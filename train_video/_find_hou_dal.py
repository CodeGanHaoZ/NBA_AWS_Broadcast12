import json
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

UA = "Mozilla/5.0"
HEADERS = {
    "User-Agent": UA,
    "Referer": "https://china.nba.cn/inside-the-game/",
    "Origin": "https://china.nba.cn",
    "Accept": "application/json",
}
OUT = Path("train_video/nba_cn_dump")
OUT.mkdir(parents=True, exist_ok=True)


def get(path, params=None, base="https://api.nba.cn"):
    url = base + path
    if params:
        url += "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=20) as resp:
        raw = resp.read()
        return json.loads(raw.decode("utf-8", "replace")), raw


# pull relevant JS snippet around inside/game and videoPlay
js = urllib.request.urlopen(
    urllib.request.Request(
        "https://res.nba.cn/static/webmaster/assets/js/index-8c467dd5.js",
        headers={"User-Agent": UA},
    ),
    timeout=20,
).read().decode("utf-8", "replace")

for needle in ["inside/game", "inside/videoPlay", "inside/gpShot", "playerId", "Cooper", "Amen"]:
    idx = 0
    n = 0
    while n < 3:
        i = js.find(needle, idx)
        if i < 0:
            break
        print("\n====", needle, "at", i, "====")
        print(js[max(0, i - 180) : i + 220])
        idx = i + len(needle)
        n += 1

print("\n\n==== API probes ====")
probes = [
    ("/nba-web/api/web/inside/season/playerGravity", {"season": "2025-26", "seasonType": "Regular Season"}),
    ("/nba-web/api/web/inside/season/shotDifficulty", {"season": "2025-26", "seasonType": "Regular Season"}),
    ("/nba-web/api/web/inside/season/playerLeverage", {"season": "2025-26", "seasonType": "Regular Season"}),
    ("/nba-web/api/web/inside/gpShot", {"playerId": "1641708"}),
    ("/nba-web/api/web/inside/gpShot", {"playerId": "1642276"}),
    ("/sib/v2/players/list", {"teamId": 1610612745}),
    ("/sib/v2/players/list", {"teamId": 1610612742}),
    ("/sib/v2/game/schedule", {"teamId": 1610612745, "season": "2025-26"}),
    ("/sib/v2/pbp/details", {"gameid": "0012600035"}),
    ("/sib/v2/pbp/periods", {"gameId": "0012600035"}),
]

for path, params in probes:
    print("-" * 60)
    print(path, params)
    try:
        data, raw = get(path, params)
        fname = path.strip("/").replace("/", "_") + "__" + "_".join(f"{k}{v}" for k, v in params.items()) + ".json"
        (OUT / fname).write_bytes(raw)
        print("saved", fname, "bytes", len(raw), "code", data.get("code"), "keys", list((data.get("data") or {}) if isinstance(data.get("data"), dict) else [])[:12])
        preview = json.dumps(data, ensure_ascii=False)
        print(preview[:500])
    except Exception as e:
        print("FAIL", type(e).__name__, e)
