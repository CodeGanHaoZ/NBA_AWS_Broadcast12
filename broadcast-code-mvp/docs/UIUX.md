# UIUX.md · NBA 深度赛场可视化 AI Agent — 设计契约

> 生成日期：2026-10-10 | 设计师：颜好看 | 基于：PRD（Broadcast Code 12h 黑客松参赛作）
> UI 范式：**broadcast-code-ui（已锁定，不重发明）** | 技术栈：Vue 3 SPA | 场景：路演大屏 + 评委近距离操作
> 设计寄存器：**Product 寄存器**（工具类页面——规范手册/工具/演示类，书法字体禁用）
> 三轴刻度：**Variance = 4**（布局稳定可预期，仅栏宽非对称）/ **Motion = 6**（转播 live 感动效）/ **Density = 7**（驾驶舱密度，大屏一屏看全）

---

## 0. P0 纪律声明（本设计全篇遵守）

| 规则 | 本设计执行方式 |
|---|---|
| 禁 emoji 功能图标 | 全部图标为内联 SVG（16/20/24px）或 mono 字符（`▶ ▍ ●` 属文本字形非 emoji），零 emoji |
| 禁紫色→粉色渐变 / 浅色主题 / 圆角气泡 / 毛玻璃 / 柔和阴影 | 近黑底 `#0B0B0C` 唯一主题；卡片圆角 2px；仅 1px 硬描边；blur 仅允许顶栏 `backdrop-filter` 一处（范式白名单） |
| 禁空洞占位 / lorem ipsum / 三列 icon 卡片 | 全部文案为真实赛场语境（回合编号、球员、战术名）；功能介绍用编号管线替代 |
| 信号橙 ≤10%，无第二强调色 | 橙仅用于：CTA、LIVE pill、Telestrator 标注、选中态、关键数字、解说高亮词；骨骼三色（红/黄/青）仅限数据标注层 |
| 书法字体禁用 | 本产品为工具类页面，中文标题用 Noto Sans SC 900 + 信号橙左侧竖条，标题结构 Display + Mono |

---

## 1. 外部参照提炼（只取布局与信息层级，配色不抄）

| 参照 | 提炼的布局启发 | 落到本产品 |
|---|---|---|
| **Second Spectrum CourtVision / ESPN Full Court Press** | Coach Mode 证明「场上 X's and O's 图解」是专业感的核心；模式切换（Coach/Player）说明同一画面可承载多层标注；概率气泡说明数据可挂在「人」上而非堆在角落 | 战术板主区 = 全屏 Coach Mode 画布；标注分 4 层按需叠加；球员骨架上可挂 mono 数据标签 |
| **F1 遥测大屏（Pit Wall / MultiViewer 类）** | 经典三柱结构：左 timing tower（纵向名单）+ 中 track map（主视野）+ 右 telemetry（选中对象详情）；底部 race control ticker 滚事件流；Bloomberg 式 mono 高密度排版，breadth 优先于 depth——一屏看完，不跳面板 | 左栏回合列表 = timing tower；中央战术板 = track map；右栏解说+数据 = telemetry panel；底部 scrubber 兼事件刻度 = ticker 的结构化版本 |
| **NBA stats / 转播记分条** | 顶部记分条（比分+节次+时钟）是「这是比赛」的即时识别信号，永远置顶、永不消失 | 顶部转播条常驻，含比分、节次、时钟、AI 运行状态 |

**结论：三柱驾驶舱 + 顶条 + 底部时间轴**，评委 3 秒内能读出「这是 AI 在解说一场真实比赛」。

---

## 2. 页面清单与信息架构

Vue 3 SPA，**单页工作台**。不做多路由——路演场景下任何跳转都是风险。辅助状态用层（overlay/empty state）而非页面。

| # | 页面/层 | 路由 | 说明 |
|---|---|---|---|
| P1 | **AI 解说工作台**（主页面） | `/` | 全部核心体验所在，下文详述 |
| L1 | 空态/待选层（P1 内状态） | `/`（初始态） | 未选回合时主区显示 AI 管线空态（编号管线签名元素落位处）+ 引导选择第一个回合 |
| L2 | 加载层（P1 内状态） | `/`（回合切换瞬态） | 主区骨骼帧 loading：navy 底 + scanline 扫描 + mono 状态行 `analyzing possession…` |
| L3 | 错误层（P1 内状态） | `/`（异常态） | 数据/LLM 失败：主区 1px 硬描边错误卡 + mono 错误码 + 「重新分析」ghost 按钮，不遮罩整个工作台 |

### 信息架构（P1 内）

```
P1 AI 解说工作台
├── A. 顶部转播条 BroadcastBar（常驻，h 56px）
│   ├── wordmark + 赛事标识（BROADCAST CODE / AI COURT AGENT）
│   ├── 记分块：LAL 102 : 104 BOS · Q4 · 02:41（Anton 大数字 + mono 标签）
│   ├── 模式 pill：LIVE / REPLAY（信号橙 .bc-pill）
│   └── AI 状态灯：● analyzing / narrating / idle（8px 橙点 + mono 字）
├── B. 左栏 · 回合列表 RoundList（w 288px，可折叠）
│   ├── 栏头 kicker：POSSESSIONS / Q4
│   ├── 筛选 chips：全部 / 关键回合 / 得分 / 失误（mono 小字 + 计数）
│   └── 回合条目流（时间倒序）：mono 时间戳 + 事件类型 + 结果分 + 关键标记
├── C. 中央 · 战术板主区 CourtStage（弹性主宽）
│   ├── 骨骼追踪帧 .bc-frame（16:9，navy 底）：球场透视线 + 骨架 polyline + 关键点
│   ├── 标注层 OverlayLayer（绝对定位于帧上）：Telestrator 圆环 / 跑动虚线 / 出手点标记
│   ├── 帧状态行：mono `possession #24 · Q4 02:41 · overlay running`
│   └── 回放控制条：播放/暂停 · 0.5x 慢放 · 逐帧 · 重播（ghost 小按钮组 + SVG 图标）
├── D. 右栏 · 解说与数据面板 SidePanel（w 360px）
│   ├── 解说流 CommentaryFeed（占上 60%）：kicker + 逐句打字机文本流
│   ├── AI 管线状态 PipelineStrip（编号管线紧凑版）：input→analyze→visualize→narrate
│   └── 数据块 DataBlock（占下 40%）：大数字统计 + 点阵热图 + 关键数据行
└── E. 底部 · 时间轴 Scrubber（h 64px，常驻）
    ├── 播放头 + 回合内进度轨
    └── 事件刻度：▲ 挡拆 / ▲ 顺下 / ▲ 空位 / ▲ 出手（点击刻度跳转）
```

---

## 3. 主工作台布局线框（第一眼/第二眼/第三眼）

```
┌────────────────────────────────────────────────────────────────────────────────────┐
│ ● BROADCAST CODE / AI COURT AGENT      LAL 102 : 104 BOS   Q4 02:41   [REPLAY] ●AI │ A 56px
│▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔ 皮革纹理细条 4px ▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔│
├──────────────┬──────────────────────────────────────────────────┬──────────────────┤
│ POSSESSIONS /│ possession #24 · Q4 02:41 · overlay ●running     │ COMMENTARY / AI  │ D
│ Q4      288px│ ┌──────────────────────────────────────────────┐ │ 02:41 ▸ 勒布朗借 │
│ [全部 12][关键│ │                                              │ │ 掩护走左路，【挡 │
│ 5][得分 8]    │ │      ○ ← Telestrator 圈（pulse）             │ │ 拆】后防守收缩…  ▍│ ← 打字机光标
│ ──────────── │ │     ╱╲                                       │ │ ─────────────── │
│ ┌──────────┐ │ │    ╱  ╲  - - -> 顺下跑动虚线(dash)           │ │ 02:38 ▸ 戴维斯  │
│ │#24 ⬤ 02:41│ │ │   红骨架(持球)  黄骨架(无球)   青骨架(防守)  │ │ 顺下接球，【空位 │
│ │挡拆顺下 +2 │ │ │      ● 出手点（signal 圆点+环）             │ │ 扣篮】得手       │
│ │◄ marquee │ │ │                                              │ │ 02:35 ▸ …       │
│ └──────────┘ │ │  球场透视线 chalk 12%                        │ │                 │
│ #23 ○ 02:12  │ │                                              │ │ PIPELINE        │
│ 转换三分  +3 │ └──────────────────────────────────────────────┘ │ 01 input ─ 02   │
│ ──────────── │ C 弹性主宽（约 55-60% 屏宽）                      │ analyze ─ 03    │
│ #22 ○ 01:47  │ ┌ [▶] [0.5x] [|◄ ▄ ►|] [↺ 重播] ─ ghost 按钮组 ┐ │ visualize ─ 04  │
│ 失误被断     │ └──────────────────────────────────────────────┘ │ ●narrate        │
│ ──────────── │                                                  │ ─────────────── │
│ #21 ○ 01:20  │                                                  │ KEY DATA        │
│ 中距离命中+2 │                                                  │  104            │
│ B            │                                                  │  末节得分 · Anton│
│              │                                                  │  64px signal    │
│              │                                                  │  点阵热图 10×10  │
├──────────────┴──────────────────────────────────────────────────┴──────────────────┤
│ ▶ 00:00 ━━━━━━━━━●━━━━━━━━━━━━━━━ 00:18   ▲02:41挡拆  ▲02:38顺下  ▲02:35空位  ▲02:33命中 │ E 64px
└────────────────────────────────────────────────────────────────────────────────────┘
   底层：球场线 SVG 全页铺底（stroke chalk 7%）+ 噪点 grain 5%
```

### 视线路径（路演大屏 3 秒测试）

| 次序 | 落点 | 设计手段 |
|---|---|---|
| **第一眼** | 顶部记分块 `104 : 102` + 中央战术板骨骼帧 | Anton 大数字对比 + 主区占屏 55%+ 的动态骨架——「在比赛、在分析」 |
| **第二眼** | Telestrator 橙圈 + 右栏正在打字的解说句 | 信号橙仅两处大面积可见：标注层 + 解说光标/高亮词——视线被橙牵着走 |
| **第三眼** | 左栏选中回合 marquee + 底部事件刻度 | 理解「这是可操作的回放系统」——评委上手时的入口 |

栏宽比（≥1440px）：`288px | 1fr | 360px`；1280-1440px 压至 `248px | 1fr | 320px`；<1024px 左栏折叠为顶部横向 chip 滚动条（路演不要求移动端，但保底可用）。

---

## 4. 关键交互流：选回合 → 重演 → 标注叠加 → 打字机解说

### 4.1 时序总谱（单个回合的完整叙事，总长约 18s，可打断）

```
T+0.00s   点击左栏回合条目（或底部事件刻度 / 快捷键 ←→）
          ├─ 左栏：条目套 marquee 虚线选框（150ms 绘入），旧选中态移除
          ├─ 右栏：解说流定格当前句，新句槽位显示「排队中」mono 灰字
          └─ 主区：旧标注层 150ms 淡出，帧切 loading 态（scanline 扫描）

T+0.30s   数据就绪（本地 mock 即时 / LLM 流式则状态行滚动日志）
          ├─ 帧状态行刷新：`possession #24 · Q4 02:41 · overlay ●running`
          └─ 管线条：01 input 点亮 → 02 analyze 点亮（橙点流动 300ms/步）

T+0.50s   重演开始
          ├─ L0 球场透视线 + 球员骨架首帧绘入（polyline dash 绘入 600ms）
          └─ 底部 scrubber 播放头开始走动（0.5x 慢放为默认路演速度）

T+0.5-6s  标注层按事件时间戳【逐层叠加】（核心表演时刻）
          ├─ L1 持球人锁定：红骨架 + Telestrator 橙环圈持球人（环带 bc-pulse）
          ├─ L2 战术识别：mono 注释标签钉在屏上 `pick & roll · weak side`
          │       环位置平移到掩护点（transform 300ms，禁跳变）
          ├─ L3 跑动揭示：黄骨架顺下路径虚线 dash-run 流动绘入
          └─ L4 终结点：出手/接球点 signal 实心圆点 + 外环，结果分 `+2` Anton 弹出

T+1.0s 起 解说与标注【同步】逐句打出（打字机）
          ├─ 每句开头 = 该句对应事件标注出现的同一帧（句-层绑定）
          ├─ 打字速度 30-45ms/字，光标 ▍ signal 530ms 闪烁
          ├─ 高亮词（战术名/球员名/数字）随打字到位即染 signal 色
          └─ 一句打完 → 光标停留 400ms → 沉为历史句（chalk 60%）

T+6.0s    重演完毕
          ├─ 标注层：全部驻留 1.2s → 次要标注（L2/L3）淡出，仅留 Telestrator 环+终结点
          ├─ 管线条：04 narrate 点亮完成态
          ├─ scrubber 播放头停在末端，控制条「重播」按钮呼吸提示一次
          └─ 数据块：大数字（如 104）做 count-up 滚动更新
```

### 4.2 交互细则

| 交互 | 规格 |
|---|---|
| 选回合 | 左栏 click / 键盘 ↑↓ 移动 + Enter 确认 / ←→ 切换相邻回合；切换立即打断当前解说与标注（可中断性是评委必测项） |
| 播放控制 | Space 播放/暂停；`1` 正常速 `2` 0.5x 慢放；`,` `.` 逐帧；`R` 重播。所有按钮 hover 描边变 signal，focus-visible 2px 橙 outline offset 2px |
| 标注层开关 | 主区右上 mono toggle：`overlay on/off`——评委可裸看骨架，再开标注看 AI 理解（对比演示杀手锏） |
| 解说跟随 | 打字机进行时点击历史句 → 该句展开对应事件的高亮（句-事件双向索引） |
| 事件刻度 | 底部 ▲ 刻度 hover 显示 mono tooltip（事件名+时间戳），click 跳转该帧并同步解说句 |
| 打断与空操作 | 打字中途切回合：当前句立刻定格为历史句（不强行打完）；重演中再点同一回合 = 重播 |

### 4.3 状态覆盖（5 态）

| 区域 | Loading | Empty | Error | Populated | Edge |
|---|---|---|---|---|---|
| 主区帧 | scanline + `analyzing…` | 管线空态引导（编号管线大图）| 错误卡+重试 | 骨骼+标注 | 超长回合 scrubber 刻度过密→合并为 `+n` |
| 解说流 | 句槽位「排队中」灰字 | 「选择一个回合，听 AI 拆解」引导 | LLM 失败：mono 错误行+「重试解说」ghost 按钮 | 打字机流 | 长句自动断行，高亮词不断词 |
| 回合列表 | 骨架行 3 条 | 「本场无可分析回合」+重载 | 列表失败 inline 提示 | 条目流 | 单节 >50 回合虚拟滚动 |
| 数据块 | count-up 占位 `--` | 隐藏整块 | 整块隐藏不报错 | 大数字+热图 | 数字 ≥1000 缩为 `1.2K` |

---

## 5. 签名元素落位表（十大签名元素 → 用 8 个）

| # | 签名元素 | 是否采用 | 落位区域 | 规格说明 |
|---|---|---|---|---|
| S-01 | 球场线背景 | 用 | **全页底层** | stroke chalk 7%，中圈居主区，超大尺度裁切出血；工作台三柱压其上 |
| S-02 | 点阵数据块 | 用 | **右栏数据块** | 10×10 SVG 圆点阵 = 该球员投篮热图，命中点 signal，尺寸 160px |
| S-03 | Telestrator 标注 | 用 | **主区标注层（核心）** | 2px signal 圆环+十字线+mono 注释，带 bc-pulse；每个事件一个，逐层叠加 |
| S-04 | 虚线选框 marquee | 用 | **左栏当前选中回合** | 1.5px dashed signal + 四角 chalk 方块手柄，选中 150ms 绘入 |
| S-05 | 日期 pill | 用 | **顶栏 LIVE/REPLAY 模式 pill + 场次标签** | signal 底 chalk 字；ghost 变体做筛选 chips，一屏 ≤3 个实心 |
| S-06 | 皮革纹理 | 用 | **顶栏底部 4px 细条** | `.bc-leather` 压转播条下缘——「转播台」质感，面积 <1% |
| S-07 | 斜杠分区标签 | 用 | **三栏栏头 kicker** | `POSSESSIONS / Q4`、`COURT / OVERLAY`、`COMMENTARY / AI`，斜杠 signal |
| S-08 | 编号管线 | 用 | **右栏管线状态条 + 主区空态** | 空态大图版（Anton 48px 序号）；右栏紧凑横向版实时点亮 4 步 |
| S-09 | 大数字统计 | 用 | **右栏数据块** | Anton 64px：末节得分/该回合 xP/命中率，关键数字 signal 色 |
| S-10 | 骨骼追踪帧 | 用 | **主区本体** | navy 底 16:9 + 三色骨架 polyline + 关键点圆点 + 帧状态行 |
| — | 奖项卡 / 赛程时间线 | 不用 | — | 非本产品场景，不用 |

**采用 8/10**（要求 ≥4）。信号橙面积预算：标注层 ~3% + 顶栏 pill/纹理 ~2% + 左栏 marquee ~1% + 右栏高亮词/大数字 ~2% ≈ **8%**，达标。

---

## 6. 组件映射表（页面区域 → broadcast-code-ui 组件/工具类）

| 页面区域 | 范式组件/工具类 | 关键变体与状态 |
|---|---|---|
| A 顶栏 | `.bc-nav` 改造（非 fixed-页面级，改工作台内常驻）+ `.bc-pill` + `.bc-leather` 细条 | LIVE/REPLAY pill 实心 signal；AI 状态灯 8px 橙点 bc-pulse；记分 Anton 28px |
| A 模式切换 | `.bc-btn--ghost bc-btn--sm` | LIVE ⇄ REPLAY 切换，hover 描边变 signal |
| B 栏头 | `.bc-kicker` | mono 12px 大写 muted，斜杠 signal |
| B 筛选 chips | `.bc-pill--ghost` | 选中态：描边变 signal、字变 signal；计数 mono muted |
| B 回合条目 | `.bc-card` 紧凑改造（padding 12px 16px）+ `.bc-marquee`（选中态）+ **ImportanceBreakdown 微型条形分解**（选中/展开态，见附录 B） | default/hover（surface-2+描边#3A3A40)/selected(marquee)；关键回合条目左缘 2px signal 竖条 + ⬤ 标记；importance ≥80 挂 IconFlame 16px signal |
| C 主帧 | `.bc-frame`（签名 S-10 完整实现） | navy 底、16:9、1px line 描边、frame-status 状态行、scanline 仅 loading 时 |
| C 标注层 | `.bc-tele` + `.bc-tele--pulse` + 自定义 dash-run 路径 + mono 注释标签 | 圆环 2px signal；注释 signal 10-12px mono；reduced-motion 关闭 pulse |
| C 控制条 | `.bc-btn--ghost bc-btn--sm` 按钮组 + 内联 SVG 图标 16px | 播放/暂停/慢放/逐帧/重播；激活态（如 0.5x 生效中）字色 signal |
| D 解说流 | `.bc-kicker` + 自定义解说句组件（见 §7） | 打字机光标 ▍ signal；历史句 chalk 60% |
| D 管线条 | `.bc-pipe` 紧凑横向改造 | 序号 Anton 20px，当前步 signal+橙点，完成步 chalk，待跑步 muted 30% |
| D 数据块 | `.bc-stat` + `.bc-dots` + `.bc-table` 精简 | 大数字 Anton 64px；热图 10×10；数据行 mono 数字列 |
| E scrubber | 自定义（基于 token）+ 事件刻度 ▲ | 轨道 2px `--bc-line`，播放头 8px signal 方块（非圆点——硬朗语言），刻度 signal 三角 |
| 错误卡 | `.bc-card` + `.bc-btn--ghost` | 描边 `--bc-key-red`（语义错误，非装饰），mono 错误码 |
| 全局底层 | 球场线 SVG（S-01）+ `.grain` 噪点 | 与 showcase 同参数 |

**图标方案**：架构已锁定（ARCHITECTURE.md §2.7）——内联 SVG Vue 组件，24×24 viewBox，1.5px 描边，`stroke="currentColor"` + `fill="none"`，round linecap/linejoin，尺寸 16/20/24 三档，颜色一律 currentColor 由范式 token 着色。14 枚图标的语义、落位与 path 级设计规范见本文 **附录 A**。禁止任何 emoji；⬤▲▍● 为文本字形标记，非图标。

---

## 7. 解说面板排版规范（核心差异化体验）

### 7.1 单句结构

```
[02:41] 勒布朗借掩护走左路，【挡拆】后防守收缩，底角出现空位。
└──┬──┘ └──────────────┬────────────────┘ └─┬─┘
 mono 时间戳            正文                  高亮词
```

| 元素 | 字体 | 字号/行高 | 颜色 | 字距 |
|---|---|---|---|---|
| 时间戳 | JetBrains Mono 700 | 12px / 1.5 | `var(--bc-signal)` | 0.08em |
| 正文 | Noto Sans SC 400 | 15px / 1.7 | `var(--bc-chalk)` | 0 |
| 高亮词 | Noto Sans SC 700 | 同正文 | `var(--bc-signal)` | 0，两侧不加括号样式外的装饰——用【】书名号式方括号是文案层的语义标记，视觉上只靠颜色+字重 |
| 打字光标 | 文本字形 `▍` | 随正文 | `var(--bc-signal)` | 闪烁 530ms steps(1) |
| 历史句 | 同正文 | 14px / 1.7 | `var(--bc-chalk)` 60% opacity | — |

### 7.2 打字机节奏

- 速度：**30-45ms/字**（中文按字，数字/英文按 token）；标点处停顿 +120ms（句号）/+60ms（逗号）——制造「解说员在思考」的呼吸感
- 句间：打完 → 光标驻留 400ms → 该句沉为历史句（opacity 降至 60%，150ms 过渡）→ 下一句起打
- 高亮词染色时机：**打字到该词时逐字染色**，不是整句打完再染——评委看到的是「AI 边说边意识到重点」
- 每屏最多 1 个活跃打字句；历史句上限 8 条，溢出向上滚动（滚动容器内，不引起整版面位移）
- 句-事件绑定：每句带 `data-event-id`，与标注层、scrubber 刻度三向同步

### 7.3 高亮词信号橙用量纪律

解说高亮词是信号橙在右栏的主要消耗点，**每句 ≤3 个高亮词**，优先级：战术名 > 关键数字 > 球员决定性动作。整段解说流的橙色文字占比须 <15%——多了就成霓虹灯，丧失「信号」语义。

### 7.4 真实文案示例（禁占位符，按此语感写 mock 数据）

```
[02:41] 勒布朗弧顶持球，【戴维斯】上提做第一次掩护——这是湖人末节第 6 次【高位挡拆】。
[02:38] 防守选择换防，勒布朗没有强攻，把球分给顺下的戴维斯。
[02:35] 戴维斯接球起跳，补防慢了【0.4 秒】——【空位扣篮】，104 比 102。
[02:33] 这记配合的【预期得分 1.72】，是本场第四节效率最高的一次进攻。
```

### 7.5 解说语气三档视觉规范（calm / excited / clutch · 对齐架构 §2.5）

后端 narration 时间轴每句带 `tone` 字段，前端按档切换字幕样式。**"解说感"靠排版表达，不靠语音**（TTS 为可选增强，字幕永远是主路）。

| 维度 | calm（常规） | excited（得分/高重要性） | clutch（决胜时刻） |
|---|---|---|---|
| 触发条件 | 默认档 | importance ≥60 或得分事件句 | importance ≥80，或末节最后 2 分钟且分差 ≤3 |
| 正文字号/字重 | 15px / 400 | 17px / 500 | 20px / 500 |
| 高亮词预算 | ≤3 个/句（§7.3 基线） | ≤5 个/句 | ≤4 个/句，但允许 1 个**关键词升格 Anton 大写**（英文词/数字） |
| 时间戳 | mono 12px signal | mono 12px signal | mono 13px signal 700 + 前置 `▍` 竖条 |
| 打字节奏 | 30-45ms/字，标点停顿 120/60ms | 24-30ms/字（更快），句间停顿减半——语速感 | 40-50ms/字（放慢）+ 句号停顿 ×2——一字一顿的压迫感 |
| 光标 | `▍` signal 闪烁 530ms | 同 calm，闪烁加快至 400ms | `▍` signal + bc-pulse 呼吸 |
| 面板氛围 | 无 | 面板顶出现 mono 状态行 `● run detected`（muted） | 面板顶出现 **clutch pill**（`.bc-pill` 实心 signal + IconFlame 16px chalk）；右栏数据块弹出 **S-09 大数字**（剩余秒数或比分 Anton 64px signal，count-up 入场） |
| 主区联动 | 标准标注 | Telestrator 环 pulse 频率 ×1.5 | **S-03 圆环 + S-09 大数字组合**：圆环 pulse 幅度 1.06→1.10，帧状态行追加 `<em>CLUTCH</em>` |
| 橙色文字占比 | 句内 <15% | 句内 <20% | 句内 ≤25%（仅 clutch 句破例，面板级仍须 ≤10% 面积纪律） |
| 回落 | — | 下一非得分句自动回 calm | 事件结束 + 一句总结句后回落 calm，clutch pill 150ms 淡出 |

**设计意图**：三档是「同一排版系统的张力调节」——只动字号/节奏/橙占比/脉冲四个旋钮，不换字体、不加新色、不改布局。评委看到 clutch 时刻「整个界面安静下来放大一句话」，这就是转播感。

---

## 8. Token 与全局规格（引用 broadcast-code.css，不重定义）

直接引入 `assets/broadcast-code.css` 的 `:root` token 作为唯一色彩/字体来源。本产品的工程映射：

```css
/* Vue 3 工程内的语义别名（component 层，值全部引用范式 primitive） */
:root {
  /* 区域底色 */
  --app-bg: var(--bc-bg);
  --panel-bg: var(--bc-surface);
  --panel-bg-hover: var(--bc-surface-2);
  --frame-bg: var(--bc-navy);
  /* 解说专用 */
  --commentary-text: var(--bc-chalk);
  --commentary-highlight: var(--bc-signal);
  --commentary-history: rgba(245, 242, 236, 0.6);
  /* 标注层 */
  --overlay-ring: var(--bc-signal);
  --skeleton-ball: var(--bc-key-red);
  --skeleton-offball: var(--bc-key-yellow);
  --skeleton-defense: var(--bc-key-cyan);
  /* 结构 */
  --topbar-h: 56px;
  --scrubber-h: 64px;
  --sidebar-w: 288px;
  --panel-w: 360px;
}
```

字体引入（去 Ma Shan Zheng——本产品禁用书法体）：
`https://fonts.googleapis.com/css2?family=Anton&family=JetBrains+Mono:wght@400;700&family=Noto+Sans+SC:wght@400;500;700;900&display=swap`

| 规格 | 值 |
|---|---|
| 间距 | 4px 基准：4/8/12/16/24/32/48；面板 padding 16-24px；栏间距 0（用 1px `--bc-line` 硬分隔，不用 gap 留白） |
| 圆角 | 卡片/按钮/帧 2px；pill 999px；Telestrator 环 50%；其余 0 |
| 动效 | 0.2-0.3s，仅 opacity/transform；入场 8px 上移淡入；禁弹跳；`prefers-reduced-motion` 下关闭 pulse/scanline/dash-run，打字机降级为整句直出 |
| 大屏适配 | 主目标 1920×1080；≥2560px 时栏宽等比放大（352/440px）且 Anton 大数字 +12px；<1280px 警告横幅 `建议 1280px 以上演示` |
| 无障碍 | chalk on bg 对比度 13.5:1；muted 仅非关键文字；全交互键盘可达（§4.2 快捷键表）；focus-visible 2px signal outline；触摸目标 ≥44px（控制条按钮 40px 高 + 4px 外距） |
| z-index | court-bg 0 / grain 1 / 工作台 2 / 标注层 10（帧内）/ 错误层 50 / 顶栏 40 |

---

## 9. 给前端 Agent 的实现提示（Agent Implementation Guide）

1. **状态机先行**：主区是严格状态机 `idle → loading → replaying → annotating(L1-L4) → narrating → settled`，标注层与解说打字机都挂在这个状态机的时间轴上，不要各自 setTimeout——用单一 replay clock 驱动，保证「句-层-刻度」三向同步和可打断性。
2. **打字机**：用 requestAnimationFrame + 字符队列实现，支持中途 `cancel()`；`prefers-reduced-motion` 下整句直出。
3. **骨骼帧**：SVG polyline 组件化（`<SkeletonPlayer :color :points />`），关键点坐标从 mock 数据驱动；帧坐标系固定 viewBox（如 400×225），标注层用同一坐标系绝对定位，禁止 px 硬算。
4. **左栏列表**：>50 条用虚拟滚动；marquee 选中态用 CSS class 切换，四个手柄 `<b>` 元素常驻、仅边框透明度过渡（避免重排）。
5. **信号橙审计**：开发完成后全局搜索 `#F9530C` 与 `--bc-signal` 的使用点，对照 §5 面积预算表复核 ≤10%。
6. **已知坑**：Anton 无中文——中文大标题必须 Noto Sans SC 900；打字光标 `▍` 在不同平台渲染宽度不一，用 `display:inline-block; width:0.5em` 固定；`backdrop-filter` 仅顶栏一处，他处禁用。

---

## 10. 自检清单（交付前已逐项过）

- [x] 零 emoji 功能图标（图标 = 内联 SVG / 文本字形）
- [x] 无紫粉渐变 / 浅色主题 / 圆角气泡 / 毛玻璃 / 柔和阴影（blur 仅顶栏范式白名单）
- [x] 无 lorem ipsum / 空洞文案（全部真实赛场语境）
- [x] 无三列 icon 卡片（功能流程 = 编号管线 S-08）
- [x] 书法字体零使用
- [x] 信号橙 ≤10%（预算 8%），无第二强调色（骨骼三色仅数据标注）
- [x] 签名元素 8/10 落位（≥4 达标）
- [x] 组件 5 态覆盖（§4.3）
- [x] 键盘可达 + reduced-motion + focus-visible

---

## 附录 A · 图标网格与 14 枚图标 path 规范（架构锁定 §2.7）

**网格纪律（不可偏离）**：24×24 viewBox；视觉重心居中，主体落在 20×20 安全区内（四边留 2px 出血）；1.5px 描边、`stroke="currentColor"`、`fill="none"`、round linecap/linejoin；全部用 `<path>` / `<circle>` / `<polyline>` 基本元素，不用 `<rect>` 的 rx 圆角（圆角由 linejoin 表达）；禁止填充式图标、禁止双色。

| # | 组件名 | 语义 / 落位 | 尺寸档 | path 级设计（24 网格） |
|---|---|---|---|---|
| 1 | IconPlay | 播放 / 控制条 | 20 | `M8.5 5.8v12.4L19 12z`（实心感三角：单 path 闭合，linejoin round） |
| 2 | IconPause | 暂停 / 控制条 | 20 | `M9.2 5.5v13` + `M14.8 5.5v13`（两竖线，间距 5.6） |
| 3 | IconFastForward | 快进/下一事件刻度 / 控制条 | 20 | `M5 6.5l6.5 5.5L5 17.5z` + `M12.5 6.5l6.5 5.5-6.5 5.5z`（双三角） |
| 4 | IconReplay | 重播 / 控制条 | 20 | `M4.8 9.2A8 8 0 1 1 4 13.8`（开口弧）+ `M4.2 4.5v5h5`（箭头折角） |
| 5 | IconFramePrev | 逐帧后退 / 控制条 | 16 | `M15.5 6l-6 6 6 6` + `M8.5 6v12`（竖线+左尖括号） |
| 6 | IconFrameNext | 逐帧前进 / 控制条 | 16 | `M8.5 6l6 6-6 6` + `M15.5 6v12` |
| 7 | IconSlowMo | 0.5x 慢放 / 控制条 | 16 | `<circle cx="12" cy="13" r="7.5"/>` + `M12 9v4l2.8 1.8`（表盘+指针）+ `M9 3.5h6`（表冠） |
| 8 | IconVolume | 音量（TTS 开关）/ 顶栏 | 20 | `M4.5 9.5v5h3.5L13.5 19V5L8 9.5z`（喇叭）+ `M16.5 9a4.5 4.5 0 0 1 0 6`（单声波；mute 态斜线 `M17 9.5l4 5M21 9.5l-4 5` 替换声波） |
| 9 | IconSubtitle | 字幕开关 / 顶栏 | 20 | `M3.5 6.5h17v11h-17z`（外框）+ `M7 11.5h4M7 14.5h7`（双行字幕线；off 态线色 muted） |
| 10 | IconCourt | 战术板切换（overlay on/off）/ 主区右上 | 20 | `M3.5 6h17v12h-17z` + `M12 6v12` + `<circle cx="12" cy="12" r="2.8"/>`（半场+中线+中圈） |
| 11 | IconVideo | 视频/帧视图切换 / 主区右上 | 20 | `M3.5 6.5h17v11h-17z` + `M10.3 9.8l4.6 2.7-4.6 2.7z`（帧内小三角） |
| 12 | IconArrowRight | 箭头（列表跳转/事件刻度指示）/ 通用 | 16 | `M4 12h15` + `M13.5 6l6 6-6 6` |
| 13 | IconTargetRing | 瞄准环（Telestrator 图例/标注开关）/ 主区 | 16 | `<circle cx="12" cy="12" r="6.5"/>` + `M12 2.8v3.4M12 17.8v3.4M2.8 12h3.4M17.8 12h3.4`（环+四向刻度） |
| 14 | IconFlame | clutch 标识 / 回合卡片·clutch pill | 16 | `M12 3.2s5.2 4.8 5.2 9.4a5.2 5.2 0 0 1-10.4 0c0-1.9.9-3.6 2.1-4.9.4 1 1 1.7 1.7 2.1C10.6 6.9 12 3.2 12 3.2z`（单焰舌+内卷） |
| 15 | IconDatabase | 数据源 / 数据块栏头 | 16 | `<ellipse cx="12" cy="5.8" rx="7.5" ry="2.8"/>` + `M4.5 5.8v12.4c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8V5.8` + `M4.5 12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8`（圆柱+中缝线） |
| 16 | IconTimeline | 时间轴 / scrubber 栏头 | 16 | `M3.5 12h17` + `M7.5 12V8.5M12 12v3.5M16.5 12V9.5`（主轴+三刻度，刻度高低错落表事件） |

> 清单 16 枚 = 架构 14 枚基线 + 逐帧双枚（IconFramePrev/Next，控制条已规划）。`collapse` 与 `alert` 复用 IconArrowRight（旋转 90°）与文本 mono 错误码表达，不新增图标。
> path 数值允许前端落组件时 ±0.3px 微调对齐像素网格；16px 档渲染时描边视觉等效 1px，无需改 stroke-width（vector-effect: non-scaling-stroke 禁用，保持等比缩放）。

---

## 附录 B · ImportanceBreakdown 可解释打分组件（架构锁定 §2.6）

**定位**：「可解释 AI」路演卖点的视觉载体——评委能看到 AI 为什么认为这个回合关键，每个子项都是一行可讲解的算术。

**落位**：左栏回合卡片**选中展开态**内嵌（默认收起，随 marquee 选中 150ms 展开）；卡片未选中时仅显示总分徽章。

### B.1 结构线框

```
┌──────────────────────────────────────┐
│ #24 ⬤ Q4 02:41            [87] Anton │ ← 总分：Anton 22px，≥80 signal 色 + IconFlame
│ 挡拆顺下 · 戴维斯 +2                  │
│ ── importance breakdown ──────────── │ ← mono 10px muted 分隔行
│ CLU ▓▓▓▓▓▓▓▓▓░ 0.92 ×0.30            │ ← 五项子分：mono 标签 + 微条 + 数值 + 权重
│ DIF ▓▓▓▓▓▓░░░░ 0.61 ×0.25            │
│ RAR ▓▓▓▓▓▓▓▓░░ 0.85 ×0.20            │
│ MOM ▓▓▓▓░░░░░░ 0.44 ×0.15            │
│ STR ▓▓▓▓▓▓▓▓▓▓ 1.00 ×0.10            │
└──────────────────────────────────────┘
```

### B.2 规格

| 元素 | 规格 |
|---|---|
| 标签 | JetBrains Mono 10px，大写，`--bc-muted`，宽 32px 左对齐；五项固定序 `CLU / DIF / RAR / MOM / STR`（与 scoring-rules.js 常量同名，路演时可对照源码讲） |
| 微条 | 高 3px，轨道 `var(--bc-line)` 全长，填充 `var(--bc-chalk)` 按子分值 0-1 等比；**最高子分项填充 signal 色**（每卡片仅 1 条橙条——橙纪律） |
| 数值 | mono 11px `var(--bc-chalk)`，两位小数；权重 mono 10px `var(--bc-muted)`，格式 `×0.30` |
| 总分 | Anton 22px 右对齐；≥80 signal + IconFlame 16px；60-79 chalk；<60 muted |
| 条动画 | 展开时五条从左向右 stagger 填充，每条 200ms、间隔 60ms，ease-standard；reduced-motion 直出 |
| 交互 | hover 单子分行 → 行底 surface-2 + 显示一行中文注解（如 CLU→「关键时刻：末节 & 分差≤5 & 时间越少越高」）；点击行不高亮，纯只读 |
| 数据源 | API `plays/:playId` 返回 `importance` + `breakdown{clutch,difficulty,rarity,momentum,star}`；权重常量与后端 `scoring-rules.js` 顶部注释保持同文案 |
| Edge | 子分缺失时该行整行不渲染（不画 0 值空条）；总分 <40 的回合不展开此组件（低重要性无需解释） |

### B.3 中文注解文案（hover 用，与后端规则一一对应）

```
CLU 关键时刻 —— 第四节 & 分差≤5，剩余时间越少越高
DIF 出手难度 —— 投篮距离越远、防守人越近越高
RAR 稀有度   —— 绝杀 > 压哨 > 扣篮 > 追身三分 > 普通
MOM 势头     —— 连续得分的延续或打断（run length）
STR 主角参与 —— 名单内 star 球员的参与度
```

---

## 变更记录

| 日期 | 变更 | 原因 | 影响范围 |
|---|---|---|---|
| 2026-10-10 | 初版交付（§0-§10） | Phase 1 设计契约 | 全文 |
| 2026-10-10 | §6 图标段改写为架构锁定网格；新增附录 A（16 枚图标 path 规范） | 架构 §2.7 锁定 SVG 图标方案 | 前端 icons/ 目录全部组件 |
| 2026-10-10 | 新增 §7.5 解说语气三档视觉规范 | 架构 §2.5 narration tone 字段落地 | 解说面板、主区标注层联动 |
| 2026-10-10 | §6 回合条目行更新 + 新增附录 B（ImportanceBreakdown 组件） | 架构 §2.6 可解释打分路演卖点 | 左栏回合卡片、后端 breakdown 字段契约 |
