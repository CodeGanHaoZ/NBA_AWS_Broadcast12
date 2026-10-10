# ADR-004: 全资产本地化（字体/依赖/构建产物），杜绝一切 CDN

## Status: Accepted (2026-10-10)

## Background
离线路演：现场网络不可假设。范式要求 Anton / JetBrains Mono / Noto Sans SC 三款字体，常规做法是 Google Fonts CDN——离线即破相。npm install 同样不可假设。

## Decision
1. 字体子集化后放 web/public/fonts，@font-face 本地引入；全项目禁止外链，grep `https://` 作为验收项。
2. package-lock.json 提交仓库；赛前打包 node_modules tar 与 web/dist 构建产物入库，现场可跳过 install 直接 npm start。

## Consequences
- 正面：现场零网络依赖，R1/R2 风险闭环。
- 负面：仓库体积增大（字体子集 + 备份 tar）；子集化需一次手工操作。

## Related ADRs: ADR-002
