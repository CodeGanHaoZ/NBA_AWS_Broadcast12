# Broadcast Code UI · 团队设计交接

> 给队友共用的界面语言。完整视觉版见战队手册末章 [`broadcast-code-12-战队手册.html`](broadcast-code-12-战队手册.html) 的 `#design`。
> 一句话：**近黑底 × 信号橙 × 球场线 × 实时数据感**。

---

## 1. 可以交给队友的

| 资产 | 位置 | 用途 |
|---|---|---|
| UI 范式介绍 | `broadcast-code-ui/broadcast-code-ui-介绍.md` | token、签名元素、组件、动效、禁令、安装。交接正文主来源。 |
| Skill 分发包 | `broadcast-code-ui/broadcast-code-ui.skill` | zip。解压到兼容 Agent 的 skills 目录即可，无注册步骤。 |
| 范式演示页 | `broadcast-code-ui/broadcast-code-ui-showcase.html` | 签名元素 + 组件 + 6 组动效。 |
| 轻量 Demo | `broadcast-code-ui/broadcast-code-demo.html` | 对照 token 与排版。 |
| 落地页提案 | `broadcast-code-redesign/pages/index.html` | 赛事落地页改版稿，整页战术网格背景。用 `--bc26-*`。 |
| 落地页配色 | `broadcast-code-redesign/colors_and_type.css` | 落地页专用变量。手册 / Demo / overlay 仍用 `--bc-*`。 |
| 战术网格图 | `broadcast-code-redesign/assets/tactical-grid-background.png` | 球场线 + 网格底图。 |
| 战队手册 | `资料文档/broadcast-code-12-战队手册.html` | 赛题 + 指标 + 管线 + 词典 + 本设计交接。 |

Skill 包内（解压后）：`SKILL.md`、`assets/broadcast-code.css`、`assets/example-showcase.html`、`references/components.md`。常见安装位置：`~/.workbuddy/skills/broadcast-code-ui/`，兼容 Claude Code / Codex 同类目录。

## 2. 不要写进对外文档的

- 个人 AI 工具的内部 skill 名、路由、编排脚本
- 本机绝对路径、临时工作区、未进仓库的草稿
- 未授权比赛录像、未披露来源的数据截图
- 赛事账号密钥、SSO、CloudFront 私有配置

交接只谈**本仓库可见的设计资产与用法**，不谈工具怎么实现。

---

## 3. 两套 Token，不要混

同一页面只选一套。信号橙面积 ≤ 10%，只给 CTA、标注、日期、关键数字。

### 权威系统 `--bc-*`（手册 / Skill / Demo / overlay）

| Token | 色值 | 用途 |
|---|---|---|
| `--bc-bg` | `#0B0B0C` | 转播间黑 |
| `--bc-surface` / `-2` | `#131315` / `#1B1B1F` | 卡片 / 嵌套 |
| `--bc-chalk` | `#F5F2EC` | 粉笔白 · 主文字 |
| `--bc-muted` | `#8E8E96` | 次要文字 |
| `--bc-signal` | `#F9530C` | 唯一主强调色 |
| `--bc-navy` | `#12183A` | 骨骼追踪帧底 |

### 落地页提案 `--bc26-*`（仅 `broadcast-code-redesign`）

| Token | 色值 | 用途 |
|---|---|---|
| `--bc26-background` | `#06090F` | 夜空底 |
| `--bc26-card` | `#0D131D` | 卡片 |
| `--bc26-foreground` | `#F5F0E8` | 主文字 |
| `--bc26-muted-foreground` | `#93A0B6` | 次要 |
| `--bc26-primary` | `#FF5A1F` | 提案橙 |
| `--bc26-navy` | `#111B31` | 海军蓝 |

字体：Anton（标题 / 大数字）· Noto Sans SC（正文）· JetBrains Mono（标签，字距 `0.14em`）。Ma Shan Zheng **仅海报营销页**；手册 / 工具 / overlay 禁用书法字体。

---

## 4. 十大签名元素（每页至少 4 个）

S-01 球场线背景 · S-02 点阵数据块 · S-03 Telestrator 标注 · S-04 虚线选框 Marquee · S-05 日期 Pill · S-06 皮革纹理色块 · S-07 斜杠分区标签 · S-08 编号管线 · S-09 大数字统计 · S-10 骨骼追踪帧（红=持球 / 黄=无球 / 青=防守，三色禁作装饰）

---

## 5. 给 AI 的触发词与提示词

触发词（装好 Skill 后直接说即可）：

```
Broadcast Code / 黑客松 UI / 赛事落地页 / NBA 可视化 / 转播终端风 / 信号橙深色范式
```

没装 Skill 时，把下面整段连同 `broadcast-code-ui-介绍.md` 一起贴给 AI：

```
请按 Broadcast Code UI 范式生成页面。
视觉：近黑底 #0B0B0C + 信号橙 #F9530C + 粉笔白 #F5F2EC。橙面积 ≤10%。
字体：Anton 标题与大数字，Noto Sans SC 正文，JetBrains Mono 标签。手册/工具页禁用书法字体。
每页至少 4 个签名元素：球场线背景、斜杠分区标签、大数字、Telestrator 或虚线选框。
禁止：emoji 当图标、紫/蓝紫渐变、浅色主题、圆角气泡卡、毛玻璃（导航除外）、三列 icon 功能卡、第二强调色、Inter/Roboto、lorem ipsum。
组件用 2–4px 硬边角卡片、编号管线代替功能宫格。动效只用 opacity/transform，尊重 reduced-motion。
若做落地页提案，改用 --bc26-*（底 #06090F、橙 #FF5A1F），不要和手册 token 混用。
```

五步工作流：确认目标 → 引入 token 与字体 → 铺球场线 + kicker → 落 ≥4 个签名元素 → 过禁令 / 对比度 / reduced-motion。

---

## 6. 安装 Skill 包

1. 复制 `broadcast-code-ui/broadcast-code-ui.skill`
2. 改后缀为 `.zip`（或直接当 zip 解压）
3. 解压到本机 Agent 的 skills 目录，目录名保持 `broadcast-code-ui`
4. 对 Agent 说出触发词即可，无需注册

政务 / 金融 / 合规、以及普通 SaaS 仪表盘不要用这套范式。
