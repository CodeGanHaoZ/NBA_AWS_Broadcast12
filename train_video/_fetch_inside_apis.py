import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
BASES = [
    "https://china.nba.cn",
    "https://api.nba.cn",
    "https://stats.nba.cn",
    "https://www.nba.cn",
]
HEADERS = {
    "User-Agent": UA,
    "Referer": "https://china.nba.cn/inside-the-game/video/1629013?gameId=0012600035",
    "Origin": "https://china.nba.cn",
    "Accept": "application/json, text/plain, */*",
}

queries = [
    ("/nba-web/api/web/inside/config", {}),
    ("/nba-web/api/web/inside/leader", {}),
    ("/nba-web/api/web/inside/game", {"gameId": "0012600035"}),
    ("/nba-web/api/web/inside/shot", {"gameId": "0012600035"}),
    ("/nba-web/api/web/inside/def", {"gameId": "0012600035"}),
    ("/nba-web/api/web/inside/gpShot", {"gameId": "0012600035", "playerId": "1629013"}),
    ("/nba-web/api/web/inside/videoPlay", {"gameId": "0012600035", "playerId": "1629013"}),
    ("/nba-web/api/web/inside/videoPlay", {"gameId": "0012600035", "vid": "1629013"}),
    ("/nba-web/api/web/inside/videoPlay", {"playerId": "1629013"}),
    ("/nba-web/api/web/inside/season/year", {}),
    ("/sib/v2/pbp/details", {"gameId": "0012600035"}),
    ("/sib/v2/game/schedule", {"gameId": "0012600035"}),
    ("/cms/v1/video/playurl", {"vid": "1629013"}),
]


def try_get(base, path, params):
    url = base + path
    if params:
        url += "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=12) as resp:
            data = resp.read()
            return resp.status, dict(resp.headers), data, None
    except urllib.error.HTTPError as e:
        body = e.read()[:400]
        return e.code, dict(e.headers), body, str(e)
    except Exception as e:
        return None, {}, b"", repr(e)


outdir = Path("train_video/nba_cn_dump")
outdir.mkdir(parents=True, exist_ok=True)

for path, params in queries:
    print("=" * 72)
    print(path, params)
    hit = False
    for base in BASES:
        status, headers, data, err = try_get(base, path, params)
        ctype = headers.get("Content-Type", "")
        print(f"  {base} -> {status} {ctype} bytes={len(data)} err={err}")
        if status == 200 and data:
            name = path.strip("/").replace("/", "_")
            extra = "_".join(f"{k}{v}" for k, v in params.items())
            fname = f"{name}__{extra or 'noparams'}.json"
            (outdir / fname).write_bytes(data)
            preview = data[:500].decode("utf-8", "replace")
            print("  SAVED", fname)
            print("  PREVIEW", preview)
            hit = True
            break
    if not hit:
        print("  no 200")
