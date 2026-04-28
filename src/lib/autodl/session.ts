import crypto from 'crypto'
import { decryptApiKey, encryptApiKey } from '@/lib/crypto-utils'
import { isAutoDLProfileId, type AutoDLProfileId } from './catalog'
import { buildAutoDLWorkerStartCommand, type AutoDLPreferredPort } from './connection'

export type AutoDLSessionStatus = 'created' | 'booting' | 'running' | 'worker_ready' | 'stopped' | 'released' | 'failed'

export interface AutoDLSessionView {
  id: string
  instanceUuid: string | null
  profileId: AutoDLProfileId
  imageUuid: string | null
  modelBundle: string | null
  status: AutoDLSessionStatus
  autodlStatus: string | null
  workerBaseUrl: string | null
  paygPrice: number | null
  createdAt: string
  updatedAt: string
  startedAt: string | null
  releasedAt: string | null
}

interface AutoDLSessionRow {
  id: string
  instanceUuid?: string | null
  profileId: string
  imageUuid?: string | null
  modelBundle?: string | null
  status: string
  autodlStatus?: string | null
  workerBaseUrl?: string | null
  paygPrice?: number | null
  createdAt: Date | string
  updatedAt: Date | string
  startedAt?: Date | string | null
  releasedAt?: Date | string | null
}

export interface BuildAutoDLStartCommandParams {
  serverUrl: string
  preferredPort: AutoDLPreferredPort
  modelBundle?: string | null
}

function toIsoString(value: Date | string | null | undefined): string | null {
  if (!value) return null
  if (value instanceof Date) return value.toISOString()
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function normalizeSessionStatus(value: string): AutoDLSessionStatus {
  if (
    value === 'created'
    || value === 'booting'
    || value === 'running'
    || value === 'worker_ready'
    || value === 'stopped'
    || value === 'released'
    || value === 'failed'
  ) {
    return value
  }
  return 'created'
}

export function buildAutoDLSessionView(row: AutoDLSessionRow): AutoDLSessionView {
  return {
    id: row.id,
    instanceUuid: row.instanceUuid || null,
    profileId: isAutoDLProfileId(row.profileId) ? row.profileId : '5090-p',
    imageUuid: row.imageUuid || null,
    modelBundle: row.modelBundle || null,
    status: normalizeSessionStatus(row.status),
    autodlStatus: row.autodlStatus || null,
    workerBaseUrl: row.workerBaseUrl || null,
    paygPrice: row.paygPrice ?? null,
    createdAt: toIsoString(row.createdAt) || new Date(0).toISOString(),
    updatedAt: toIsoString(row.updatedAt) || new Date(0).toISOString(),
    startedAt: toIsoString(row.startedAt),
    releasedAt: toIsoString(row.releasedAt),
  }
}

export function createAutoDLWorkerSecret(): { plaintext: string; ciphertext: string } {
  const plaintext = crypto.randomBytes(24).toString('base64url')
  return {
    plaintext,
    ciphertext: encryptApiKey(plaintext),
  }
}

export function decryptAutoDLWorkerSecret(ciphertext: string): string {
  return decryptApiKey(ciphertext)
}

export function getAutoDLPublicServerUrl(fallbackUrl?: string): string {
  const rawUrl = process.env.AUTODL_PUBLIC_SERVER_URL || process.env.NEXTAUTH_URL || fallbackUrl || process.env.INTERNAL_APP_URL
  if (!rawUrl) throw new Error('AUTODL_PUBLIC_SERVER_URL_REQUIRED')
  const parsed = new URL(rawUrl)
  return parsed.toString().replace(/\/+$/, '')
}

export function isAutoDLPublicServerUrlReachableFromInstance(serverUrl: string): boolean {
  const parsed = new URL(serverUrl)
  const hostname = parsed.hostname.toLowerCase()
  return !['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(hostname)
}

export function buildSessionStartCommand(params: BuildAutoDLStartCommandParams): {
  workerSecret: { plaintext: string; ciphertext: string }
  startCommand: string
} {
  const workerSecret = createAutoDLWorkerSecret()
  return {
    workerSecret,
    startCommand: buildAutoDLWorkerStartCommand({
      serverUrl: params.serverUrl,
      workerSecret: workerSecret.plaintext,
      preferredPort: params.preferredPort,
      modelBundle: params.modelBundle || 'default',
    }),
  }
}

export function normalizeAutoDLPaygPrice(value: unknown): number | null {
  const price = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(price)) return null
  return Math.max(0, Math.round(price))
}

export function resolveAutoDLSessionRuntimeStatus(
  autodlStatus: string | null | undefined,
  workerHealthy: boolean,
  workerBaseUrl: string | null | undefined,
): AutoDLSessionStatus {
  const status = (autodlStatus || '').trim().toLowerCase()
  if (status.includes('fail') || status.includes('error')) return 'failed'
  if (status.includes('release') || status.includes('delete')) return 'released'
  if (status.includes('stop') || status.includes('shutdown') || status.includes('poweroff')) return 'stopped'
  if (workerHealthy) return 'worker_ready'
  if (workerBaseUrl && status === 'running') return 'running'
  if (status === 'running') return 'running'
  return 'booting'
}

export async function probeAutoDLWorkerHealth(params: {
  workerBaseUrl: string
  workerSecret: string
  fetcher?: typeof fetch
  timeoutMs?: number
}): Promise<boolean> {
  const workerBaseUrl = params.workerBaseUrl.trim().replace(/\/+$/, '')
  const workerSecret = params.workerSecret.trim()
  if (!workerBaseUrl || !workerSecret) return false

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), params.timeoutMs || 5000)
  try {
    const response = await (params.fetcher || fetch)(`${workerBaseUrl}/health`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${workerSecret}`,
        'x-autogpu-worker-secret': workerSecret,
      },
      signal: controller.signal,
    })
    if (!response.ok) return false
    const payload = await response.json().catch(() => null) as { ok?: unknown } | null
    return payload?.ok === true
  } catch {
    return false
  } finally {
    clearTimeout(timeout)
  }
}

export function buildAutoDLWorkerBootstrapScript(): string {
  return String.raw`#!/usr/bin/env bash
set -Eeuo pipefail

WORKDIR="\${AUTOGPU_WORKER_DIR:-/root/autogpu-worker}"
PORT="\${AUTOGPU_WORKER_PORT:-6006}"
MODEL_BUNDLE="\${AUTOGPU_MODEL_BUNDLE:-default}"

mkdir -p "$WORKDIR"

cat > "$WORKDIR/worker.py" <<'PY'
import json
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

MODEL_CATALOG = {
    "wan2.2-ti2v-5b": {"id": "wan2.2-ti2v-5b", "name": "Wan2.2 TI2V 5B", "type": "video"},
    "wan2.2-i2v-a14b": {"id": "wan2.2-i2v-a14b", "name": "Wan2.2 I2V A14B", "type": "video"},
    "ltx-video-2b-distilled": {"id": "ltx-video-2b-distilled", "name": "LTX-Video 2B Distilled", "type": "video"},
    "ltx-video-13b-fp8": {"id": "ltx-video-13b-fp8", "name": "LTX-Video 13B Distilled FP8", "type": "video"},
    "flux2-klein-4b": {"id": "flux2-klein-4b", "name": "FLUX.2 klein 4B", "type": "image"},
    "qwen-image-edit": {"id": "qwen-image-edit", "name": "Qwen-Image / Qwen-Image-Edit", "type": "image"},
    "sdxl-sd35-medium": {"id": "sdxl-sd35-medium", "name": "SDXL / SD 3.5 Medium", "type": "image"},
    "cosyvoice3-0.5b": {"id": "cosyvoice3-0.5b", "name": "CosyVoice 3 0.5B", "type": "audio"},
    "f5-tts-v1": {"id": "f5-tts-v1", "name": "F5-TTS v1", "type": "audio"},
    "indextts2": {"id": "indextts2", "name": "IndexTTS2", "type": "audio"},
    "fish-speech": {"id": "fish-speech", "name": "Fish-Speech", "type": "audio"},
}

def selected_models():
    bundle = os.environ.get("AUTOGPU_MODEL_BUNDLE", "default").strip()
    if bundle and bundle != "default" and bundle in MODEL_CATALOG:
        return [MODEL_CATALOG[bundle]]
    return list(MODEL_CATALOG.values())

class WorkerHandler(BaseHTTPRequestHandler):
    server_version = "AutoGPUWorker/0.1"

    def _authorized(self):
        secret = os.environ.get("AUTOGPU_WORKER_SECRET", "").strip()
        if not secret:
            return True
        auth = self.headers.get("authorization", "")
        shared = self.headers.get("x-autogpu-worker-secret", "")
        return shared == secret or auth == "Bearer " + secret

    def _json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json; charset=utf-8")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _not_ready(self):
        # 这里是最小 Worker 壳，真实推理镜像可以替换这些端点接入 ComfyUI / Diffusers / TTS 后端。
        self._json(501, {
            "error": {
                "type": "model_backend_missing",
                "message": "AutoGPU Worker 已启动，但当前镜像还没有接入真实模型推理后端。"
            }
        })

    def do_GET(self):
        if not self._authorized():
            self._json(401, {"ok": False, "error": "unauthorized"})
            return
        path = urlparse(self.path).path
        if path == "/health":
            self._json(200, {
                "ok": True,
                "service": "autogpu-worker",
                "modelBundle": os.environ.get("AUTOGPU_MODEL_BUNDLE", "default"),
                "port": int(os.environ.get("AUTOGPU_WORKER_PORT", "6006")),
            })
            return
        if path == "/v1/models":
            self._json(200, {
                "object": "list",
                "data": [
                    {"id": model["id"], "object": "model", "owned_by": "autogpu-worker", "type": model["type"]}
                    for model in selected_models()
                ],
            })
            return
        self._json(404, {"ok": False, "error": "not_found"})

    def do_POST(self):
        if not self._authorized():
            self._json(401, {"ok": False, "error": "unauthorized"})
            return
        path = urlparse(self.path).path
        if path in ("/v1/images/generations", "/v1/images/edits", "/v1/videos", "/v1/audio/speech"):
            self._not_ready()
            return
        self._json(404, {"ok": False, "error": "not_found"})

    def log_message(self, fmt, *args):
        sys.stderr.write("[autogpu-worker] " + (fmt % args) + "\n")

port = int(os.environ.get("AUTOGPU_WORKER_PORT", "6006"))
server = ThreadingHTTPServer(("0.0.0.0", port), WorkerHandler)
server.serve_forever()
PY

if ! command -v python3 >/dev/null 2>&1; then
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y python3
fi

if command -v pkill >/dev/null 2>&1; then
  pkill -f "$WORKDIR/worker.py" >/dev/null 2>&1 || true
fi

nohup python3 "$WORKDIR/worker.py" > "$WORKDIR/worker.log" 2>&1 &
echo "AutoGPU Worker started on port $PORT with model bundle $MODEL_BUNDLE"
`.replaceAll('\\${', '${')
}
