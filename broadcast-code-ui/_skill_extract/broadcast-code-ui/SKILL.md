---
name: broadcast-code-ui
description: "NBA 赛事转播数据终端风（Broadcast Code）前端 UI 设计范式与组件库。源自 CSDN BuilderX「Broadcast Code 12h 黑客松极限赛」（NBA × 亚马逊云科技）官方海报与官网视觉。当用户需要赛事/黑客松/体育数据可视化/AI 解说 overlay 类的深色落地页、海报式页面、赛程页、路演 Demo 页，或明确要求「近黑底 + 信号橙 + 球场线 + 点阵数据块 + Telestrator 标注」风格时使用。触发词：Broadcast Code、黑客松 UI、NBA 可视化、赛事落地页、转播终端风、信号橙深色范式。"
---

# Broadcast Code UI · 赛事转播数据终端风

一套深色-only 设计范式：把「电视转播间 + 球场战术板 + 数据终端」三种气质合成一个界面语言。核心情绪是**极限、对抗、实时数据**。

## 何时用 / 不用

- 用：黑客松/赛事落地页、体育数据可视化、AI Agent 解说/overlay 产品页、路演 Demo、赛程与奖项页。
- 不用：政务/金融等合规严肃场景、浅色内容站、SaaS 仪表盘（那是数据终端风，不是本范式）。

## 设计系统 Token（必须严格遵守）

完整 CSS 变量与工具类见 `assets/broadcast-code.css`，可直接在 HTML 中内联或引入。

### 配色（hex + oklch 双标注）

| Token | Hex | oklch | 用途 |
|---|---|---|---|
| `--bc-bg` | `#0B0B0C` | `oklch(0.16 0.005 260)` | 页面底色（转播间黑） |
| `--bc-surface` | `#131315` | `oklch(0.20 0.006 260)` | 卡片/分区底 |
| `--bc-surface-2` | `#1B1B1F` | `oklch(0.24 0.007 260)` | 嵌套层/hover 底 |
| `--bc-line` | `#2A2A2E` | `oklch(0.29 0.008 260)` | 结构线、卡片描边 |
| `--bc-chalk` | `#F5F2EC` | `oklch(0.95 0.01 90)` | 主文字（粉笔白） |
| `--bc-muted` | `#8E8E96` | `oklch(0.63 0.01 260)` | 次要文字、mono 标签 |
| `--bc-signal` | `#F9530C` | `oklch(0.65 0.21 40)` | 唯一主强调色（信号橙） |
| `--bc-signal-deep` | `#C43A08` | `oklch(0.53 0.18 42)` | 皮革纹理/渐变暗端 |
| `--bc-navy` | `#12183A` | `oklch(0.26 0.07 265)` | 视频分析帧底色 |
| 关键点三色 | `#E23B3B` / `#F5C518` / `#39C2D7` | — | 仅用于骨骼追踪/数据标注，不作装饰 |

面积纪律：信号橙 ≤ 10% 页面面积，只给 CTA、日期标签、标注、关键数字。底色永远近黑，禁止浅色模式。

### 字体（禁止默认 Inter/Roboto/Arial/系统字体）

```
--bc-font-display: "Anton", "Arial Narrow", sans-serif;         /* 英文标题/大数字，全部大写 */
--bc-font-brush:   "Ma Shan Zheng", cursive;                    /* 中文书法标语，限海报式营销页（见下） */
--bc-font-body:    "Noto Sans SC", sans-serif;                  /* 中文正文 */
--bc-font-mono:    "JetBrains Mono", "IBM Plex Mono", monospace;/* 数据标签 */
```

**Brush 使用范围（硬性）**：书法字体只用于赛事海报式落地页的中文大标语（如「12h黑客松极限赛」）；规范手册、工具、文档、演示类页面禁用——此类页面中文标题用 Noto Sans SC 900 加宽字距（可配信号橙左侧竖条），标题结构一律 Display + Mono。

Google Fonts 引入：
`https://fonts.googleapis.com/css2?family=Anton&family=JetBrains+Mono:wght@400;700&family=Ma+Shan+Zheng&family=Noto+Sans+SC:wght@400;500;700;900&display=swap`

字号梯度：12 / 14 / 16 / 20 / 28 / 40 / 64 / 96 / 144。英文标题一律 `text-transform: uppercase; letter-spacing: 0.02em`；mono 标签 `letter-spacing: 0.14em; font-size: 12px`。

### 间距 / 圆角 / 动效

- 间距 4px 基准：4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96；section 纵向 padding ≥ 96px。
- 圆角纪律：卡片 2-4px（转播终端是「硬」的）；仅日期 pill 用 999px；Telestrator 标注圆 50%。
- 动效 0.2-0.3s，仅 `opacity` / `transform`；尊重 `prefers-reduced-motion`；入场用 8px 上移淡入，禁止弹跳。

## 十大签名元素（本范式的灵魂，至少用 4 个）

1. **球场线背景**：页面底层 SVG 画中圈、三分弧、边线，`stroke: rgba(245,242,236,0.07)`，1-1.5px，超大尺度裁切出血。
2. **点阵数据块**：圆点矩阵模拟投篮热图，橙点+白点按数据分布；用 SVG `<circle>` 阵列或 CSS `radial-gradient` 平铺。
3. **Telestrator 标注**：绝对定位橙色圆环（2px signal）圈住画面重点，可带十字线与小字 mono 注释（如 `possession #24 · Q3 07:41`）。
4. **虚线选框（marquee）**：1.5px dashed signal 边框 + 四角 6px 白色小方块手柄，套在需要「被选中」的标语/卡片上。
5. **日期 pill**：signal 橙底 + 粉笔白粗体，999px 圆角，如 `10/10-10/11`。
6. **皮革纹理色块**：`--bc-signal-deep` 底 + SVG feTurbulence 噪点，模拟篮球表皮，作分隔条/卡头。
7. **斜杠分区标签**：mono 大写 muted 小字 `GAME DATA / AI STORYTELLING`，斜杠用 signal 橙。
8. **编号管线步骤**：`01` Anton 大数字 + mono 小写后缀（`input` / `analyze` / `visualize` / `narrate`），纵向或横向流水线。
9. **大数字统计**：Anton 64-144px 关键数字（`120` / `09/27` / `TOP 8`）+ mono 说明小字。
10. **骨骼追踪帧**：navy 底矩形内 SVG polyline 画球员骨架关键点（红/黄/青三色），模拟 AI 视频分析帧。

## 工作流程

1. 确认页面唯一目标与内容素材（真实文案，禁止 lorem ipsum）。
2. 引入 `assets/broadcast-code.css` 或复制其 `:root` token；按上表引入字体。
3. 先搭球场线背景 + 分区标签，再填组件；组件规范见 `references/components.md`（按钮/卡片/赛程时间线/奖项卡/记分表格/导航/表单/页脚，含全部交互状态）。
4. 至少落 4 个签名元素，信号橙面积 ≤ 10%。
5. 交付前自检下方禁令清单 + 可访问性（chalk on bg 对比度 13.5:1 达标；muted 仅用于非关键文字）。

**参考实现**：`assets/example-showcase.html` 是范式的完整自我演示页（含全部签名元素、组件状态与 6 组动效的可运行代码），生成页面前可读取它对齐实现细节。

## 强禁止清单

- 禁止 emoji 当 icon 或装饰元素（图标用 SVG 线条或 mono 字符）。
- 禁止紫色/蓝紫渐变；禁止浅色主题；禁止奶油底+赤陶橙、近黑底+酸性绿等 AI 默认审美。
- 禁止圆角气泡卡片、毛玻璃、柔和阴影——本范式只有 1px 硬描边与噪点纹理。
- 禁止三列 icon 卡片式功能介绍；用编号管线（签名元素 8）替代。
- 禁止无意义 stock 图；图像位用骨骼追踪帧/点阵/纹理块等范式内元素填充。
- 信号橙之外禁止第二强调色（骨骼关键点三色仅限数据标注场景）。
- 规范手册/工具/演示类页面禁止使用书法字体（Brush 仅限海报式营销页大标语）。
