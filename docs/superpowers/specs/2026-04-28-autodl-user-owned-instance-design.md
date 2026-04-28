# AutoDL 自带实例与多模态模型设计

## 背景

本方案基于 AutoGPU Studio 的非商业开源定位调整。当前项目继承了 `waoowaoo` 的 Next.js、Prisma、MySQL、Redis、BullMQ、对象存储、任务状态和多模型配置中心等基础能力。由于上游许可证为 `CC BY-NC-SA 4.0`，本项目不做商业 GPU 实例平台，不收取实例费用，不做 AutoDL 算力转售，也不做站内余额冻结和加价结算。

新的目标是：用户使用自己的 AutoDL 账号、自己的 AutoDL 实例或自己的 AutoDL API Key，把 AutoDL 实例连接到 AutoGPU Studio。平台只做开源任务编排、远程 Worker 调度、模型目录和生成结果管理。

配置上默认采用 `AUTODL_CONNECTION_MODE=manual`。只有用户个人自部署、密钥由用户自己保管时，才建议启用 `user_api_key` 模式。

## 设计原则

- 不收费：平台不向用户收取 GPU 实例费、服务费、抽成或差价。
- 不转售：平台不使用统一 AutoDL 账号替用户创建或支付实例。
- 不加价：AutoDL 价格只作为官方价格或用户账号返回价格展示，不做 20% 加价。
- 不冻结余额：移除站内余额冻结、扣费、结算、退款和失败补偿。
- 用户自有：AutoDL 实例、API Key、费用和数据由用户自己负责。
- 非商业共享：代码、文档和改动继续遵守 `CC BY-NC-SA 4.0`。

## 目标

- 用户可以在平台内查看 PRO6000 和 RTX 5090 两个推荐档位。
- 用户可以通过 AutoDL 官方入口自行创建实例，然后把远程 Worker 地址填回平台。
- 用户可以在自部署环境中配置自己的 AutoDL API Key，由系统自动创建、查询、关停和释放其个人账号下的实例。
- 用户连接实例后，可以使用后台允许的本地视频、图片和 TTS 模型。
- 结果统一回传到用户配置的对象存储，并写入现有项目数据。
- 实例断线、到期或释放后，平台停止向该实例派发新任务。

## 非目标

- 不做平台方统一 AutoDL 账号代用户创建或支付实例。
- 不做站内余额、充值、冻结、扣费、退款或平台账单。
- 不做 AutoDL 价格包装、20% 加价或任何形式抽成。
- 不向公共演示站点集中收集用户 AutoDL API Key。
- 不承诺 AutoDL 库存、地区、价格或实例可用性。
- 不默认向第三方公开 AutoDL 自定义服务链接。

## 推荐档位

第一版只展示两个推荐档位，用于降低镜像和模型适配复杂度：

| 档位 | AutoDL 规格 ID | 说明 |
| --- | --- | --- |
| PRO6000 | `pro6000-p` | 高显存档，适合高质量视频、大图和高质量 TTS |
| RTX 5090 | `5090-p` | 标准档，适合快速视频、图片和轻量 TTS |

后台每个档位配置：

- 档位名称
- AutoDL 规格 ID
- 推荐用途
- 推荐镜像 UUID
- CUDA 下限
- 推荐地区列表
- 启动命令
- 可用模型列表
- 最大并发任务数
- 许可证提示

库存、地区和价格以 AutoDL 官方页面或用户账号下的 API 返回为准。

## 接入方式

### 手动连接模式

流程：

1. 用户在 AutoGPU Studio 查看推荐档位和模型说明。
2. 用户点击 AutoDL 官方入口，自行登录 AutoDL。
3. 用户在 AutoDL 官方页面完成实例创建、付款、镜像选择和实例启动。
4. 用户在实例中启动远程 Worker。
5. 用户把 Worker 地址、端口和访问密钥填回 AutoGPU Studio。
6. 平台执行健康检查，读取远程 Worker 模型能力。
7. 视频、图片和 TTS 任务路由到该实例。
8. 用户自行在 AutoDL 官方页面关停或释放实例。

优点：

- 平台不接触 AutoDL 账号余额。
- 平台不保存 AutoDL API Key。
- 费用完全由用户和 AutoDL 官方结算。
- 最符合非商业开源工具定位。

### 用户自带 API Key 模式

流程：

1. 用户在自己的自部署环境中配置 AutoDL API Key。
2. 用户选择推荐档位、镜像和启动命令。
3. 系统调用 AutoDL 容器实例 Pro API，在用户自己的 AutoDL 账号内创建实例。
4. AutoDL 返回实例 ID 后，平台记录一次实例会话。
5. 系统轮询实例详情，获取访问地址和运行状态。
6. 系统执行健康检查，确认远程 Worker 可用。
7. 用户的本地模型任务路由到该实例。
8. 用户手动释放，或由自部署系统按用户设置自动释放。

约束：

- API Key 只能代表用户自己的 AutoDL 账号。
- 不建议公共演示站点收集或托管用户 API Key。
- 平台记录的运行时长只用于状态展示和用户提醒，不用于收费。
- AutoDL 实际费用由用户账号直接承担。

## 费用展示

本项目不做计费。界面只允许展示参考信息：

```text
参考成本 = AutoDL 官方小时价 × 用户预计运行小时数
```

该信息仅用于帮助用户估算 AutoDL 官方成本，不产生站内订单、不冻结余额、不扣款、不退款。

如果 AutoDL API 返回 `payg_price`，平台可以展示该价格和当前运行时长，但不能在其基础上加价或生成平台账单。

## 实例会话状态

实例会话状态：

```text
disconnected -> connecting -> booting -> healthy -> draining -> disconnected
```

异常状态：

```text
create_failed
health_failed
worker_unreachable
release_failed
```

会话状态只表示连接和任务路由状态，不代表商业订单状态。

## 远程 Worker

AutoDL 镜像启动一个开源远程 Worker，用于接收 AutoGPU Studio 的任务请求。

接口能力：

- 创建视频任务
- 创建图片任务
- 创建 TTS 任务
- 查询任务状态
- 获取结果文件
- 健康检查
- 查询当前模型能力

平台请求建议包含：

- 平台任务 ID
- 用户 ID
- 项目 ID
- 模型 ID
- 输入素材
- 提示词
- 参数
- 时间戳
- 签名

远程 Worker 返回远程任务 ID，平台继续轮询。任务完成后，平台下载结果到对象存储，再写回现有面板、图片或音频字段。

## 任务路由

用户没有连接 AutoDL 实例时：

- 隐藏 AutoDL 本地模型。
- 继续保留现有第三方 API 模型。

用户连接 AutoDL 实例时：

- 视频任务可以走该 AutoDL 实例。
- 图片任务可以走该 AutoDL 实例。
- 配音任务可以走该 AutoDL 实例。
- 当前实例不支持的模型在前端隐藏。

断线处理：

- 实例进入 `draining` 或不可达后，停止接收新任务。
- 运行中的任务进入短缓冲。
- 超过缓冲后标记失败或等待用户重新连接。

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
- 许可证说明
- 非商业使用提示

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

第一版维护两个建议镜像：

- RTX 5090 镜像：ComfyUI、Wan 5B、LTX 2B、FLUX klein、SDXL 或 SD3.5、CosyVoice、F5-TTS。
- PRO6000 镜像：包含 RTX 5090 镜像能力，并增加 Wan A14B、LTX 13B、Qwen-Image、IndexTTS2、Fish-Speech。

模型权重可预置在镜像或 AutoDL 文件存储中，避免每次实例启动重新下载。实例启动命令负责启动远程 Worker，并向平台注册健康状态。

## 数据模型建议

新增核心表：

- `autodl_connections`：用户自带实例或 API Key 配置。
- `autodl_instance_sessions`：AutoDL 实例连接会话。
- `local_model_catalog`：本地模型目录。
- `remote_generation_jobs`：远程 Worker 子任务。

现有任务表继续作为平台任务主状态。远程任务只作为执行细节，不替代 BullMQ 主任务链路。

不再新增 AutoDL 商业订单、站内余额冻结或结算相关表。

## API 建议

平台 API：

- `GET /api/autodl/profiles`
- `GET /api/autodl/connections`
- `POST /api/autodl/connections`
- `PATCH /api/autodl/connections/:id`
- `DELETE /api/autodl/connections/:id`
- `POST /api/autodl/sessions`
- `GET /api/autodl/sessions/:id`
- `POST /api/autodl/sessions/:id/release`
- `GET /api/local-models`

远程 Worker API：

- `GET /health`
- `GET /models`
- `POST /jobs`
- `GET /jobs/:id`
- `GET /jobs/:id/result`

## 风险与处理

- AutoDL 协议风险：用户需要自行遵守 AutoDL 服务协议和自定义服务限制。
- API Key 风险：公共演示站点不应集中收集用户 AutoDL API Key，自部署场景需要本地加密保存。
- 实例不可达：停止派发新任务，提示用户检查 AutoDL 实例和 Worker。
- 服务健康检查失败：标记异常，不继续派发任务。
- 任务执行超时：任务失败，可由用户重试。
- 模型许可证风险：模型目录必须标注许可证和非商业使用提示。
- 数据合规风险：用户需要确保上传、生成和分发内容符合法律法规。

## 验收标准

- 用户可以看到 PRO6000 和 RTX 5090 推荐档位。
- 用户可以手动连接自己的 AutoDL Worker。
- 用户可以在自部署环境中使用自己的 AutoDL API Key 创建实例。
- 平台不出现站内余额、冻结金额、平台售价、抽成或加价字段。
- 有效连接用户可以看到对应本地模型。
- 视频、图片、配音任务可以路由到远程 Worker。
- 任务结果可以回传对象存储并更新现有项目数据。
- 实例断线或释放后，平台停止向该实例派发新任务。
