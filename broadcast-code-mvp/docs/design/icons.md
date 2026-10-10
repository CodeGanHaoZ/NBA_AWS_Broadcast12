# icons.md · SVG 图标组件契约

> 设计师：颜好看 | 2026-10-10 | 依据：ARCHITECTURE.md §2.7（锁定）+ UIUX.md 附录 A（path 级设计）
> P0：禁止 emoji 作为功能图标。全部图标 = 内联 SVG Vue 组件，不引入任何图标库。

## 1. 网格纪律（不可偏离）

| 项 | 锁定值 |
|---|---|
| 形态 | 内联 SVG Vue 组件，`web/src/components/icons/IconXxx.vue` |
| 网格 | 24×24 viewBox，主体落在 20×20 安全区（四边 2px 出血） |
| 描边 | 1.5px，`stroke="currentColor"`，`fill="none"`，round linecap/linejoin |
| 尺寸 | 16 / 20 / 24 三档，`size` prop 控制（`width/height` 等比） |
| 颜色 | 一律 `currentColor`，由范式 token 经 CSS `color` 着色 |
| 元素 | 只用 `<path>` / `<circle>` / `<polyline>`；禁填充式、禁双色 |

## 2. IconBase 组件契约

所有图标通过统一基座渲染，单个图标组件只提供 inner 图形：

```vue
<!-- web/src/components/icons/IconBase.vue -->
<template>
  <svg
    :width="size" :height="size" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" stroke-width="1.5"
    stroke-linecap="round" stroke-linejoin="round"
    aria-hidden="true" focusable="false"
  >
    <slot />
  </svg>
</template>

<script setup>
defineProps({
  size: { type: [Number, String], default: 20, validator: v => [16, 20, 24].includes(Number(v)) }
})
</script>
```

**契约要点**：
- `size` 仅允许 16 / 20 / 24（行内 / 按钮内 / 独立图标），validator 拦截其他值
- **stroke-width 缩放规则**：固定 1.5，随 viewBox 等比缩放（16px 档视觉等效 1px）；**禁止** `vector-effect: non-scaling-stroke`
- 图标无语义装饰性 → `aria-hidden="true"`；若按钮只有图标无文字，由**按钮**侧补 `aria-label`，图标自身不承担
- 单个图标组件示例：

```vue
<!-- IconPlay.vue -->
<template>
  <IconBase :size="size"><path d="M8.5 5.8v12.4L19 12z" /></IconBase>
</template>
<script setup>
import IconBase from './IconBase.vue'
defineProps({ size: { type: [Number, String], default: 20 } })
</script>
```

## 3. 图标清单（16 枚 = SPEC 9 枚必需 + 7 枚扩展）

path 数值容差 ±0.3px（对齐像素网格微调）。落位详见 UIUX.md §6 组件映射表。

| # | 组件名 | 级别 | 语义 / 落位 | path（24 网格） |
|---|---|---|---|---|
| 1 | IconPlay | **SPEC 必需** | 播放 / 控制条 | `M8.5 5.8v12.4L19 12z` |
| 2 | IconPause | **SPEC 必需** | 暂停 / 控制条 | `M9.2 5.5v13` + `M14.8 5.5v13` |
| 3 | IconReplay | **SPEC 必需** | 重播 / 控制条 | `M4.8 9.2A8 8 0 1 1 4 13.8` + `M4.2 4.5v5h5` |
| 4 | IconCourt | **SPEC 必需** | 战术板切换（overlay on/off）/ 主区右上 | `M3.5 6h17v12h-17z` + `M12 6v12` + `<circle cx="12" cy="12" r="2.8"/>` |
| 5 | IconArrowRight | **SPEC 必需** | 箭头（跳转/指示；旋转 90° 兼作 collapse）/ 通用 | `M4 12h15` + `M13.5 6l6 6-6 6` |
| 6 | IconTargetRing | **SPEC 必需** | 瞄准环（标注开关/图例）/ 主区 | `<circle cx="12" cy="12" r="6.5"/>` + `M12 2.8v3.4M12 17.8v3.4M2.8 12h3.4M17.8 12h3.4` |
| 7 | IconFlame | **SPEC 必需** | clutch 标识 / 回合卡片 · clutch pill | `M12 3.2s5.2 4.8 5.2 9.4a5.2 5.2 0 0 1-10.4 0c0-1.9.9-3.6 2.1-4.9.4 1 1 1.7 1.7 2.1C10.6 6.9 12 3.2 12 3.2z` |
| 8 | IconDatabase | **SPEC 必需** | 数据源 / 数据块栏头 | `<ellipse cx="12" cy="5.8" rx="7.5" ry="2.8"/>` + `M4.5 5.8v12.4c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8V5.8` + `M4.5 12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8` |
| 9 | IconTimeline | **SPEC 必需** | 时间轴 / scrubber 栏头 | `M3.5 12h17` + `M7.5 12V8.5M12 12v3.5M16.5 12V9.5` |
| 10 | IconFastForward | 扩展 | 快进/下一事件刻度 / 控制条 | `M5 6.5l6.5 5.5L5 17.5z` + `M12.5 6.5l6.5 5.5-6.5 5.5z` |
| 11 | IconFramePrev | 扩展 | 逐帧后退 / 控制条 | `M15.5 6l-6 6 6 6` + `M8.5 6v12` |
| 12 | IconFrameNext | 扩展 | 逐帧前进 / 控制条 | `M8.5 6l6 6-6 6` + `M15.5 6v12` |
| 13 | IconSlowMo | 扩展 | 0.5x 慢放 / 控制条 | `<circle cx="12" cy="13" r="7.5"/>` + `M12 9v4l2.8 1.8` + `M9 3.5h6` |
| 14 | IconVolume | 扩展 | 音量（TTS 开关，`?flags=tts`）/ 顶栏 | `M4.5 9.5v5h3.5L13.5 19V5L8 9.5z` + `M16.5 9a4.5 4.5 0 0 1 0 6`；mute 态以 `M17 9.5l4 5M21 9.5l-4 5` 替换声波 |
| 15 | IconSubtitle | 扩展 | 字幕开关 / 顶栏 | `M3.5 6.5h17v11h-17z` + `M7 11.5h4M7 14.5h7` |
| 16 | IconVideo | 扩展 | 视频/帧视图切换 / 主区右上 | `M3.5 6.5h17v11h-17z` + `M10.3 9.8l4.6 2.7-4.6 2.7z` |

**不新增图标的两个决定**（与架构师已确认）：
- `collapse`（左栏折叠）→ 复用 IconArrowRight，CSS `transform: rotate(90deg)` 及朝向翻转
- `alert`（错误态）→ 不画图标，用 mono 错误码 + `--bc-key-red` 1px 描边错误卡表达（UIUX §6）

## 4. 着色用法

```vue
<!-- 默认随父级 color；需强调时用范式 token -->
<IconFlame :size="16" style="color: var(--bc-signal)" />
<!-- 控制条激活态（如 0.5x 生效中）：按钮 color 切 signal，图标随 currentColor 自动变色 -->
```

- 图标颜色只允许三处语义：`var(--bc-chalk)`（默认）、`var(--bc-signal)`（激活/关键）、`var(--bc-muted)`（次要/禁用态配合 opacity）
- 骨骼关键点三色（key-red/yellow/cyan）**禁止**用于图标——仅限战术板数据标注层

## 5. 验收检查（前端落组件后）

- [ ] 16 枚组件全部经 IconBase 渲染，无裸 `<svg>`
- [ ] `stroke-width` 全局无改写、无 `non-scaling-stroke`
- [ ] 全项目 grep 无 emoji（正则 `[\x{1F300}-\x{1F9FF}\x{2600}-\x{26FF}\x{2700}-\x{27BF}]`）
- [ ] 纯图标按钮均有 `aria-label`
