"""Burn Chinese commentary subtitles onto a clip.

Usage:
  python burn_commentary.py
  python burn_commentary.py --video source/foo.mp4 --srt foo.srt --out out/foo_commentary.mp4
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "out"
# White fill + dark outline, no black box. BorderStyle=1 is outline-only.
SUB_STYLE = (
    "FontName=Microsoft YaHei,FontSize=22,PrimaryColour=&H00FFFFFF,"
    "OutlineColour=&H80000000,BackColour=&H00000000,BorderStyle=1,"
    "Outline=2,Shadow=0,MarginV=72,Alignment=2"
)

DEFAULT_JOBS = [
    (ROOT / "source" / "训练_弗拉格2月1日.mp4", ROOT / "flagg.srt", OUT / "flagg_commentary.mp4"),
    (ROOT / "source" / "训练_阿门1月4日.mp4", ROOT / "amen.srt", OUT / "amen_commentary.mp4"),
]


def burn(src: Path, srt: Path, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    srt_arg = srt.as_posix().replace(":", "\\:")
    vf = f"subtitles='{srt_arg}':force_style='{SUB_STYLE}'"
    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        str(src),
        "-vf",
        vf,
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "20",
        "-c:a",
        "copy",
        "-movflags",
        "+faststart",
        str(dest),
    ]
    print("RUN", dest.name)
    subprocess.check_call(cmd)
    print("WROTE", dest, dest.stat().st_size)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Burn transparent-background commentary subtitles")
    parser.add_argument("--video", help="source mp4; omit to burn both training clips")
    parser.add_argument("--srt", help="srt next to the video or an explicit path")
    parser.add_argument("--out", help="output mp4 path")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    OUT.mkdir(exist_ok=True)
    if args.video:
        src = Path(args.video)
        if not src.is_absolute():
            src = (ROOT / src).resolve()
        srt = Path(args.srt) if args.srt else src.with_suffix(".srt")
        if not srt.is_absolute():
            srt = (ROOT / srt).resolve()
        dest = Path(args.out) if args.out else OUT / f"{src.stem}_commentary.mp4"
        if not dest.is_absolute():
            dest = (ROOT / dest).resolve()
        jobs = [(src, srt, dest)]
    else:
        jobs = DEFAULT_JOBS

    for src, srt, dest in jobs:
        if not src.exists():
            raise SystemExit(f"missing video: {src}")
        if not srt.exists():
            raise SystemExit(f"missing srt: {srt}")
        burn(src, srt, dest)
    print("done")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
