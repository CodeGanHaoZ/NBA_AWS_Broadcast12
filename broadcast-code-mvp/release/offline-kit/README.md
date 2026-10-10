# 离线保险包（Offline Kit）

路演现场网络不可控时的保险方案：**完全跳过 npm install**，用本目录预置的依赖包与构建产物直接启动。以下所有命令均无需联网。

## 包内容

| 文件/目录 | 体积 | 内容 |
|-----------|------|------|
| `server-node_modules.tar.gz` | 628 KB | 后端依赖（express 5.3.0 及其依赖树，713 项） |
| `web-node_modules.tar.gz` | 16 MB | 前端依赖（vue / vite / plugin-vue，902 项） |
| `web-dist/` | 9.6 MB | 前端构建产物副本（assets + 本地化字体 + index.html） |
| `README.md` | — | 本说明 |

两个 tar 包均已通过 gzip 完整性校验，并在干净目录做过**真实还原测试**：解包后启动 server 与 vite preview，`/health` 与页面均返回 200。

## 离线恢复步骤

前提：项目源码目录（`server/`、`web/`、`docs/` 等）已在演示机上；Node.js >= 20。

```bash
# 0. 进入项目根目录（下述路径均以此为基准）
cd broadcast-code-mvp

# 1. 后端：解压依赖（已装过可跳过）
tar -xzf release/offline-kit/server-node_modules.tar.gz -C server
cd server && npm start        # 后端 :3000，另开终端执行下一步

# 2. 前端：解压依赖 + 恢复构建产物（已装过可跳过解压）
tar -xzf release/offline-kit/web-node_modules.tar.gz -C web
cp -r release/offline-kit/web-dist/* web/dist/     # dist 缺失时
cd web && npm run preview     # 4173 起自动选端口，看控制台实际地址

# 3. 或者直接用一键脚本（会自动跳过 build，因 web/dist 已就位）
node scripts/start-all.mjs
```

验证（应依次看到 200 与 2 场比赛）：

```bash
curl -s http://localhost:3000/health         # {"status":"ok","games":2}
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4175/   # 200（以实际端口为准）
```

## 注意事项

1. **两个服务必须同时运行**：前端 dist 产物以相对路径调用 `/api/v1/*`，由 vite preview 的代理转发到 :3000。
2. preview 端口不保证是 4173（本机 4173/4174 常被占用），以 vite 控制台打印的 `Local:` 地址为准；`scripts/start-all.mjs` 会自动解析并醒目打印实际端口。
3. tar 包在 Windows（Git Bash 自带 tar）与 Linux/macOS 均可解压；如演示机无 tar，可提前在源项目上完成 `npm install`，直接用 `npm start` / `npm run preview`。
4. 依赖为纯 JS（无原生模块，AC-08 实证），跨机器解包即用，无需 rebuild。
5. 如需重建数据集（正常情况下不需要）：`cd server && npm run gen -- --all --seed 20261010`，结果确定性可复现。
