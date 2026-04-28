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

export AUTOGPU_WORKER_DIR="$WORKDIR"
export AUTOGPU_WORKER_PORT="$PORT"
export AUTOGPU_MODEL_BUNDLE="$MODEL_BUNDLE"

mkdir -p "$WORKDIR"

cat > "$WORKDIR/worker.py" <<'PY'
import base64
import json
import os
import subprocess
import sys
import time
import uuid
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import quote, urlparse

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

TASKS = {}
# 支持环境变量：AUTOGPU_IMAGE_API_URL、AUTOGPU_VIDEO_API_URL、AUTOGPU_TTS_API_URL。
SUPPORTED_BACKEND_ENV_HINTS = (
    "AUTOGPU_IMAGE_API_URL",
    "AUTOGPU_VIDEO_API_URL",
    "AUTOGPU_TTS_API_URL",
)

class BackendMissing(Exception):
    def __init__(self, kind):
        self.kind = kind
        super().__init__(kind)

def backend_timeout(kind):
    raw = os.environ.get("AUTOGPU_" + kind + "_TIMEOUT_SECONDS", "900").strip()
    try:
        return max(1, int(raw))
    except Exception:
        return 900

def backend_script(kind):
    configured = os.environ.get("AUTOGPU_" + kind + "_SCRIPT", "").strip()
    if configured:
        return configured
    script_dir = os.environ.get("AUTOGPU_SCRIPT_DIR", "/root/autogpu-worker/scripts").strip()
    names = {
        "IMAGE": "image_generate.py",
        "VIDEO": "video_generate.py",
        "TTS": "tts_generate.py",
    }
    return os.path.join(script_dir, names[kind])

def backend_headers(kind):
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json, audio/*, video/*, image/*",
    }
    api_key = os.environ.get("AUTOGPU_" + kind + "_API_KEY", "").strip()
    if api_key:
        headers["Authorization"] = "Bearer " + api_key
    extra_raw = os.environ.get("AUTOGPU_" + kind + "_HEADERS_JSON", "").strip()
    if extra_raw:
        try:
            extra = json.loads(extra_raw)
            if isinstance(extra, dict):
                for key, value in extra.items():
                    if isinstance(key, str) and isinstance(value, str) and key.strip() and value.strip():
                        headers[key.strip()] = value.strip()
        except Exception:
            pass
    return headers

def read_json_body(handler):
    length = int(handler.headers.get("content-length", "0") or "0")
    raw = handler.rfile.read(length) if length > 0 else b"{}"
    if not raw:
        return {}
    try:
        payload = json.loads(raw.decode("utf-8"))
    except Exception:
        raise ValueError("invalid_json")
    return payload if isinstance(payload, dict) else {"input": payload}

def normalize_binary_payload(content_type, data):
    mime_type = content_type.split(";")[0].strip() or "application/octet-stream"
    return {
        "_binary_base64": base64.b64encode(data).decode("ascii"),
        "_content_type": mime_type,
    }

def call_direct_backend(kind, payload):
    url = os.environ.get("AUTOGPU_" + kind + "_API_URL", "").strip()
    if url:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        request = urllib.request.Request(
            url,
            data=body,
            headers=backend_headers(kind),
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=backend_timeout(kind)) as response:
            response_body = response.read()
            content_type = response.headers.get("content-type", "application/json")
        if "json" in content_type:
            return json.loads(response_body.decode("utf-8") or "{}")
        return normalize_binary_payload(content_type, response_body)

    script = backend_script(kind)
    if not os.path.exists(script):
        raise BackendMissing(kind)
    completed = subprocess.run(
        ["python3", script],
        input=json.dumps(payload, ensure_ascii=False),
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=backend_timeout(kind),
    )
    if completed.returncode != 0:
        raise RuntimeError((completed.stderr or "script failed")[-600:])
    stdout = completed.stdout.strip()
    return json.loads(stdout) if stdout else {}

def first_value(payload, keys):
    if isinstance(payload, dict):
        for key in keys:
            value = payload.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
        for nested_key in ("data", "output", "result", "results"):
            nested = payload.get(nested_key)
            value = first_value(nested, keys)
            if value:
                return value
    if isinstance(payload, list):
        for item in payload:
            value = first_value(item, keys)
            if value:
                return value
    return ""

def first_media_url(payload):
    url = first_value(payload, (
        "url",
        "image_url",
        "imageUrl",
        "video_url",
        "videoUrl",
        "audio_url",
        "audioUrl",
        "output_url",
        "outputUrl",
    ))
    if url:
        return url
    b64 = first_value(payload, ("b64_json", "image_base64", "audio_base64"))
    if b64:
        return "data:application/octet-stream;base64," + b64
    if isinstance(payload, dict) and payload.get("_binary_base64"):
        return "data:" + payload.get("_content_type", "application/octet-stream") + ";base64," + payload["_binary_base64"]
    return ""

def first_task_id(payload):
    task_id = first_value(payload, ("id", "task_id", "taskId", "request_id", "requestId", "job_id", "jobId"))
    return task_id or str(uuid.uuid4())

def normalize_status(payload):
    status = first_value(payload, ("status", "state", "phase")).lower()
    if status in ("completed", "succeeded", "success", "done", "finished"):
        return "completed"
    if status in ("failed", "error", "cancelled", "canceled"):
        return "failed"
    if status in ("queued", "pending", "running", "processing", "in_progress", "started"):
        return "pending"
    return "pending"

def render_status_url(task_id, stored_task):
    raw = os.environ.get("AUTOGPU_VIDEO_STATUS_API_URL", "").strip() or stored_task.get("status_url", "")
    if not raw:
        return ""
    if "{task_id}" in raw:
        return raw.replace("{task_id}", quote(task_id, safe=""))
    return raw.rstrip("/") + "/" + quote(task_id, safe="")

def fetch_video_status(task_id, stored_task):
    status_url = render_status_url(task_id, stored_task)
    if not status_url:
        return stored_task
    method = os.environ.get("AUTOGPU_VIDEO_STATUS_METHOD", "GET").strip().upper() or "GET"
    body = None
    if method != "GET":
        body = json.dumps({"id": task_id, "task_id": task_id}, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        status_url,
        data=body,
        headers=backend_headers("VIDEO"),
        method=method,
    )
    with urllib.request.urlopen(request, timeout=backend_timeout("VIDEO")) as response:
        raw = response.read().decode("utf-8")
    payload = json.loads(raw or "{}")
    video_url = first_media_url(payload)
    return {
        "id": task_id,
        "status": normalize_status(payload),
        **({"video_url": video_url} if video_url else {}),
        **({"error": {"message": first_value(payload, ("error", "message"))}} if normalize_status(payload) == "failed" else {}),
    }

def backend_presence(kind):
    return bool(os.environ.get("AUTOGPU_" + kind + "_API_URL", "").strip() or os.path.exists(backend_script(kind)))

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

    def _bytes(self, status, content_type, payload):
        self.send_response(status)
        self.send_header("content-type", content_type)
        self.send_header("content-length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def _backend_missing(self, kind):
        self._json(501, {
            "error": {
                "type": "model_backend_missing",
                "message": "AutoGPU Worker 已启动，但还没有配置 " + kind + " 直接推理 API 或脚本。"
            }
        })

    def _backend_error(self, error):
        self._json(502, {
            "error": {
                "type": "backend_error",
                "message": str(error)
            }
        })

    def _handle_image(self):
        try:
            payload = read_json_body(self)
            result = call_direct_backend("IMAGE", payload)
            image_url = first_media_url(result)
            if not image_url:
                self._json(502, {"error": {"type": "backend_output_invalid", "message": "图片后端没有返回 url 或 base64"}})
                return
            self._json(200, {
                "created": int(time.time()),
                "data": [{"url": image_url}],
            })
        except BackendMissing as error:
            self._backend_missing(error.kind)
        except Exception as error:
            self._backend_error(error)

    def _handle_video_create(self):
        try:
            payload = read_json_body(self)
            result = call_direct_backend("VIDEO", payload)
            task_id = first_task_id(result)
            video_url = first_media_url(result)
            status = "completed" if video_url else normalize_status(result)
            stored = {
                "id": task_id,
                "status": status,
                **({"video_url": video_url} if video_url else {}),
                **({"status_url": first_value(result, ("status_url", "statusUrl"))} if first_value(result, ("status_url", "statusUrl")) else {}),
            }
            TASKS[task_id] = stored
            self._json(200, stored)
        except BackendMissing as error:
            self._backend_missing(error.kind)
        except Exception as error:
            self._backend_error(error)

    def _handle_video_status(self, task_id):
        try:
            stored = TASKS.get(task_id, {"id": task_id, "status": "pending"})
            next_status = fetch_video_status(task_id, stored)
            TASKS[task_id] = next_status
            self._json(200, next_status)
        except Exception as error:
            self._backend_error(error)

    def _handle_tts(self):
        try:
            payload = read_json_body(self)
            result = call_direct_backend("TTS", payload)
            if isinstance(result, dict) and result.get("_binary_base64"):
                content_type = result.get("_content_type", "audio/mpeg")
                self._bytes(200, content_type, base64.b64decode(result["_binary_base64"]))
                return
            audio_url = first_media_url(result)
            if audio_url:
                self._json(200, {"audio_url": audio_url})
                return
            self._json(502, {"error": {"type": "backend_output_invalid", "message": "语音后端没有返回音频"}})
        except BackendMissing as error:
            self._backend_missing(error.kind)
        except Exception as error:
            self._backend_error(error)

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
                "backends": {
                    "image": backend_presence("IMAGE"),
                    "video": backend_presence("VIDEO"),
                    "tts": backend_presence("TTS"),
                },
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
        if path.startswith("/v1/autogpu/videos/"):
            task_id = path.rsplit("/", 1)[-1]
            self._handle_video_status(task_id)
            return
        self._json(404, {"ok": False, "error": "not_found"})

    def do_POST(self):
        if not self._authorized():
            self._json(401, {"ok": False, "error": "unauthorized"})
            return
        path = urlparse(self.path).path
        if path in ("/v1/autogpu/images", "/v1/images/generations", "/v1/images/edits"):
            self._handle_image()
            return
        if path in ("/v1/autogpu/videos", "/v1/videos"):
            self._handle_video_create()
            return
        if path == "/v1/audio/speech":
            self._handle_tts()
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
