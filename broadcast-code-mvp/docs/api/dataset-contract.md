# Dataset Contract — Mock 深度数据集行为契约

> 版本：v1.0 | 日期：2026-10-10 | 架构师：高见远
> 地位：后端开发与 tools/gen-mock-game.mjs 的**唯一实现依据**，与 SPEC v1.0 §6 完全一致。
> 凡本契约未明确的字段/行为，实现者不得自行发明——先改契约再改代码。

---

## 1. 坐标系与全局常量

| 常量 | 值 | 说明 |
|---|---|---|
| 球场物理尺寸 | 94 × 50 ft | 原点 = 左下角（左底线 × 下边线） |
| SVG 映射 | `viewBox 0 0 940 500` | 1 ft = 10 单位，前端 ×10 直接落位 |
| 左篮筐中心 | (40, 250)（SVG 单位）= (4.0, 25.0) ft | |
| 右篮筐中心 | (900, 250) = (90.0, 25.0) ft | |
| 三分弧半径 | 237.5 单位（23.75 ft） | 以篮筐中心为圆心 |
| 角三分线距边线 | 30 单位（3.0 ft） | y ≤ 30 或 y ≥ 470 时为底角三分区 |
| 帧步进 | 100 ms（10fps） | `t` 从 0 开始，严格等差 |
| 单回合 frames | 100–240 帧 | 即 durationMs ∈ [10000, 24000] |
| 坐标精度 | 2 位小数（ft） | 生成器输出前 `round2()` |
| 时间精度 | 整数 ms | |

**进攻方向约定**：每回合 `possession` 字段指明进攻方与进攻篮筐。g001 全部回合进攻右篮筐 (900,250)，g002 全部进攻左篮筐 (40,250)——便于验证前端镜像渲染。生成器以"向右进攻"为内部规范方向，g002 输出时做 x 镜像（`x' = 94 - x`，再 round2）。

---

## 2. 字段级契约（JSON Schema 语义）

### 2.1 Game

| 字段 | 类型 | 必填 | 取值/格式 | 说明 |
|---|---|---|---|---|
| id | string | 是 | `g\d{3}`，如 `g001` | |
| label | string | 是 | 非空 ≤30 字 | 如 "火箭 vs 独行侠 · 第三节" |
| date | string | 是 | ISO date `YYYY-MM-DD` | 虚构日期 |
| venue | string | 是 | 非空 | |
| home / away | Team | 是 | 见 §2.2 | |
| quarters | array | 是 | `[{q:int, home:int, away:int}]` ≥1 节 | 分节比分；g001 只含 Q1–Q3 |
| score | object | 是 | `{home:int, away:int}` | = 末节累计；须与 quarters 求和一致（validator 校验） |
| court | object | 是 | 七常量，值同 §1 表 | 冗余下发，前端免硬编码 |
| plays | Play[] | 是 | 8 个 | 生成后按 importance.total 降序重排入库 |

### 2.2 Team / Player

| 字段 | 类型 | 必填 | 取值 | 说明 |
|---|---|---|---|---|
| teamId | string | 是 | 小写缩写，如 `hou` | |
| name / abbr | string | 是 | 非空 / 3 大写字母 | |
| color | string | 是 | `#RRGGBB` | 仅用于列表徽标，**不进战术板**（战术板用范式关键点三色） |
| players | Player[5] | 是 | **恒 5 人** | 场上阵容，无替补概念 |
| players[].id | string | 是 | `{teamId}-{number}`，如 `dal-77` | |
| players[].name | string | 是 | 非空 | |
| players[].number | int | 是 | 0–99 | |
| players[].star | bool | 是 | 每队 1–2 个 true | importance 的 star 子分输入 |

### 2.3 Play

| 字段 | 类型 | 必填 | 取值/范围 | 说明 |
|---|---|---|---|---|
| id | string | 是 | `p\d{3}`，按 importance 降序重编号 | p001 = 全场最关键回合 |
| quarter | int | 是 | g001=3，g002=4 | |
| clock | string | 是 | `MM:SS.s`，节内剩余时间 | 与回合开始时刻一致 |
| label | string | 是 | ≤20 字，如 "东契奇后撤步三分" | 列表展示用 |
| tags | string[] | 是 | 1–3 个，取自 §5.3 rarity 表 key 或 `clutch` | clutch 回合必含 `clutch` |
| scoreBefore | object | 是 | `{home, away}` | 本回合开始前比分 |
| actors | object | 是 | `{shooter, defender?, assister?, screener?}` | shooter 必填；其余可 null |
| features | Features | 是 | 见 §2.4 | analyze 阶段产出 |
| importance | object | 是 | `{total:0..1, breakdown:{clutch,difficulty,rarity,momentum,star}}` | 公式见 §4，total 保留 3 位小数 |
| durationMs | int | 是 | 10000–24000，100 的倍数 | = frames.length × 100 |
| frames | Frame[] | 是 | 100–240 | 见 §2.5 |
| overlays | Overlay[] | 是 | ≥3 | 见 §2.6；由事件序列派生，映射表见 §5.4 |
| narration | Narration[] | 是 | ≥3 | 见 narration-rules.md（姊妹契约） |
| video | object | 是 | `{available:false, src:null, offsetMs:0}` | MVP 恒为关闭态，字段保留 |

### 2.4 Features（analyze 七项，全部 0..1 归一，除标注外）

| 字段 | 类型 | 范围 | 计算公式（生成器必须逐字实现） |
|---|---|---|---|
| shotDifficulty | float | 0..1 | `clamp01(0.55·dShot + 0.45·dDef)`；`dShot=clamp01((distFt−2)/26)`；`dDef=1−clamp01(defDistFt/8)` |
| gravity | float | 0..1 | 持球人 2 ft 内防守人数记 n0、6 ft 内记 n1：`clamp01(0.5·n0 + 0.25·(n1−n0) + 0.5·(shooter.star?1:0))`，上限 1 |
| clutchScore | float | 0..1 | `clamp01(0.6·fClock + 0.4·fMargin)`；`fClock=clamp01((180−secLeftInQuarter)/180)`；`fMargin=1−clamp01(abs(margin)/12)` |
| spacingGain | float | 0..600 | 战术执行后最开阔接球人空档面积（ft²）= 以接球人为圆心、最近防守人距离为半径的圆面积 `π·r²`，round1 |
| defenseCollapseMs | int | 0..5000，100 的倍数 | 从战术发起事件到首个防守人失位（距责任对象 >6 ft）的毫秒数 |
| offBallMovement | float | 0..1 | 无球 4 人总移动距离 ÷ 基准 120 ft：`clamp01(totalDist/120)` |
| passCount | int | 0..8 | 本回合传球次数 |

### 2.5 Frame

| 字段 | 类型 | 必填 | 取值 | 说明 |
|---|---|---|---|---|
| t | int | 是 | 0 起，100 等差 | |
| ball | object | 是 | `{x,y,z}` ft，round2；`z ≥ 0` | 持球时 z=持球队员手部高度 3.2；传球飞行 z 线性 3.2→3.2；投篮抛物线见 §5.5 |
| players | array | 是 | **恒 10 个**，5 攻 5 防 | 顺序固定：先攻后防，各按 number 升序 |
| players[].id | string | 是 | 存在于 Game roster | validator 校验 |
| players[].team | string | 是 | `home` / `away` | |
| players[].x / .y | float | 是 | 0≤x≤94，0≤y≤50，round2 | 越界 = validator 拒启 |
| players[].role | string | 是 | `handler / cutter / screener / defender / help` | 每帧每队至少 1 个 defender（防守方） |

### 2.6 Overlay

| 字段 | 适用 type | 必填 | 取值 | 说明 |
|---|---|---|---|---|
| type | 全部 | 是 | `arrow / ring / zone` | |
| t0 / t1 | 全部 | 是 | int ms，`0 ≤ t0 < t1 ≤ durationMs` | 事件窗口；持续时长 ∈ [800, 3000] |
| from / to | arrow | 是 | `[x,y]` ft，round2 | 传球/跑位起止点 |
| style | arrow | 是 | `solid / dashed` | solid=传球，dashed=跑位路线 |
| playerId | ring | 是 | roster 内 id | 标注目标 |
| r | ring | 是 | 1.5–3.0 ft | 橙环半径 |
| label | ring, zone | 是 | ≤12 字 mono 短文案 | 如 "空档 +210ft²" |
| points | zone | 是 | 3–6 个 `[x,y]` 顶点 | 简单多边形，不自交 |
| opacity | zone | 是 | 0.10–0.20 | |

### 2.7 Narration

字段契约见 `docs/api/narration-rules.md` §2；本文件只锁同步硬约束：**每句 t0 与其锚点 overlay.t0 严格相等**（偏差 0ms，天然满足 AC-04 ≤200ms），`t1 ≤ durationMs`，highlights ≤3 且为 text 子串。

---

## 3. importance 五维打分公式（逐字实现）

```
total = 0.30·clutch + 0.25·difficulty + 0.20·rarity + 0.15·momentum + 0.10·star
```

| 子分 | 公式 | 输入 |
|---|---|---|
| clutch | `= features.clutchScore` | §2.4 |
| difficulty | `= features.shotDifficulty` | §2.4 |
| rarity | 查表（§5.3 archetype → rarity 值） | 回合 archetype |
| momentum | `clamp01(0.5·offBallMovement + 0.5·clamp01(passCount/6))` | §2.4 |
| star | `shooter.star ? 1.0 : 0.3` | roster |

输出：各子分 round3，total round3。该公式同时是前端 ImportanceBreakdown 组件的展示依据——**公式即 UI**。

---

## 4. 生成器行为规格（server/tools/gen-mock-game.mjs）

### 4.1 CLI 接口

```bash
node server/tools/gen-mock-game.mjs --game g001 --seed 20261010 --out server/data/games/g001.json
node server/tools/gen-mock-game.mjs --game g002 --seed 20261010 --out server/data/games/g002.json
node server/tools/gen-mock-game.mjs --all --seed 20261010   # 两场全生成
```

| 参数 | 必填 | 默认 | 说明 |
|---|---|---|---|
| --game | 否 | — | `g001` / `g002`，与 --all 二选一 |
| --all | 否 | — | 生成全部场次 |
| --seed | 否 | 20261010 | 全局种子；**CI 与本地必须使用同一默认** |
| --out | 否 | server/data/games/{game}.json | |

退出码：0 成功；1 参数非法；2 生成结果未过自检（§6 校验全量跑一遍，不过则不写盘）。

### 4.2 确定性（硬约束）

1. **唯一随机源**：`mulberry32` PRNG，逐字实现：

```js
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

2. **种子派生**：每回合独立流 `seed_play = seed + gameIndex·1000 + playIndex`，gameIndex：g001=0，g002=1；playIndex=0..7。**禁止** `Math.random()` / `Date.now()` / 任何时间依赖出现在生成路径。
3. **消费顺序固定**：同一 playIndex 下，PRNG 调用次序 = ① 时长抖动 → ② 路径控制点 → ③ 防守反应 → ④ 噪声序列（帧序 × 球员序）。次序写入代码注释，改动即破坏确定性，必须同步 bump 本契约版本。
4. **数值收敛**：所有坐标 round2、子分 round3、时间取整——保证两次运行产物 byte-identical。验收：`连续运行两次 --all，diff 两个 JSON 必须为空`。

### 4.3 回合生成算法（五阶段）

**阶段 A：archetype 选取与演员指派**
按 §5.2 场次剧本表逐回合取 archetype（**剧本表即输入，不由 PRNG 选**——保证 2 个 clutch 回合等叙事结构稳定）。从 roster 指派 shooter/screener/cutter/assister/defender：star 球员优先担任 clutch 回合 shooter；其余按 PRNG 抽签。

**阶段 B：关键路径点（waypoints）**
每个 archetype 定义路径模板（§5.4）：起始于发球阵型（五外/horns/边线），含 2–4 段三次贝塞尔曲线。控制点在模板基准上叠加 PRNG 抖动（±2.0 ft 均匀分布）。

**阶段 C：轨迹积分**
- 每球员沿贝塞尔分段匀速插值，速度按角色：handler 14–18 ft/s、cutter 18–22、screener 10–14、defender 跟随对象速度 +5%。
- 球权转移生成事件序列 `events[] = [{t, kind: screen|pass|cut|receive|shot|make|miss, ...}]`；pass 事件：球直线飞行，速率 25 ft/s；receive 前下一路径段不启动（接球等人）。
- **防守跟随规则**：人盯人基线——防守人位置 = 责任对象位置朝己方篮筐收缩 1.5 ft；反应延迟 200ms（即跟随对象是 200ms 前的位置）；gravity 规则——当 handler 为 star 且持球 >1.5s，最近一名 help 防守人向 handler 收缩（协防），其责任对象漏空（spacingGain 由此产生）；失位判定：某防守人与责任对象距离 >6 ft 且持续 ≥300ms → 记 defenseCollapseMs = 失位时刻 − 战术发起时刻。
- **噪声**：每帧每球员叠加 PRNG 均匀抖动 ±0.15 ft（round2 后落盘）——消除"机器人感"，但不影响事件时刻。

**阶段 D：features 与 importance 计算**
按 §2.4 / §3 公式从事件序列与轨迹实测值计算（**不是编的值**——distFt/defDistFt/n0/n1/移动距离全部从生成轨迹采样），保证"指标计算逻辑真实"（SPEC §6）。

**阶段 E：overlays 与 narration 派生**
- overlays：事件 → overlay 映射表（§5.4 每 archetype 列明），t0=事件时刻，t1=t0+窗口（§2.6 范围）。
- narration：调用 `narration-rules.md` 定义的规则表与模板，逐句生成 t0/t1/text/highlights；锚点 overlay 按该契约 §4 选取。

### 4.4 事件 → 帧时间对齐

所有事件时刻必须落在帧边界（100 的倍数）上：贝塞尔积分按 100ms 步进采样，事件时刻 `round(t/100)*100`。overlay.t0/narration.t0 直接使用事件时刻——**三向同源，无需后对齐**。

---

## 5. 场次剧本（生成器输入，逐回合锁定）

### 5.1 阵容

**g001 — HOU vs DAL（Q3）**，venue: American Airlines Center，date: 2025-01-16
- DAL（home，star 加粗）：dal-77 **Luka Doncic** 77、dal-11 **Kyrie Irving** 11、dal-25 P.J. Washington 25、dal-21 Daniel Gafford 21、dal-31 Klay Thompson 31
- HOU（away）：hou-15 **Alperen Sengun** 15、hou-4 Jalen Green 4、hou-5 Fred VanVleet 5、hou-9 Dillon Brooks 9、hou-10 Jabari Smith Jr. 10

**g002 — LAL vs GSW（Q4，备用场）**，venue: Chase Center，date: 2025-01-25
- GSW（home）：gsw-30 **Stephen Curry** 30、gsw-23 Draymond Green 23、gsw-22 Andrew Wiggins 22、gsw-8 Buddy Hield 8、gsw-32 Trayce Jackson-Davis 32
- LAL（away）：lal-23 **LeBron James** 23、lal-3 **Anthony Davis** 3、lal-15 Austin Reaves 15、lal-1 D'Angelo Russell 1、lal-12 Taurean Prince 12

### 5.2 g001 回合剧本（Q3 ×8，含 2 clutch）

| playIndex | archetype | shooter | clutch | 备注 |
|---|---|---|---|---|
| 0 | iso_stepback_deep_three | dal-77 | 否 | 招牌后撤步 |
| 1 | horns_dunk | dal-21 | 否 | 空接终结 |
| 2 | offball_flare_three | dal-31 | 否 | 汤普森绕掩护 |
| 3 | pick_and_roll_layup | dal-11 | 否 | 欧文挡拆突破 |
| 4 | fast_break_three | dal-25 | 否 | 转换追身三分 |
| 5 | elevator_three | dal-31 | 否 | 电梯门战术 |
| 6 | buzzer_beater_deep_three | dal-77 | **是** | Q3 压哨超远 |
| 7 | pick_and_roll_midrange | dal-77 | **是** | 节末 30s 内反超球 |

### 5.3 g002 回合剧本（Q4 ×8，含 2 clutch）

| playIndex | archetype | shooter | clutch |
|---|---|---|---|
| 0 | pick_and_roll_layup | lal-23 | 否 |
| 1 | offball_flare_three | gsw-8 | 否 |
| 2 | post_up_kickout_three | gsw-30 | 否 |
| 3 | fast_break_dunk | lal-3 | 否 |
| 4 | iso_stepback_deep_three | gsw-30 | 否 |
| 5 | horns_dunk | gsw-32 | 否 |
| 6 | buzzer_beater_deep_three | gsw-30 | **是** |
| 7 | pick_and_roll_midrange | lal-23 | **是** |

### 5.4 archetype 定义表

| archetype | rarity | 时长区间 ms | 事件序列（→overlay 映射） | tags |
|---|---|---|---|---|
| iso_stepback_deep_three | 0.85 | 10000–13000 | iso 拉开(zone) → 后撤步(arrow:dashed) → 出手(ring+label) | deep_three |
| horns_dunk | 0.80 | 10000–12000 | horns 站位(zone) → 掩护(ring screener) → 空切(arrow:dashed) → 传球(arrow:solid) → 扣篮(ring) | dunk, alley_oop |
| offball_flare_three | 0.60 | 11000–14000 | 弱侧掩护(ring) → flare 跑位(arrow:dashed) → 传球(arrow:solid) → 空位三分(ring+zone) | catch_shoot |
| pick_and_roll_layup | 0.40 | 10000–12000 | 掩护(ring) → 顺下(arrow:dashed) → 防守夹击(zone) → 上篮/分球(ring) | pick_roll |
| fast_break_three | 0.65 | 10000–11000 | 推进(arrow:solid) → 底角拉开(zone) → 追身三分(ring) | transition |
| elevator_three | 0.75 | 12000–14000 | 双掩护就位(ring×2) → 穿越(arrow:dashed) → 关门(help 被挡) → 三分(ring) | elevator |
| buzzer_beater_deep_three | 1.00 | 10000–12000 | 接球(arrow:solid) → 运球摆脱(arrow:dashed) → 超远出手(ring, label=距离) | buzzer, clutch |
| pick_and_roll_midrange | 0.45 | 10000–12000 | 掩护(ring) → 换防(zone) → 急停中投(ring) | pick_roll, clutch |
| post_up_kickout_three | 0.55 | 11000–13000 | 低位要球(ring) → 包夹(zone) → 分球(arrow:solid) → 三分(ring) | post_up |
| fast_break_dunk | 0.60 | 10000–11000 | 抢断/推进(arrow:solid) → 终结扣篮(ring) | transition, dunk |

每 archetype 路径模板（贝塞尔控制点基准值）写在生成器源码 `ARCHETYPES` 常量中，本契约不逐点列举；**验收以 §6 校验 + 视觉抽查为准，不以坐标绝对值为准**——这是有意保留的实现自由度。

### 5.5 投篮抛物线

球 z 高度：`z(τ) = 3.2 + v0·τ − 16.1·τ²`（τ 秒，v0 由命中点反解使 z(T)=篮筐 10.0 ft±0.3），出手点到篮筐的 xy 线性插值。三分 v0 峰值高度 12–15 ft，扣篮 z 峰值 ≤10.5。make/miss 由剧本锁定（buzzer_beater 必中；其余 archetype 命中率：layup/dunk 必中，三分 8 回合中 3 不中——miss 回合球碰筐弹出，反弹 2 帧后回合结束）。

---

## 6. 数据集校验清单（server/src/lib/dataset-validator.js 逐条实现）

启动时对每场比赛执行；任一失败 → 打印 `文件路径 + JSON 路径 + 期望值/实际值`，进程退出码 1（对应错误码 1003 的预防：损坏数据永不进内存）。

**结构类**
- V01 所有 §2 标"必填"字段存在且类型正确
- V02 roster 恒 5 人/队；players[].id 全场唯一
- V03 score = Σ quarters

**帧类**
- V04 frames.length ∈ [100,240]；t 严格 100 等差从 0 起；durationMs = length×100
- V05 每帧 players 恒 10 且 id 全集 == roster 全集；每帧防守方至少 1 个 role=defender
- V06 坐标全域 0≤x≤94 / 0≤y≤50 / z≥0；球 z ≤ 16
- V07 相邻帧单球员位移 ≤ 2.6 ft（≈26 ft/s 上限，防轨迹断裂）

**事件/同步类**
- V08 overlays ≥ 3；每 overlay 0≤t0<t1≤durationMs；t1−t0 ∈ [800,3000]
- V09 narration ≥ 3；每句存在锚点 overlay 使 |t0−overlay.t0| = 0；t1≤durationMs；highlights ⊆ text 子串且 ≤3
- V10 importance.breakdown 五项 ∈[0,1]，total = 加权和 ±0.001；plays 按 total 降序

**业务类**
- V11 clutch 回合数 == 2；其 tags 含 `clutch`
- V12 每回合 shooters 存在于 roster；star 射手至少 3 回合

---

## 7. Out-of-Scope（生成器不做）

- 不做多节连续叙事（8 回合相互独立，比分由剧本静态给定）
- 不做犯规/罚球/暂停事件类型
- 不做真实球员追踪数据导入（赛后接官方数据时另立契约）
- 不做帧数据压缩/二进制化（JSON 明文，体积预算：单场 ≤ 1.5MB）
