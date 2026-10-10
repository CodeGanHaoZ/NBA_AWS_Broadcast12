# NBA × AWS Hackathon 明日作战计划

> 依据赛事官方文档《NBA × AWS Hackathon｜赛制与选手快速上手 Rules & Quick Start》整理
> 文档地址：https://csdn.feishu.cn/docx/Y21TdJqrHopofmx2w21cmqHLnLb

---

## 一、赛题速览

做一个 **AI Agent**：输入 NBA 深度赛场数据 + 一段真实比赛视频，输出**带数据可视化的比赛画面**，并通过 **Web 界面**对外呈现。

一句话：**数据进去，能看的作品出来。**

---

## 二、三项硬性要求（缺一直接影响最终成绩）

| # | 要求 | 什么情况不算满足 |
|---|------|-----------------|
| 1 | 智能体必须使用 **Amazon Bedrock AgentCore** 承载 | 智能体逻辑跑在本地进程，或只是一段调用大模型的循环 |
| 2 | 必须以 **Amazon CloudFront** 对外发布，且作品具备 **Web 交互界面** | 命令行工具、Notebook、录屏视频、纯 API |
| 3 | 必须使用 **AWS CDK** 定义基础设施 | 控制台手点、纯 aws CLI 脚本；Terraform / SAM / 裸 CloudFormation 也不行 |

**环境约束（硬）：**
- 全部资源部署在赛事账号的 **`us-east-1`** 区域，其他区域操作被直接拒绝。
- `cdk.json` 必须加入权限边界配置（否则创建 IAM 角色的部署会失败）：

```json
{
  "context": {
    "@aws-cdk/core:permissionsBoundary": { "name": "NBAHackathonParticipantBoundary" }
  }
}
```

- **不要执行 `cdk bootstrap`**（主办方已提前完成，直接 `cdk deploy` 即可）。
- EC2 **GPU 配额为 0**：需 GPU 走 SageMaker 申请（g4dn / g5 / g6 / 部分 g6e，数量 1/2/4 视资源情况，不保证）；日常优先 CPU 机型（c7i / m7i / t3）。

---

## 三、时间与提交规则

- **比赛时长 12 小时**，以组委会公布的开始与截止时刻为准。
- **提交次数不限**：在 Portal「Submit your entry」反复提交 CloudFront URL，每次覆盖上一次；两次提交间隔 1 分钟。
- **截止前确认链接可访问**：评分以最后一次提交的链接为准，不会另行索取。
- ⚠️ 文档模板中写的截止时刻为北京时间 2026/10/10 20:00，但文档同时注明"以组委会公布的开始与截止时刻为准"，请以 Portal 实际显示为准。

---

## 四、明日核心要做 & 必须完成的内容

### 时间主线（12 小时）

| 阶段 | 时间 | 核心动作 | 验收标准 |
|------|------|----------|----------|
| ① 开赛即做 | T0 | SSO 登录（12h 有效）；验证身份；确认 profile | `aws sts get-caller-identity` 出现 NBAHackathonParticipantRole |
| ② 最小闭环（必达） | 0–2h | CDK 最小栈 → AgentCore 最小 Agent → 视频叠字闭环 | 页面公网可访问；Agent 可被前端调用；视频"下载→叠字→传 S3→页面能播" |
| ③ 打磨创意 | 2–10h | 数据可视化叠加、解说、页面叙事、深用托管服务 | 画面讲得动人、数据准、AWS 用得深 |
| ④ 收尾 | 截止前 | 最终提交 CloudFront URL + 确认可访问 | 提交按钮灰掉前完成 |

### 硬清单（必须全部完成）

1. **前 2 小时打通最小闭环**（三项硬性要求可由同一套 CDK 模板一次带出，主办方提供可部署版本，可压缩到半小时量级）：
   - CDK 最小栈：S3 + CloudFront + 静态页，确认链接公网可打开
   - Bedrock AgentCore 最小 Agent，确认能被 Web 前端调用
   - 练习视频最小闭环：下载视频 → 叠一行字 → 传回 S3 → 页面能播
2. **尽早提交**：一有可访问链接就提交，之后随时覆盖（间隔 1 分钟）。
3. **截止前**：最终提交 + 确认链接可正常访问。
4. **评分双线达标**：
   - 机器评分（看代码仓库重跑）：工程链路完整、AWS 托管服务用得深（托管 > 自建，同服务深用 > 浅用）
   - 人工评分（看 CloudFront 链接）：画面讲得动人、数据准确

### 服务对应关系（流水线）

```
① 官方数据 + 视频 ──► S3 桶
② Agent（Bedrock AgentCore）读取
③ 调 Bedrock 模型：识别画面、理解战术、生成解说
④ ffmpeg 把数据可视化叠进视频
⑤ 成品 + Web 界面经 CloudFront 发布
⑥ 提交 CloudFront URL（人工评分）+ 主办方拉代码重跑（机器评分）
⑦ 以上全部由 AWS CDK 定义部署
```

| 环节 | 服务 | 说明 |
|------|------|------|
| 承载智能体 | **Bedrock AgentCore** | 硬性要求 |
| 存数据/成品 | **S3** | 每队专属桶，已预置 |
| 视觉识别/解说 | **Bedrock** | 视觉模型识别球员理解回合；文本模型写解说 |
| 语音解说（可选） | **Polly** | 解说转配音 |
| 叠加渲染 | **ffmpeg** | 球员名、指标、箭头画进视频 |
| 对外交付 | **CloudFront** | 硬性要求 |
| 基础设施 | **AWS CDK** | 硬性要求 |

### 已实测可用的 2 个 Bedrock 模型

- Claude Sonnet 4.6 — Model ID：`global.anthropic.claude-sonnet-4-6`
- Qwen3 VL 235B A22B — Model ID：`qwen.qwen3-vl-235b-a22b`

（Portal 的 aws service 目录中有对应源码范例；调试用便宜模型，跑通再换 Sonnet。）

---

## 五、工作内容分工（3 人）

> 分工主线：**数据/S3 → 智能体（A）→ 渲染（C）→ 发布与提交（B）**

### 队员 A · 智能体 / 模型工程师（推理链路 · 硬性要求①）

1. 用 **Bedrock AgentCore** 搭建最小 Agent，确认能被 Web 前端调用
2. 用 **Qwen3 VL 235B** 做视觉识别：识别球员、理解回合、读懂战术
3. 用 **Claude Sonnet 4.6** 生成解说文案
4. 打通「视频 → 理解 → 解说」推理链路，输出结构化结果供渲染端使用
5. 调试用便宜模型（Haiku / Nova Lite），跑通后换 Sonnet

### 队员 B · 基础设施 / 部署工程师（CDK 与发布 · 硬性要求②③）

1. 编写 **CDK 全栈**：S3 + CloudFront + Lambda / Step Functions（及所需编排服务）
2. `cdk.json` 加入权限边界配置；**不跑 `cdk bootstrap`**；全程 `--profile nba --region us-east-1`
3. 管理 **GitHub 仓库**（代码与 CDK，主办方拉取跑机器评分）
4. 发布 CloudFront 链接，在 Portal 随时提交 / 覆盖（间隔 1 分钟）
5. 排查权限 / 区域 / SSO / 配额类报错

### 队员 C · 前端 / 渲染工程师（画面与 Web 界面）

1. 开发 **Web 界面**：视频播放页 + 数据可视化面板（经 CloudFront 对外）
2. 用 **ffmpeg** 把球员名、指标、箭头等数据可视化**叠进视频**，输出成品
3. 设计数据可视化叙事，保证画面讲得动人、数据准确（人工评分关键）
4. 可选：用 **Polly** 将解说文本转配音
5. 成品上传 S3，与队员 A 的解说输出联调

### 全员共同规则

- 业务命令一律 `--profile nba --region us-east-1`（日常不用 nba-sso，否则报 AWSReservedSSO）
- 共用同一 GitHub 仓库 + AWS 账号；一有可访问链接就提交
- AI 编码工具（Kiro / Claude Code / Cursor）写代码**不占账号额度**，Agent 运行时调 Bedrock 才花额度
- Claude 模型 ID 前加 `us.` 前缀（如 `us.anthropic.claude-sonnet-4-5-...`）
- SSO 凭证 12 小时有效，过期需重跑 `aws sso login --profile nba-sso`

---

## 六、最容易踩的坑（对照表）

| 现象 | 原因 | 解决 |
|------|------|------|
| Arn 显示 `AWSReservedSSO` | 用了 `nba-sso` | 改用 `--profile nba` |
| 命令报权限错，像空账号 | 区域不对 | 所有命令带 `--region us-east-1` |
| 调 Claude 报 ValidationException | 缺前缀 | 模型 ID 前加 `us.` |
| 开 GPU 实例失败 | 配额为 0 | 改用 CPU 机型（c7i / m7i / t3）或走 SageMaker |
| 操作突然全部失败 | SSO 12 小时过期 | 重跑 `aws sso login --profile nba-sso` |
| AI 工具操作 AWS 失败 | 没指定 profile | 提示里明确写「用 profile nba，us-east-1」 |

---

## 七、给 AI 工具的标准说法示例

> 「用 AWS profile nba、区域 us-east-1，帮我在 S3 桶里列出所有文件。」

> 「用 profile nba（us-east-1），写一套 CDK：把 Bedrock AgentCore、S3、CloudFront 和一个静态 Web 前端一起部署出来。」

---

*文档整理时间：2026-10-10 · 内容来源：赛事官方文档（见文首链接）*
