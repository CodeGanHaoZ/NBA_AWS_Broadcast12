# ADR-003: 战术板采用 SVG + rAF 插值，视频 overlay 为备路

## Status: Accepted (2026-10-10)

## Background
核心画面：10 球员 + 球的运动重演，叠加箭头/圆环/色块标注。候选：SVG vs Canvas 2D vs 动画库；另有真实视频 overlay 诉求。

## Decision
1. 主路：SVG 战术板。运动实体 11 个远低于 SVG 性能阈值；Telestrator 描边（stroke-dashoffset）、虚线选框等范式签名元素在 SVG 中零成本；overlay 与球员同坐标系同 DOM 树。
2. 备路：HTML5 video + 绝对定位 SVG overlay，rAF 读 currentTime 驱动（禁用 4Hz 的 timeupdate），Feature Flag `?flags=video` 控制，仅在有合法短素材时启用。

## Consequences
- 正面：渲染函数主备两路复用（仅时钟源不同）；DevTools 可逐节点调试。
- 负面：线性插值在急停变向有轻微滑冰感——接受。
- 硬约束：60fps 逐帧更新禁止走 Vue 响应式，必须 ref 直写 SVG attribute；Vue 响应式只管离散状态。

## Related ADRs: 无
