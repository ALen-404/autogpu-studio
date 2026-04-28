# AutoGPU Studio

AutoGPU Studio is a non-commercial source-available derivative of [saturndec/waoowaoo](https://github.com/saturndec/waoowaoo). It explores user-owned AutoDL instances, remote GPU workers, local multimodal model inference, AI video generation, image generation, and TTS workflows.

This project does not charge users, resell AutoDL GPU resources, maintain an in-app wallet, freeze user balance, add a markup, or operate as a commercial SaaS. Any AutoDL cost is paid directly by the user inside their own AutoDL account. AutoGPU Studio only provides open-source orchestration, connection settings, and task routing.

## Attribution And License

This repository is derived from the original `waoowaoo` project. See [NOTICE.md](./NOTICE.md) for attribution and change notes.

The inherited license is `CC BY-NC-SA 4.0`. It includes Attribution, NonCommercial, and ShareAlike restrictions and is not an OSI-approved software open-source license. Non-commercial sharing and modification should keep attribution and the same license. Commercial SaaS, paid hosting, advertising monetization, or paid platform usage requires permission from the upstream rights holder, or a separate commercially usable rewrite.

## Project Scope

AutoGPU Studio is designed for individual creators, researchers, and open-source users:

- Users create and pay for GPU instances directly on AutoDL, or configure their own AutoDL API Key in a self-hosted deployment.
- The platform connects only to user-owned instances.
- The platform does not charge instance fees, maintain balance, freeze funds, or add any markup to AutoDL prices.
- Users can choose recommended GPU profiles and see compatible local video, image, and TTS models.
- Remote workers run inside the user's own AutoDL instance and upload generated assets back to the user's configured storage.
- Task scheduling, status tracking, model catalog, and result persistence reuse the existing project architecture.

## AutoDL Integration Modes

### Manual Connection

The user rents, pays for, and starts an instance on AutoDL, then enters the remote Worker URL, port, and access secret in AutoGPU Studio.

This is the safest mode because the platform never touches the user's AutoDL balance or billing flow.

### User-Owned API Key

In a self-hosted deployment, the user may configure their own AutoDL API Key. The system can then create, inspect, stop, and release instances inside that user's AutoDL account.

This is still not resale. Billing remains between the user and AutoDL. API Keys should be held by the user and should not be collected by a public demo service.

## Recommended GPU Profiles

| Profile | AutoDL Spec ID | Use Case |
| --- | --- | --- |
| PRO6000 | `pro6000-p` | High-quality video, large images, high-quality TTS |
| RTX 5090 | `5090-p` | Fast video, image generation, lightweight TTS |

Availability, region, and actual pricing should come from the AutoDL website or the user's own AutoDL API response. This project only displays recommendations and connection state.

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

Every model entry should include its own license notes, VRAM requirements, workflow ID, default parameters, supported resolutions, and recommended GPU profile.

## Design Document

- [AutoDL user-owned instance and multimodal model design](./docs/superpowers/specs/2026-04-28-autodl-user-owned-instance-design.md)

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

Optional AutoDL settings are documented in `.env.example`. For non-commercial self-hosted usage, start with `AUTODL_CONNECTION_MODE=manual`; only personal self-hosted deployments should use `user_api_key`.

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
