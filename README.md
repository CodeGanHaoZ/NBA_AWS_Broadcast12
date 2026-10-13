# Broadcast Code — NBA 深度赛场可视化 AI Agent

读取深度赛场数据，识别关键回合，把跑位、空档、防守变化以箭头、色块、球员标注叠加到战术板上逐帧重演，并生成与画面逐秒同步的篮球解说。单机离线运行，无任何外部网络依赖。

> Broadcast Code 12h 黑客松参赛作品（NBA × 亚马逊云科技）。
> 数据集为参数化轨迹生成器合成的演示数据，路演中如实标注「演示数据」，指标计算逻辑真实。

**在线预览**：<https://d35ms19zcr5b08.cloudfront.net/>


<img width="2560" height="1389" alt="image" src="https://github.com/user-attachments/assets/80b4b543-c5e0-4907-9488-bbc18e357232" />

<img width="2560" height="1389" alt="image" src="https://github.com/user-attachments/assets/01c64a19-9c1a-40ad-994d-b32344b52916" />

---

## 本轮迭代更新（2026-10-10）

在 MVP 交付版本基础上的第二轮迭代，聚焦「实拍视频融合 + 全站动效 + 移动端适配」：

### 实拍视频融合（转播台左右布局）

- 视频管线：原始 `output.avi`（XVID 1080p59.94 90Mbps）经 ffmpeg（imageio-ffmpeg 静态二进制）转码为 H.264 MP4（720p30 faststart，16.3MB），产物随前端静态资源分发：`web/public/media/processed-feed.mp4`
- 转播台改为**左右双栏**：左栏完整展示处理完成视频（16:9 contain，不裁切）+ PROCESSED FEED 标签 / LIVE 呼吸徽章 / FEED MONITOR 信号监视面板（源/输出/管线/延迟参数 + 错峰电平表）；右栏为 TACTICAL OVERLAY 战术台（合成球场 + 四层标注）
- **视频与母钟逐帧同步**：视频从动于全局时钟 bT，漂移 >0.18s 才 seek 校正；暂停/拖动时间轴/切换回合均联动
- 下三分之一解说条移出舞台，改为横跨双栏的独立卡片（渐变底 + 证据芯片可点击回跳）

### 全站动效体系

- 图表：速度曲线 clip-path 擦除入场 + 辉光垫层 + 流光点（Motion Path 沿曲线巡游）、跑动距离/事件分布条形生长 + 数值弹入、KPI 滚动计数
- 洞察面板：格子级联滑入 + 数值滚动 + 橙色信号轮巡高亮（6.5s 循环）+ 顶部扫光线
- 投篮热点图：战术台同款科技感（径向渐变透明底 + 坐标网格 + HUD 角标），出手点逐个弹入 + 命中点辉光呼吸 + 切换范围/回合自动重放
- 转播台：选中球员脉冲环、解说换行滑入、比分跳动、播放头光晕、舞台扫描线、导航/记分条/时间轴全区域驻留动效
- 全部动效遵循 `prefers-reduced-motion` 系统偏好自动禁用

### 移动端适配

- 顶栏三行布局（品牌+操作 / 导航整行带分隔线 / 记分条），≤768px 导航改横向滑动（移动端标准模式）
- 战术台/视频双栏 900px 以下自动单列堆叠，雷达/电平表自适应填充
- 返回顶部按钮（回顶后动效可重放），769–1120px 中间断点专项处理

### 稳定性修复

- 修复球员引力大数字切换不联动（v-countup 指令依赖 updated 钩子不可靠 → 改组件内 watch 驱动滚动计数）
- 修复 CSS 特异性冲突导致的移动端导航与记分条重叠（`.vb-bx.vb-shell` 行高锁死）
- 修复热点图弹入只播一次、切换范围不重放的问题（`:key=数据指纹` 强制重挂载）

---

## 产品管线

```
 input                analyze                visualize              narrate
+-----------+      +---------------+      +-----------------+     +----------------+
| 深度赛场  |  ->  | 关键回合识别  |  ->  | SVG 战术板重演  | ->  | 逐秒同步解说   |
| 数据集 x2 |      | importance   |      | 四层标注叠加     |     | 规则引擎 + 模板 |
| (JSON)    |      | 五维加权排序 |      | 骨架/箭头/色块/ |     | calm/excited/  |
|           |      | 三大指标计算 |      | 球员标注        |     | clutch 三档    |
+-----------+      +---------------+      +-----------------+     +----------------+
   server/            server/src             web/src             server/src/
   data/games         games + meta           CourtBoard          narration/
```

四段管线缺一不可：数据进，复盘出。解说与标注消费同一份事件序列，帧级同步（QA 实测 16 回合锚点偏差 0ms）。

---

## 快速启动

环境要求：Node.js >= 20，Chrome/Edge 最新两版。

方式一：一键启动（推荐，自动探明 preview 实际端口）

```bash
node scripts/start-all.mjs
```

方式二：两个终端手动启动

```bash
# 终端 1 — 后端 API（:3000）
cd server
npm install
npm start

# 终端 2 — 前端（先构建再预览，4173 起自动选端口）
cd web
npm install
npm run build
npm run preview
```

启动后访问 Vite 控制台打印的 preview 地址（本机 4173/4174 被占用时会自动顺延，QA 环境实测为 4175）。前端 dist 产物以相对路径调用 API，由 preview 的 `/api` 代理转发到 :3000，**两个服务都要开**。

验证：

```bash
curl -s http://localhost:3000/health          # {"status":"ok","games":2}
curl -s http://localhost:3000/api/v1/games    # 2 场比赛（g001 HOU@DAL / g002 LAL@GSW）
```

离线现场（跳过 npm install）：见 `release/offline-kit/README.md`，解压依赖包后直接 `npm start` / `npm run preview`。

---

## 路演演示脚本（约 3 分钟）

| 步骤 | 操作 | 讲解要点 |
|------|------|----------|
| 1 | 打开 preview 地址，等待开屏 | 首回合（压哨回合，importance 最高）自动选中并开始重演——「关键回合识别引擎已经排好序了」 |
| 2 | 速度切 0.5x，观看战术板重演 | 四层标注逐层出现：L1 持球人橙环 → L2 战术标签 → L3 跑位虚线 → L4 终结点；强调逐帧数据驱动，非预制动画 |
| 3 | 指向右侧解说面板 | 打字机解说与画面逐秒同步（锚点级），clutch 时刻文案换档、关键词染橙；右栏三大指标随播放头实时跳动 |
| 4 | 点击 overlay on/off 开关反复对比 | 叠加层一开一关，直观展示「AI 看到的」与「原始跑位」的差异——对比演示杀手锏 |
| 5 | 顶栏切到 g002（LAL-GSW） | 列表与战术板整体刷新，进攻方向镜像到左半场，解说面板清空重载——验证不是单场硬编码 |

兜底问答：数据为演示数据（生成器含 seed，确定性可重建）；解说为规则引擎 + 模板（离线铁律，LLM 接入为赛后规划，见 docs/PRD.md）。

---

## 目录索引

```
broadcast-code-mvp/
├── server/                 后端（Express 5 只读 API）
│   ├── src/                app 入口 / games 索引 / meta / narration 规则引擎
│   ├── data/games/         预置数据集（g001 / g002，seed 确定性生成）
│   ├── tools/              gen-mock-game.mjs 数据生成器
│   └── test/               narration 契约单测（node --test，6/6）
├── web/                    前端（Vue 3 SPA 单页）
│   ├── src/                App / components / lib(clock 单一时钟) / styles
│   ├── public/fonts/       本地化字体（Anton / JetBrains Mono / Noto Sans SC）
│   ├── public/media/       处理完成视频（processed-feed.mp4，与时间轴同步播放）
│   └── dist/               构建产物（npm run build 生成）
├── scripts/
│   └── start-all.mjs       一键启动后端 + preview（Ctrl+C 全部清理）
├── release/offline-kit/    离线保险包（node_modules tar 包 + dist 副本）
└── docs/
    ├── PRD.md              产品需求：12h 里程碑、路演关注点、风险
    ├── SPEC.md             锁定规格：范围 / 技术栈 / API / 验收标准 EARS
    ├── ARCHITECTURE.md     架构设计
    ├── UIUX.md             UI/UX 设计规范
    ├── api/                openapi.yaml + dataset-contract + narration-rules
    ├── decisions/          ADR-001 ~ ADR-005（Express5 / JSON / SVG / 离线资产 / JS）
    ├── design/             icons.md 图标语义清单
    └── qa/                 QA-REPORT.md（12/12 PASS、GO 判定）+ 截图证据
```

---

## 技术栈

| 层 | 技术 | 版本 | 说明 |
|----|------|------|------|
| 前端 | Vue | 3.5.43 | SPA 单页，响应式只管离散状态 |
| 构建 | Vite + @vitejs/plugin-vue | 8.3.4 / 6.0.9 | 单页零配置，preview 带本地代理 |
| 后端 | Express | 5.3.0 | 只读 API，注意 v5 breaking changes（见 SPEC §11） |
| 数据存储 | JSON 文件 + 启动全量内存索引 | — | 零依赖，离线铁律（ADR-002） |
| 战术板动画 | SVG + rAF 插值 | 原生 | 逐帧坐标直写 attr，60fps 渲染 / 10fps 逻辑步进 |
| 解说引擎 | 规则表 + 槽位模板 | 自研 | calm/excited/clutch 三档，离线零依赖 |
| 语言 | JavaScript（JSDoc） | Node >= 20 | 12h 不引入 TS（ADR-005） |
| 不引入 | pinia / axios / UI 库 / TS | — | 运行时依赖仅 express + vue |

完整架构与版本锁定原因见 `docs/SPEC.md` §4。

---

## 质量与验收

- QA 独立判定 **GO**：AC 12/12 PASS，P0/P1 缺陷为零，单测 6/6，交互探针 14/14（`docs/qa/QA-REPORT.md`）
- 离线合规：全项目源码 grep `https://` 零命中，无原生模块依赖，无 CDN 引用
- 性能：API p95 = 14.7ms（内存索引），渲染 rAF p95 = 16.7ms 零掉帧，冷启动到重演 251ms

## 已知限制

1. **F7 备路视频 overlay 未启用**（`?flags=video` 不生效）：H11.5 决策点判定主线优先，备路按 Spec 锁定不阻塞主线，未包含在本交付版本中。
2. **TTS 语音播报为可选增强**：依赖浏览器 SpeechSynthesis 与本机语音包，不可用时静默降级为纯字幕流，不报错。
3. 演示数据为生成器合成（seed 20261010，确定性可重建），非真实 NBA 追踪数据；指标计算逻辑真实。
4. 窄屏阈值 1280px 即折叠左栏（严于 Spec 文字 1024px，路演分辨率 1440/1920 不受影响）。

---

*Broadcast Code 12h Hackathon — 珠海/澳门 · 2026*
