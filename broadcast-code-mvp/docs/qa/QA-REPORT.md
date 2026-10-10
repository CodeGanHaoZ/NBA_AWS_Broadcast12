# QA-REPORT — Broadcast Code MVP v1.0（Phase 4 独立验证）

> QA：测试工程师 严过关 | 日期：2026-10-10 | 判定性质：**独立复跑，不采信任何开发自检结论**
> 被测版本：server@1.0.0（express 5.3.0）+ web@1.0.0（vue 3.5.43 / vite 8.3.4）
> 验证环境：Windows / Node v22.22.2 / Chrome headless（独立 user-data-dir，遵守 K11）/ CDP 交互探针
> 联调方式记录：`vite preview`（实际绑定 :4175，4173/4174 被本机其他项目占用）经 preview proxy `/api → :3000`；dist 产物 API 调用为相对路径 `/api/v1`，preview 模式代理生效（实测 `curl :4175/api/v1/games` → 200）。

---

## 1. AC 判定表（12/12）

| AC | 判定 | 证据（全部为 QA 亲手跑出的机械证据） |
|---|---|---|
| AC-01 启动 | **PASS** | `node src/app.js` 冷启动（含数据生成+校验）→ `/health` 返回 `{"status":"ok","games":2}`；页面 load → `clockState=replaying` 实测 **251ms**（限 10s） |
| AC-02 回合列表 | **PASS** | CDP 实测 `importance.total` = `0.804,0.649,0.637,0.541,0.513,0.416,0.403,0.388` 严格降序；`list[0]=p001 === selected=p001` 首回合自动选中 |
| AC-03 战术板重演 | **PASS** | 点击 p002：marquee 选中态 **3.9ms**、重演开始 **33.7ms**（限 150ms）；2s rAF 采样 n=121，p50=16.7ms / p95=16.7ms / max=16.8ms，>50ms 帧 0 个（60fps 无掉帧）；中态截图 `qa-final-05-midreplay.png` 可见箭头标注层 + 打字机逐字染橙 |
| AC-04 解说同步 | **PASS** | 对**全部 16 回合**经 API 实时数据程序化全量验证：每句非 analysis narration.t0 与某 overlay.t0 **恒等（0ms 偏差）**；11 个无锚点句全部为 analysis 豁免槽位（"关键度评分…"/"看数据…" 模板），符合 narration-rules §3 |
| AC-05 降级兜底 | **PASS** | ①数据层：手动删除 g001 p001 narration 数组后启动 → 校验器拒启，输出 `plays[0].narration :: expected >=3 sentences, actual undefined` + `refusing to start`，**exit 1（拒启即合规）**；②引擎层 L3 兜底由单测 anchor2 覆盖（16 回合 features 缺失 → 固定三句 calm 句）；③前端层：断开后端 → 错误卡 `ERR -1 无法连接分析服务器…` + 重新分析/重新加载按钮，无白屏无崩溃（`qa-final-04-error-card.png`） |
| AC-06 播放控制 | **PASS** | 真实 CDP 按键：空格暂停 **9ms** / 恢复 **12ms**（含 CDP 往返，限 150ms）；速度键 3→2x、1→1x 实测生效；`stepPlay` ←→ 切换即时打断当前重演（`clock.interrupt()` 代码核实 + 运行时验证） |
| AC-07 数据面板 | **PASS** | `seek(2000)` → `live={t:2000, difficulty:0.898, gravity:1, spacing:6.2, clutch:0.267}`；`seek(6000)` → `{t:6000, difficulty:0.959, gravity:1, spacing:0.9, …}`——三指标随播放头实时变化且数值不同 |
| AC-08 离线合规 | **PASS** | `grep -rn "https://" server/src web/src server/tools web/public`（js/mjs/vue/css，排除注释行）**零命中**（7 处原始命中全部在 docs/*.md 文档内，属文档引用）；`npm ls --omit=dev`：server 仅 express@5.3.0、web 仅 vue@3.5.43；依赖树 `grep -ci "gyp\|binding\|sqlite\|native"` = **0**（无原生模块）；两侧 package-lock.json 齐备。离线 install 本身未物理断网实测，以纯 JS 依赖树 + lock 文件为证据 |
| AC-09 键盘导航 | **PASS** | 真实 CDP Input 事件：↓ cursor 1→2、↑ 2→1；Enter 于 cursor=2 → 选中 p003（预期 p003）；→ 切换 p003→p004、← 回到 p003。全局 keydown 处理器代码核实（App.vue onKey） |
| AC-10 数据集切换 | **PASS** | 点击 LAL-GSW：gameId g001→g002、plays 8 条刷新、p001 自动选中并重启重演、解说面板清空重载（新内容 "00:01.8，分差3分，球在Stephen Curry手里…"）；g002 镜像数据：中帧 shooterX=32.49ft（左半场进攻，坐标全域 [30.19, 60.03]ft 在界内）；视觉目检 `qa-final-02-g002-mirror.png`：球员/球/传球箭头全部在左半场，无出界无穿模 |
| AC-11 可访问性 | **PASS** | Chrome `--force-prefers-reduced-motion` 仿真：`matchMedia(reduce)=true`；首句解说 37 字**整句直出**（`fullyVisible=true`，非逐字）；`.bc-live-dot` 计算样式 `animation-name: none`；CSS 降级块代码核实（design-tokens.css:406、app.css:114、CourtBoard.vue:265；typewriter.js:88 整句直出分支） |
| AC-12 视觉门禁 | **PASS** | emoji 正则扫描（U+1F300-1F9FF/2600-26FF/2700-27BF/FE0F/2B00-2BFF）全代码**零命中**；紫粉渐变扫描（purple/pink/#7C3AED/#A855F7/#EC4899/#8B5CF6/violet）**零命中**；浅色背景扫描零命中；AI 模板味扫描（Welcome to/Lorem ipsum/作为一个 AI 等）**零命中**；信号橙面积像素级实测 **1.02%**（canvas 取重演中态全屏 1440×900，648000 采样点中 6578 橙点）——远优于 ≤10% 上限与 8% 目标。毛玻璃：顶栏 1 处 `backdrop-filter: blur(8px)`，属 **UIUX v1.0 锁定文档白名单特例**（见 §5 观察项 O-1，不判违规） |

**AC 汇总：12/12 PASS。**

---

## 2. SPEC §12 端到端步骤复跑记录

| 步骤 | 结果 |
|---|---|
| 1. 安装与启动 | server/web node_modules 均在，server 启动正常；web `npm run build` 5.2s 通过（dist 108KB js + 28KB css） |
| 2. 健康与数据 | `/health` 200；`/games` 2 场（g001 HOU@DAL Q3 / g002 LAL@GSW Q4）；plays 降序（见 AC-02） |
| 3. 单回合全量 | 16 回合全量契约扫描：frames∈[100,240]、t 严格 100 等差、每帧恒 10 球员、坐标全域 0≤x≤94/0≤y≤50/z≥0、overlays≥3 且窗口∈[800,3000]ms、narration≥3、highlights ≤3 且为 text 子串、无残留花括号、setup.t0=0、t0 严格递增、t1≤durationMs——**全部通过，0 违规** |
| 4. 错误流 | g999 → 404 `code=1002`；`top=abc` → 400 `code=1001`；g001/p999 → 404 `code=1002` |
| 5. 离线合规 | 见 AC-08，全过 |
| 6. 视觉验证 | Chrome headless 1440×900 ×7 张截图（本报告 docs/qa/qa-final-*.png）：五区布局齐、marquee 选中、签名元素落位、零 emoji、橙 1.02% |

## 3. 后端单测复跑（C 项）

```
node --test server/test/narration.test.mjs
# tests 6  # pass 6  # fail 0  # skipped 0
```

**测试完整性审查（无 git 基线，diff 类检测 N/A，改为直接内容审查）：**

| 检测项 | 结果 | 详情 |
|---|---|---|
| 测试文件删除/弱化 | ✅ | 测试文件 113 行，6 用例覆盖契约 §9 全部 5 锚点 + t1 公式边界 |
| skip/xfail/.only | ✅ | 零命中（`# skipped 0`） |
| 硬编码断言/特判 | ✅ | 断言对象为 16 回合真实数据的全量不变量（非期望值硬编码）；实现侧 narration.service.js / commentary-rules.js 逐行审查无测试输入特判 |
| 框架配置篡改 | ✅ | 无 jest/pytest 配置；package.json test 脚本为标准 `node --test` |
| 断言强度 | ✅ | `assert/strict`，含严格相等、集合隶属、逐元素子串校验 |

## 4. 对抗抽查（D 项，防 gaming 代码级）

| 抽查对象 | 结果 |
|---|---|
| `web/src/lib/clock.js` | 全应用唯一 rAF 时序源成立：全前端 grep `setTimeout/setInterval/requestAnimationFrame`，除 clock.js 外仅 api.js 的 AbortController 超时（非 UI 时序）。状态机 idle→loading→replaying⇄paused→settled 完备；`wallDt` clamp 100ms 防后台标签页大跳；`loadSeq` 令牌防慢请求覆盖竞态（store.js） |
| `server/src/narration/commentary-rules.js` | 18 条规则与契约 §2.2 **逐字一致**（finish 7 / action 6 / setup 3 / analysis 2，优先级、when 条件、template、tone 全对）；priority 降序 + 稳定排序保同优先级书写顺序；`excludeIds` 保证两句 action 不重复 |
| `narration.service.js` | 锚点选取、t1 公式（clamp 1600–6000、最短驻留 800、next anchor+400 截断）、tone 升级（importance≥0.8 excited→clutch）、L1/L2/L3 三级兜底与契约逐字对应 |
| 生成器确定性（契约 §4.2） | `--all --seed 20261010` 连跑 3 次，g001/g002 md5 **三次完全一致**（b93a8a61…/13d35e22…），byte-identical |
| V10 importance 公式 | 16 回合 API 数据复算 `0.30c+0.25d+0.20r+0.15m+0.10s` vs total，**全部 ±0.001 内** |

## 5. 观察项（非阻断）

| # | 级别 | 事项 | 处置建议 |
|---|---|---|---|
| O-1 | P2 | 顶栏 `backdrop-filter: blur(8px)` 与 AC-12 "零毛玻璃" 字面冲突，但 UIUX v1.0（SPEC 三大基线文档之一，用户已确认）第 15/333/340 行明确白名单"blur 仅顶栏一处"。判合规，**不计缺陷** | 建议在 SPEC 下次修订时把该白名单写入 §8，消除字面歧义 |
| O-2 | P2 | 窄屏兜底阈值为 1280px（App.vue `vw<1280` 显示兜底横幅+左栏折叠），SPEC §10 文字为 ≥1024px 三栏完整。1024–1279px 区间行为严于 SPEC 文字；演示分辨率 1440/1920 不受影响 | 打回文字对齐即可（二选一：改阈值到 1024 或修订 SPEC §10），不阻断交付 |
| O-3 | P2 | 契约 narration-rules.md §2.2 规则 15 `minPassCount:0` 按 §2.1 语义为恒真（任何 play 命中），实现采用 `maxPassCount:0`（零传球才判 iso），语义正确但属契约笔误的合理偏离 | 契约文档修订笔误（minPassCount→maxPassCount），代码不动 |
| O-4 | 环境注记 | 验证中段后端进程曾被外部因素终止一次（端口释放、日志无崩溃记录，任务系统回收所致）；重启后全程稳定，与产品代码无关 | 交付包路演前用 `npm start` 前台运行并留意外部进程管理 |

**缺陷清单：P0 = 0，P1 = 0，P2 = 3（O-1/O-2/O-3，均为文档对齐类，不修代码不阻断）。**

## 6. 失效模式覆盖声明（6 类逐项）

| 失效模式 | 覆盖 | 证据 |
|---|---|---|
| Happy-path 偏差 | ✅ 已测异常路径 | 404/400 错误流、后端断开错误卡、损坏数据拒启、筛选空态代码路径存在 |
| 沉默逻辑错误 | ✅ 独立复算 | V10 公式全量复算、16 回合契约不变量全量扫描（不依赖开发自报）、V09 锚点恒等程序化验证 |
| 幻觉依赖/接口 | ✅ 存在性核验 | npm ls 两侧纯净（express/vue 锁定版本）；构建通过；全 API 端点实测响应形状与 openapi.yaml 一致 |
| 缺失系统上下文 | ✅ 设计内闭环 | 无认证为锁定 Out-of-Scope；只读 API 无写面；CORS/错误处理中间件存在；无敏感数据 |
| 性能盲区 | ✅ 已测 | `/plays/:playId` n=30：p50=**8.0ms** p95=**14.7ms**（限 50ms 纯内存读）；前端 rAF p95=16.7ms 零掉帧 |
| 静默缺失 | ✅ 构建+运行时双门 | vite build 绿、node --test 绿、CDP 运行时无未捕获异常（交互全程 14/14 探针通过） |

## 7. 生产就绪评级（7 维 × 3 档）

| 维度 | 档位 | 证据 |
|---|---|---|
| 测试 + 回归 | **Silver** | 契约锚点单测 6/6 + QA 独立全量契约扫描 + CDP 交互回归 14/14；无 git 基线故回归率按"首轮全绿"计 0；未到 Gold（无变异加固） |
| 契约 | **Silver** | OpenAPI 1.0.1 + dataset-contract + narration-rules 三契约先行；前后端实测对齐；错误模型统一（envelope + 4 错误码） |
| 安全 | **Silver** | 只读无写面、零原生依赖、零 CDN/外联（grep 实证）、无密钥无敏感数据；攻击面近零 |
| 无障碍 | **Silver** | prefers-reduced-motion 运行时实证、全键盘可操作（真实按键实证）、role/aria-label 在位 |
| 性能 | **Gold** | API p95 14.7ms（内存索引）；渲染 60fps p95=16.7ms；帧数据 10fps 逻辑步进与 rAF 解耦（K8 合规） |
| 可观测 | **Silver** | 结构化请求日志（方法/路径/状态码/耗时）、health 端点、启动校验日志带 JSON 路径级错误定位 |
| 发布安全 | **Silver** | 损坏数据拒启（exit 1 + 精确报错）、seed 确定性可重建、错误卡重试、无状态可任意重启 |
| **总档（取最低）** | **Silver** | 达商业级最低线；对 12h 黑客松路演场景（目标档 Bronze+）显著超标 |

## 8. 性能数据附录

- `/api/v1/games/g001/plays/p004` ×30：min 4.7ms / p50 8.0ms / p95 14.7ms / max 100.2ms（首请求离群，服务日志显示常规 1–5ms）
- 前端帧节奏：2s 121 帧，间隔 p50/p95/max = 16.7/16.7/16.8ms
- 页面冷启动 → 重演开始：251ms（含 API 往返）

## 9. 证据存档

| 文件 | 内容 |
|---|---|
| docs/qa/qa-final-01-initial-g001.png | g001 初始态：五区布局、p001 marquee 自动选中 |
| docs/qa/qa-final-02-g002-mirror.png | g002 左篮筐镜像渲染目检 |
| docs/qa/qa-final-03-reduced-motion.png | reduced-motion 仿真态 |
| docs/qa/qa-final-04-error-card.png | 后端断开错误卡（含重试） |
| docs/qa/qa-final-05-midreplay.png | 重演中态：标注层 + 打字机染橙 |
| docs/qa/qa-final-06-overlay-off.png | overlay 关闭对比态 |
| docs/qa/qa-final-07-narrow-900px.png | 900px 兜底布局（横幅 + 横向 chips） |

## 10. 交付判定

# **GO**

AC 12/12 PASS；P0/P1 缺陷为零；单测 6/6；交互探针 14/14；失效模式 6/6 覆盖；生产就绪 **Silver**（路演目标 Bronze+ 显著超标）。
P2 观察项 3 条进 backlog（文档对齐类），不阻断交付。
