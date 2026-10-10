# ADR-002: 使用 JSON 文件数据集替代 SQLite

## Status: Accepted (2026-10-10)

## Background
离线路演 P0 约束：npm install 后即用。数据规模小（2-3 场比赛、每场 8-12 回合、每回合约 100 帧，全量 < 20MB）。候选：JSON 文件 vs better-sqlite3 13.0.3。

## Decision
选 JSON 文件 + 启动时全量加载建内存索引。决定性因素：better-sqlite3 的原生 prebuilt 二进制需在 install 时下载，现场网络受限即整体翻车，直接违反 P0 离线约束。

## Consequences
- 正面：零原生依赖；数据人肉可编辑、git diff 友好；demo 前可临场微调回合。
- 负面：无 schema 约束 → 补偿为启动期 dataset-validator.js 运行时校验（失败拒绝启动并指出具体文件与路径）。
- 查询退化：全量内存 + JS filter，此规模下无性能问题。

## Related ADRs: ADR-001
