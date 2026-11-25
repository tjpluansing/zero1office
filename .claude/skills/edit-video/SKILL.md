---
name: edit-video
description: Edit a raw Ask Karla talking-head clip into a ready-to-post vertical Reel/TikTok/Short with cuts, branded captions, hook title and end card. Use when asked to edit, cut, caption or "make a reel" from a video file.
---

# Edit a video for Ask Karla

You are the editor. The tool in `video-editor/karla_edit.py` does the mechanical work (transcribe, cut, caption, render). Your job is the judgment: what to keep, what the hook is, and that the captions are spelled right.

## Steps

1. **Check setup** once: `ffmpeg -version` and `python -c "import faster_whisper"`. If missing, see `video-editor/README.md`.
2. **Transcribe**:
   `python video-editor/karla_edit.py transcribe "<video>"`
   (add `--model medium` for better Taglish accuracy on a fast PC; `--language tl` if detection picks the wrong language).
   This writes into `<video folder>/edited/`: `<name>.transcript.txt` (readable, with timestamps), `<name>.transcript.json` (word timings) and `<name>.edl.json` (first cut: pauses and "uhm/ah/eh" removed).
3. **Read `<name>.transcript.txt` and edit `<name>.edl.json`**:
   - `keep`: list of `[start, end]` seconds from the ORIGINAL clip, in order. Remove retakes (when Karla repeats a sentence, keep the LAST, cleanest take), false starts, off-topic bits and dead air at the start/end. Reorder ranges only if asked.
   - Aim for 20 to 60 seconds total unless told otherwise. The first 3 seconds must earn attention.
   - `hook`: 3 to 8 word on-screen title for the first seconds, in the clip's language (Taglish is fine), e.g. "Freelancer ka? Pwede ka mag-HMO". `null` for none.
   - `caption_fixes`: `{"maxi care": "Maxicare", "medi card": "Medicard"}` for words Whisper got wrong. Check brand names: Ask Karla, Maxicare, Medicard, Intellicare, FWD, PhilHealth, HMO, MBL, ABL.
   - `cta`: end card `{"title": ..., "subtitle": ...}`; default "Questions about your HMO? / Message Ask Karla". `null` for none.
   - `music`: path to a royalty-free track or `null`. It is ducked under the voice automatically.
   - `framing`: `auto` (landscape gets a blurred background, portrait fills), `blur` or `fill`.
4. **Preview**: `python video-editor/karla_edit.py render "<video>" --preview`, then check a few frames (`ffmpeg -ss 2 -i <final> -frames:v 1 frame.png`) for caption placement and that cuts land between sentences.
5. **Final**: run `render` again without `--preview`. Outputs `<name>.final.mp4` (1080x1920, -14 LUFS audio), `<name>.srt` and `<name>.report.json`.
6. **Hand back**: the final video path, length before/after, what you cut and why, the hook, and a suggested post caption with 3 to 5 hashtags.

## Rules

- Never invent or change what Karla says: cut only, never re-word her speech. Caption fixes are spelling only.
- Prices, benefits and coverage claims in hooks, captions or end cards must come from Karla's words or an approved Maxicare document. Karla approves client-facing advice before posting.
- Don't post or schedule anything. Posting needs Paolo's OK.
- Brand look lives in `video-editor/brand/style.json` (colors, font, caption size and position, logo). Change it there, not per video.
- Quick first cut without judgment: `python video-editor/karla_edit.py auto "<video>"`.
