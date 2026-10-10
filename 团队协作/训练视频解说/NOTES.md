# 三块怎么用

团队只需要记住结论：GitHub 那个仓库不整仓放进来；深度赛场用 nba.cn 接口读；Polly 用现成脚本配音。

## 1. GitHub 解说仓库放不放

仓库：[jaredalonzo/nba-event-agent](https://github.com/jaredalonzo/nba-event-agent)

**不放进本项目，不要 clone 进来。**

它是 Kafka 实时 play-by-play 文本分析，不是视频解说管线：

- 输入是逐回合事件流，不是比赛视频
- 输出是 2–3 句 ESPN 风 insight，写到 JSONL / Bluesky
- 模型是本地 Ollama，不是 Bedrock
- 没有 ffmpeg overlay、没有 Polly、没有 AgentCore / CDK / CloudFront
- Demo 数据是 2016 总决赛 G7，不是火箭 vs 独行侠

12 小时里整仓拖进来，会把 Kafka、LangGraph、Postgres 一起背进来，挤掉必须项。

可以偷的只有三样，已经写进我们自己的稿子了：

1. 不是每回合都开口，只在高杠杆回合说话
2. 每句 2–3 句，不灌水
3. 教练、阵容、出手数据当事实验进 prompt，不让模型编

当前落地是：`commentary.yaml` + 字幕轨 + 以后 Polly 口播。这就是我们的解说，不依赖那个仓库。

## 2. 深度赛场怎么读

页面：[NBA中国 深度赛场](https://china.nba.cn/inside-the-game/video/1629013?gameId=0012600035)

这个链接能打开，也能打到 API，但对不上练习视频。它是：

- 日期：2026-10-09
- 对阵：尼克斯 @ 奇才
- 球员：兰德里·沙梅特 `playerId=1629013`
- 场次：`gameId=0012600035`

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

返回里有用的字段：`shotList[].value`（xFG%）、`success`、`shotDesc`、`period`、`locX/locY`、`eventId`。部分记录的 `gameClock` 是空的，要用视频比分条对时间。

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

已落盘到 `data/season_*.json`。解说稿里的「弗拉格引力 3.8」「阿门无球引力是负数」来自这里。

### 不要指望的接口

```
GET https://api.nba.cn/nba-web/api/web/inside/videoPlay?newsId=...&eventId=...&gameId=...
```

官网播回放用这个。没进球的回合经常没有 `newsId`，所以练习视频不能从官网直接拉下来配音。我们用本地原片。

请求头至少带：

```
User-Agent: Mozilla/5.0
Referer: https://china.nba.cn/inside-the-game/
Origin: https://china.nba.cn
Accept: application/json
```

## 3. Polly 口播怎么跑

Polly 就是 AWS 的 TTS。链路已经接到 `commentary.yaml` 的分句时间轴上。

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
- 本机还没黑客松 AWS 凭证，所以现在没有口播成品；登录后再跑

名牌和箭头不走这条链路。等点位接口来了，再叠到画面上。
