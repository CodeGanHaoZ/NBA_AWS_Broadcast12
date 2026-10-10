# 训练视频解说 · 团队协作包

给解说、数据和口播联调用。头顶名牌和箭头 overlay 先不做，等后续接口。

## 先看这两个成品

- `out/flagg_commentary.mp4` 弗拉格末节突破，字幕已烧上，出手 xFG% = 21.6%
- `out/amen_commentary.mp4` 阿门侧翼急停，字幕已烧上，出手 xFG% = 45.3%

截图也在 `out/` 里。

## 目录

```
source/     官方练习原片
out/        已烧字幕的成品 + 预览图
data/       两段对应的深度赛场 JSON
scripts/    烧字幕、Polly 口播
NOTES.md    GitHub 仓库 / 深度赛场读取 / Polly 口播，三块怎么用
flagg.srt / amen.srt / commentary.yaml
```

## 两段分别是什么

| 文件 | 场次 | 时间 | 出手 |
|---|---|---|---|
| 弗拉格 2月1日 | `0022500701` 火箭@独行侠 | 第四节 1:52，DAL 103-HOU 107 | event 681，突破上篮，xFG 21.6%，未中 |
| 阿门 1月4日 | `0022500491` 独行侠@火箭 | 第三节 7:45，HOU 60-DAL 63 | event 433，急停跳投，xFG 45.3%，未中 |

注意：`https://china.nba.cn/inside-the-game/video/1629013?gameId=0012600035` 是尼克斯沙梅特，不是这两段。正确读法见 `NOTES.md`。

## 怎么重跑

烧字幕（白字描边，透明底，无黑底条）：

```powershell
python scripts/burn_commentary.py
```

换一段视频，只换片和字幕稿：

```powershell
python scripts/burn_commentary.py --video source\新视频.mp4 --srt 新视频.srt --out out\新视频_commentary.mp4
```

Polly 口播（需要黑客松 AWS 登录，区域 us-east-1）：

```powershell
python scripts/polly_voiceover.py --profile nba --region us-east-1
```

会生成 `out/flagg_voiceover.mp4` 和 `out/amen_voiceover.mp4`。中文 Neural 声音是 `Zhiyu`，现场声压到约 28%。

## 还没做

- Polly 口播：脚本在，本机还没 AWS 凭证，所以没出声
- 头顶名牌、箭头 overlay：等点位接口

