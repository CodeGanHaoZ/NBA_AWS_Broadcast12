# Narration Rules Contract — 解说规则引擎契约

> 版本：v1.0 | 日期：2026-10-10 | 架构师：高见远
> 地位：`server/src/lib/commentary-rules.js` + `templates.js` + `narration.service.js` 的**唯一实现依据**。
> 姊妹契约：字段级 JSON 定义见 `dataset-contract.md` §2.7；本文件锁规则表、模板语法、时间轴对齐、兜底与 highlights。
> 验收锚点：AC-04（t0 与锚点 overlay.t0 偏差 ≤200ms——本契约取 0ms）、AC-05（字段缺失兜底不中断）。

---

## 1. 引擎流水线（逐字实现）

```
Play（含 features/frames/overlays，生成器阶段 D 产物）
  │
  ▼ ① 句子槽位划分（§3）：setup / action / finish / analysis，每槽 1 句，≥3 句
  ▼ ② 规则匹配（§2）：每槽位按 priority 降序扫描规则表，取**首条命中**
  ▼ ③ 模板渲染（§5）：槽位 {slot} 从 PlayContext 取值，缺失走兜底链（§6）
  ▼ ④ highlights 选取（§7）：≤3 个，按优先级表
  ▼ ⑤ 时间轴生成（§4）：t0 = 锚点 overlay.t0（恒等），t1 按展示时长公式
  ▼
narration: [{t0, t1, tone, text, highlights[]}]
```

**硬约束：**
- 规则表扫描必须**确定性**：同优先级按表内书写顺序，禁止任何运行时随机。
- 每个槽位必有命中：每个槽位至少 1 条 `fallback` 规则（priority=0，无条件命中）。
- 纯函数：`narrate(play, roster) → Narration[]`，无副作用，可单测。

---

## 2. 规则表格式与全量规则

### 2.1 规则条目格式

```js
{
  id: 'finish_buzzer_clutch',        // 全局唯一，snake_case
  slot: 'finish',                    // setup | action | finish | analysis
  priority: 100,                     // 降序扫描，首条命中；fallback=0
  when: {                            // 全部条件 AND；可省略的键=不检查
    tags: ['buzzer'],                // play.tags 须包含全部列出值
    clutch: true,                    // tags 含 'clutch' 的语法糖
    result: 'made',                  // 由 archetype/剧本推导
    minImportance: 0.75,             // importance.total ≥ 阈值
    minDifficulty: null,             // features.shotDifficulty ≥ 阈值，null=不检查
    minGravity: null,
    minPassCount: null,
    star: true,                      // shooter.star === true
    maxClockSec: 3                   // 节内剩余秒数 ≤ 阈值
  },
  template: 'finish_buzzer_01',      // §5 模板表 key
  tone: 'clutch'                     // calm | excited | clutch
}
```

### 2.2 全量规则表（18 条，按 priority 降序——实现时按此表逐字落码）

| # | id | slot | priority | when（关键条件） | template | tone |
|---|---|---|---|---|---|---|
| 1 | finish_buzzer_clutch | finish | 100 | tags:[buzzer], result:made | finish_buzzer_01 | clutch |
| 2 | finish_clutch_star | finish | 95 | clutch:true, star:true, result:made | finish_clutch_01 | clutch |
| 3 | finish_deep_three | finish | 85 | tags:[deep_three], result:made | finish_deep_01 | excited |
| 4 | finish_tough_shot | finish | 80 | minDifficulty:0.75, result:made | finish_tough_01 | excited |
| 5 | finish_dunk | finish | 70 | tags:[dunk], result:made | finish_dunk_01 | excited |
| 6 | finish_miss | finish | 60 | result:missed | finish_miss_01 | calm |
| 7 | finish_fallback | finish | 0 | — | finish_generic_01 | calm |
| 8 | action_gravity_collapse | action | 90 | minGravity:0.7, minCollapseMs:800 | action_gravity_01 | excited |
| 9 | action_screen_roll | action | 75 | tags:[pick_roll] | action_screen_01 | calm |
| 10 | action_offball_screen | action | 70 | tags:[catch_shoot] 或 [elevator] | action_offball_01 | calm |
| 11 | action_transition | action | 65 | tags:[transition] | action_transition_01 | excited |
| 12 | action_ball_movement | action | 55 | minPassCount:3 | action_passing_01 | calm |
| 13 | action_fallback | action | 0 | — | action_generic_01 | calm |
| 14 | setup_clutch_context | setup | 90 | clutch:true | setup_clutch_01 | clutch |
| 15 | setup_star_iso | setup | 80 | tags:[iso] 或 star:true 且 maxPassCount:0 | setup_iso_01 | calm |
| 16 | setup_fallback | setup | 0 | — | setup_generic_01 | calm |
| 17 | analysis_spacing | analysis | 70 | minSpacingGain:150 | analysis_spacing_01 | calm |
| 18 | analysis_fallback | analysis | 0 | — | analysis_generic_01 | calm |

**tone 决策补充规则（覆盖表内 tone）：** 若 `importance.total ≥ 0.80` 且该句 tone 为 excited → 升级为 clutch。calm 永不升级。此规则在渲染后统一应用，保证"最关键回合全程高能"的路演观感。

---

## 3. 句子槽位划分

| 槽位 | 数量 | 锚点事件（决定 t0） | 说明 |
|---|---|---|---|
| setup | 1 | 回合首个 overlay（t0=0） | 交代局面：时间/分差/持球人 |
| action | 1–2 | 首个非 zone 型 overlay（掩护/传球/跑位事件） | 战术展开过程；有第 2 个 action 事件则生成第 2 句 |
| finish | 1 | shot 事件对应的 ring overlay | 出手与结果 |
| analysis | 0–1 | finish 句 t1 之后 400ms（无 overlay 锚点，属例外槽位） | 数据解读，仅当 minImportance≥0.5 或规则 17 命中时生成 |

每回合总句数 3–5，满足 dataset-contract §6 V09（≥3）。analysis 是唯一允许无 overlay 锚点的槽位——AC-04 的措辞是"对应 overlay 的句子"，analysis 句无对应 overlay，天然豁免。

---

## 4. t0 / t1 生成算法（对齐 AC-04）

```js
// 锚点：每句绑定 anchorOverlay（analysis 除外）
t0 = anchorOverlay.t0                          // 偏差 0ms ≤ 200ms，AC-04 恒成立

// 展示时长：与前端打字机节奏（30–45ms/字 + 标点停顿）匹配
const chars = text.length;
const puncts = (text.match(/[，。——！？]/g) || []).length;
const typingMs = 40 * chars + 150 * puncts;    // 取打字机速率中位
displayMs = clamp(1600, typingMs + 600, 6000); // 读完再留 600ms

// t1 不越过下一个锚点 +400ms（防字幕叠层）
const nextAnchor = nextSentenceAnchorT0 ?? durationMs;
t1 = Math.min(t0 + displayMs, nextAnchor + 400, durationMs);
t1 = Math.max(t1, t0 + 800);                   // 最短驻留
```

不变量（validator V09 校验）：`0 ≤ t0 < t1 ≤ durationMs`；同回合各句 t0 严格递增；setup.t0 == 0。

---

## 5. 槽位模板语法与全量模板表

### 5.1 语法

- 槽位：`{slotName}`，从 PlayContext（§5.3）取值；**渲染期槽位必须全部消解**——产物 text 中不得残留 `{` `}`。
- 转义：模板中字面花括号写 `{{` `}}`（当前模板表未使用，仅为语法完备性保留）。
- 数字槽位已带单位的模板不再拼接单位；`{distFt}` 输出形如 `"28.6"`（1 位小数）。
- 禁止：模板中出现 emoji、出现"作为一个 AI"类元叙述、出现占位省略号 `...`。

### 5.2 全量模板表（13 个模板 + 5 个兜底，逐字）

| key | 模板（text 原文） |
|---|---|
| setup_generic_01 | `{team}进攻，{clock}，{player}持球组织。` |
| setup_iso_01 | `{player}示意拉开，单打{defender}——这是他最舒服的节奏。` |
| setup_clutch_01 | `{clock}，分差{margin}分，球在{player}手里，全场都站起来了。` |
| action_generic_01 | `{player}发动战术，{team}开始跑位。` |
| action_screen_01 | `{screener}上来掩护，{player}借掩护{action}。` |
| action_offball_01 | `{player}借{screener}的无球掩护兜出来，防守被甩在身后。` |
| action_gravity_01 | `{player}持球吸引{nDef}人收缩，防线正在崩塌——{collapseMs}毫秒内轮转已经失位。` |
| action_transition_01 | `攻防转换！{player}全速推进，防守还没落位。` |
| action_passing_01 | `{team}连续{passCount}次传导，球动了，防守跟着动了。` |
| finish_buzzer_01 | `压哨！{player}超远三分出手——球进灯亮！` |
| finish_clutch_01 | `关键球交给{player}，迎着{defender}命中！{team}反超！` |
| finish_deep_01 | `距离三分线外{distFt}英尺，{player}迎着防守果断出手——命中！` |
| finish_tough_01 | `防守人指尖都快封到脸上了，{player}这球还是进——难度拉满。` |
| finish_dunk_01 | `{player}腾空而起，双手重扣！篮筐都在晃。` |
| finish_miss_01 | `{player}出手弹筐而出，这球差了一点。` |
| finish_generic_01 | `{player}完成终结，回合结束。` |
| analysis_spacing_01 | `看数据：这次跑位撕开了{spacingGain}平方英尺的空档，防守沟通完全失败。` |
| analysis_generic_01 | `这个回合的关键度评分{importance}，{reason}。` |

### 5.3 PlayContext 槽位来源表（渲染取值唯一依据）

| 槽位 | 来源 | 缺失时 |
|---|---|---|
| {player} | roster 查 actors.shooter 的 name | 不可能缺（V12 保证）→ 否则走 §6 整句兜底 |
| {defender} | roster 查 actors.defender 的 name | actors.defender==null → "补防球员" |
| {screener} | roster 查 actors.screener 的 name | null → "队友" |
| {team} | shooter 所属队 name | 不可能缺 |
| {clock} | play.clock | 不可能缺 |
| {margin} | abs(scoreBefore.home − scoreBefore.away) | 不可能缺 |
| {action} | archetype 动作短语表：pick_roll→"直杀篮下"，flare→"绕到侧翼"，iso→"连续变向"，transition→"长驱直入"，默认→"完成摆脱" | 默认短语 |
| {nDef} | gravity 计算中间量 n1（6ft 内防守人数） | features.gravity 缺失 → §6 整句兜底 |
| {collapseMs} | features.defenseCollapseMs | 同上 |
| {passCount} | features.passCount | 同上 |
| {distFt} | 出手点到篮筐距离，round1 | features 缺失 → "超远"（距模板语义兼容的词） |
| {spacingGain} | features.spacingGain，取整 | features 缺失 → §6 整句兜底 |
| {importance} | importance.total，2 位小数 | 不可能缺 |
| {reason} | breakdown 中最大子分 → 短语映射：clutch→"胜在关键时刻的价值"，difficulty→"胜在出手难度"，rarity→"胜在回合稀有度"，momentum→"胜在团队联动"，star→"胜在球星成色" | 并列最大取表内靠前者 |

---

## 6. 降级兜底文案表（AC-05 唯一依据）

按"缺失范围"三级降级，逐级套用，**任何情况下 narration 数组非空**：

| 级别 | 触发条件 | 行为 |
|---|---|---|
| L1 槽位级 | 单个槽位值缺失（§5.3 各行"缺失时"列） | 用该槽位默认词替换，句子照常生成 |
| L2 句子级 | 某句所需 features 整体缺失 / 模板渲染后仍残留 `{` | 该槽位改发对应 `*_fallback` 规则（priority 0）的通用句 |
| L3 回合级 | features 字段整体缺失或 overlays 为空 | narration = 固定三句：`[{t0:0, tone:calm, text:"{team}进攻，{player}持球。"}, {t0:durationMs/2 取帧界, tone:calm, text:"战术展开，{player}寻找机会。"}, {t0:最后事件帧或 durationMs−2000, tone:calm, text:"回合结束。"}]`，highlights 全为空数组；t1 按 §4 公式。前端此时只渲染基础骨架（L1 橙环），不报错不白屏 |

---

## 7. highlights 选取规则

| 规则 | 内容 |
|---|---|
| 数量 | 每句 0–3 个；**上限 3 为硬约束**（validator V09） |
| 优先级 | ① 数值度量（distFt/spacingGain/collapseMs/passCount 的渲染串，含单位词如 "28.6英尺" 整体高亮）→ ② 战术名词（挡拆/空切/掩护/压哨/反超/空档，取模板中实际出现的）→ ③ 球员姓名（每句最多 1 个） |
| 选取方式 | 按优先级扫描 text，每类至多取满即停；同类按在 text 中出现顺序取 |
| 合法性 | 每个 highlight 必须是 text 的**连续子串**（前端用 indexOf 定位逐字染橙）；大小写/空格敏感 |
| tone 联动 | clutch 句允许 3 个；calm 句最多 2 个（视觉降噪） |

---

## 8. 与 overlay 事件窗口的锚点绑定表

| 槽位 | 锚点 overlay 选取规则 |
|---|---|
| setup | overlays 中 t0 最小者（生成器保证 t0=0 的 zone/ring 存在） |
| action 第 1 句 | t0 最小的 `type=ring`（掩护事件）；无 ring 则 t0 最小的 arrow |
| action 第 2 句 | t0 最小的 `type=arrow, style=dashed`（跑位事件）；不存在则不生成第 2 句 |
| finish | t0 最大的 ring（出手标注）；不存在则 t0 最大的任意 overlay |
| analysis | 无锚点（§3 豁免），t0 = finish.t1 + 400，向 100ms 帧界向上取整 |

若锚点选取失败（overlays 为空）→ 直接进 §6 L3，不得抛错。

---

## 9. 单测锚点（交付时 QA 据此验收）

1. 同优先级规则交换书写顺序 → 产物变化即判定扫描顺序实现有误
2. 任意 Play 删除 features → 产物 == §6 L3 三句
3. 全部 16 回合：每句存在锚点使 `narration.t0 === anchor.t0`（analysis 除外）
4. 全部 16 回合：text 不含 `{`/`}`；highlights 全部为 text 子串且 ≤3
5. 全部 16 回合：setup.t0===0，句间 t0 严格递增，t1 ≤ durationMs
