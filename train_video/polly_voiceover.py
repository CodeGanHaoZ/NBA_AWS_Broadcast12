"""Amazon Polly voiceover for timed commentary lines.

Pipeline:
  1. Read clip lines from commentary.yaml
  2. Call Polly Neural TTS per line (Chinese Zhiyu)
  3. Pad each clip to its [start, end] window
  4. Mix voice over original stadium audio with ffmpeg
  5. Keep burned-in subtitles from the existing commentary mp4

Hackathon login:
  python train_video/polly_voiceover.py --profile nba --region us-east-1
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

import boto3
import yaml
from botocore.exceptions import BotoCoreError, ClientError, NoCredentialsError, ProfileNotFound

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "out"
VOICE_DIR = OUT / "voice"
DEFAULT_VOICE = "Zhiyu"
DEFAULT_ENGINE = "neural"
DEFAULT_REGION = "us-east-1"


def load_clips() -> list[dict]:
    data = yaml.safe_load((ROOT / "commentary.yaml").read_text(encoding="utf-8"))
    return data["clips"]


def make_client(profile: str | None, region: str):
    session_kwargs = {"region_name": region}
    if profile:
        session_kwargs["profile_name"] = profile
    session = boto3.Session(**session_kwargs)
    return session.client("polly")


def synth_line(polly, text: str, dest: Path, voice: str, engine: str) -> None:
    response = polly.synthesize_speech(
        Text=text,
        VoiceId=voice,
        Engine=engine,
        OutputFormat="mp3",
        TextType="text",
        LanguageCode="cmn-CN",
    )
    dest.write_bytes(response["AudioStream"].read())


def pad_and_place(src_mp3: Path, dest_wav: Path, start: float, window: float) -> None:
    delay_ms = int(start * 1000)
    filtergraph = (
        f"atrim=0:{window},asetpts=PTS-STARTPTS,"
        f"apad=whole_dur={window},"
        f"adelay={delay_ms}|{delay_ms}"
    )
    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        str(src_mp3),
        "-af",
        filtergraph,
        "-ar",
        "44100",
        "-ac",
        "2",
        str(dest_wav),
    ]
    subprocess.check_call(cmd, cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def mix_voiceover(video: Path, voice_wavs: list[Path], dest: Path, duration: float) -> None:
    cmd = ["ffmpeg", "-y", "-i", str(video)]
    for wav in voice_wavs:
        cmd.extend(["-i", str(wav)])
    n = len(voice_wavs)
    mixes = "".join(f"[{i + 1}:a]" for i in range(n))
    filtergraph = (
        f"{mixes}amix=inputs={n}:normalize=0[voice];"
        f"[0:a]volume=0.28[stad];"
        f"[stad][voice]amix=inputs=2:duration=first:dropout_transition=0[aout]"
    )
    cmd.extend(
        [
            "-filter_complex",
            filtergraph,
            "-map",
            "0:v",
            "-map",
            "[aout]",
            "-c:v",
            "copy",
            "-c:a",
            "aac",
            "-b:a",
            "160k",
            "-t",
            f"{duration:.3f}",
            "-movflags",
            "+faststart",
            str(dest),
        ]
    )
    subprocess.check_call(cmd, cwd=ROOT)


def process_clip(clip: dict, polly, voice: str, engine: str) -> Path:
    clip_dir = VOICE_DIR / clip["id"]
    clip_dir.mkdir(parents=True, exist_ok=True)
    placed: list[Path] = []
    for idx, line in enumerate(clip["lines"], start=1):
        raw_mp3 = clip_dir / f"line_{idx:02d}.mp3"
        placed_wav = clip_dir / f"line_{idx:02d}_placed.wav"
        print(f"  TTS {clip['id']} #{idx}: {line['text']}")
        synth_line(polly, line["text"], raw_mp3, voice, engine)
        window = max(0.4, float(line["end"]) - float(line["start"]) - 0.08)
        pad_and_place(raw_mp3, placed_wav, float(line["start"]), window)
        placed.append(placed_wav)

    video = ROOT / clip["output_subs"]
    dest = ROOT / clip["output_voice"]
    dest.parent.mkdir(parents=True, exist_ok=True)
    mix_voiceover(video, placed, dest, float(clip["duration_sec"]))
    print("WROTE", dest, dest.stat().st_size)
    return dest


def main() -> int:
    parser = argparse.ArgumentParser(description="Burn Polly voiceover onto commentary clips")
    parser.add_argument("--profile", default="nba")
    parser.add_argument("--region", default=DEFAULT_REGION)
    parser.add_argument("--voice", default=DEFAULT_VOICE)
    parser.add_argument("--engine", default=DEFAULT_ENGINE)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    clips = load_clips()
    print("clips", [c["id"] for c in clips])
    if args.dry_run:
        for clip in clips:
            print(json.dumps({"id": clip["id"], "lines": clip["lines"]}, ensure_ascii=False, indent=2))
        return 0

    try:
        polly = make_client(args.profile, args.region)
        polly.describe_voices(LanguageCode="cmn-CN", Engine=args.engine)
    except ProfileNotFound:
        print(f"AWS profile '{args.profile}' not found. Falling back to default chain.")
        try:
            polly = make_client(None, args.region)
            polly.describe_voices(LanguageCode="cmn-CN", Engine=args.engine)
        except (NoCredentialsError, BotoCoreError, ClientError) as exc:
            print("No AWS credentials. Login first, then rerun:")
            print("  python train_video/polly_voiceover.py --profile nba --region us-east-1")
            print("detail:", type(exc).__name__, exc)
            return 2
    except (NoCredentialsError, BotoCoreError, ClientError) as exc:
        print("Polly is not callable yet. Need hackathon AWS login.")
        print("  python train_video/polly_voiceover.py --profile nba --region us-east-1")
        print("detail:", type(exc).__name__, exc)
        return 2

    OUT.mkdir(exist_ok=True)
    VOICE_DIR.mkdir(parents=True, exist_ok=True)
    for clip in clips:
        process_clip(clip, polly, args.voice, args.engine)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
