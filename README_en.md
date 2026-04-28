# AutoGPU Studio

AutoGPU Studio is a source-available derivative of [saturndec/waoowaoo](https://github.com/saturndec/waoowaoo). It explores AutoDL-powered hourly GPU rental, balance-freeze billing, remote GPU workers, and local multimodal model inference for AI video, image, and TTS workflows.

This repository is currently a product design and engineering starting point. The AutoDL rental workflow is documented but not production-ready yet.

## Attribution And License

This repository is derived from the original `waoowaoo` project. See [NOTICE.md](./NOTICE.md) for attribution and change notes.

The inherited license is `CC BY-NC-SA 4.0`. It includes NonCommercial and ShareAlike restrictions and is not an OSI-approved software open-source license. Commercial SaaS or paid platform usage requires permission from the upstream rights holder, or a separate commercially usable rewrite.

## Planned Scope

- Hourly GPU rental inside the platform.
- Balance freeze before AutoDL instance creation.
- AutoDL container instance creation, polling, shutdown, and release.
- No SSH, JupyterLab, or AutoDL console exposure to end users.
- Local video, image, and TTS models on rented GPU instances.
- Generated assets uploaded back to platform storage and project records.

## First Rental Plans

| Plan | AutoDL Spec ID | Use Case |
| --- | --- | --- |
| PRO6000 | `pro6000-p` | High-quality video, larger images, high-quality TTS |
| RTX 5090 | `5090-p` | Fast video, image generation, lightweight TTS |

The current AutoDL account has no enterprise verification, so the first version will not rely on the elastic deployment inventory API. The platform will attempt instance creation after checkout and release frozen balance if creation fails.

## Billing Plan

```text
Frozen amount = displayed hourly price × rental hours
```

After AutoDL returns the actual `payg_price`:

```text
Final charge = AutoDL hourly cost × 1.2 × rental hours
```

Rental time starts when AutoDL returns the instance ID.

## Model Catalog Plan

| Type | Model | RTX 5090 | PRO6000 |
| --- | --- | --- | --- |
| Video | Wan2.2 TI2V 5B | Supported | Supported |
| Video | Wan2.2 I2V A14B | Not supported | Supported |
| Video | LTX-Video 2B distilled | Supported | Supported |
| Video | LTX-Video 13B distilled/fp8 | Needs testing | Supported |
| Image | FLUX.2 klein 4B | Supported | Supported |
| Image | Qwen-Image / Qwen-Image-Edit | Needs testing | Supported |
| Image | SDXL / SD 3.5 Medium | Supported | Supported |
| TTS | CosyVoice 3 0.5B | Supported | Supported |
| TTS | F5-TTS v1 | Supported | Supported |
| TTS | IndexTTS2 | Experimental | Supported |
| TTS | Fish-Speech | Experimental | Supported |

## Design Document

- [AutoDL rental and multimodal model design](./docs/superpowers/specs/2026-04-28-autodl-rental-design.md)

## Local Development

```bash
git clone https://github.com/ALen-404/autogpu-studio.git
cd autogpu-studio

cp .env.example .env
npm install

docker compose up mysql redis minio -d
npx prisma db push

npm run dev
```

## Tech Stack

- Next.js 15
- React 19
- TypeScript
- Prisma
- MySQL
- Redis
- BullMQ
- MinIO / S3-compatible storage
- NextAuth.js

## License

This repository inherits `CC BY-NC-SA 4.0`. Read [LICENSE](./LICENSE) and [NOTICE.md](./NOTICE.md) before using, distributing, or modifying this project.
