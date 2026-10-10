# Broadcast Code MVP — 技术架构文档

> NBA 深度赛场可视化 AI Agent | 12h 黑客松参赛作
> 版本：v1.0 | 日期：2026-10-10 | 架构师：高见远
> 状态：已锚定（所有版本号经 npm registry 实测，非记忆值）

---

## 0. 架构结论速览（TL;DR）

| 层 | 选型 | 版本锚定 | 一句话理由 |
|---|---|---|---|
| 前端框架 | Vue 3 (Composition API, `<script setup>`) | 3.5.43 | 团队已定，响应式 + SVG 天然契合战术板 |
| 构建工具 | Vite | 8.3.4 | 秒级冷启动，dev proxy 一行配置解决联调 |
| 后端框架 | Express | 5.3.0 | 只读 JSON 数据集 + 个位数端点，学习成本最低 |
| 数据存储 | JSON 文件数据集 + 内存索引 | — | 零原生依赖，离线 npm install 零风险，人肉可编辑 |
| 战术板动画 | SVG + rAF 插值（Vue 仅管离散状态） | — | 标注层（箭头/圆环/色块）与球员层同一坐标系 |
| 视频 overlay 备路 | HTML5 `<video>` + 绝对定位 SVG 层 | — | 仅在有合法素材时启用，Feature Flag 控制 |
| 解说引擎 | 规则表 + 槽位模板（离线） | — | 可解释、可调试、评委友好；字幕为主，TTS 可选 |
| 图标方案 | 内联 SVG 组件，1.5px 描边，16/20/24px | — | 零依赖，与范式 CSS token 同色体系 |
| 语言 | JavaScript (ESM) + JSDoc 类型注解 | Node.js >= 22.12 | 12h 窗口内免去类型构建摩擦，契约靠 OpenAPI + 运行时校验 |

**运行时依赖总清单（全部，就这些）：**

| 端 | 依赖 | 版本 |
|---|---|---|
| server | express | 5.3.0 |
| web | vue | 3.5.43 |
| web (dev) | vite | 8.3.4 |
| web (dev) | @vitejs/plugin-vue | 6.0.9 |

不引入：pinia（用 composable 替代）、axios（用原生 fetch）、TypeScript/vue-tsc（12h 窗口权衡，见 ADR-005）、任何 UI 组件库（broadcast-code-ui 范式自带 CSS）、任何图标库、任何动画库、任何数据库驱动。

---

## 1. 系统架构图（ASCII）

```
┌──────────────────────────────────────────────────────────────────┐
│                        浏览器 (localhost)                         │
│ ┌──────────────────────────────────────────────────────────────┐ │
│ │  Vue 3 SPA (Vite build → web/dist)                           │ │
│ │                                                              │ │
│ │  ┌─────────────┐  ┌──────────────────┐  ┌─────────────────┐  │ │
│ │  │ GamePicker  │  │ CourtBoard (SVG) │  │ NarrationTicker │  │ │
│ │  │  选比赛/回合 │  │  战术板重演主画面 │  │  解说字幕条      │  │ │
│ │  └──────┬──────┘  └────────┬─────────┘  └────────┬────────┘  │ │
│ │         │                  │                     │           │ │
│ │  ┌──────▼──────────────────▼─────────────────────▼────────┐  │ │
│ │  │  composables: usePlayback (rAF 时钟)                    │  │ │
│ │  │               useTrackingLerp (帧插值 → 直接写 SVG attr) │  │ │
│ │  │               useNarrationSync (字幕/可选 TTS)           │  │ │
│ │  └──────────────────────────┬────────────────────────────┘  │ │
│ │                             │ fetch /api/v1/*               │ │
│ └─────────────────────────────┼───────────────────────────────┘ │
└───────────────────────────────┼─────────────────────────────────┘
                                │  dev: Vite proxy → :8787
                                │  prod: 同源（Express 托管 dist）
┌───────────────────────────────▼─────────────────────────────────┐
│              Node.js 22 + Express 5.3.0 (server/)               │
│                                                                 │
│  ┌──────────────┐   ┌────────────────────┐   ┌───────────────┐  │
│  │ routes/      │──▶│ services/          │──▶│ repositories/ │  │
│  │ games.js     │   │ analysis.service   │   │ dataset.repo  │  │
│  │ plays.js     │   │ narration.service  │   │ (启动时全量    │  │
│  │ (controller) │   │ overlay.service    │   │  加载+索引)    │  │
│  └──────────────┘   └─────────┬──────────┘   └───────┬───────┘  │
│                               │                      │          │
│                     ┌─────────▼──────────┐   ┌───────▼───────┐  │
│                     │ lib/               │   │ data/games/   │  │
│                     │ scoring-rules.js   │   │ *.json        │  │
│                     │ templates.js       │   │ (mock 深度    │  │
│                     │ importance 打分     │   │  追踪数据集)   │  │
│                     └────────────────────┘   └───────────────┘  │
│                                                                 │
│  启动流程: 读 data/games/*.json → 运行时校验(schema assert)      │
│           → 跑 importance 打分 + overlay 生成 + 解说渲染         │
│           → 内存索引 {gameId → Game} → listen :8787             │
└─────────────────────────────────────────────────────────────────┘
```

管线 `input → analyze → visualize → narrate` 的落地映射：

| 管线阶段 | 落地位置 | 时机 |
|---|---|---|
| input | `server/data/games/*.json`（mock 追踪数据集） | 赛前准备（不进 12h 关键路径，提前生成） |
| analyze | `services/analysis.service.js` + `lib/scoring-rules.js` | **服务启动时预计算**，结果随 API 下发 |
| visualize | 前端 `CourtBoard.vue` + `TelestratorLayer.vue`（overlay 由后端 `overlay.service.js` 预生成坐标） | 播放时 |
| narrate | `services/narration.service.js` 预渲染文案 → 前端 `useNarrationSync` 按时间轴播字幕 | 播放时 |

设计要点：**analyze 和 narrate 都是启动时预计算，不是请求时计算**。路演现场点了就出，零等待，也杜绝了现场算力抖动。请求路径是纯读取。

---

## 2. 技术选型对比矩阵

评分维度：学习成本(高权重) / 生态成熟度(高) / 离线部署可靠性(高) / 性能(低，本场景无并发压力) / 扩展性(低)。5 分制。

### 2.1 后端框架（三选一）

| 维度 | Express 5.3.0 | Fastify 5.12.5 | Koa 3.2.1 |
|---|---|---|---|
| 学习成本 | 5（概念只有路由+中间件） | 3（插件封装模型需理解） | 4（洋葱模型直观但一切自装） |
| 生态成熟度 | 5（最大中间件生态） | 4 | 3 |
| 内建能力 | 3（校验需手写） | 5（JSON Schema 校验内建） | 2（裸核，body 解析都要装） |
| 性能 | 3 | 5 | 3 |
| 离线 npm 可靠性 | 5（纯 JS） | 5（纯 JS） | 5（纯 JS） |
| 12h 适配 | **5** | 4 | 3 |
| **加权总分** | **4.5（选定）** | 4.1 | 3.4 |

**决策：Express 5.3.0。** 端点只有 6 个且全部只读，Fastify 的 schema 校验优势用不上（输入只有路径参数和 top=N 查询参数），其插件封装模型的学习成本反而成为净负债。

**已知坑（内嵌硬约束）——Express 5 与 Express 4 的 breaking changes，生成代码极易写错：**

1. 通配符路由：`app.get('*')` 在 v5 中**非法**（path-to-regexp v8），静态托管兜底必须写 `app.get('/{*splat}', ...)` 或用 `app.use()` 兜底。
2. `req.query` 变为 getter，不可整体赋值覆盖。
3. 异步路由抛错自动进入错误中间件（v4 需手动 next(err)）——错误中间件签名仍是 4 参数 `(err, req, res, next)`。
4. `res.send(status)` 已移除，必须 `res.sendStatus(status)` 或 `res.status(n).send(body)`。
5. 生成代码时**禁止凭 Express 4 印象写 API**，以 5.3.0 文档为准。

### 2.2 数据存储（JSON 文件 vs SQLite）

| 维度 | JSON 文件数据集（选定） | better-sqlite3 13.0.3 |
|---|---|---|
| 离线 npm install | **5（纯 JSON，零安装）** | **1（原生模块，需下载 prebuilt 二进制或现场编译——黑客松现场网络的最大单点故障）** |
| 数据可编辑性 | 5（人肉可写、git diff 友好、demo 前可调） | 2（二进制，需工具） |
| 查询能力 | 3（全量内存 + JS filter，数据量小完全够） | 5 |
| Schema 约束 | 2（需自写运行时校验，约 60 行） | 4 |
| 迁移成本 | N/A | N/A |
| **加权总分** | **4.2（选定）** | 2.6 |

**决策：JSON 文件 + 启动时全量加载建内存索引。** 决定性因素是离线约束：better-sqlite3 的 prebuilt 二进制在 `npm install` 时需从 GitHub Releases 下载，现场网络一旦受限即整体翻车——这与"npm install 后即用"的 P0 约束直接冲突。数据规模（2-3 场比赛、每场 8-12 个关键回合、每回合约 100 帧）全量进内存不到 20MB。

**补偿措施：** 启动时跑 `lib/dataset-validator.js` 手写运行时校验（字段存在性/类型/取值范围/帧时间单调性），校验失败拒绝启动并打出具体文件+路径——把 SQLite 的 schema 约束换成启动门禁，防"沉默数据错误"。

### 2.3 战术板动画引擎

| 维度 | SVG + rAF 插值（选定） | Canvas 2D | 第三方动画库（GSAP 等） |
|---|---|---|---|
| overlay 叠加（箭头/圆环/标注） | **5（与球员同 DOM 树同坐标系，CSS 可控）** | 3（标注需自绘命中检测） | — |
| 与范式契合（Telestrator 描边动画） | 5（`stroke-dashoffset` 原生支持） | 2（需手算） | 4 |
| 性能（11 个运动实体） | 5（远低于 SVG 阈值） | 5 | 5 |
| 可调试性 | 5（DevTools 直接看节点） | 2（位图） | 4 |
| 依赖体积 | 5（零依赖） | 5（零依赖） | 2（+30KB 起） |
| **加权总分** | **5.0（选定）** | 3.2 | 3.4 |

**决策：SVG。** 运动实体只有 10 名球员 + 1 颗球 + 若干标注，SVG 性能毫无压力；而 Telestrator 圆环描绘（`stroke-dashoffset`）、虚线选框、半透明色块这些范式签名元素在 SVG 里是免费午餐。

**已知坑（内嵌硬约束）：** 60fps 逐帧更新**禁止走 Vue 响应式**（每帧 11 个 reactive 写入会触发调度风暴）。正确姿势：Vue 响应式只管离散状态（当前回合、播放/暂停、比分），逐帧坐标由 rAF 循环通过 `ref` 拿到的 SVG 元素句柄**直接写 `transform` attribute**。此条写入 Spec 作为验收项。

**插值方案：** mock 数据 10fps（每 100ms 一帧，控制 JSON 体积），前端 rAF 按 `performance.now()` 做线性插值（lerp）到显示帧率。球加 z 轴（高度）用于投篮弧线的 y 方向视差偏移。急停/变向场景线性插值会有"滑冰感"——接受，12h 内不上 easing 曲线拟合。

### 2.4 视频 overlay 备路

| 方案 | 说明 | 结论 |
|---|---|---|
| HTML5 `<video>` + 绝对定位 SVG overlay | rAF 每帧读 `video.currentTime`，查时间映射表驱动 overlay | **选定（备路）** |
| Canvas 绘制视频帧 + overlay | 控制力强但代码量翻倍 | 弃用 |
| WebCodecs 逐帧同步 | 精度最高，复杂度过载 | 弃用 |

**同步设计：** 每回合配置 `videoOffsetMs`（回合起点在视频中的毫秒偏移）。rAF 循环里 `localTime = video.currentTime * 1000 - videoOffsetMs`，overlay 用与战术板完全相同的渲染函数，仅输入时钟不同。**坑：** 不要用 `timeupdate` 事件驱动（约 4Hz，肉眼卡顿），必须 rAF 读 `currentTime`。

**风险标记：** 真实 NBA 比赛视频有版权风险，且大体积视频文件挤占演示包。视频 overlay 仅当赛前能取得合法短片段（≤30 秒）才启用，由 Feature Flag `?flags=video` 开启；**战术板重演永远是主路，视频只是加分项**。路演脚本不得依赖视频可用。

### 2.5 解说规则引擎

| 方案 | 说明 | 结论 |
|---|---|---|
| 规则表 + 槽位模板（选定） | 条件规则命中 → 选模板 → 填槽 → 时间轴字幕 | **选定** |
| 本地小模型（Ollama） | 现场机器算力不可控，安装 GB 级模型违背零依赖 | 弃用 |
| 预写死文案 | 失去"AI Agent"叙事，无法现场换回合演示 | 弃用 |

**引擎设计（约 200 行）：**

```
Play 特征提取（analyze 阶段产出，随 API 下发）
  └─ { playType, shotDistanceFt, nearestDefenderFt, period,
       clockRemainingSec, scoreMargin, isLeadChange, runLength, starInvolved }
        │
        ▼
规则表（lib/commentary-rules.js，按 priority 降序逐条匹配，取首条命中）
  ├─ { when: p => p.period===4 && p.clockRemainingSec<60 && p.isLeadChange,
  │    tone: 'clutch',   template: 'clutch_01', priority: 100 }
  ├─ { when: p => p.shotDistanceFt>=27 && p.result==='made',
  │    tone: 'excited',  template: 'deep_three_01', priority: 80 }
  ├─ { when: p => p.nearestDefenderFt<2 && p.result==='made',
  │    tone: 'excited',  template: 'tough_shot_01', priority: 75 }
  └─ ...（12-18 条规则覆盖全部回合类型，含 3 条兜底规则保证必命中）
        │
        ▼
槽位模板（lib/templates.js）
  'deep_three_01': '距离三分线外 {distanceFt} 英尺，{player} 迎着 {defender} 果断出手——命中！'
        │
        ▼
时间轴输出 narration: [{ t0, t1, text, tone }]  ← 随回合 JSON 下发
```

- **语气分三档** calm / excited / clutch，前端用不同字幕样式（字号/信号橙占比/脉冲）表达——"解说感"靠排版而非语音也能立住。
- **TTS 为可选增强**：浏览器原生 SpeechSynthesis API，零依赖。但现场机器中文语音包有无不可控——**字幕永远是主路**，TTS 由 `?flags=tts` 开启且代码必须容忍 `speechSynthesis.getVoices()` 为空。
- 解说文案遵循 P0 规则：无 emoji、无 AI 模板味空话，每条模板写出"现场解说员会说的话"。

### 2.6 关键回合识别算法（可解释打分）

不用黑盒模型，用加权规则打分——评委能看懂、现场能讲清、UI 能展示分数构成：

```
importance = 100 * (
    0.30 * clutchScore      // 第四节 & 分差≤5 & 剩余时间越少越高
  + 0.25 * difficultyScore  // 投篮距离 + 最近防守人距离（越远越近越高）
  + 0.20 * rarityScore      // 回合类型稀有度（绝杀>压哨>扣篮>追身三分>普通）
  + 0.15 * momentumScore    // 个人/球队连得分的延续或打断（run length）
  + 0.10 * starScore        // 主角球员参与度（名单内 star 标记）
)
```

- 每个子分数 0-1，公式写在 `lib/scoring-rules.js`，**每个子项都是一行可讲解的算术**。
- API 返回 importance 总分 + 五项子分（breakdown），前端在回合卡片上渲染微型条形分解——这本身就是"可解释 AI"的路演卖点。
- 权重写在文件顶部常量，路演前 10 分钟可调。

### 2.7 SVG 图标方案（锁定）

| 项 | 锁定值 |
|---|---|
| 形态 | 内联 SVG Vue 组件（`web/src/components/icons/IconXxx.vue`），不引入任何图标库 |
| 网格 | 24×24 viewBox 基准 |
| 描边 | 1.5px，`stroke="currentColor"`，`fill="none"`，round linecap/linejoin |
| 尺寸 | 16 / 20 / 24 三档，用 `width/height` prop 控制 |
| 颜色 | 一律 `currentColor`，由范式 CSS token 着色 |
| 清单 | 播放/暂停/快进/回放/音量/字幕开关/战术板切换/视频切换/箭头/瞄准环/火焰(clutch 标识)/数据源/时间轴——约 14 个 |

**禁止 emoji 作为功能图标（P0）。** 设计师按上述网格产出 path，前端逐个落为组件。

---

## 3. 分层与目录结构

约束：单文件 ≤ 300 行、单一职责、入口只装配、按资源分包。

```
broadcast-code-mvp/
├── package.json                  # 根编排：dev/build/start 三个 script
├── docs/
│   ├── ARCHITECTURE.md           # 本文档
│   ├── api/openapi.yaml          # 接口契约（前后端唯一依据）
│   └── decisions/ADR-*.md        # 选型决策留痕
├── server/
│   ├── package.json
│   ├── src/
│   │   ├── index.js              # 入口：仅装配（加载数据→校验→预计算→起服务）
│   │   ├── app.js                # express 实例 + 中间件 + 路由挂载
│   │   ├── routes/
│   │   │   ├── games.js          # GET /games, GET /games/:id
│   │   │   └── plays.js          # GET /games/:id/plays, GET /games/:id/plays/:playId
│   │   ├── services/
│   │   │   ├── analysis.service.js   # importance 打分编排
│   │   │   ├── overlay.service.js    # 生成箭头/圆环/色块 overlay 坐标
│   │   │   └── narration.service.js  # 规则匹配 + 模板渲染 → 时间轴
│   │   ├── repositories/
│   │   │   └── dataset.repository.js # 读盘 + 内存索引 {gameId→Game}
│   │   ├── lib/
│   │   │   ├── scoring-rules.js      # 五项子分公式 + 权重常量
│   │   │   ├── commentary-rules.js   # 解说规则表
│   │   │   ├── templates.js          # 槽位模板 + 填槽函数
│   │   │   ├── dataset-validator.js  # 启动时运行时校验（失败拒启）
│   │   │   └── court-geometry.js     # 球场坐标常量 + 几何工具
│   │   └── middleware/
│   │       └── error-handler.js      # 统一 {code,data,message} 响应
│   └── data/
│       └── games/
│           ├── gsw-vs-lal-2024q4.json    # mock 比赛 1（完整深度数据）
│           └── bos-vs-den-2024q4.json    # mock 比赛 2
├── web/
│   ├── package.json
│   ├── vite.config.js            # proxy /api → :8787；build outDir dist
│   ├── index.html
│   ├── public/
│   │   ├── fonts/                # 本地化字体子集（Anton/JetBrains Mono/Noto Sans SC）
│   │   └── video/                # 可选：合法短片段（仅 video flag 用）
│   └── src/
│       ├── main.js               # 入口：仅挂载
│       ├── App.vue               # 布局骨架（转播终端三段式）
│       ├── styles/
│       │   ├── broadcast-code.css    # 范式 token（skill 资产，原样引入）
│       │   └── fonts.css             # @font-face 本地字体声明
│       ├── api/
│       │   └── client.js         # fetch 封装 + 统一错误 + 类型 JSDoc
│       ├── types/
│       │   └── domain.js         # 纯 JSDoc typedef（与 openapi.yaml 对齐）
│       ├── composables/
│       │   ├── usePlayback.js        # rAF 主时钟：play/pause/seek/rate
│       │   ├── useTrackingLerp.js    # 帧插值 → 直接写 SVG attr（不走响应式）
│       │   ├── useNarrationSync.js   # 字幕时间轴 + 可选 TTS
│       │   └── useFlags.js           # ?flags=video,tts 解析
│       ├── components/
│       │   ├── court/
│       │   │   ├── CourtBoard.vue        # 球场底图（线/弧/圈，静态 SVG）
│       │   │   ├── PlayerDots.vue        # 10 球员 + 球（rAF 驱动 transform）
│       │   │   └── TelestratorLayer.vue  # 箭头/圆环/色块 overlay
│       │   ├── video/
│       │   │   └── VideoOverlay.vue      # 备路：video + 复用 TelestratorLayer
│       │   ├── narration/
│       │   │   ├── NarrationTicker.vue   # 解说字幕条（三档语气样式）
│       │   │   └── ScoreBug.vue          # 转播角标：比分/节次/时钟
│       │   ├── plays/
│       │   │   ├── PlayList.vue          # 关键回合列表（importance 排序）
│       │   │   └── ImportanceBreakdown.vue # 五项子分微型条形图
│       │   └── icons/                  # 内联 SVG 图标组件 ×14
│       └── pages/
│           └── BroadcastPage.vue       # 唯一页面：选比赛 → 看板 → 播回合
└── tools/
    └── gen-mock-game.mjs         # mock 数据生成器（脚本化造回合帧，赛前跑）
```

**prod 运行形态（路演现场）：**
```
npm ci && npm run build && npm start
# = Express 单进程：托管 web/dist 静态文件 + /api/v1/*，访问 http://localhost:8787
```
dev 形态：两个终端，`server: npm run dev`（node --watch）+ `web: vite`，Vite proxy 转发 /api。

---

## 4. API 端点草案（v1）

统一响应壳：`{ "code": 0, "data": ..., "message": "" }`；错误时 code 非 0。完整契约见 `docs/api/openapi.yaml`（前后端联调唯一依据）。

| Method | Path | 说明 | 关键参数/返回 |
|---|---|---|---|
| GET | /api/v1/health | 存活探针 | `{ status: "ok", games: 2 }` |
| GET | /api/v1/games | 比赛列表 | `[{ gameId, home, away, date, playCount }]` |
| GET | /api/v1/games/:gameId | 比赛详情 | 含两队 roster、court 配置、finalScore |
| GET | /api/v1/games/:gameId/plays?top=N | 关键回合列表 | 按 importance 降序，含 breakdown 五项子分 |
| GET | /api/v1/games/:gameId/plays/:playId | 回合全量载荷 | frames[] + overlays[] + narration[] + importance |
| GET | /api/v1/meta/flags | Feature Flag 状态 | `{ video: true, tts: true }`（服务端可强制关） |

错误码：0 成功；1001 比赛不存在；1002 回合不存在；1003 数据集校验失败（启动期，理论上运行期不可达）；2000 服务器内部错误。无认证、无分页（数据量个位数）、无写端点——**out-of-scope 明确：用户系统、实时数据接入、持久化写、鉴权一律不做**。

---

## 5. 数据模型草案

坐标系：球场 94ft × 50ft，SVG viewBox `0 0 940 500`（1ft = 10 单位），原点在左侧底线-边线交点。

```js
// Game
{
  gameId: "gsw-vs-lal-2024q4",
  meta: { date: "2024-12-25", venue: "Chase Center", label: "勇士 vs 湖人 · 第四节" },
  home: { teamId: "gsw", name: "金州勇士", abbr: "GSW", color: "#1D428A",
          players: [{ playerId: "gsw-30", name: "Stephen Curry", number: 30, star: true }] },
  away: { /* 同构 */ },
  finalScore: { home: 115, away: 113 },
  plays: [Play]                       // 8-12 个，已按 importance 降序
}

// Play（analyze + narrate 预计算完成后的最终形态）
{
  playId: "p008",
  period: 4, clockLabel: "00:42.3", gameClockSec: 42.3,
  scoreBefore: { home: 110, away: 113 },
  type: "three_pointer",              // three_pointer|layup|dunk|mid_range|steal_fastbreak|block...
  result: "made",                     // made|missed
  points: 3,
  actors: { shooter: "gsw-30", defender: "lal-23", assister: "gsw-23" },
  features: {                         // 解说规则 + 打分的输入，可解释性核心
    shotDistanceFt: 29.4, nearestDefenderFt: 1.8,
    clockRemainingSec: 42.3, scoreMargin: -3,
    isLeadChange: true, runLength: 8, starInvolved: true
  },
  importance: { total: 0.91, breakdown: { clutch: 0.95, difficulty: 0.88, rarity: 0.9, momentum: 0.8, star: 1.0 } },
  durationMs: 8200,
  frames: [Frame],                    // 10fps，t 每 100ms 一档
  overlays: [Overlay],                // overlay.service 预生成
  narration: [{ t0: 0, t1: 2600, tone: "clutch", text: "距离三分线外两步——库里迎着詹姆斯出手！" }],
  video: { available: false, src: null, offsetMs: 0 }   // 备路映射，默认空
}

// Frame（10fps；前端 lerp 到显示帧率）
{ t: 1200,                            // 回合内毫秒
  ball: { x: 47.0, y: 25.0, z: 0.0 }, // 单位 ft；z 为球高度，投篮弧线用
  players: [{ id: "gsw-30", x: 62.3, y: 12.1 }, ...]  // 恒 10 个
}

// Overlay（三类，t0/t1 控制出现窗口；坐标已是 ft，前端 ×10 直接落 viewBox）
{ kind: "arrow", from: [47, 25], to: [70.5, 25], label: "无球掩护路线", t0: 0, t1: 2400 }
{ kind: "ring",  playerId: "gsw-30", color: "signal", t0: 1800, t1: 5200 }
{ kind: "zone",  polygon: [[62,8],[75,8],[75,22],[62,22]], opacity: 0.15, t0: 800, t1: 3000 }
```

**Mock 数据生成策略：** 不手写帧坐标——`tools/gen-mock-game.mjs` 用参数化轨迹函数（直线跑位 + 贝塞尔弧线 + 投篮抛物线）合成 10 人帧序列，再人工微调 actors 与 features。2 场比赛 × 10 回合 × 约 80 帧，生成脚本 1.5h 内可完成。

---

## 6. 风险与对策

| # | 风险 | 概率 | 影响 | 对策 |
|---|---|---|---|---|
| R1 | 现场 `npm install` 失败（网络限制/原生模块） | 中 | 致命 | 全链路零原生依赖（已排除 sqlite）；`package-lock.json` 提交；**赛前打包完整 `node_modules` tar 备份 + 本地 `npm run build` 产物提交仓库**，现场可跳过 install 直接 `npm start` |
| R2 | CDN 字体离线不可用 | 高 | 高 | 字体全部本地化到 `web/public/fonts`（子集化压体积），`@font-face` 引入；禁止任何 CDN 引用——**全项目 grep `https://` 作为验收项** |
| R3 | Express 5 被生成成 Express 4 写法（幻觉 API） | 高 | 中 | 本文档 §2.1 五条 breaking changes 内嵌 Spec；`package.json` 锁 `5.3.0` 精确版本 |
| R4 | Vue 响应式 60fps 逐帧更新导致卡顿 | 中 | 高 | 硬约束：逐帧写 SVG attribute 走 ref 直写，响应式只管离散状态；写入 Spec 验收项 |
| R5 | 视频版权/体积/同步复杂度 | 高 | 中 | 视频仅备路 + Feature Flag；路演主脚本只用战术板；无合法素材则整场不开 flag |
| R6 | SpeechSynthesis 现场无中文语音 | 中 | 低 | 字幕为主路；TTS 必须优雅降级（无语音包则静默关闭，不报错不阻塞） |
| R7 | Mock 数据造假感被评委质疑 | 低 | 中 | features/importance breakdown 全量可展示，"可解释规则"转成正向卖点；轨迹按真实跑位模式参数化 |
| R8 | 12h 内单文件膨胀失控 | 中 | 中 | 300 行硬上限；Phase 3 开发前 Spec 点名文件清单，禁止"在相关地方改" |

## 7. 时间预算（12h 校验）

| 块 | 预估 | 说明 |
|---|---|---|
| 后端（路由+校验+打分+解说引擎） | 2.0h | 全部纯 JS 无框架魔法 |
| Mock 数据生成器 + 2 场比赛 | 1.5h | 可与后端并行 |
| 前端战术板 + overlay + 播放时钟 | 4.0h | 最大块，优先保 |
| 解说字幕 + 回合列表 + 角标 | 1.5h | 复用范式组件 |
| 联调 + 构建 + 离线演练 + 缓冲 | 3.0h | 含 R1 离线彩排一次 |
| **合计** | **12.0h** | 视频 overlay 备路在缓冲内，做不完就砍 |

成本参考（development-costs.md）：此类单页可视化工具传统约 1-1.5 人月，AI 辅助 + 范围极限裁剪后 12h 可达——前提是 out-of-scope 守死。

## 8. 活规格维护

实现与本文档冲突时**先改文档再改代码**；关键决策见 `docs/decisions/ADR-*.md`；API 变更必须先改 `docs/api/openapi.yaml` 并经 Team Lead 同步前后端。
