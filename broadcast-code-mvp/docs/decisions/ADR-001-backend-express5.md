# ADR-001: 使用 Express 5.3.0 作为后端框架

## Status: Accepted (2026-10-10)

## Background
12h 黑客松，后端仅需 6 个只读端点，数据源为内存中的 JSON 数据集。候选：Express 5.3.0 / Fastify 5.12.5 / Koa 3.2.1（版本均经 npm registry 实测）。

## Decision
选 Express 5.3.0。加权评分 4.5（Fastify 4.1、Koa 3.4）：端点少且只读，Fastify 的 schema 校验优势用不上；Express 概念最少、生态最大、生成代码的可用训练语料最多。

## Consequences
- 正面：零学习成本；路由直写；node --watch 即可热更。
- 负面：无内建校验 → 以启动期 dataset-validator + openapi.yaml 契约补偿。
- 硬约束：Express 5 breaking changes（通配符语法、req.query getter、res.send(status) 移除等五条）已写入 ARCHITECTURE.md §2.1 并内嵌 Spec，防止生成 Express 4 幻觉写法。

## Related ADRs: ADR-002
