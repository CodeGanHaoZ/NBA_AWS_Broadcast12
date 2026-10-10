# 架构设计 · CourtCast 深度赛场交互转播台

| 项 | 内容 |
|----|------|
| 版本 | v1.0 ｜ 2026-10-10 |
| 配套 | 《PRD-CourtCast-交互转播台》（功能编号 F1-F10 与本文模块对应） |
| 架构原则 | **离线算尽，在线只画**——Python 管线把"逐帧该画什么"全部预算进 tracks.json；Web 前端零 CV、零模型推理，只做渲染与交互 |

---

## 1. 总体架构

```
┌─ 离线侧（Python Pipeline · 练习时间+18:00后重跑）────────────────┐
│ 比赛视频 ─┐                                                     │
│ 深度数据 ─┼→ [1]detect → [2]track → [3]calibrate → [4]align     │
│           │        → [5]events → [6]metrics → [7]commentary     │
│           └→ 唯一产物：tracks.json（+ 每视频 calibration config） │
└─────────────────────────────────────────────────────────────────┘
                              ↓ 静态文件 / 对象存储
┌─ 在线侧（Web · PC+Mobile · 路演主战场）─────────────────────────┐
│ PlayerShell（video 主时钟）                                      │
│  ├─ OverlayEngine（图层注册表：名牌/指标/战术/胜率）  → F2        │
│  ├─ TimelineBar（事件时间戳打点）                     → F3        │
│  ├─ TacticalBoard ×4（T1跟随/T2跑位/T3时机/T4引力）   → F7        │
│  ├─ DataPanel（球员卡/热点图/对比条）                 → F6        │
│  ├─ CausalPanel（事件链+证据）                        → F8        │
│  └─ CommentaryBar（字幕+TTS）                         → F5        │
│ API（轻量）：/api/commentary（LLM代理）· /api/share（分享卡）     │
└─────────────────────────────────────────────────────────────────┘
```

## 2. 技术选型决策（规则 = 锁定版本；选型理由一句话）

| 层 | 选型 | 理由 |
|----|------|------|
| 前端框架 | Vue 3 + Vite + TypeScript + Pinia | 团队主力栈，上手零成本；组合式 API 适合图层组件化 |
| 渲染 | Canvas 2D（overlay 主层）+ SVG（战术板/热点图/胜率曲线） | Canvas 高频重绘性能；SVG 交互寻址方便（悬停/点击） |
| 样式 | 原生 CSS + broadcast-code 设计 Token（CSS 变量） | 12h 不引 UI 库，范式 Token 直接落地，无样式覆盖战争 |
| 视频同步 | `requestVideoFrameCallback`，降级 `timeupdate` + lerp 插值 | 帧级对齐是 F1 命门 |
| 数值平滑 | One Euro Filter（自实现 ~40 行） | 防 overlay 闪烁，比滑动平均延迟低 |
| 后端 | Node.js（Express）单服务，Serverless 可部署 | 只做 LLM 代理与分享卡生成，无数据库 |
| LLM/TTS | 亚马逊云科技 Bedrock（Claude）+ Polly（或 Edge-TTS 备选） | 赛事方技术栈，路演加分；解说文案离线预生成 + 在线"解释这个回合"实时调 |
| CV 管线 | Python 3.11 + Ultralytics YOLO + Supervision(ByteTrack) + OpenCV + scikit-learn/XGBoost | 全部有开源参照（abdullahtarek / Purgty / NBA-AI） |
| 数据库 | **无**。tracks.json + 静态托管 | 12h 极限赛，文件即数据库 |
| 部署 | 静态站（对象存储/CloudBase 静态托管）+ Serverless 函数 ×2 | 路演现场扫码即开，零运维 |

> 图表库决策：**不引 ECharts**。胜率曲线/热点图用 SVG 手绘（~200 行），风格才能与范式 Token 完全统一。

## 3. Monorepo 结构（feature-first）

```
courtcast/
├─ pipeline/                    # 离线 CV 管线（Python）
│   ├─ detect/     player_ball_detector.py   # YOLO 检测（stub 缓存）
│   ├─ track/      tracker.py                # ByteTrack + 身份绑定
│   ├─ calibrate/  court_keypoints.py homography.py  # 含手动四点兜底工具
│   ├─ align/      temporal.py spatial.py    # 时间戳对齐 + 坐标映射
│   ├─ events/     event_rules.py            # 突破/分球/出手/掩护/空切
│   ├─ metrics/    xfg.py gravity.py dps.py leverage.py hotspots.py
│   ├─ commentary/ prompts.py generate.py    # 离线预生成解说
│   └─ export/     tracks_json.py            # schema 校验后导出
├─ web/                         # 前端（Vue3+TS）
│   ├─ src/
│   │   ├─ features/
│   │   │   ├─ player/      PlayerShell.vue useFrameSync.ts      # F1
│   │   │   ├─ overlay/     OverlayEngine.ts layers/             # F2
│   │   │   ├─ timeline/    TimelineBar.vue                      # F3
│   │   │   ├─ tactical/    boards/T1Follow T2Run T3Timing T4Gravity  # F7
│   │   │   ├─ data-panel/  PlayerCard.vue ShotHotspot.vue TeamCompare.vue # F6
│   │   │   ├─ causal/      CausalChain.vue EvidenceList.vue     # F8
│   │   │   ├─ commentary/  CommentaryBar.vue tts.ts             # F5
│   │   │   └─ share/       ShareCard.vue                        # F4
│   │   ├─ shared/
│   │   │   ├─ stores/      tracksStore.ts clockStore.ts layerStore.ts
│   │   │   ├─ types/       tracks.d.ts      # 与 pipeline schema 同源
│   │   │   ├─ tokens/      broadcast-code.css
│   │   │   └─ utils/       one-euro.ts lerp.ts court-geometry.ts
│   │   └─ App.vue main.ts
├─ server/                      # 轻量 API（Node/Express，可 Serverless）
│   ├─ commentary/  controller.ts service.ts bedrock.client.ts   # F5 实时解释
│   ├─ share/       controller.ts service.ts render.ts           # F4 分享图
│   └─ shared/      config.ts errors.ts logger.ts                # 集中配置/ typed errors
└─ data/
    ├─ schema/tracks.schema.json          # 唯一事实源
    ├─ mock/tracks.mock.json              # M1 假数据
    └─ outputs/{video_id}/tracks.json calibration.json
```

## 4. tracks.json Schema（核心契约，前后端共用）

```jsonc
{
  "video": {
    "id": "rockets_q2_clip01",
    "fps": 30, "duration": 120.0, "width": 1920, "height": 1080,
    "teams": [{ "abbr": "HOU", "color": "#CE1141" }, { "abbr": "DAL", "color": "#00538C" }],
    "players": [{ "id": "p23", "name": "球员姓名", "number": 23, "team": "HOU", "role": "G" }]
  },
  "calibration": {
    "segments": [{ "tStart": 0, "tEnd": 120, "H": [[1,0,0],[0,1,0],[0,0,1]], "source": "auto|manual" }]
  },
  "frames": [                       // 抽稀存储：检测帧 + 前端 lerp
    { "t": 12.033, "objects": [
      { "pid": "p23", "bbox": [x,y,w,h], "court": [cx,cy], "conf": 0.91 },
      { "pid": "ball", "bbox": [x,y,w,h], "court": [cx,cy] }
    ]}
  ],
  "possessions": [
    { "id": "pos_07", "tStart": 38.5, "tEnd": 48.0, "team": "HOU",
      "events": ["ev_071","ev_072","ev_073"], "leverage": 0.8 }
  ],
  "events": [
    { "id": "ev_071", "type": "drive",           // drive|pass|shot|screen|cut
      "t": 40.1, "actor": "p23",
      "label": "突破启动 4.8 m/s",
      "evidence": [                              // 因果链证据（F8 唯一数据源）
        { "key": "突破速度", "value": 4.8, "unit": "m/s" },
        { "key": "篮下距离变化", "value": -3.8, "unit": "m" }
      ] },
    { "id": "ev_073", "type": "shot", "t": 47.4, "actor": "p11",
      "label": "空位三分出手",
      "evidence": [
        { "key": "xFG", "value": 0.52, "unit": "" },
        { "key": "引力贡献", "value": 78, "unit": "", "fromPlayer": "p23" },
        { "key": "最近防守人距离", "value": 2.1, "unit": "m" }
      ],
      "result": "made" }
  ],
  "metrics": {
    "players": [{ "pid": "p23",
      "fg": { "made": 5, "att": 9, "pct": 55.6, "tpPct": 40.0 },
      "xfgAvg": 0.41, "gravity": 86, "dpsAvg": 0.34, "leverageTotal": 2.3,
      "shots": [{ "t": 47.4, "court": [6.7, 3.2], "xfg": 0.52, "made": true }]
    }],
    "winProbability": [{ "t": 0, "home": 0.50 }, { "t": 47.4, "home": 0.58 }]
  },
  "commentary": [
    { "possession": "pos_07", "triggerT": 47.6, "priority": "high",
      "text": "这个三分要从三秒前说起——23号的突破把两名防守人吸进禁区，11号面前两米空无一人，52%的空位，手起刀落。",
      "evidenceRef": ["ev_071","ev_072","ev_073"] }
  ],
  "provenance": { "tracking": "cv-detected", "metricsSource": "official+derived",
                  "disclaimer": "轨迹源自视频检测；数据来源于官方深度赛场" }
}
```

**契约纪律**：`data/schema/tracks.schema.json` 为唯一事实源；pipeline 导出前校验，前端 `tracks.d.ts` 由 schema 生成（或手写并保持同步检查）；任何字段变更必须双端同改。

## 5. 离线管线模块（Python）

| 模块 | 职责 | 关键设计 | 开源参照 |
|------|------|----------|----------|
| detect | 球员/球检测 | YOLO 预训练权重 + **stub pickle 缓存**（迭代不重跑） | abdullahtarek |
| track | 跨帧跟踪+身份绑定 | ByteTrack → 球衣颜色分队 → 号码识别/阵容先验绑定 pid；ID 交换人工修正表 | roboflow/sports |
| calibrate | 球场标定 | 关键点检测求 H；**单应矩阵时序平均防漂移**；镜头切换自动分段；手动四点兜底 CLI | Purgty、kalicalib |
| align | 时间/空间对齐 | 官方出手点位 → 最近事件帧吸附（±0.5s 窗）；court 坐标 ←H→ 像素坐标互转 | 自研（赛题核心难点） |
| events | 事件规则引擎 | 持球变化→pass；向篮速度>阈值+距离缩短→drive；出手信号→shot；掩护站位→screen | courtvision-engine |
| metrics | 指标引擎 | xFG：距离/角度/防守人距离/进攻时间 → XGBoost；gravity：无球人周围防守偏移矢量代理；dps：7 项加权简化版；leverage：分差+时间+球权的胜率差分 | NBA-AI、slieb74 |
| commentary | 解说预生成 | 回合 JSON → Bedrock → 含数值校验（文案中数值必须 ∈ evidence）→ 入库 | ASAS 12 秒法则 |
| export | 导出 | schema 校验 + 分包（meta/frames/metrics 分文件，前端流式加载） | — |

**18:00 换装 SOP**：`python -m pipeline run --video exam.mp4 --calib auto` → 校验 → 替换 `data/outputs/exam/` → 前端换 `?video=exam` 即出片。目标 ≤20 分钟。

## 6. 前端架构

### 6.1 主时钟与帧同步（F1）

```
clockStore: video.currentTime (唯一事实源)
   ├─ rVFC 回调 → frameIndex = round(t × fps)
   ├─ tracksStore.getFrame(t)：二分查找最近检测帧 → 与下一帧 lerp 插值
   └─ 广播给：OverlayEngine / TacticalBoard T1 / DataPanel / TimelineBar
拖拽 seek → 所有订阅者同帧重渲染（≤100ms）
```

### 6.2 OverlayEngine（F2，图层注册表）

```typescript
interface OverlayLayer {
  id: 'nametag'|'metrics'|'tactic'|'winprob';
  zIndex: number;
  visible: boolean;                    // layerStore 开关
  render(ctx: CanvasRenderingContext2D, frame: Frame, t: number): void;
}
// 注册制：新增图层 = 新增一个实现 + register，不动引擎
// 数值输出统一过 OneEuroFilter（每实体每字段一个滤波器实例）
```

### 6.3 状态设计（Pinia）

| Store | 职责 |
|-------|------|
| clockStore | 当前时间/播放态/倍速；seek() 统一入口 |
| tracksStore | JSON 加载（meta 先载、frames 分片流式）、帧查询、回合/事件索引 |
| layerStore | 图层开关、战术板 Tab、解说开关、移动端抽屉状态 |
| selectionStore | 当前选中球员/回合/事件（驱动数据面板与因果链联动） |

### 6.4 战术板实现（F7）

- 统一 `<TacticalBoard>` 容器：SVG 半场底图（court-geometry.ts 生成线）+ 球员圆点层 + 动画层；
- T1：帧数据 → `court` 坐标直接映射（One Euro 平滑）；
- T2：回合事件窗内轨迹点连成 path，SVG `stroke-dashoffset` 生长动画，事件点打点；
- T3：出手前 3s 窗口，防守距离折线（同 SVG path）+ 时间 scrubber 联动帧；
- T4：引力矢量 = 防守人实际位置 − 理论对位位置，箭头从理论位生长到实际位，空档区 convex hull 色块脉冲。

### 6.5 移动端策略（F9）

| 项 | 方案 |
|----|------|
| 布局 | CSS 容器查询 + 断点；视频 sticky 顶；数据/因果面板底部抽屉（touch 拖拽两档） |
| 渲染 | canvas 分辨率 `min(devicePixelRatio, 2)`；低端机自动关 T4 引力动画 |
| 交互 | 时间轴横滑（pointer events）；打点 44px；战术板双击全屏（screen orientation 横屏） |

## 7. 后端 API（轻量，无 DB）

| Method | Path | 功能 | 说明 |
|--------|------|------|------|
| POST | /api/commentary/explain | "解释这个回合"实时生成 | body: possessionId；server 读 tracks.json 取该回合 events+evidence → Bedrock → 返回文案；**数值校验中间件**：文案中的数字必须出现在 evidence 集，否则重试/降级模板 |
| POST | /api/share/card | 事件分享卡 | body: eventId；服务端 canvas/Satori 渲染 1080×1350 PNG 返回 |
| GET | /health | 健康检查 | 部署验证 |

工程纪律（按 fullstack 规范）：feature-first 目录；配置集中 `config.ts` 环境变量启动校验 fail-fast；typed error 层级 + 全局错误处理中间件；结构化 JSON 日志带 request id；CORS 显式域名；LLM 调用超时 10s + 1 次重试 + 模板降级。

## 8. 部署

| 件 | 目标 | 说明 |
|----|------|------|
| web 静态站 | 对象存储/CDN（或 CloudBase 静态托管） | `vite build` 产物；`?video=` 参数切数据源 |
| server | Serverless 函数 ×2 | commentary / share；环境变量注入 Bedrock 凭证 |
| pipeline | 本地/本队 GPU 机运行 | 产物上传 outputs 目录 |
| 兜底视频 | 同管线 OpenCV 烧录 MP4 导出脚本 | 双交付合规 |

## 9. 端到端验证（交付前跑通）

```bash
# 1. 管线
python -m pipeline run --video practice.mp4 --out data/outputs/practice
python -m pipeline validate data/outputs/practice/tracks.json   # schema 校验通过

# 2. 前端
cd web && pnpm build && pnpm preview                            # 构建零错误
# 手工 smoke：播放→名牌跟人对→开 4 图层→点时间轴打点→战术板 T2 回放→解释这个回合→手机扫码

# 3. API
curl -X POST localhost:3000/api/commentary/explain -d '{"possessionId":"pos_07"}' -H 'Content-Type: application/json'
# 断言：返回文案中所有数值 ∈ 该回合 evidence

# 4. 泛化演练（赛前用自备视频模拟 18:00 流程，计时 ≤20min）
python -m pipeline run --video stranger.mp4 --calib auto && 前端 ?video=stranger 出片
```

## 10. 已知坑与对策（管线侧）

| 坑 | 对策 |
|----|------|
| 单应矩阵逐帧抖动 → overlay 漂移 | 时序窗口平均 + 突变检测分段 |
| 扎堆遮挡 → ByteTrack ID 交换 | 阵容先验 + 号码识别复核 + correction 表人工兜底 |
| 视频时间轴 ≠ 数据时间戳 | 用出手事件做锚点对齐（官方出手点位 ↔ 检测出手帧），其余回合按帧率线性映射 |
| 解说数值幻觉 | 服务端数值校验中间件，不通过降级为模板文案 |
| 移动端 rVFC 不支持（Safari 旧版） | timeupdate + lerp 降级链 |

---

*架构与 PRD 功能映射：F1→player/clockStore；F2→overlay；F3→timeline；F4→events+share；F5→commentary+server；F6→data-panel；F7→tactical；F8→causal；F9→移动端策略；F10→tokens。*
