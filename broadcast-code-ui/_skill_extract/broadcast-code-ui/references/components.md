# Broadcast Code UI · 组件规范

所有组件基于 `assets/broadcast-code.css` 的 token。状态必须覆盖 default / hover / active / focus / disabled。

## 目录
1. 按钮 2. 分区标签 3. 卡片 4. 日期 pill 5. 虚线选框 6. Telestrator 标注
7. 点阵数据块 8. 编号管线 9. 大数字统计 10. 赛程时间线 11. 奖项卡
12. 记分/数据表格 13. 导航 14. 表单 15. 页脚 16. 骨骼追踪帧

## 1. 按钮 `.bc-btn`

| 变体 | 样式 | 用途 |
|---|---|---|
| primary | signal 橙底 + chalk 字，Anton 大写 | 唯一主 CTA（每屏 ≤1 个） |
| ghost | 1px `--bc-line` 描边 + chalk 字 | 次级操作 |
| dashed | 1.5px dashed signal + signal 字 | 「被选中」特殊操作 |

- padding `14px 32px`，圆角 2px，字号 16-20px，letter-spacing 0.06em。
- hover：primary 亮度 +8% 并上移 1px；ghost 描边变 signal、字变 signal。
- active：下移 1px。focus-visible：2px signal outline，offset 2px。
- disabled：透明度 0.35，禁止事件。

## 2. 分区标签 `.bc-kicker`

mono 12px 大写 muted，`SECTION / TOPIC` 结构，斜杠信号橙。下接 Anton 大标题（40-96px）。
规范：`<span class="bc-kicker">GAME DATA <i>/</i> AI STORYTELLING</span>`，`<i>` 染色不斜体。

## 3. 卡片 `.bc-card`

- surface 底 + 1px `--bc-line` 描边，圆角 2px，padding 24-32px，无阴影。
- hover：描边变 `#3A3A40`，底变 surface-2，0.25s。
- 卡头可挂 mono 小标签（右上，muted）；卡内标题 Anton 20-28px。

## 4. 日期 pill `.bc-pill`

signal 底 + chalk 字，JetBrains Mono 700 或 Anton，13-16px，padding `4px 14px`，圆角 999px。
仅用于日期/倒计时等关键短信息，一屏 ≤3 个。

## 5. 虚线选框 `.bc-marquee`

1.5px dashed signal 边框，四角 6×6 chalk 实心方块（绝对定位 -4px）。
用于海报式标语高亮、奖项卡头。内部 padding ≥ 16px。选中手柄用 `::before/::after` + 两个 `<i>` 或四个 `<b>`。

## 6. Telestrator 标注 `.bc-tele`

绝对定位：`border: 2px solid var(--bc-signal); border-radius: 50%`，圈内可放十字线（两条 1px signal 45% 长短线）。
配 mono 注释小字（signal 色，10-12px），如 `possession #24 · Q3 07:41`。
可带 `bc-pulse` 2.4s 呼吸动画（scale 1→1.06，reduced-motion 下关闭）。

## 7. 点阵数据块 `.bc-dots`

SVG 圆点阵列（推荐 10×10，r=4，gap=14）：命中点 signal、普通点 chalk 20% 透明度、重点行 chalk 实心。
语义=投篮热图/数据分布；作装饰时置于分区角落，尺寸 120-240px。

## 8. 编号管线 `.bc-pipe`

横向 4 列（移动端纵向）。每步：Anton 48-64px 序号（signal 或 chalk 15% 描边空心）+ mono 小写后缀 + Noto 标题 + 2-3 行说明。
步骤间用 1px `--bc-line` 长线连接，节点 6px signal 圆点。

## 9. 大数字统计 `.bc-stat`

Anton 64-144px chalk（关键数字可 signal），下方 mono 12px muted 说明。
多个 stat 横排时用 1px 竖线分隔，间距 48px。

## 10. 赛程时间线 `.bc-timeline`

纵向：左 rail 1px `--bc-line`，节点 8px signal 圆点；日期 mono signal，标题 Noto 700，说明 muted。
当下节点圆点带 4px 外发光圈（`box-shadow: 0 0 0 4px rgba(249,83,12,.18)`）。

## 11. 奖项卡 `.bc-prize`

surface 底 + marquee 卡头（奖项名）+ Anton 奖项主体 + chalk 奖品清单（1px line 分隔行）。
TOP 1 奖项卡卡头用皮革纹理条（`.bc-leather`）压顶。

## 12. 记分/数据表格 `.bc-table`

无竖线，仅 1px `--bc-line` 横线；表头 mono 12px 大写 muted；数字列 JetBrains Mono；hover 行 surface-2。
排名 1-3 名序号 signal。

## 13. 导航 `.bc-nav`

fixed 顶栏，底 `rgba(11,11,12,.86)` + `backdrop-filter: blur(8px)`（本范式唯一允许 blur 的位置），1px line 底边。
左：赛事 wordmark（Anton）；右：mono 锚点链接 + 一个 primary 小按钮。滚动超过 40px 出现底边线。

## 14. 表单 `.bc-input`

surface 底 + 1px line，圆角 2px，padding `12px 16px`，chalk 字；label mono 12px muted。
focus：描边 signal + 0 0 0 3px rgba(249,83,12,.15)。error：描边 `#E23B3B` + 下方 mono 错误提示。
placeholder：muted 50%。

## 15. 页脚 `.bc-footer`

surface 底，上 1px line。三栏：赛事信息 / 主办方 / mono 备案链接。底部一条皮革纹理细条（4-8px）。

## 16. 骨骼追踪帧 `.bc-frame`

`--bc-navy` 底矩形（比例 16:9 或 4:3），1px line 描边。内嵌 SVG：
- 球场透视线：chalk 12% 透明度 polyline。
- 球员骨架：polyline 连 5-8 个关键点，stroke 1.5px，关键点 r=3 圆点，三色（红=持球/黄=无球跑动/青=防守）。
- 左上 mono 状态行：`Telestrator / possession #24 · Q3 07:41 · AI overlay running`（muted，`running` 用 signal）。
- 可叠 1 个 Telestrator 圆环。
