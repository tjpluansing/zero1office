# Ask Karla video editor

Turns a raw phone clip of Karla into a ready-to-post 9:16 Reel / TikTok / Short:

- Transcribes Taglish speech with word timings (faster-whisper, runs locally, free)
- Cuts long pauses and filler words ("uhm", "ah", "eh"), and lets Claude remove retakes
- Burns in bold captions with the current word highlighted in gold
- Adds a hook title for the first seconds and a navy end card ("Message Ask Karla")
- Reframes landscape clips with a blurred background, cleans and levels the voice to -14 LUFS, ducks optional music

In the zero1office AI team this is **Vince** (Reels & Video Editor, Marketing & Content). Nadia's scripts feed his hooks and Cora takes the finished reel for captions and scheduling. Claude drives it as Vince with the `edit-video` skill in `.claude/skills/edit-video/SKILL.md`. In Claude Code just say: *"Edit C:\...\karla-hmo-tip.mp4 into a reel"*.

## One-time setup (Windows)

```powershell
winget install Gyan.FFmpeg          # then open a new terminal
pip install faster-whisper
```

The first transcription downloads the Whisper model (~500 MB for `small`).

## Use it by hand

```powershell
python video-editor\karla_edit.py transcribe "C:\Videos\clip.mp4"
# edit C:\Videos\edited\clip.edl.json (what to keep, hook, caption fixes, end card)
python video-editor\karla_edit.py render "C:\Videos\clip.mp4" --preview
python video-editor\karla_edit.py render "C:\Videos\clip.mp4"
```

Or one shot with the automatic first cut: `python video-editor\karla_edit.py auto "C:\Videos\clip.mp4"`.

Outputs go to an `edited` folder next to the clip: `clip.final.mp4`, `clip.srt`, `clip.transcript.txt`, `clip.report.json`.

## Brand look

Edit `brand/style.json`: colors (Deep Navy #002C6C, Gold #D3A13B, Sand #E4C075 by default), font, caption size/position, words per caption line, end card length. Drop a logo PNG into `brand/` and set `"logo": "logo.png"`. Drop `.ttf` fonts (for example Montserrat ExtraBold) into `brand/fonts/` and set `"font"` to the font's name.

## Filming tips that make the edit better

- Film vertical, eye level, window light in front of Karla, phone mic within arm's length (or a lapel mic).
- If she flubs a line, pause 2 seconds and say the whole sentence again. Claude keeps the last take.
- Open with the hook question in the first sentence ("Freelancer ka ba? ...").
