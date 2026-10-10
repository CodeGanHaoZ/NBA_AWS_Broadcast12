# Spec — Broadcast Code MVP v1.0

> 生成日期：2026-10-10
> 基于：PRD v1.0 + ARCHITECTURE v1.0 + UIUX v1.0（三文档用户已全部确认）
> 状态：已确认（锁定）
> 一致性裁决已内嵌：字体本地化（C1）、JSON 数据集（C2）、单一 replay clock、信号橙预算 8%

---

## 1. 产品定义

- **一句话描述**：NBA 深度赛场可视化 AI Agent——读取深度赛场数据，识别关键回合，把跑位/空档/防守变化以箭头、色块、球员标注叠加到战术板上重演，并生成与画面逐秒同步的篮球解说。
- **目标用户**：首要=黑客松评审（5-8 分钟接触，四维度打分）；次要=篮球深度观众、内容创作者。
- **核心问题**：企业级追踪产品封闭、球迷向产品只给结论不给过程、教练工具纯手工——「数据进→复盘出」的自服务管线是市场空白。
- **管线**：input → analyze → visualize → narrate，四段缺一不可（管线断裂 = 全失分）。

## 2. MVP 范围（锁定——不在此列表的功能一律不做）

| 优先级 | 编号 | 功能 | 验收标准摘要 | RICE |
|---|---|---|---|---|
| P0 | F1 | 深度数据解析 + 关键回合识别引擎（importance 五维加权） | 回合按 importance 降序返回，含子分 breakdown | 12.0 |
| P0 | F2 | SVG 战术板重演（骨架/箭头/色块/标注四层叠加 + 帧动画） | 选回合后 10fps 平滑重演，标注按事件窗口逐层出现 | 10.0 |
| P0 | F3 | 播放控制（播放/暂停/倍速/回合跳转/空格键） | 全部控制可打断当前重演，150ms 内响应 | 10.0 |
| P0 | F5 | 规则引擎 + 模板解说（逐秒同步字幕流 + 降级兜底文案） | 解说与标注消费同一事件序列，帧级同步 | 8.0 |
| P0 | F4 | 深度数据面板（投篮难度/引力/关键度随帧联动） | 指标值随播放头实时更新 | 7.2 |
| P1 | F6 | 回合列表侧栏（筛选 chips + marquee 选中态 + 键盘导航） | ↑↓ 选择、Enter 播放、←→ 上/下回合 | 6.4 |
| P1 | F8 | 数据集切换（≥2 场比赛） | GET /games ≥ 2，切换后列表与战术板刷新 | 4.8 |
| 备路 | F7 | 真实视频 Canvas/SVG overlay（?flags=video 开启） | 永不阻塞主线，H11.5 做启用/放弃决策 | 1.0 |

## 3. 明确不做（Out-of-Scope — 锁定）

| 不做的功能 | 原因 | 何时考虑 |
|---|---|---|
| 登录/用户体系 | 单机演示无需求 | 产品化后 |
| 实时数据接入 | 无公开 API，离线 P0 | 赛后接官方数据 |
| LLM 调用生成解说 | 现场网络不可假设 | 有稳定网络环境 |
| 3D/AR 渲染 | 12h 不可行 | v2.0 |
| 多运动扩展 | 聚焦 NBA 单场景 | 赛后 |
| 移动端深度适配 | 路演为大屏+评委近距 PC，仅做 <1024px 左栏折叠兜底 | 产品化后 |
| 内容导出（视频/GIF） | 超出 12h 预算 | 内容创作者版本 |
| 英文解说模板包 | 中文路演优先（P2 backlog） | 国际场 |

## 4. 技术架构（锁定——版本全部经 npm registry 实测锚定）

| 层 | 技术 | 实际版本 | 锁定原因 |
|---|---|---|---|
| 前端 | Vue | 3.5.43 | 用户主力栈，响应式适合离散 UI 状态 |
| 构建 | Vite + @vitejs/plugin-vue | 8.3.4 / 6.0.9 | 快速 HMR，单页零配置 |
| 后端 | Express | 5.3.0 | 选型矩阵加权 4.5 胜 Fastify/Koa；注意 §11 的 5 条 breaking changes |
| 数据存储 | JSON 文件 + 启动全量内存索引 | 零依赖 | 离线铁律否决 better-sqlite3（ADR-002） |
| 战术板动画 | SVG + rAF 插值 | 原生 | 逐帧坐标 ref 直写 attr，禁走 Vue 响应式（ADR-003） |
| 视频 overlay（备路） | HTML5 video + 绝对定位 SVG 层，rAF 读 currentTime | 原生 | 禁用 timeupdate（4Hz 卡顿） |
| 解说引擎 | 规则表 + 槽位模板（calm/excited/clutch 三档） | 自研 | 离线零依赖；SpeechSynthesis TTS 可选且必须优雅降级 |
| 图标 | 内联 SVG 组件，24 网格 1.5px 描边 currentColor，16/20/24px | 自绘 | 零图标库依赖，P0 禁 emoji |
| 语言 | JavaScript（JSDoc + 运行时 validator 补偿） | Node ≥ 20 | 12h 不引入 TS（ADR-005） |
| 不引入 | pinia / axios / UI 库 / TS | — | 依赖最小化，运行时依赖仅 express + vue |

## 5. API 端点清单（锁定——契约见 docs/api/openapi.yaml）

统一响应壳 `{code, data, message}`；全只读；无认证无分页。

| Method | Path | 功能 | 响应要点 |
|---|---|---|---|
| GET | /health | 健康检查 | `{status:"ok"}` |
| GET | /api/v1/games | 比赛列表 | id/teams/date/possessionCount |
| GET | /api/v1/games/:id | 单场元信息 | 含三节比分、球场映射常量 |
| GET | /api/v1/games/:id/plays?top=N | 回合列表，importance 降序 | id/quarter/clock/label/importance/breakdown/tags |
| GET | /api/v1/games/:id/plays/:playId | 单回合全量 | meta + features + frames + overlays + narration |
| GET | /api/v1/meta/flags | 特性开关 | `{video:false,...}` |

错误码：1001 参数非法 / 1002 资源不存在 / 1003 数据损坏 / 2000 服务器内部错误。

## 6. 数据模型（锁定——analyze/narrate 启动时预计算，请求路径纯读取）

- **球场映射**：94×50 ft → `viewBox 0 0 940 500`，1ft=10 单位，左篮下 x=52.5? 否——左篮筐中心 (40,250)，右篮筐 (900,250)，三分弧半径 237.5 单位（角三分线距边线 30 单位）。
- **Game**：`{id, home, away, date, quarters[], score{home,away}, plays[]}`
- **Play**：`{id, quarter, clock, label, tags[], features{shotDifficulty, gravity, clutchScore, spacingGain, defenseCollapseMs, offBallMovement, passCount}, importance{total, breakdown{clutch:.30, difficulty:.25, rarity:.20, momentum:.15, star:.10}}, frames[], overlays[], narration[]}`
- **Frame**：`{t(ms, 100ms 步进), ball{x,y,z}, players[{id, team, x, y, role}]}`（role: handler/cutter/screener/defender/help）
- **Overlay**：`{type: arrow|ring|zone, t0, t1, ...}`——arrow `{from,to,style}`；ring `{playerId, r, label}`；zone `{points[], opacity, label}`
- **Narration**：`{t0, t1, tone: calm|excited|clutch, text, highlights[]}`（highlights=高亮词，每句 ≤3 个）
- **Mock 数据**：参数化轨迹生成器 `server/tools/gen-mock-game.mjs` 合成（贝塞尔跑位 + 防守跟随规则 + 噪声），禁止手写帧；≥2 场比赛（HOU vs DAL Q3×8 回合 + 备用一场 ×8 回合）。路演中如实标注「演示数据」，指标计算逻辑真实。

## 7. 页面清单（锁定——Vue 3 SPA 单页，无多路由）

| 页面 | 路由 | 区域 | 对应 API | 主题 |
|---|---|---|---|---|
| AI 解说工作台 | / | A 顶部转播条 56px（记分/LIVE-REPLAY pill/AI 状态灯/皮革 4px 细条） | /games/:id | 深色（唯一主题） |
| | | B 左栏回合列表 288px（kicker+筛选 chips+marquee 选中） | /plays?top=N | |
| | | C 中央战术板主区（骨骼帧 navy 16:9 + 标注层 + 控制条） | /plays/:playId | |
| | | D 右栏解说与数据 360px（打字机解说流 + AI 管线状态 + 大数字/点阵热图） | /plays/:playId | |
| | | E 底部 scrubber 64px（播放头 + 事件刻度 ▲ 可点击） | 本地状态 | |
| 页内状态层 | — | 空态引导（编号管线大图）/ 加载 scanline / 错误卡（含重试） | — | |
| 视频 overlay 备路 | /?flags=video | 同 C 区换 video + SVG overlay | /meta/flags | |

**交互核心（锁定）**：单一 `replayClock` 状态机 `idle→loading→replaying→annotating(L1-L4)→narrating→settled` 驱动回放/标注/解说三向同步；任何组件不得自起 setTimeout 做时序；全部操作可打断；标注四层 = L1 持球人橙环 pulse → L2 战术 mono 标签 → L3 跑位 dash-run 虚线 → L4 终结点 + Anton +2；打字机 30-45ms/字、标点停顿、高亮词逐字染橙、光标 530ms 闪烁；路演默认 0.5x；overlay on/off toggle 为对比演示杀手锏。

## 8. 设计 Token（锁定——broadcast-code-ui 范式，详细值以 skill 为准）

- **配色**：bg `#0B0B0C` / surface `#131315` / surface-2 `#1B1B1F` / line `#2A2A2E` / chalk `#F5F2EC` / muted `#8E8E96` / signal `#F9530C` / signal-deep `#C43A08` / navy `#12183A` / 关键点三色 `#E23B3B` `#F5C518` `#39C2D7`（仅数据标注）
- **信号橙预算 8%**（范式上限 10%，本 Spec 收紧）；解说高亮词每句 ≤3 个；交付前全局审计 #F9530C 使用点
- **字体（C1 裁决：全部本地化，禁任何 CDN）**：Anton（display 大写）/ JetBrains Mono（数据标签 0.14em）/ Noto Sans SC 400/500/700/900（正文与中文标题）。子集化后存 `web/public/fonts/`，本地 `@font-face`；**验收时全项目 grep `https://` 必须零命中（注释除外）**。书法字体禁用（工具类页面）
- **签名元素落位 8/10**：S-01 球场线（全页底）/ S-02 点阵热图（右栏）/ S-03 Telestrator（标注层核心）/ S-04 marquee（左栏选中）/ S-05 pill（顶栏模式）/ S-06 皮革纹理（顶栏下缘 4px）/ S-07 斜杠 kicker（三栏栏头）/ S-08 编号管线（右栏 AI 状态条 + 空态）/ S-09 大数字（右栏数据）/ S-10 骨骼帧（主区本体）
- **图标**：内联 SVG，24 网格 1.5px 描边 currentColor，尺寸 16（行内）/20（按钮）/24（独立）；语义清单：播放/暂停/快进/上一回合/下一回合/图层开关/数据/解说/警示
- **栏宽**：288 | 1fr | 360；<1280px 左栏折叠为横向 chip 条（实现取 1280 断点，QA P2 对齐修订）
- **毛玻璃白名单**：backdrop-filter blur(8px) 仅允许出现在顶部导航一处（对齐 UIUX v1.0 白名单），其余区域零毛玻璃

## 9. 验收标准（锁定——EARS 格式，QA 唯一依据）

| 编号 | 功能 | EARS 验收标准 | 优先级 |
|---|---|---|---|
| AC-01 | 启动 | When 执行 `npm run dev`（server+web），系统**必须**在 10s 内完成启动且 /health 返回 200 | P0 |
| AC-02 | 回合列表 | When 打开工作台，系统**必须**展示按 importance 降序的回合列表，且首回合自动选中 | P0 |
| AC-03 | 战术板重演 | When 选中回合，系统**必须**在 150ms 内呈现 marquee 选中态并开始重演，10fps 帧动画无明显掉帧 | P0 |
| AC-04 | 解说同步 | While 重演进行中，系统**必须**使解说句与标注层消费同一事件序列，任一句子的 t0 与对应 overlay.t0 偏差 ≤200ms | P0 |
| AC-05 | 降级兜底 | If 某回合数据字段缺失，系统**必须**展示通用解说文案与基础骨架，不得白屏或报错中断 | P0 |
| AC-06 | 播放控制 | When 用户按空格/倍速/跳转，系统**必须**在 150ms 内响应并可随时打断当前重演 | P0 |
| AC-07 | 数据面板 | While 播放头移动，系统**必须**使投篮难度/引力/关键度三指标随当前帧实时更新 | P0 |
| AC-08 | 离线合规 | When 全项目静态检查，系统**必须**满足：grep `https://` 零命中（注释除外）、无原生模块依赖、npm install 离线可完成（赛前 tar 包） | P0 |
| AC-09 | 键盘导航 | When 焦点在回合列表，↑↓ **必须**移动选择、Enter 播放、←→ 切换上/下回合 | P1 |
| AC-10 | 数据集切换 | When 切换比赛，系统**必须**刷新列表与战术板且解说面板清空重载 | P1 |
| AC-11 | 可访问性 | 系统**必须**支持 prefers-reduced-motion（关闭 pulse/scanline/打字机逐字，直接呈现终态） | P0 |
| AC-12 | 视觉门禁 | 系统**必须**零 emoji 图标、零紫色渐变、零浅色、零毛玻璃（顶栏 backdrop-filter 一处白名单除外，见 §8）、信号橙面积 ≤10%（目标 8%） | P0 |

## 10. 边界与约束

- 不支持 IE；目标 Chrome/Edge 最新两版，演示分辨率 1440×900 与 1920×1080
- 性能：重演 60fps 渲染（rAF），帧数据 10fps 逻辑步进；单回合 frames ≤ 240（24s×10fps）
- 响应式：≥1280px 三栏完整；<1280px 左栏折叠横向 chip 条（兜底，不深度适配；实现断点 1280）
- 全部交互可打断；切换回合时旧标注 150ms 淡出
- SpeechSynthesis TTS 为可选增强：不可用/无语音包时静默降级为纯字幕，不得报错

## 11. 内嵌已知坑（开发前必读）

| # | 坑 | 技术栈指纹 | 根因 | 修法（Spec 强制） |
|---|---|---|---|---|
| K1 | Express 5 通配符语法变更 | express-5.x | `*` 路由写法在 v5 抛错 | 用 `/{*splat}` 或具体路径；SPA fallback 用 `app.use((req,res)=>...)` |
| K2 | `res.send(status)` 已移除 | express-5.x | v5 改为 `res.sendStatus(status)` | 一律 `res.sendStatus` 或 `res.status(n).json()` |
| K3 | `req.query` 只读 getter | express-5.x | 赋值会静默无效 | 只读使用，禁止改写 |
| K4 | `res.json(obj, status)` 签名移除 | express-5.x | v5 只接受单参 | `res.status(n).json(obj)` |
| K5 | 回调错误必须显式 next(err) | express-5.x | 同步 throw 才被自动捕获——async 中 rejected promise v5 会自动 next，但回调 API 不会 | fs 等回调 API 用 promisify 包装 |
| K6 | 原生模块依赖 | better-sqlite3 等 | prebuilt 需 install 时联网 | 依赖树只允许纯 JS 包；`npm ls` 审计 |
| K7 | CDN 资源引用 | fonts/图标库 | 现场网络不可假设 | 全部本地化；grep `https://` 零命中（注释除外） |
| K8 | Vue 响应式驱动逐帧坐标 | vue-3.x | 60fps 下响应式开销导致掉帧 | 逐帧坐标用 ref 直写 SVG attr，Vue 只管离散状态（ADR-003） |
| K9 | video timeupdate 仅 ~4Hz | html5-video | 采样率过低导致 overlay 抖动 | rAF 循环读 `video.currentTime` 同步 |
| K10 | 多时钟各自计时 | 自研播放器 | 组件各自 setTimeout 导致解说/标注/时间轴三向漂移 | 单一 replayClock 状态机，所有时序从其派生（UIUX advisory 锁定） |
| K11 | 本机 Edge headless 截图静默失效 | edge-headless | exit 0 但不写文件 | 视觉验证一律用 Chrome headless + 独立 user-data-dir |
| K12 | 预览器注入 data-page-node-id | workbuddy-preview | 编辑器注入属性导致 Edit 匹配失败 | 编辑已预览 HTML 时 old_string 须含注入属性 |

## 12. 端到端验证步骤（锁定）

```bash
# 1. 安装与启动（离线：使用赛前 node_modules tar 包）
cd server && npm install && npm start &     # :3000
cd web && npm install && npm run build && npm run preview &  # :4173

# 2. 健康与数据
curl -s http://localhost:3000/health                       # 断言: {"status":"ok"}
curl -s http://localhost:3000/api/v1/games | head -c 200   # 断言: ≥2 场比赛
curl -s "http://localhost:3000/api/v1/games/g001/plays?top=8" | head -c 300
# 断言: plays 按 importance.total 降序

# 3. 单回合全量（核心成功流）
curl -s http://localhost:3000/api/v1/games/g001/plays/p001 > /tmp/play.json
# 断言: 含 features/importance/frames(≥100)/overlays(≥3)/narration(≥3)
# 断言: 每句 narration.t0 与某 overlay.t0 偏差 ≤200ms

# 4. 关键错误流
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/v1/games/g999   # 断言: 404, code=1002
curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/api/v1/games/g001/plays?top=abc" # 断言: 400, code=1001

# 5. 离线合规（AC-08）
grep -r "https://" server/src web/src --include="*.js" --include="*.vue" --include="*.css" | grep -v "^\s*//" | grep -v "\*" # 断言: 零命中
npm ls --omit=dev  # 断言: server 仅 express，web 仅 vue

# 6. 视觉验证（K11：用 Chrome）
# Chrome headless 截图 1440x900，核对：五区布局/8 签名元素/零 emoji/橙面积 ≤10%
```

## 13. 变更记录

| 日期 | 变更内容 | 原因 | 影响范围 |
|---|---|---|---|
| 2026-10-10 | Spec v1.0 生成并锁定 | 三文档用户确认 | 全文 |
| 2026-10-10 | P2 文档对齐：§8 增毛玻璃顶栏白名单；§8/§10 响应式断点 1024→1280（对齐实现） | QA-REPORT P2 修订建议（零代码变更） | §8/§10/AC-12 |
