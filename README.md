# AutoGPU Studio

AutoGPU Studio 是一个基于 [saturndec/waoowaoo](https://github.com/saturndec/waoowaoo) 派生的非商业开源项目。项目目标是在原有 AI 短剧、漫画视频创作流程上，探索“用户自带 AutoDL 账号或实例”的远程 GPU Worker 调度、多模态模型推理、视频生成、图片生成和 TTS 生成工作流。

本项目不做商业化，不向用户收取 GPU 实例费用，不做 AutoDL 算力转售，不做站内余额充值、冻结、抽成或加价。AutoDL 产生的费用由用户在 AutoDL 官方账号内自行结算，本项目只提供开源调度工具、连接配置和任务编排能力。

## 来源与许可证

本仓库基于原项目 [saturndec/waoowaoo](https://github.com/saturndec/waoowaoo) 派生，保留上游署名、许可证和来源链接。详细来源说明见 [NOTICE.md](./NOTICE.md)。

许可证沿用上游仓库的 `CC BY-NC-SA 4.0`。该许可证包含署名、非商业使用和相同方式共享限制，严格来说不是 OSI 意义上的软件开源许可证。只要本项目保持非商业、保留署名并以相同许可证共享，就更符合当前授权边界。若未来要用于商业 SaaS、付费平台、广告变现或托管收费服务，需要先取得上游权利方授权，或完成不受该许可证约束的可商用重写。

## 项目定位

AutoGPU Studio 面向个人创作者、研究者和开源爱好者，计划提供：

- 用户自行在 AutoDL 官方创建并支付实例，或在自部署环境中填写自己的 AutoDL API Key。
- 平台只连接用户自己的实例，不托管平台方统一 AutoDL 账号。
- 平台不收取实例费用，不设置站内余额，不冻结资金，不在 AutoDL 官方价格上加价。
- 用户可以选择推荐 GPU 档位，并查看适合的本地视频、图片和 TTS 模型。
- 远程 Worker 运行在用户自己的 AutoDL 实例中，生成结果回传到用户部署的平台对象存储。
- 任务调度、状态追踪、模型目录和结果写回沿用现有项目能力。

## AutoDL 接入方式

第一版建议支持两种非商业开源模式：

### 手动连接模式

用户在 AutoDL 官方页面自行完成实例创建、付款和启动，然后把远程 Worker 地址、访问端口和连接密钥填回 AutoGPU Studio。

这种模式最稳妥：平台不接触用户的 AutoDL 账户余额，也不参与任何费用结算。

### 用户自带 API Key 模式

用户在自己的自部署环境中配置 AutoDL API Key，系统可以替用户在其个人 AutoDL 账号内创建、查询、关停和释放实例。

这种模式仍然不做转售：费用走用户自己的 AutoDL 账号，AutoGPU Studio 只做自动化操作和任务路由。API Key 必须由用户自行保管，不应在公共演示站点集中收集。

## 推荐 GPU 档位

第一版只展示两个推荐档位，用于降低模型适配复杂度：

| 档位 | AutoDL 规格 ID | 用途 |
| --- | --- | --- |
| PRO6000 | `pro6000-p` | 高质量视频、大图和高质量 TTS |
| RTX 5090 | `5090-p` | 快速视频、图片和轻量 TTS |

库存、地区和实际价格以 AutoDL 官方页面或用户账号下的 API 返回为准。本项目只做展示和连接，不承诺库存，也不对价格做包装或加价。

## 模型目录规划

模型能力由后台目录控制，用户只能看到当前连接实例支持的模型。模型是否可用于公开分发、研究、非商业创作或商业用途，需要分别遵守各模型自身许可证。

首发候选模型：

| 类型 | 模型 | RTX 5090 | PRO6000 |
| --- | --- | --- | --- |
| 视频 | Wan2.2 TI2V 5B | 支持 | 支持 |
| 视频 | Wan2.2 I2V A14B | 不支持 | 支持 |
| 视频 | LTX-Video 2B distilled | 支持 | 支持 |
| 视频 | LTX-Video 13B distilled/fp8 | 待压测 | 支持 |
| 图片 | FLUX.2 klein 4B | 支持 | 支持 |
| 图片 | Qwen-Image / Qwen-Image-Edit | 待压测 | 支持 |
| 图片 | SDXL / SD 3.5 Medium | 支持 | 支持 |
| 配音 | CosyVoice 3 0.5B | 支持 | 支持 |
| 配音 | F5-TTS v1 | 支持 | 支持 |
| 配音 | IndexTTS2 | 实验 | 支持 |
| 配音 | Fish-Speech | 实验 | 支持 |

每个模型还需要配置许可证说明、显存要求、工作流 ID、默认参数、支持分辨率和推荐运行档位。

## 设计文档

- [AutoDL 自带实例与多模态模型设计](./docs/superpowers/specs/2026-04-28-autodl-user-owned-instance-design.md)

## 本地开发

前提条件：

- Node.js 18.18 或更高版本。
- npm 9 或更高版本。
- Docker Desktop。

启动步骤：

```bash
git clone https://github.com/ALen-404/autogpu-studio.git
cd autogpu-studio

cp .env.example .env
npm install

docker compose up mysql redis minio -d
npx prisma db push

npm run dev
```

可选 AutoDL 配置位已经写入 `.env.example`。非商业自部署时，推荐先使用 `AUTODL_CONNECTION_MODE=manual`，让用户自己在 AutoDL 官方创建实例后填写 Worker 地址；只有个人自部署环境才建议使用 `user_api_key` 模式。

开发服务默认访问：

- 应用：http://localhost:3000
- Docker 模式应用：http://localhost:13000

## 技术栈

- Next.js 15
- React 19
- TypeScript
- Prisma
- MySQL
- Redis
- BullMQ
- MinIO / S3 兼容对象存储
- NextAuth.js

## 后续工程任务

- 增加 AutoDL 官方入口和实例连接配置页。
- 增加用户自带 AutoDL API Key 的本地加密配置。
- 增加远程 Worker 签名调用协议。
- 增加本地模型目录和实例能力探测。
- 将视频、图片和 TTS 任务路由到用户连接的 AutoDL 实例。
- 增加实例健康检查、断线重连和任务失败补偿。
- 增加模型许可证标注和非商业使用提示。

## 许可证

本仓库沿用 `CC BY-NC-SA 4.0`。请阅读 [LICENSE](./LICENSE) 和 [NOTICE.md](./NOTICE.md) 后再使用、分发或改造本项目。
