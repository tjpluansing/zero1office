#!/usr/bin/env python3
"""
Ask Karla video editor: turns a raw talking-head clip into a ready-to-post
vertical Reel / TikTok / Short.

Two steps, so Claude can act as the editor in between:

  1. transcribe   raw clip  -> <name>.transcript.json  (word-level timestamps)
                              <name>.edl.json         (edit decision list: what to keep)
  2. render       raw clip + edl -> <name>.final.mp4 (+ .srt and .report.json)

Between the two steps Claude (or a person) reads the transcript and edits the
EDL: removes retakes and mistakes, fixes caption spelling, writes the hook
title and the call to action. Running `auto` does both steps with the default
EDL (silences and filler words removed) for a quick first cut.

Needs ffmpeg on PATH. Transcription needs `pip install faster-whisper`.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
DEFAULT_STYLE = HERE / "brand" / "style.json"

FILLERS = {
    "uh", "uhm", "um", "umm", "erm", "ah", "ahh", "eh", "ehh", "hmm", "mm",
    "ano", "parang",  # Taglish fillers; only cut when they stand alone (see below)
}
# Taglish words that are often real words, so only cut them when they sit
# between pauses (they are fillers then, not part of a sentence).
SOFT_FILLERS = {"ano", "parang"}


# --------------------------------------------------------------------------- utils

def run(cmd: list[str], quiet: bool = True) -> str:
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        sys.stderr.write(res.stderr[-4000:])
        raise SystemExit(f"command failed: {' '.join(cmd[:6])} ...")
    return res.stdout


def need_ffmpeg() -> None:
    for tool in ("ffmpeg", "ffprobe"):
        if not shutil.which(tool):
            raise SystemExit(f"{tool} not found. Install it first (Windows: winget install Gyan.FFmpeg).")


def probe(path: Path) -> dict:
    out = run(["ffprobe", "-v", "error", "-print_format", "json", "-show_streams",
               "-show_format", str(path)])
    info = json.loads(out)
    v = next((s for s in info["streams"] if s["codec_type"] == "video"), None)
    a = next((s for s in info["streams"] if s["codec_type"] == "audio"), None)
    if v is None:
        raise SystemExit("no video stream in input")
    w, h = int(v["width"]), int(v["height"])
    rot = 0
    for sd in v.get("side_data_list", []) or []:
        if "rotation" in sd:
            rot = int(sd["rotation"])
    rot = int(v.get("tags", {}).get("rotate", rot))
    if abs(rot) in (90, 270):  # phone clips: ffmpeg auto-rotates on decode
        w, h = h, w
    num, den = (v.get("avg_frame_rate") or "30/1").split("/")
    fps = float(num) / float(den) if float(den) else 30.0
    if not (10 <= fps <= 120):
        fps = 30.0
    return {"width": w, "height": h, "fps": fps, "has_audio": a is not None,
            "duration": float(info["format"]["duration"])}


def load_style(path: Path | None) -> dict:
    style = json.loads(DEFAULT_STYLE.read_text(encoding="utf-8"))
    if path and path != DEFAULT_STYLE:
        style.update(json.loads(Path(path).read_text(encoding="utf-8")))
    return style


def paths_for(src: Path, outdir: Path | None) -> dict:
    outdir = outdir or src.parent / "edited"
    outdir.mkdir(parents=True, exist_ok=True)
    stem = src.stem
    return {
        "dir": outdir,
        "transcript": outdir / f"{stem}.transcript.json",
        "edl": outdir / f"{stem}.edl.json",
        "final": outdir / f"{stem}.final.mp4",
        "srt": outdir / f"{stem}.srt",
        "ass": outdir / f"{stem}.ass",
        "report": outdir / f"{stem}.report.json",
        "text": outdir / f"{stem}.transcript.txt",
    }


# --------------------------------------------------------------------------- step 1: transcribe

def transcribe(src: Path, model_size: str, language: str | None) -> dict:
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        raise SystemExit("faster-whisper is not installed. Run: pip install faster-whisper")
    model = WhisperModel(model_size, device="auto", compute_type="int8")
    segments, info = model.transcribe(
        str(src), language=language, word_timestamps=True, vad_filter=True,
        # Bias towards the words Ask Karla says a lot so captions spell them right.
        initial_prompt="Ask Karla, Maxicare, Medicard, Intellicare, HMO, MBL, ABL, "
                       "pre-existing, PhilHealth, FWD. Taglish: Tagalog at English.",
    )
    words = []
    for seg in segments:
        for w in seg.words or []:
            words.append({"start": round(w.start, 3), "end": round(w.end, 3),
                          "word": w.word.strip(), "p": round(w.probability, 3)})
    return {"source": str(src), "language": info.language, "duration": info.duration,
            "model": model_size, "words": words}


def default_edl(tr: dict, duration: float, max_gap: float, pad: float, cut_fillers: bool) -> dict:
    """Keep speech, drop long pauses and filler words."""
    words = tr["words"]
    keep_words = []  # (word, starts_new_segment)
    split_next = False
    for i, w in enumerate(words):
        token = re.sub(r"[^\w]", "", w["word"].lower())
        if cut_fillers and token in FILLERS:
            if token in SOFT_FILLERS:
                prev_gap = w["start"] - (words[i - 1]["end"] if i else 0)
                next_gap = (words[i + 1]["start"] if i + 1 < len(words) else duration) - w["end"]
                if prev_gap < 0.35 or next_gap < 0.35:
                    keep_words.append((w, split_next))
                    split_next = False
                    continue
            split_next = True  # a filler was cut here: force a cut point
            continue
        keep_words.append((w, split_next))
        split_next = False

    segs: list[list[float]] = []
    for w, force_split in keep_words:
        s, e = max(0.0, w["start"] - pad), min(duration, w["end"] + pad)
        if force_split and segs:
            segs[-1][1] = min(segs[-1][1], w["start"] - 0.01)  # don't let padding re-include the filler
        if segs and not force_split and s - segs[-1][1] <= max_gap:
            segs[-1][1] = max(segs[-1][1], e)
        else:
            segs.append([s, e])
    # merge overlaps created by padding
    merged: list[list[float]] = []
    for s, e in segs:
        if merged and s <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], e)
        else:
            merged.append([round(s, 3), round(e, 3)])

    return {
        "_help": ("Edit me, then run: python karla_edit.py render <video>. "
                  "keep = time ranges (seconds, original clip) to keep, in order. "
                  "caption_fixes = {wrong: right} applied to captions. "
                  "hook = big title on screen for the first seconds. "
                  "cta = end card text. Set any to null to skip."),
        "keep": merged,
        "caption_fixes": {},
        "hook": None,
        "hook_seconds": 3.0,
        "cta": {"title": "Questions about your HMO?", "subtitle": "Message Ask Karla"},
        "captions": True,
        "music": None,
        "music_volume": 0.12,
        "framing": "auto",
    }


# --------------------------------------------------------------------------- step 2: render

def remap_words(words: list[dict], keep: list[list[float]], fixes: dict) -> list[dict]:
    """Move word times from the raw clip onto the edited timeline."""
    out, offset = [], 0.0
    for s, e in keep:
        for w in words:
            mid = (w["start"] + w["end"]) / 2
            if s <= mid <= e:
                text = w["word"]
                for bad, good in fixes.items():
                    text = re.sub(rf"\b{re.escape(bad)}\b", good, text, flags=re.I)
                if text.strip():
                    out.append({"start": offset + max(w["start"], s) - s,
                                "end": offset + min(w["end"], e) - s, "word": text})
        offset += e - s
    return out


def group_words(words: list[dict], max_words: int, max_chars: int, max_gap: float = 0.6) -> list[list[dict]]:
    groups, cur = [], []
    for w in words:
        if cur and (len(cur) >= max_words
                    or len(" ".join(x["word"] for x in cur + [w])) > max_chars
                    or w["start"] - cur[-1]["end"] > max_gap
                    or re.search(r"[.?!]$", cur[-1]["word"])):
            groups.append(cur)
            cur = []
        cur.append(w)
    if cur:
        groups.append(cur)
    return groups


def ass_time(t: float) -> str:
    t = max(0.0, t)
    h, rem = divmod(t, 3600)
    m, s = divmod(rem, 60)
    return f"{int(h)}:{int(m):02d}:{s:05.2f}"


def srt_time(t: float) -> str:
    t = max(0.0, t)
    ms = int(round(t * 1000))
    h, ms = divmod(ms, 3600000)
    m, ms = divmod(ms, 60000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def ass_color(hex_rgb: str, alpha: int = 0) -> str:
    h = hex_rgb.lstrip("#")
    r, g, b = h[0:2], h[2:4], h[4:6]
    return f"&H{alpha:02X}{b}{g}{r}".upper()


def ass_escape(text: str) -> str:
    return text.replace("\\", "").replace("{", "(").replace("}", ")").replace("\n", "\\N")


def build_ass(groups, style, W, H, hook, hook_seconds, cta, total, cta_seconds) -> str:
    c = style["colors"]
    cap = style["captions"]
    font = style["font"]
    upper = cap.get("uppercase", True)
    size = int(H * cap["size_pct"] / 100)
    margin_v = int(H * cap["bottom_pct"] / 100)
    hook_size = int(H * style["hook"]["size_pct"] / 100)
    lines = [
        "[Script Info]", "ScriptType: v4.00+", f"PlayResX: {W}", f"PlayResY: {H}",
        "WrapStyle: 0", "ScaledBorderAndShadow: yes", "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, "
        "BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, "
        "BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
        f"Style: Cap,{font},{size},{ass_color(c['caption_text'])},{ass_color(c['caption_text'])},"
        f"{ass_color(c['caption_outline'])},{ass_color('#000000', 128)},-1,0,0,0,100,100,0,0,1,"
        f"{max(3, size // 10)},2,2,60,60,{margin_v},1",
        f"Style: Hook,{font},{hook_size},{ass_color(c['hook_text'])},{ass_color(c['hook_text'])},"
        f"{ass_color(c['hook_box'])},{ass_color(c['hook_box'])},-1,0,0,0,100,100,0,0,3,"
        f"{max(10, hook_size // 3)},0,8,80,80,{int(H * 0.11)},1",
        f"Style: CtaT,{font},{int(H * 0.042)},{ass_color(c['cta_title'])},{ass_color(c['cta_title'])},"
        f"{ass_color('#000000')},{ass_color('#000000', 255)},-1,0,0,0,100,100,0,0,1,0,0,5,80,80,0,1",
        f"Style: CtaS,{font},{int(H * 0.03)},{ass_color(c['cta_sub'])},{ass_color(c['cta_sub'])},"
        f"{ass_color('#000000')},{ass_color('#000000', 255)},-1,0,0,0,100,100,0,0,1,0,0,5,80,80,0,1",
        "", "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ]
    hi = ass_color(c["caption_highlight"])
    for g in groups:
        for i, w in enumerate(g):
            start = w["start"]
            end = g[i + 1]["start"] if i + 1 < len(g) else w["end"] + 0.25
            end = min(end, total)  # never run onto the end card
            parts = []
            for j, x in enumerate(g):
                t = ass_escape(x["word"].upper() if upper else x["word"])
                parts.append(f"{{\\c{hi}}}{t}{{\\r}}" if j == i else t)
            pop = "{\\fscx104\\fscy104}" if cap.get("pop", True) else ""
            lines.append(f"Dialogue: 1,{ass_time(start)},{ass_time(end)},Cap,,0,0,0,,{pop}{' '.join(parts)}")
    if hook:
        lines.append(f"Dialogue: 2,{ass_time(0)},{ass_time(hook_seconds)},Hook,,0,0,0,,"
                     f"{{\\fad(120,200)}}{ass_escape(hook.upper())}")
    if cta:
        cs = total
        ce = total + cta_seconds
        if cta.get("title"):
            lines.append(f"Dialogue: 2,{ass_time(cs)},{ass_time(ce)},CtaT,,0,0,0,,"
                         f"{{\\fad(200,0)\\pos({W // 2},{int(H * 0.46)})}}{ass_escape(cta['title'])}")
        if cta.get("subtitle"):
            lines.append(f"Dialogue: 2,{ass_time(cs + 0.25)},{ass_time(ce)},CtaS,,0,0,0,,"
                         f"{{\\fad(200,0)\\pos({W // 2},{int(H * 0.54)})}}{ass_escape(cta['subtitle'])}")
    return "\n".join(lines) + "\n"


def build_srt(groups) -> str:
    out = []
    for n, g in enumerate(groups, 1):
        out += [str(n), f"{srt_time(g[0]['start'])} --> {srt_time(g[-1]['end'] + 0.2)}",
                " ".join(w["word"] for w in g), ""]
    return "\n".join(out)


def ff_path(p: Path) -> str:
    """Escape a path for use inside an ffmpeg filter argument (works on Windows too)."""
    s = str(p).replace("\\", "/")
    return s.replace(":", r"\:").replace("'", r"\'")


def render(src: Path, edl: dict, tr: dict, style: dict, out: dict, preview: bool) -> dict:
    info = probe(src)
    W, H = style["output"]["width"], style["output"]["height"]
    fps = style["output"].get("fps") or round(info["fps"])
    keep = [k for k in edl["keep"] if k[1] - k[0] > 0.05]
    if not keep:
        raise SystemExit("EDL keeps nothing")
    body = sum(e - s for s, e in keep)
    cta = edl.get("cta")
    cta_seconds = float(style["cta"]["seconds"]) if cta else 0.0
    total = body + cta_seconds

    words = remap_words(tr["words"], keep, edl.get("caption_fixes") or {})
    cap = style["captions"]
    groups = group_words(words, cap["max_words"], cap["max_chars"]) if edl.get("captions", True) else []
    out["srt"].write_text(build_srt(groups), encoding="utf-8")
    out["ass"].write_text(build_ass(groups, style, W, H, edl.get("hook"), float(edl.get("hook_seconds") or 3),
                                    cta, body, cta_seconds), encoding="utf-8")

    sel = "+".join(f"between(t,{s:.3f},{e:.3f})" for s, e in keep)
    framing = edl.get("framing", "auto")
    landscape = info["width"] / info["height"] > W / H + 0.05
    if framing == "auto":
        framing = "blur" if landscape else "fill"

    f = []
    f.append(f"[0:v]select='{sel}',setpts=N/FRAME_RATE/TB,fps={fps}[vcut]")
    if framing == "blur":
        f.append("[vcut]split[bga][fga]")
        f.append(f"[bga]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},"
                 f"boxblur=30:2,eq=brightness=-0.08[bg]")
        f.append(f"[fga]scale={W}:-2[fg]")
        f.append("[bg][fg]overlay=(W-w)/2:(H-h)/2[vfr]")
    else:
        f.append(f"[vcut]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H}[vfr]")
    if cta:
        # hold a branded end card: navy background after the talking part
        f.append(f"color=c={style['colors']['cta_bg']}:s={W}x{H}:r={fps}:d={cta_seconds}[card]")
        f.append("[vfr]setsar=1[vfr1];[card]setsar=1[card1];[vfr1][card1]concat=n=2:v=1:a=0[vlong]")
    else:
        f.append("[vfr]null[vlong]")
    logo = style.get("logo")
    logo_path = (HERE / "brand" / logo) if logo else None
    vin = "[vlong]"
    inputs = ["-i", str(src)]
    if logo_path and logo_path.exists():
        inputs += ["-i", str(logo_path)]
        lw = int(W * style.get("logo_width_pct", 18) / 100)
        f.append(f"[1:v]scale={lw}:-1,format=rgba,colorchannelmixer=aa=0.92[lg]")
        f.append(f"{vin}[lg]overlay=W-w-{int(W * 0.05)}:{int(H * 0.04)}[vlogo]")
        vin = "[vlogo]"
    f.append(f"{vin}subtitles='{ff_path(out['ass'])}'[vout]")

    music = edl.get("music")
    if info["has_audio"]:
        f.append(f"[0:a]aselect='{sel}',asetpts=N/SR/TB,"
                 f"highpass=f=80,afftdn=nf=-25,loudnorm=I=-14:TP=-1.5:LRA=11,"
                 f"aresample=48000,apad=whole_dur={total:.3f}[voice]")
    else:
        f.append(f"anullsrc=r=48000:cl=stereo,atrim=0:{total:.3f}[voice]")
    if music and Path(music).exists():
        mi = len([x for x in inputs if x == "-i"])
        inputs += ["-stream_loop", "-1", "-i", str(music)]
        vol = float(edl.get("music_volume") or 0.12)
        f.append(f"[{mi}:a]aresample=48000,volume={vol},atrim=0:{total:.3f},"
                 f"afade=t=out:st={max(0, total - 1.5):.3f}:d=1.5[bgm]")
        f.append("[voice]asplit[v1][v2]")
        f.append("[bgm][v2]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=400[duck]")
        f.append("[v1][duck]amix=inputs=2:duration=first:normalize=0[aout]")
    else:
        f.append("[voice]anull[aout]")

    graph = ";".join(f)
    preset = "veryfast" if preview else style["output"].get("preset", "medium")
    crf = "28" if preview else str(style["output"].get("crf", 20))
    cmd = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", *inputs,
           "-filter_complex", graph, "-map", "[vout]", "-map", "[aout]",
           "-t", f"{total:.3f}",
           "-c:v", "libx264", "-preset", preset, "-crf", crf, "-pix_fmt", "yuv420p",
           "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", str(out["final"])]
    fontsdir = HERE / "brand" / "fonts"
    if fontsdir.exists():
        cmd[cmd.index("-filter_complex") + 1] = graph.replace(
            f"subtitles='{ff_path(out['ass'])}'",
            f"subtitles='{ff_path(out['ass'])}':fontsdir='{ff_path(fontsdir)}'")
    run(cmd)

    report = {
        "input": str(src), "output": str(out["final"]),
        "original_seconds": round(info["duration"], 2),
        "edited_seconds": round(total, 2),
        "removed_seconds": round(info["duration"] - body, 2),
        "cuts": len(keep) - 1, "caption_lines": len(groups),
        "framing": framing, "size": f"{W}x{H}",
    }
    out["report"].write_text(json.dumps(report, indent=2), encoding="utf-8")
    return report


# --------------------------------------------------------------------------- CLI

def write_transcript_text(tr: dict, path: Path) -> None:
    """Readable transcript with timestamps, one line per pause-separated phrase."""
    lines, cur, start = [], [], None
    prev_end = 0.0
    for w in tr["words"]:
        if cur and (w["start"] - prev_end > 0.6 or len(cur) >= 14):
            lines.append(f"[{start:7.2f} - {prev_end:7.2f}] {' '.join(cur)}")
            cur, start = [], None
        if start is None:
            start = w["start"]
        cur.append(w["word"])
        prev_end = w["end"]
    if cur:
        lines.append(f"[{start:7.2f} - {prev_end:7.2f}] {' '.join(cur)}")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def cmd_transcribe(a) -> None:
    need_ffmpeg()
    src = Path(a.video).resolve()
    out = paths_for(src, Path(a.out) if a.out else None)
    info = probe(src)
    if a.words_json:
        tr = json.loads(Path(a.words_json).read_text(encoding="utf-8"))
    else:
        tr = transcribe(src, a.model, a.language)
    out["transcript"].write_text(json.dumps(tr, ensure_ascii=False, indent=1), encoding="utf-8")
    write_transcript_text(tr, out["text"])
    edl = default_edl(tr, info["duration"], a.max_gap, a.pad, not a.keep_fillers)
    if out["edl"].exists() and not a.force:
        print(f"kept existing EDL {out['edl']} (use --force to replace)")
    else:
        out["edl"].write_text(json.dumps(edl, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"transcript": str(out["transcript"]), "transcript_text": str(out["text"]),
                      "edl": str(out["edl"]), "words": len(tr["words"]),
                      "language": tr.get("language")}, indent=2))


def cmd_render(a) -> None:
    need_ffmpeg()
    src = Path(a.video).resolve()
    out = paths_for(src, Path(a.out) if a.out else None)
    if not out["transcript"].exists():
        raise SystemExit("no transcript yet: run `transcribe` first")
    tr = json.loads(out["transcript"].read_text(encoding="utf-8"))
    edl = json.loads(Path(a.edl or out["edl"]).read_text(encoding="utf-8"))
    style = load_style(Path(a.style) if a.style else None)
    report = render(src, edl, tr, style, out, a.preview)
    print(json.dumps(report, indent=2))


def cmd_auto(a) -> None:
    a.force = True
    cmd_transcribe(a)
    cmd_render(a)


def main() -> None:
    p = argparse.ArgumentParser(description="Ask Karla video editor")
    sub = p.add_subparsers(dest="cmd", required=True)

    def common(sp):
        sp.add_argument("video")
        sp.add_argument("--out", help="output folder (default: <video folder>/edited)")

    t = sub.add_parser("transcribe", help="transcribe and write a first-cut EDL")
    common(t)
    t.add_argument("--model", default="small", help="whisper size: base, small, medium, large-v3")
    t.add_argument("--language", default=None, help="force a language code, e.g. tl or en")
    t.add_argument("--max-gap", type=float, default=0.45, help="pauses longer than this are cut")
    t.add_argument("--pad", type=float, default=0.08, help="seconds kept around each word")
    t.add_argument("--keep-fillers", action="store_true")
    t.add_argument("--words-json", help="use an existing transcript instead of whisper")
    t.add_argument("--force", action="store_true", help="overwrite an existing EDL")
    t.set_defaults(func=cmd_transcribe)

    r = sub.add_parser("render", help="render the final vertical video from the EDL")
    common(r)
    r.add_argument("--edl")
    r.add_argument("--style", help="style JSON that overrides brand/style.json")
    r.add_argument("--preview", action="store_true", help="fast, lower quality render")
    r.set_defaults(func=cmd_render)

    au = sub.add_parser("auto", help="transcribe + render in one go (no manual edit)")
    common(au)
    for sp in (au,):
        sp.add_argument("--model", default="small")
        sp.add_argument("--language", default=None)
        sp.add_argument("--max-gap", type=float, default=0.45)
        sp.add_argument("--pad", type=float, default=0.08)
        sp.add_argument("--keep-fillers", action="store_true")
        sp.add_argument("--words-json")
        sp.add_argument("--edl")
        sp.add_argument("--style")
        sp.add_argument("--preview", action="store_true")
    au.set_defaults(func=cmd_auto)

    a = p.parse_args()
    a.func(a)


if __name__ == "__main__":
    main()
