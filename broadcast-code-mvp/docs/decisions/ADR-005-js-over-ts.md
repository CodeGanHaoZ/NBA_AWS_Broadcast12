# ADR-005: MVP 使用 JavaScript (ESM) + JSDoc，不引入 TypeScript

## Status: Accepted (2026-10-10)

## Background
12h 窗口。TS（5.9.3 / vue-tsc 3.3.12）能防沉默类型错误，但引入构建链、类型生成与调试摩擦；数据源是后端自控的 JSON 契约，类型边界集中且少。

## Decision
全 JS ESM。类型安全补偿：openapi.yaml 作为契约唯一依据；web/src/types/domain.js 用 JSDoc typedef 镜像契约（编辑器可提示）；启动期 dataset-validator 运行时拦截脏数据。

## Consequences
- 正面：vite 免转译快、调试无 sourcemap 噪音、生成代码无类型幻觉负担。
- 负面：无编译期类型门 → 若赛后产品化，首个迭代应回迁 TS（数据模型已 JSDoc 化，迁移成本低）。

## Related ADRs: ADR-001
