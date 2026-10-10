import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

HEADERS = {
    "User-Agent": "Mozilla/5.0",
    "Referer": "https://china.nba.cn/inside-the-game/",
    "Origin": "https://china.nba.cn",
    "Accept": "application/json",
}
OUT = Path("train_video/nba_cn_dump")
OUT.mkdir(parents=True, exist_ok=True)


def get(path, params=None):
    url = "https://api.nba.cn" + path
    if params:
        url += "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=20) as resp:
        raw = resp.read()
        return json.loads(raw.decode("utf-8")), raw


games = {
    "flagg": {"gameId": "0022500701", "playerId": "1642843", "date": "2026-02-01"},
    "amen": {"gameId": "0022500491", "playerId": "1641708", "date": "2026-01-04"},
}

for name, g in games.items():
    print("====", name, g)
    jobs = [
        ("/nba-web/api/web/inside/gpShot", {"gameId": g["gameId"], "playerId": g["playerId"]}),
        ("/nba-web/api/web/inside/shot", {"gameId": g["gameId"]}),
        ("/nba-web/api/web/inside/def", {"gameId": g["gameId"]}),
        ("/nba-web/api/web/inside/game", {"date": g["date"]}),
    ]
    for path, params in jobs:
        extra = "_".join(f"{k}{v}" for k, v in params.items())
        fname = f"{name}_{path.strip('/').replace('/', '_')}__{extra}.json"
        try:
            data, raw = get(path, params)
            (OUT / fname).write_bytes(raw)
            print("OK", path, "bytes", len(raw), "code", data.get("code"))
            if "gpShot" in path:
                d = data.get("data") or {}
                print(
                    " player",
                    d.get("playerFirstName"),
                    d.get("playerLastName"),
                    d.get("matchup"),
                    d.get("gameDate"),
                )
                print(
                    " shotQuality",
                    d.get("shotQuality"),
                    "fgPct",
                    d.get("fgPct"),
                    "avg",
                    d.get("avgShotQuality"),
                    "avgMiss",
                    d.get("avgMissShotQuality"),
                    "defDist",
                    d.get("avgDefenderBallDistance"),
                )
                for shot in d.get("shotList") or []:
                    print(
                        " ",
                        shot.get("period"),
                        shot.get("gameClock"),
                        shot.get("shotType"),
                        shot.get("shotDesc"),
                        "xFG",
                        shot.get("value"),
                        "make",
                        shot.get("success"),
                        "loc",
                        shot.get("locX"),
                        shot.get("locY"),
                        "event",
                        shot.get("eventId"),
                        "news",
                        shot.get("newsId"),
                    )
        except Exception as e:
            print("FAIL", path, type(e).__name__, e)
