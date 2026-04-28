# AutoDL 自动租机与多模态模型设计

## 背景

本方案基于 `waoowaoo` 现有架构扩展。当前项目已经具备 Next.js、Prisma、MySQL、Redis、BullMQ、对象存储、任务状态、余额冻结和多模型配置中心等基础能力。目标是在平台内提供按小时租用 GPU 机器的能力，用户不接触 AutoDL 控制台，只在平台内使用视频、图片和配音模型。

AutoDL 账号当前没有企业认证，因此第一版不依赖弹性部署库存接口。系统使用容器实例 Pro API 自动创建、查询、关机和释放实例。创建前不承诺实时库存；创建失败时解冻余额并提示用户重试或更换档位。

## 目标

- 用户可以在平台内选择 GPU 档位和租用小时数。
- 平台使用站内余额冻结保障租机成本。
- 平台自动调用 AutoDL 创建实例，实例创建成功后立即开始计时。
- 用户租到机器后，可以使用后台允许的本地视频、图片和 TTS 模型。
- 结果统一回传到平台对象存储，并写入现有项目数据。
- 到期后自动停止接新任务，并释放 AutoDL 实例。

## 非目标

- 第一版不向用户暴露 SSH、JupyterLab 或远程桌面。
- 第一版不做 AutoDL 弹性部署库存查询，因为该能力需要企业认证。
- 第一版不做用户自带 AutoDL Token。
- 第一版不把 AutoDL 全部 GPU 市场开放给用户。
- 第一版不强制把唇形同步纳入 AutoDL 本地模型链路，可后续扩展。

## 可售档位

第一版只开放两个后台配置档位：

| 档位 | AutoDL 规格 ID | 说明 |
| --- | --- | --- |
| PRO6000 | `pro6000-p` | 高显存档，适合高质量视频、大图和高质量 TTS |
| RTX 5090 | `5090-p` | 标准档，适合快速视频、图片和轻量 TTS |

后台每个档位配置：

- 档位名称
- AutoDL 规格 ID
- 展示小时价
- 最高可接受 AutoDL 小时成本
- 镜像 UUID
- CUDA 下限
- 默认地区列表
- 启动命令
- 可用模型列表
- 最大并发任务数

## 计费规则

用户下单时按照后台展示小时价冻结余额：

```text
冻结金额 = 展示小时价 × 租用小时数
```

AutoDL 实例创建成功后，系统查询实例详情，读取 AutoDL 实际 `payg_price`，按 20% 加价计算最终售价：

```text
最终售价 = AutoDL 实际小时成本 × 1.2 × 租用小时数
```

若最终售价低于冻结金额，多余部分解冻。若 AutoDL 实际小时成本超过后台配置的最高可接受成本，系统立即释放实例，订单失败，冻结金额全部解冻。若创建实例失败，订单失败并解冻余额。

租用时间从 AutoDL 返回实例 ID 的时间开始计算，不等待模型服务健康检查。

## 生命周期

租机订单状态：

```text
pending_freeze -> creating_instance -> booting -> available -> expiring -> released
```

异常状态：

```text
create_failed
health_failed
release_failed
settle_failed
```

流程：

1. 用户选择档位和小时数。
2. 系统校验余额并冻结展示价对应金额。
3. 系统调用 AutoDL 容器实例 Pro API 创建实例。
4. AutoDL 返回实例 ID 后，订单开始计时。
5. 系统轮询实例详情，获取访问地址和实际价格。
6. 系统执行健康检查，确认远程 Worker 可用。
7. 用户的本地模型任务路由到该实例。
8. 到期前停止接收新任务。
9. 已开始任务允许短缓冲。
10. 系统关机并释放实例。
11. 系统结算费用并完成订单。

## 远程 Worker

AutoDL 镜像启动一个平台自研推理服务，只接受平台签名请求，不向用户开放控制台。

接口能力：

- 创建视频任务
- 创建图片任务
- 创建 TTS 任务
- 查询任务状态
- 获取结果文件
- 健康检查
- 查询当前模型能力

平台请求必须包含：

- 租机订单 ID
- 平台任务 ID
- 用户 ID
- 模型 ID
- 输入素材
- 提示词
- 参数
- 时间戳
- 签名

远程 Worker 返回远程任务 ID，平台继续轮询。任务完成后，平台下载结果到对象存储，再写回现有面板、图片或音频字段。

## 任务路由

用户没有有效租机时：

- 隐藏 AutoDL 本地模型。
- 继续保留现有第三方 API 模型。

用户有有效租机时：

- 视频任务优先走专属 AutoDL 实例。
- 图片任务优先走专属 AutoDL 实例。
- 配音任务优先走专属 AutoDL 实例。
- 当前实例不支持的模型在前端隐藏。

到期处理：

- 到期前进入 `expiring`，停止接收新任务。
- 运行中的任务进入短缓冲。
- 超过缓冲后释放实例。
- 未完成任务按失败处理，可进入补偿流程。

## 模型目录

后台维护模型目录，用户不能直接选择镜像中的任意文件。

模型配置字段：

- 模型 ID
- 模型名称
- 能力类型：视频、图片、配音
- 支持档位
- 镜像 UUID
- 工作流 ID
- 显存要求
- 支持分辨率
- 支持时长
- 默认参数
- 是否推荐
- 是否实验
- 是否可售
- 许可证说明

首发建议：

| 类型 | 模型 | RTX 5090 | PRO6000 | 说明 |
| --- | --- | --- | --- | --- |
| 视频 | Wan2.2 TI2V 5B | 支持 | 支持 | 默认快速视频模型 |
| 视频 | Wan2.2 I2V A14B | 不支持 | 支持 | 高质量图生视频 |
| 视频 | LTX-Video 2B distilled | 支持 | 支持 | 快速预览 |
| 视频 | LTX-Video 13B distilled/fp8 | 待压测 | 支持 | 高质量 LTX 视频 |
| 视频 | HunyuanVideo 1.5 | 实验 | 实验 | 压测后开放 |
| 图片 | FLUX.2 klein 4B | 支持 | 支持 | 快速出图和编辑 |
| 图片 | FLUX.2 dev | 不支持 | 支持 | 需注意许可证 |
| 图片 | Qwen-Image / Qwen-Image-Edit | 待压测 | 支持 | 中文文字和复杂构图 |
| 图片 | SDXL / SD 3.5 Medium | 支持 | 支持 | 生态成熟，适合 LoRA |
| 配音 | CosyVoice 3 0.5B | 支持 | 支持 | 中文、多语言、音色克隆 |
| 配音 | F5-TTS v1 | 支持 | 支持 | 快速试音和克隆 |
| 配音 | IndexTTS2 | 实验 | 支持 | 情绪和时长控制 |
| 配音 | Fish-Speech | 实验 | 支持 | 多语言和表现力 |

## 镜像策略

第一版维护两个主镜像：

- RTX 5090 镜像：ComfyUI、Wan 5B、LTX 2B、FLUX klein、SDXL 或 SD3.5、CosyVoice、F5-TTS。
- PRO6000 镜像：包含 RTX 5090 镜像能力，并增加 Wan A14B、LTX 13B、Qwen-Image、IndexTTS2、Fish-Speech。

模型权重预置在镜像或 AutoDL 文件存储中，避免每次实例启动重新下载。实例启动命令负责启动远程 Worker，并向平台注册健康状态。

## 数据模型建议

新增核心表：

- `gpu_rental_plans`：后台档位配置。
- `gpu_rental_orders`：用户租机订单。
- `gpu_rental_instances`：AutoDL 实例绑定。
- `local_model_catalog`：本地模型目录。
- `remote_generation_jobs`：远程 Worker 子任务。

现有任务表继续作为平台任务主状态。远程任务只作为执行细节，不替代 BullMQ 主任务链路。

## API 建议

平台 API：

- `GET /api/gpu-rental/plans`
- `POST /api/gpu-rental/orders`
- `GET /api/gpu-rental/orders/:id`
- `POST /api/gpu-rental/orders/:id/cancel`
- `GET /api/local-models`

后台 API：

- `POST /api/admin/gpu-rental/plans`
- `PATCH /api/admin/gpu-rental/plans/:id`
- `GET /api/admin/gpu-rental/orders`
- `POST /api/admin/gpu-rental/orders/:id/release`

远程 Worker API：

- `GET /health`
- `GET /models`
- `POST /jobs`
- `GET /jobs/:id`
- `GET /jobs/:id/result`

## 风险与处理

- AutoDL 创建失败：订单失败，解冻余额。
- 实际成本超过阈值：立即释放实例，解冻余额。
- 服务健康检查失败：标记异常，释放实例，按策略补偿。
- 任务执行超时：任务失败，释放或重启 Worker。
- 到期任务未完成：停止接新任务，缓冲后失败处理。
- 许可证风险：后台模型目录必须标注商业可用性，默认隐藏不适合商业化的模型。
- 滥用风险：远程 Worker 只接受平台签名请求，不暴露 SSH/Jupyter 给用户。

## 验收标准

- 用户可以选择 PRO6000 或 RTX 5090 并按小时下单。
- 余额不足时不能下单。
- AutoDL 创建失败时自动解冻余额。
- AutoDL 创建成功后立即开始计时。
- 有效租机用户可以看到对应本地模型。
- 视频、图片、配音任务可以路由到远程 Worker。
- 任务结果可以回传对象存储并更新现有项目数据。
- 到期实例可以自动停止接新任务并释放。
