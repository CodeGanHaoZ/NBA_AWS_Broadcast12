---
name: nba-clip-commentary
description: Use when burning Chinese commentary onto an NBA training/exam clip, swapping in a new video, overlaying transparent-background subtitles, reading NBA China inside-the-game shot data, or mixing Amazon Polly Neural TTS voiceover in us-east-1. Trigger words: 换视频复现, 透明底字幕, Polly 口播, Zhiyu, gpShot, xFG%, 训练视频解说.
---

# NBA Clip Commentary

Burn timed Chinese commentary onto a short NBA clip, then optionally mix Polly Neural TTS. Overlay nameplates and arrows wait for a later point API.

## When to Use

- A new training or exam clip arrives and the team says "在这个视频上复现"
- Subtitles must be white text with outline, no black box
- Shot quality / gravity / leverage should be read from NBA China inside-the-game APIs
- Voiceover should go through Amazon Polly, not a local TTS

## Package Root

Work from `团队协作/训练视频解说/` unless the user names another folder.

```
source/     original clips
out/        burned mp4 + preview frames
data/       gpShot / shot / season JSON
scripts/    burn_commentary.py, polly_voiceover.py
*.srt       timed commentary
commentary.yaml
```

## Reproduce On A New Video

1. Put the mp4 in `source/`.
2. Probe duration and pull frames every 2s with ffmpeg.
3. Read scorebug, jersey numbers, and the shot. Do not invent xFG% from the picture.
4. Write a 5–6 line SRT. Each line 3–5 seconds. Keep it on the play, not a recap.
5. If a date and matchup are visible, fetch:

```
GET https://api.nba.cn/nba-web/api/web/inside/game?date=YYYY-MM-DD
GET https://api.nba.cn/nba-web/api/web/inside/gpShot?gameId=GAME_ID&playerId=PLAYER_ID
```

Headers: `User-Agent: Mozilla/5.0`, `Referer: https://china.nba.cn/inside-the-game/`, `Origin: https://china.nba.cn`, `Accept: application/json`.

Known IDs:

| Player | playerId |
|---|---|
| Cooper Flagg | 1642843 |
| Amen Thompson | 1641708 |
| Max Christie | 1631108 |

If `gpShot` has no matching period/clock/make, leave xFG% out. Do not guess.

6. Burn transparent subtitles:

```powershell
python scripts/burn_commentary.py --video source\NEW.mp4 --srt NEW.srt --out out\NEW_commentary.mp4
```

Style is already in the script: white fill, dark outline, `BorderStyle=1`, `MarginV=72`. Do not set `BorderStyle=4` (that paints the black box).

7. Pull 2–3 preview frames and check: no black bar, scorebug still visible, text matches the play.

Both training clips: `python scripts/burn_commentary.py`

## Polly Voiceover

Polly is AWS TTS. The mix script reads `commentary.yaml`.

```powershell
python scripts/polly_voiceover.py --profile nba --region us-east-1
```

Rules:

- Region `us-east-1`
- Voice `Zhiyu`, engine `neural`, language `cmn-CN`
- One Polly call per SRT line, pad to `[start, end]`, mix over stadium audio at 28%
- Outputs: `out/flagg_voiceover.mp4`, `out/amen_voiceover.mp4`
- No credentials: leave the burned-subtitle mp4 as the deliverable. Do not fake audio locally.

For a new clip, add it to `commentary.yaml` with `file`, `srt`, `output_subs`, `output_voice`, `duration_sec`, and `lines` before running Polly.

## Do Not

- Pull in an external commentary agent or third-party GitHub project
- Call `china.nba.cn` for JSON; the API host is `api.nba.cn`
- Depend on `videoPlay` for missed shots; those often have no `newsId`
- Burn nameplates or arrows until the user supplies a point API
