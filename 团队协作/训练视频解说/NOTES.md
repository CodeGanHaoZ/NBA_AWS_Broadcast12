# 深度赛场读取与 Polly 口播

深度赛场用 nba.cn 接口读；口播用现成 Polly 脚本。不要引入外部开源解说仓库。

## 1. 深度赛场怎么读

页面本身是 SPA，数据不在 HTML 里。真实接口在 `https://api.nba.cn`，不是 `china.nba.cn`。

### 读场次

```
GET https://api.nba.cn/nba-web/api/web/inside/game?date=YYYY-MM-DD
```

用练习视频上的比分和日期对上 `gameId`：

| 练习视频 | date | gameId | 对阵 |
|---|---|---|---|
| 弗拉格 2月1日 | 2026-02-01 | `0022500701` | 火箭 @ 独行侠 |
| 阿门 1月4日 | 2026-01-04 | `0022500491` | 独行侠 @ 火箭 |

### 读某球员本场出手

```
GET https://api.nba.cn/nba-web/api/web/inside/gpShot?gameId=GAME_ID&playerId=PLAYER_ID
```

球员 ID：

- 库珀·弗拉格 `1642843`
- 阿门·汤普森 `1641708`
- 马克斯·克里斯蒂 `1631108`

返回里有用的字段：`shotList[].value`（xFG%）、`success`、`shotDesc`、`period`、`locX/locY`、`eventId`。部分记录的 `gameClock` 是空的，要用视频比分条对时间。对不上就不要填 xFG%。

本包已落盘：

- `data/flagg_gpShot.json`
- `data/amen_gpShot.json`

### 读全场出手分布

```
GET https://api.nba.cn/nba-web/api/web/inside/shot?gameId=GAME_ID
```

已落盘：`data/flagg_shot.json`、`data/amen_shot.json`。

### 读赛季指标（引力 / 杠杆 / 投篮难度）

```
GET https://api.nba.cn/nba-web/api/web/inside/season/playerGravity?season=2025-26&seasonType=Regular Season
GET https://api.nba.cn/nba-web/api/web/inside/season/playerLeverage?season=2025-26&seasonType=Regular Season
GET https://api.nba.cn/nba-web/api/web/inside/season/shotDifficulty?season=2025-26&seasonType=Regular Season
```

已落盘到 `data/season_*.json`。

### 不要指望的接口

```
GET https://api.nba.cn/nba-web/api/web/inside/videoPlay?newsId=...&eventId=...&gameId=...
```

官网播回放用这个。没进球的回合经常没有 `newsId`，所以练习视频用本地原片。

请求头至少带：

```
User-Agent: Mozilla/5.0
Referer: https://china.nba.cn/inside-the-game/
Origin: https://china.nba.cn
Accept: application/json
```

## 2. Polly 口播怎么跑

Polly 就是 AWS 的 TTS。链路接到 `commentary.yaml` 的分句时间轴上。

```
解说文案（按秒切开）
        |
        v
Amazon Polly Neural / Zhiyu / cmn-CN
        |
        v
按 start/end 垫进时间窗
        |
        v
ffmpeg 混音：口播 + 现场声 28%
        |
        v
out/flagg_voiceover.mp4
out/amen_voiceover.mp4
```

脚本：`scripts/polly_voiceover.py`

```powershell
python scripts/polly_voiceover.py --profile nba --region us-east-1
```

约定：

- 区域必须 `us-east-1`
- 中文 Neural 声音用 `Zhiyu`
- 一句不要超过时间窗，现在每句大约 3 到 5 秒
- 现场声不要静音，压低即可
- 本机还没黑客松 AWS 凭证时，只交付烧字幕的 mp4

名牌和箭头不走这条链路。等点位接口来了，再叠到画面上。
