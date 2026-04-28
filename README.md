# AutoGPU Studio

AutoGPU Studio 是一个基于 `waoowaoo` 二次开发的源码开放项目，目标是在原有 AI 短剧/漫画视频创作流程上，扩展站内余额冻结、AutoDL 自动租机、多模态本地模型推理和远程 GPU Worker 调度能力。

当前仓库处于产品设计与工程改造起点阶段。AutoDL 自动租机能力已经形成设计文档，但尚未完成生产实现。

## 来源与许可证

本仓库基于原项目 [saturndec/waoowaoo](https://github.com/saturndec/waoowaoo) 派生，保留上游署名、许可证和来源链接。详细来源说明见 [NOTICE.md](./NOTICE.md)。

许可证沿用上游仓库的 `CC BY-NC-SA 4.0`。该许可证包含非商业使用和相同方式共享限制，严格来说不是 OSI 意义上的软件开源许可证。若要把本项目用于商业 SaaS、付费平台或其他商业用途，需要先取得上游权利方授权，或完成不受该许可证约束的可商用重写。

## 项目定位

AutoGPU Studio 面向 AI 影像创作者和平台运营者，计划提供：

- 按小时租用 GPU 机器。
- 使用站内余额冻结保障租机成本。
- 后台通过 AutoDL 自动创建、查询、关停和释放实例。
- 用户不接触 SSH、JupyterLab 或 AutoDL 控制台，只在平台内生成内容。
- 租到机器后使用本地视频、图片和 TTS 模型。
- 生成结果统一回传平台对象存储，并写入现有项目数据。

## 第一版租机范围

第一版计划只开放两个后台可配置档位：

| 档位 | AutoDL 规格 ID | 用途 |
| --- | --- | --- |
| PRO6000 | `pro6000-p` | 高质量视频、大图和高质量 TTS |
| RTX 5090 | `5090-p` | 快速视频、图片和轻量 TTS |

由于当前 AutoDL 账号没有企业认证，第一版不依赖弹性部署库存接口。平台会在用户下单后尝试创建容器实例；创建失败时订单失败并解冻余额。

## 计费规则规划

下单时按后台展示价冻结余额：

```text
冻结金额 = 展示小时价 × 租用小时数
```

AutoDL 实例创建成功后读取实际 `payg_price`，按 20% 加价结算：

```text
最终售价 = AutoDL 实际小时成本 × 1.2 × 租用小时数
```

租用时间从 AutoDL 返回实例 ID 开始计算，不等待模型服务健康检查。

## 模型目录规划

模型能力由后台目录控制，用户只能看到当前租用机器支持并允许售卖的模型。

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

每个模型还需要在后台配置许可证说明、显存要求、工作流 ID、默认参数、支持分辨率和是否可商用。

## 设计文档

- [AutoDL 自动租机与多模态模型设计](./docs/superpowers/specs/2026-04-28-autodl-rental-design.md)

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

- 增加 AutoDL API 客户端。
- 增加 GPU 租机套餐和订单表。
- 接入余额冻结、结算和失败补偿。
- 增加远程 Worker 签名调用协议。
- 增加本地模型目录和可售模型过滤。
- 将视频、图片和 TTS 任务路由到用户专属实例。
- 增加实例到期回收和异常释放任务。

## 许可证

本仓库沿用 `CC BY-NC-SA 4.0`。请阅读 [LICENSE](./LICENSE) 和 [NOTICE.md](./NOTICE.md) 后再使用、分发或改造本项目。
