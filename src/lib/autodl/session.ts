import crypto from 'crypto'
import { decryptApiKey, encryptApiKey } from '@/lib/crypto-utils'
import { isAutoDLProfileId, type AutoDLProfileId } from './catalog'
import { buildAutoDLWorkerStartCommand, type AutoDLPreferredPort } from './connection'
import type { AutoDLListedInstance } from './client'

export type AutoDLSessionStatus = 'created' | 'booting' | 'running' | 'worker_ready' | 'stopped' | 'released' | 'failed'
export type AutoDLSessionSource = 'platform' | 'autodl'

export interface AutoDLSessionView {
  id: string
  instanceUuid: string | null
  displayName: string | null
  profileId: AutoDLProfileId
  imageUuid: string | null
  modelBundle: string | null
  status: AutoDLSessionStatus
  autodlStatus: string | null
  workerBaseUrl: string | null
  paygPrice: number | null
  source: AutoDLSessionSource
  managedByPlatform: boolean
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
  workerSharedSecretCiphertext?: string | null
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

function normalizeExternalSessionStatus(value: string | null | undefined): AutoDLSessionStatus {
  const status = (value || '').trim().toLowerCase()
  if (!status) return 'created'
  if (status.includes('fail') || status.includes('error')) return 'failed'
  if (status.includes('release') || status.includes('delete') || status.includes('destroy')) return 'released'
  if (status.includes('stop') || status.includes('shutdown') || status.includes('poweroff')) return 'stopped'
  if (status.includes('running')) return 'running'
  if (status.includes('boot') || status.includes('start') || status.includes('create')) return 'booting'
  return 'created'
}

export function inferAutoDLModelBundleFromName(value: string | null | undefined): string | null {
  const name = (value || '').trim().toLowerCase()
  if (!name) return null
  if (name.includes('低级') || name.includes('starter') || name.includes('low')) return 'starter'
  if (name.includes('高级') || name.includes('advanced') || name.includes('high')) return 'advanced'
  if (name.includes('中级') || name.includes('balanced') || name.includes('medium')) return 'balanced'
  return null
}

export function buildAutoDLSessionView(row: AutoDLSessionRow, options: {
  displayName?: string | null
  source?: AutoDLSessionSource
  managedByPlatform?: boolean
} = {}): AutoDLSessionView {
  const source = options.source || 'platform'
  return {
    id: row.id,
    instanceUuid: row.instanceUuid || null,
    displayName: options.displayName || null,
    profileId: isAutoDLProfileId(row.profileId) ? row.profileId : '5090-p',
    imageUuid: row.imageUuid || null,
    modelBundle: row.modelBundle || null,
    status: normalizeSessionStatus(row.status),
    autodlStatus: row.autodlStatus || null,
    workerBaseUrl: row.workerBaseUrl || null,
    paygPrice: row.paygPrice ?? null,
    source,
    managedByPlatform: options.managedByPlatform ?? (source === 'platform'),
    createdAt: toIsoString(row.createdAt) || new Date(0).toISOString(),
    updatedAt: toIsoString(row.updatedAt) || new Date(0).toISOString(),
    startedAt: toIsoString(row.startedAt),
    releasedAt: toIsoString(row.releasedAt),
  }
}

export function buildAutoDLExternalSessionView(instance: AutoDLListedInstance): AutoDLSessionView {
  const now = new Date().toISOString()
  return {
    id: `autodl:${instance.instanceUuid}`,
    instanceUuid: instance.instanceUuid,
    displayName: instance.displayName,
    profileId: instance.profileId || '5090-p',
    imageUuid: null,
    modelBundle: inferAutoDLModelBundleFromName(instance.displayName),
    status: normalizeExternalSessionStatus(instance.status),
    autodlStatus: instance.status,
    workerBaseUrl: null,
    paygPrice: null,
    source: 'autodl',
    managedByPlatform: false,
    createdAt: instance.createdAt || instance.startedAt || now,
    updatedAt: instance.statusAt || instance.startedAt || instance.createdAt || now,
    startedAt: instance.startedAt,
    releasedAt: null,
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
  options: {
    workerExpected?: boolean
    workerUnauthorized?: boolean
    startedAt?: Date | string | null
    now?: Date
    bootTimeoutMs?: number
  } = {},
): AutoDLSessionStatus {
  const status = (autodlStatus || '').trim().toLowerCase()
  if (status.includes('fail') || status.includes('error')) return 'failed'
  if (status.includes('release') || status.includes('delete')) return 'released'
  if (status.includes('stop') || status.includes('shutdown') || status.includes('poweroff')) return 'stopped'
  if (workerHealthy) return 'worker_ready'
  if (options.workerUnauthorized) return 'failed'
  if (options.workerExpected && status === 'running') {
    const timeoutMs = Math.max(1, options.bootTimeoutMs || 20 * 60 * 1000)
    const startedAt = toIsoString(options.startedAt)
    if (startedAt) {
      const startedAtMs = new Date(startedAt).getTime()
      const nowMs = (options.now || new Date()).getTime()
      if (Number.isFinite(startedAtMs) && nowMs - startedAtMs > timeoutMs) return 'failed'
    }
    return 'booting'
  }
  if (workerBaseUrl && status === 'running') return 'running'
  if (status === 'running') return 'running'
  return 'booting'
}

export interface AutoDLWorkerReadiness {
  healthy: boolean
  unauthorized: boolean
  statusCode: number | null
  message: string | null
  backends: {
    image: boolean
    video: boolean
    llm: boolean
    tts: boolean
  } | null
}

function normalizeAutoDLWorkerBackends(value: unknown): AutoDLWorkerReadiness['backends'] {
  if (!value || typeof value !== 'object') return null
  const backends = value as Record<string, unknown>
  return {
    image: backends.image === true,
    video: backends.video === true,
    llm: backends.llm === true,
    tts: backends.tts === true,
  }
}

export async function probeAutoDLWorkerReadiness(params: {
  workerBaseUrl: string
  workerSecret: string
  fetcher?: typeof fetch
  timeoutMs?: number
}): Promise<AutoDLWorkerReadiness> {
  const workerBaseUrl = params.workerBaseUrl.trim().replace(/\/+$/, '')
  const workerSecret = params.workerSecret.trim()
  if (!workerBaseUrl || !workerSecret) {
    return {
      healthy: false,
      unauthorized: false,
      statusCode: null,
      message: 'missing_worker_config',
      backends: null,
    }
  }

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
    const payload = await response.json().catch(() => null) as { ok?: unknown; error?: unknown; backends?: unknown } | null
    return {
      healthy: response.ok && payload?.ok === true,
      unauthorized: response.status === 401 || response.status === 403,
      statusCode: response.status,
      message: typeof payload?.error === 'string' ? payload.error : response.statusText || null,
      backends: normalizeAutoDLWorkerBackends(payload?.backends),
    }
  } catch (error) {
    return {
      healthy: false,
      unauthorized: false,
      statusCode: null,
      message: error instanceof Error ? error.message : 'worker_probe_failed',
      backends: null,
    }
  } finally {
    clearTimeout(timeout)
  }
}

export async function probeAutoDLWorkerHealth(params: {
  workerBaseUrl: string
  workerSecret: string
  fetcher?: typeof fetch
  timeoutMs?: number
}): Promise<boolean> {
  const readiness = await probeAutoDLWorkerReadiness(params)
  return readiness.healthy
}

export async function fetchAutoDLWorkerModelIds(params: {
  workerBaseUrl: string
  workerSecret: string
  fetcher?: typeof fetch
  timeoutMs?: number
}): Promise<string[]> {
  const workerBaseUrl = params.workerBaseUrl.trim().replace(/\/+$/, '')
  const workerSecret = params.workerSecret.trim()
  if (!workerBaseUrl || !workerSecret) return []

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), params.timeoutMs || 5000)
  try {
    const response = await (params.fetcher || fetch)(`${workerBaseUrl}/v1/models`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${workerSecret}`,
        'x-autogpu-worker-secret': workerSecret,
      },
      signal: controller.signal,
    })
    if (!response.ok) return []
    const payload = await response.json().catch(() => null) as { data?: unknown } | null
    if (!Array.isArray(payload?.data)) return []
    return payload.data.flatMap((item) => {
      if (!item || typeof item !== 'object') return []
      const id = typeof (item as { id?: unknown }).id === 'string' ? (item as { id: string }).id.trim() : ''
      return id ? [id] : []
    })
  } catch {
    return []
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
LLM_BACKEND="\${AUTOGPU_LLM_BACKEND:-transformers}"

export AUTOGPU_WORKER_DIR="$WORKDIR"
export AUTOGPU_WORKER_PORT="$PORT"
export AUTOGPU_MODEL_BUNDLE="$MODEL_BUNDLE"
export AUTOGPU_LLM_BACKEND="$LLM_BACKEND"

mkdir -p "$WORKDIR"

cat > "$WORKDIR/worker.py" <<'PY'
import base64
import inspect
import io
import json
import os
import re
import subprocess
import sys
import tempfile
import threading
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
    "qwen3-8b-instruct": {"id": "qwen3-8b-instruct", "name": "Qwen3 8B Instruct", "type": "llm"},
    "qwen3-32b-instruct": {"id": "qwen3-32b-instruct", "name": "Qwen3 32B Instruct", "type": "llm"},
    "cosyvoice3-0.5b": {"id": "cosyvoice3-0.5b", "name": "CosyVoice 3 0.5B", "type": "audio"},
    "f5-tts-v1": {"id": "f5-tts-v1", "name": "F5-TTS v1", "type": "audio"},
    "indextts2": {"id": "indextts2", "name": "IndexTTS2", "type": "audio"},
    "fish-speech": {"id": "fish-speech", "name": "Fish-Speech", "type": "audio"},
}

MODEL_BUNDLES = {
    "starter": ["ltx-video-2b-distilled", "sdxl-sd35-medium", "f5-tts-v1"],
    "balanced": ["wan2.2-ti2v-5b", "flux2-klein-4b", "f5-tts-v1"],
    "advanced": ["wan2.2-i2v-a14b", "ltx-video-13b-fp8", "qwen-image-edit", "f5-tts-v1"],
}

def is_model_supported(model_id):
    model = MODEL_CATALOG.get(model_id)
    if not model:
        return False
    model_type = model.get("type")
    if model_type == "image":
        return image_backend_kind() in ("auto", "diffusers")
    if model_type == "video":
        return video_backend_kind() in ("auto", "diffusers") and model_id in DEFAULT_VIDEO_MODEL_REFS
    if model_type == "audio":
        return tts_backend_kind() in ("auto", "builtin", "local") and model_id in ("f5-tts-v1", "cosyvoice3-0.5b")
    if model_type == "llm":
        return llm_backend_kind() == "transformers"
    return False

def selected_models():
    bundle = os.environ.get("AUTOGPU_MODEL_BUNDLE", "default").strip()
    if bundle in MODEL_BUNDLES:
        return [MODEL_CATALOG[model_id] for model_id in MODEL_BUNDLES[bundle] if is_model_supported(model_id)]
    if bundle and bundle != "default" and bundle in MODEL_CATALOG and is_model_supported(bundle):
        return [MODEL_CATALOG[bundle]]
    return [model for model_id, model in MODEL_CATALOG.items() if is_model_supported(model_id)]

TASKS = {}
IMAGE_PIPELINE = None
IMAGE_PIPELINE_KEY = ""
IMAGE_PIPELINE_MODE = ""
IMAGE_DEVICE = "cpu"
VIDEO_PIPELINES = {}
TTS_MODELS = {}
LLM_MODEL = None
LLM_TOKENIZER = None
LLM_MODEL_KEY = ""
WORKDIR = os.environ.get("AUTOGPU_WORKER_DIR", "/root/autogpu-worker")
OUTPUT_DIR = os.path.join(WORKDIR, "outputs")
os.makedirs(OUTPUT_DIR, exist_ok=True)
DEFAULT_IMAGE_MODEL_REFS = {
    "sdxl-sd35-medium": "stabilityai/stable-diffusion-xl-base-1.0",
}
DEFAULT_VIDEO_MODEL_REFS = {
    "ltx-video-2b-distilled": "Lightricks/LTX-Video",
    "ltx-video-13b-fp8": "Lightricks/LTX-Video-0.9.8-13B-distilled",
    "wan2.2-ti2v-5b": "Wan-AI/Wan2.2-TI2V-5B-Diffusers",
    "wan2.2-i2v-a14b": "Wan-AI/Wan2.2-I2V-A14B-Diffusers",
}
DEFAULT_LLM_MODEL_REFS = {
    "qwen3-8b-instruct": "Qwen/Qwen3-8B",
    "qwen3-32b-instruct": "Qwen/Qwen3-32B",
}
DEFAULT_TTS_MODEL_REFS = {
    "f5-tts-v1": "F5TTS_v1_Base",
    "cosyvoice3-0.5b": "pretrained_models/Fun-CosyVoice3-0.5B",
}
# 支持环境变量：AUTOGPU_IMAGE_API_URL、AUTOGPU_VIDEO_API_URL、AUTOGPU_TTS_API_URL、AUTOGPU_LLM_BACKEND，以及本地 VIDEO/TTS 后端开关。
SUPPORTED_BACKEND_ENV_HINTS = (
    "AUTOGPU_IMAGE_API_URL",
    "AUTOGPU_VIDEO_API_URL",
    "AUTOGPU_TTS_API_URL",
    "AUTOGPU_LLM_API_URL",
    "AUTOGPU_LLM_BACKEND",
    "AUTOGPU_VIDEO_BACKEND",
    "AUTOGPU_TTS_BACKEND",
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
        "LLM": "llm_generate.py",
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

def image_backend_kind():
    return os.environ.get("AUTOGPU_IMAGE_BACKEND", "diffusers").strip().lower()

def video_backend_kind():
    return os.environ.get("AUTOGPU_VIDEO_BACKEND", "auto").strip().lower()

def tts_backend_kind():
    return os.environ.get("AUTOGPU_TTS_BACKEND", "auto").strip().lower()

def llm_backend_kind():
    return os.environ.get("AUTOGPU_LLM_BACKEND", "transformers").strip().lower()

def safe_env_suffix(value):
    return re.sub(r"[^A-Z0-9]+", "_", value.upper()).strip("_")

def read_int_env(name, default_value):
    raw = os.environ.get(name, "").strip()
    if not raw:
        return default_value
    try:
        return int(raw)
    except Exception:
        return default_value

def read_float_env(name, default_value):
    raw = os.environ.get(name, "").strip()
    if not raw:
        return default_value
    try:
        return float(raw)
    except Exception:
        return default_value

def clamp_dimension(value):
    try:
        parsed = int(value)
    except Exception:
        parsed = 1024
    parsed = max(256, min(parsed, 2048))
    return max(8, (parsed // 8) * 8)

def resolve_dimensions(payload):
    width = read_int_env("AUTOGPU_IMAGE_DEFAULT_WIDTH", 1024)
    height = read_int_env("AUTOGPU_IMAGE_DEFAULT_HEIGHT", 1024)
    for key in ("size", "resolution"):
        raw = str(payload.get(key, "") or "").strip().lower()
        match = re.match(r"^(\d{3,4})\s*[x*]\s*(\d{3,4})$", raw)
        if match:
            width = int(match.group(1))
            height = int(match.group(2))
            break
    aspect_ratio = str(payload.get("aspect_ratio", "") or "").strip()
    match = re.match(r"^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$", aspect_ratio)
    if match and not payload.get("size") and not payload.get("resolution"):
        ratio_width = float(match.group(1))
        ratio_height = float(match.group(2))
        if ratio_width > 0 and ratio_height > 0:
            pixels = min(read_int_env("AUTOGPU_IMAGE_MAX_PIXELS", 1048576), 4194304)
            width = int((pixels * ratio_width / ratio_height) ** 0.5)
            height = int(width * ratio_height / ratio_width)
    return clamp_dimension(width), clamp_dimension(height)

def round_to_multiple(value, divisor):
    divisor = max(1, int(divisor))
    return max(divisor, int(value // divisor) * divisor)

def load_binary_source(value):
    if not isinstance(value, str) or not value.strip():
        return None
    source = value.strip()
    if source.startswith("data:"):
        marker = ";base64,"
        if marker not in source:
            return None
        return base64.b64decode(source.split(marker, 1)[1])
    if source.startswith("http://") or source.startswith("https://"):
        with urllib.request.urlopen(source, timeout=60) as response:
            return response.read()
    if os.path.exists(source):
        with open(source, "rb") as file:
            return file.read()
    return None

def write_source_to_temp_file(source, suffix):
    raw = load_binary_source(source)
    if raw is None:
        return None
    handle = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    handle.write(raw)
    handle.flush()
    handle.close()
    return handle.name

def resolve_video_model_ref(payload):
    payload_model = str(payload.get("model", "") or "").strip()
    if payload_model:
        mapped = os.environ.get("AUTOGPU_VIDEO_MODEL_" + safe_env_suffix(payload_model), "").strip()
        if mapped:
            return mapped
    if payload_model in DEFAULT_VIDEO_MODEL_REFS:
        return DEFAULT_VIDEO_MODEL_REFS[payload_model]
    return payload_model

def resolve_tts_model_ref(payload):
    payload_model = str(payload.get("model", "") or "").strip()
    if payload_model:
        mapped = os.environ.get("AUTOGPU_TTS_MODEL_" + safe_env_suffix(payload_model), "").strip()
        if mapped:
            return mapped
    if payload_model in DEFAULT_TTS_MODEL_REFS:
        return DEFAULT_TTS_MODEL_REFS[payload_model]
    return payload_model

def resolve_video_image_source(payload):
    image = payload.get("image")
    if isinstance(image, str) and image.strip():
        return image.strip()
    images = payload.get("images")
    if isinstance(images, list):
        for item in images:
            if isinstance(item, str) and item.strip():
                return item.strip()
    return ""

def resolve_video_dimensions(payload, default_width=832, default_height=480):
    width = read_int_env("AUTOGPU_VIDEO_DEFAULT_WIDTH", default_width)
    height = read_int_env("AUTOGPU_VIDEO_DEFAULT_HEIGHT", default_height)
    for key in ("size", "resolution"):
        raw = str(payload.get(key, "") or "").strip().lower()
        match = re.match(r"^(\d{3,4})\s*[x*]\s*(\d{3,4})$", raw)
        if match:
            width = int(match.group(1))
            height = int(match.group(2))
            break
    image_source = resolve_video_image_source(payload)
    reference_image = load_reference_image(image_source)
    if reference_image is not None and not payload.get("size") and not payload.get("resolution"):
        image_width, image_height = reference_image.size
        max_pixels = 1280 * 720
        ratio = min(1.0, (max_pixels / float(image_width * image_height)) ** 0.5)
        width = max(256, int(image_width * ratio))
        height = max(256, int(image_height * ratio))
    aspect_ratio = str(payload.get("aspect_ratio", "") or "").strip()
    match = re.match(r"^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$", aspect_ratio)
    if match and not payload.get("size") and not payload.get("resolution"):
        ratio_width = float(match.group(1))
        ratio_height = float(match.group(2))
        if ratio_width > 0 and ratio_height > 0:
            pixels = min(width * height, 1280 * 720)
            width = int((pixels * ratio_width / ratio_height) ** 0.5)
            height = int(width * ratio_height / ratio_width)
    return max(256, width), max(256, height)

def resolve_video_fps(payload):
    raw = payload.get("fps")
    if isinstance(raw, (int, float)) and raw > 0:
        return max(8, min(int(raw), 30))
    return max(8, min(read_int_env("AUTOGPU_VIDEO_DEFAULT_FPS", 16), 30))

def resolve_video_num_frames(payload, fps):
    raw = payload.get("num_frames")
    if isinstance(raw, (int, float)) and raw > 0:
        return max(9, min(int(raw), 161))
    duration = payload.get("duration")
    duration_seconds = float(duration) if isinstance(duration, (int, float)) and duration > 0 else float(read_int_env("AUTOGPU_VIDEO_DEFAULT_DURATION_SECONDS", 5))
    return max(9, min(int(duration_seconds * fps), 161))

def resolve_tts_input_text(payload):
    text = str(payload.get("input", "") or payload.get("text", "") or "").strip()
    if not text:
        raise RuntimeError("TTS_TEXT_REQUIRED")
    return text

def resolve_tts_reference_audio_source(payload):
    for key in ("reference_audio_url", "prompt_audio_url", "audio_url"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""

def resolve_tts_reference_text(payload):
    return str(
        payload.get("reference_text", "")
        or payload.get("prompt_text", "")
        or os.environ.get("AUTOGPU_TTS_REFERENCE_TEXT", "")
    ).strip()

def resolve_tts_instruction(payload):
    return str(payload.get("instruction", "") or payload.get("emotion_prompt", "") or "").strip()

def resolve_image_model_ref(payload):
    payload_model = str(payload.get("model", "") or "").strip()
    if payload_model:
        mapped = os.environ.get("AUTOGPU_IMAGE_MODEL_" + safe_env_suffix(payload_model), "").strip()
        if mapped:
            return mapped
    configured = os.environ.get("AUTOGPU_IMAGE_DIFFUSERS_MODEL", "").strip()
    if configured:
        return configured
    if payload_model in DEFAULT_IMAGE_MODEL_REFS:
        return DEFAULT_IMAGE_MODEL_REFS[payload_model]
    return payload_model

def load_reference_image(value):
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        from PIL import Image
    except Exception as error:
        raise RuntimeError("backend_dependency_missing: 请在 AutoDL 镜像中安装 pillow") from error
    raw = load_binary_source(value)
    if raw is None:
        return None
    return Image.open(io.BytesIO(raw)).convert("RGB")

def load_image_pipeline(payload):
    global IMAGE_PIPELINE
    global IMAGE_PIPELINE_KEY
    global IMAGE_PIPELINE_MODE
    global IMAGE_DEVICE
    model_ref = resolve_image_model_ref(payload)
    if not model_ref:
        raise RuntimeError("AUTOGPU_IMAGE_DIFFUSERS_MODEL_REQUIRED")
    reference_image = resolve_video_image_source(payload)
    pipeline_mode = "image2image" if reference_image else "text2image"
    pipeline_cache_key = model_ref + "::" + pipeline_mode
    if IMAGE_PIPELINE is not None and IMAGE_PIPELINE_KEY == pipeline_cache_key:
        return IMAGE_PIPELINE
    try:
        import torch
        from diffusers import AutoPipelineForImage2Image, AutoPipelineForText2Image, DiffusionPipeline
    except Exception as error:
        raise RuntimeError("backend_dependency_missing: 请在 AutoDL 镜像中安装 torch、diffusers、transformers、accelerate、safetensors") from error
    device = "cuda" if torch.cuda.is_available() else "cpu"
    dtype_name = os.environ.get("AUTOGPU_IMAGE_DIFFUSERS_DTYPE", "float16").strip().lower()
    torch_dtype = None
    if dtype_name == "float16" and device == "cuda":
        torch_dtype = torch.float16
    elif dtype_name == "bfloat16" and device == "cuda":
        torch_dtype = torch.bfloat16
    local_only = os.environ.get("AUTOGPU_IMAGE_DIFFUSERS_LOCAL_FILES_ONLY", "").strip().lower() in ("1", "true", "yes")
    kwargs = {}
    if torch_dtype is not None:
        kwargs["torch_dtype"] = torch_dtype
    if local_only:
        kwargs["local_files_only"] = True
    loader = AutoPipelineForImage2Image if pipeline_mode == "image2image" else AutoPipelineForText2Image
    try:
        pipeline = loader.from_pretrained(model_ref, **kwargs)
    except Exception:
        pipeline = DiffusionPipeline.from_pretrained(model_ref, **kwargs)
    if hasattr(pipeline, "to"):
        pipeline = pipeline.to(device)
    if hasattr(pipeline, "enable_attention_slicing"):
        pipeline.enable_attention_slicing()
    IMAGE_PIPELINE = pipeline
    IMAGE_PIPELINE_KEY = pipeline_cache_key
    IMAGE_PIPELINE_MODE = pipeline_mode
    IMAGE_DEVICE = device
    return IMAGE_PIPELINE

def render_pipeline_kwargs(pipeline, payload):
    prompt = str(payload.get("prompt", "") or "").strip()
    if not prompt:
        raise RuntimeError("IMAGE_PROMPT_REQUIRED")
    width, height = resolve_dimensions(payload)
    steps = read_int_env("AUTOGPU_IMAGE_DEFAULT_STEPS", 28)
    guidance_scale = read_float_env("AUTOGPU_IMAGE_DEFAULT_GUIDANCE_SCALE", 3.5)
    negative_prompt = str(payload.get("negative_prompt", "") or os.environ.get("AUTOGPU_IMAGE_NEGATIVE_PROMPT", "")).strip()
    seed_raw = payload.get("seed", None)
    seed = read_int_env("AUTOGPU_IMAGE_SEED", -1)
    if isinstance(seed_raw, int):
        seed = seed_raw
    try:
        signature = inspect.signature(pipeline.__call__)
        parameter_names = set(signature.parameters.keys())
        accepts_kwargs = any(item.kind == inspect.Parameter.VAR_KEYWORD for item in signature.parameters.values())
    except Exception:
        parameter_names = set()
        accepts_kwargs = True
    candidates = {
        "prompt": prompt,
        "negative_prompt": negative_prompt,
        "num_inference_steps": steps,
        "guidance_scale": guidance_scale,
        "width": width,
        "height": height,
    }
    image_source = payload.get("image") or (payload.get("images")[0] if isinstance(payload.get("images"), list) and payload.get("images") else "")
    reference_image = load_reference_image(image_source)
    if reference_image is not None:
        candidates["image"] = reference_image
    if seed >= 0:
        try:
            import torch
            candidates["generator"] = torch.Generator(device=IMAGE_DEVICE).manual_seed(seed)
        except Exception:
            pass
    return {
        key: value
        for key, value in candidates.items()
        if value not in ("", None) and (accepts_kwargs or key in parameter_names)
    }

def call_builtin_image_backend(payload):
    pipeline = load_image_pipeline(payload)
    result = pipeline(**render_pipeline_kwargs(pipeline, payload))
    images = getattr(result, "images", None)
    if not images:
        raise RuntimeError("图片后端没有返回图片")
    buffer = io.BytesIO()
    images[0].save(buffer, format="PNG")
    data_url = "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")
    return {
        "created": int(time.time()),
        "data": [{"url": data_url}],
    }

def resolve_llm_model_ref(payload):
    payload_model = str(payload.get("model", "") or "").strip()
    if payload_model:
        mapped = os.environ.get("AUTOGPU_LLM_MODEL_" + safe_env_suffix(payload_model), "").strip()
        if mapped:
            return mapped
    configured = os.environ.get("AUTOGPU_LLM_TRANSFORMERS_MODEL", "").strip()
    if configured:
        return configured
    if payload_model in DEFAULT_LLM_MODEL_REFS:
        return DEFAULT_LLM_MODEL_REFS[payload_model]
    return DEFAULT_LLM_MODEL_REFS["qwen3-8b-instruct"]

def torch_dtype_from_env(torch):
    dtype_name = os.environ.get("AUTOGPU_LLM_DTYPE", "auto").strip().lower()
    if dtype_name == "float16":
        return torch.float16
    if dtype_name == "bfloat16":
        return torch.bfloat16
    if dtype_name == "float32":
        return torch.float32
    return "auto"

def load_llm_model(payload):
    global LLM_MODEL
    global LLM_TOKENIZER
    global LLM_MODEL_KEY
    model_ref = resolve_llm_model_ref(payload)
    if LLM_MODEL is not None and LLM_TOKENIZER is not None and LLM_MODEL_KEY == model_ref:
        return LLM_MODEL, LLM_TOKENIZER
    try:
        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer
    except Exception as error:
        raise RuntimeError("backend_dependency_missing: 请在 AutoDL 镜像中安装 torch、transformers、accelerate、safetensors") from error
    local_only = os.environ.get("AUTOGPU_LLM_LOCAL_FILES_ONLY", "").strip().lower() in ("1", "true", "yes")
    tokenizer = AutoTokenizer.from_pretrained(
        model_ref,
        trust_remote_code=True,
        local_files_only=local_only,
    )
    kwargs = {
        "trust_remote_code": True,
        "local_files_only": local_only,
        "torch_dtype": torch_dtype_from_env(torch),
    }
    if torch.cuda.is_available():
        kwargs["device_map"] = "auto"
    model = AutoModelForCausalLM.from_pretrained(model_ref, **kwargs)
    if not torch.cuda.is_available() and hasattr(model, "to"):
        model = model.to("cpu")
    if hasattr(model, "eval"):
        model.eval()
    LLM_MODEL = model
    LLM_TOKENIZER = tokenizer
    LLM_MODEL_KEY = model_ref
    return LLM_MODEL, LLM_TOKENIZER

def normalize_message_content(content):
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict):
                text = item.get("text") or item.get("content")
                if isinstance(text, str):
                    parts.append(text)
        return "\n".join(parts)
    if isinstance(content, dict):
        text = content.get("text") or content.get("content")
        return text if isinstance(text, str) else ""
    return ""

def render_llm_prompt(payload, tokenizer):
    messages = payload.get("messages")
    if isinstance(messages, list) and messages:
        normalized = []
        for message in messages:
            if not isinstance(message, dict):
                continue
            role = str(message.get("role", "user") or "user")
            content = normalize_message_content(message.get("content", ""))
            normalized.append({"role": role, "content": content})
        if normalized and hasattr(tokenizer, "apply_chat_template"):
            try:
                return tokenizer.apply_chat_template(normalized, tokenize=False, add_generation_prompt=True)
            except Exception:
                pass
        if normalized:
            return "\n".join([item["role"] + ": " + item["content"] for item in normalized]) + "\nassistant: "
    prompt = str(payload.get("prompt", "") or payload.get("input", "") or "").strip()
    if not prompt:
        raise RuntimeError("LLM_PROMPT_REQUIRED")
    return prompt

def read_generation_int(payload, key, env_name, default_value):
    value = payload.get(key)
    if isinstance(value, int) and value > 0:
        return value
    if isinstance(value, float) and value > 0:
        return int(value)
    return read_int_env(env_name, default_value)

def read_generation_float(payload, key, default_value):
    value = payload.get(key)
    if isinstance(value, (int, float)):
        return float(value)
    return default_value

def call_builtin_llm_backend(payload):
    import torch
    model, tokenizer = load_llm_model(payload)
    prompt = render_llm_prompt(payload, tokenizer)
    inputs = tokenizer(prompt, return_tensors="pt")
    try:
        device = next(model.parameters()).device
        inputs = {key: value.to(device) for key, value in inputs.items()}
    except Exception:
        pass
    max_new_tokens = read_generation_int(payload, "max_tokens", "AUTOGPU_LLM_MAX_NEW_TOKENS", 1024)
    temperature = read_generation_float(payload, "temperature", 0.6)
    top_p = read_generation_float(payload, "top_p", 0.95)
    generate_kwargs = {
        "max_new_tokens": max_new_tokens,
        "do_sample": temperature > 0,
        "temperature": max(0.01, temperature),
        "top_p": top_p,
        "pad_token_id": tokenizer.eos_token_id,
    }
    with torch.inference_mode():
        output_ids = model.generate(**inputs, **generate_kwargs)
    input_length = inputs["input_ids"].shape[-1]
    generated_ids = output_ids[0][input_length:]
    text = tokenizer.decode(generated_ids, skip_special_tokens=True).strip()
    return {
        "id": "chatcmpl-" + str(uuid.uuid4()),
        "object": "chat.completion",
        "created": int(time.time()),
        "model": str(payload.get("model", "") or LLM_MODEL_KEY or "autogpu-llm"),
        "choices": [{
            "index": 0,
            "message": {"role": "assistant", "content": text},
            "finish_reason": "stop",
        }],
    }

def filter_callable_kwargs(callable_obj, candidates):
    try:
        signature = inspect.signature(callable_obj)
        parameter_names = set(signature.parameters.keys())
        accepts_kwargs = any(item.kind == inspect.Parameter.VAR_KEYWORD for item in signature.parameters.values())
    except Exception:
        parameter_names = set()
        accepts_kwargs = True
    return {
        key: value
        for key, value in candidates.items()
        if value not in ("", None) and (accepts_kwargs or key in parameter_names)
    }

def video_torch_dtype_from_env(torch):
    dtype_name = os.environ.get("AUTOGPU_VIDEO_DTYPE", "bfloat16").strip().lower()
    if dtype_name == "float16":
        return torch.float16
    if dtype_name == "float32":
        return torch.float32
    return torch.bfloat16 if hasattr(torch, "bfloat16") else torch.float16

def resolve_video_backend_name(payload):
    payload_model = str(payload.get("model", "") or "").strip()
    backend_kind = video_backend_kind()
    if backend_kind not in ("auto", "diffusers"):
        return ""
    if payload_model.startswith("ltx-video-"):
        return "ltx"
    if payload_model.startswith("wan2.2-"):
        return "wan"
    return ""

def build_video_output_path(task_id):
    return os.path.join(OUTPUT_DIR, task_id + ".mp4")

def resolve_video_steps(payload):
    return read_generation_int(payload, "num_inference_steps", "AUTOGPU_VIDEO_DEFAULT_STEPS", 30)

def resolve_video_guidance_scale(payload):
    return read_generation_float(payload, "guidance_scale", read_float_env("AUTOGPU_VIDEO_DEFAULT_GUIDANCE_SCALE", 4.0))

def render_video_prompt(payload):
    prompt = str(payload.get("prompt", "") or "").strip()
    if not prompt:
        raise RuntimeError("VIDEO_PROMPT_REQUIRED")
    return prompt

def call_builtin_ltx_video_backend(payload, task_id):
    model_ref = resolve_video_model_ref(payload)
    image_source = resolve_video_image_source(payload)
    pipeline_kind = "condition" if image_source else "text"
    cache_key = "ltx::" + pipeline_kind + "::" + model_ref
    cached = VIDEO_PIPELINES.get(cache_key)
    if cached:
        pipeline = cached["pipeline"]
        device = cached["device"]
    else:
        try:
            import torch
            from diffusers import LTXConditionPipeline, LTXPipeline
        except Exception as error:
            raise RuntimeError("backend_dependency_missing: 请在 AutoDL 镜像中安装 torch、diffusers、transformers、accelerate、safetensors、imageio") from error
        device = "cuda" if torch.cuda.is_available() else "cpu"
        kwargs = {
            "torch_dtype": video_torch_dtype_from_env(torch),
        }
        if os.environ.get("AUTOGPU_VIDEO_LOCAL_FILES_ONLY", "").strip().lower() in ("1", "true", "yes"):
            kwargs["local_files_only"] = True
        loader = LTXConditionPipeline if image_source else LTXPipeline
        pipeline = loader.from_pretrained(model_ref, **kwargs)
        if torch.cuda.is_available() and hasattr(pipeline, "to"):
            pipeline = pipeline.to(device)
        elif hasattr(pipeline, "to"):
            pipeline = pipeline.to("cpu")
        if hasattr(pipeline, "enable_attention_slicing"):
            pipeline.enable_attention_slicing()
        VIDEO_PIPELINES[cache_key] = {
            "pipeline": pipeline,
            "device": device,
        }
    try:
        import torch
        from diffusers.utils import export_to_video
    except Exception as error:
        raise RuntimeError("backend_dependency_missing: 请在 AutoDL 镜像中安装 torch、diffusers、imageio") from error
    prompt = render_video_prompt(payload)
    fps = resolve_video_fps(payload)
    width, height = resolve_video_dimensions(payload, 768, 432)
    divisor = getattr(pipeline, "vae_spatial_compression_ratio", 32) or 32
    width = round_to_multiple(width, divisor)
    height = round_to_multiple(height, divisor)
    candidates = {
        "prompt": prompt,
        "width": width,
        "height": height,
        "num_frames": resolve_video_num_frames(payload, fps),
        "num_inference_steps": resolve_video_steps(payload),
        "guidance_scale": resolve_video_guidance_scale(payload),
    }
    reference_image = load_reference_image(image_source)
    if reference_image is not None:
        candidates["image"] = reference_image
    seed = payload.get("seed")
    if isinstance(seed, int) and seed >= 0:
        generator_device = cached["device"] if cached else ("cuda" if torch.cuda.is_available() else "cpu")
        candidates["generator"] = torch.Generator(device=generator_device).manual_seed(seed)
    result = pipeline(**filter_callable_kwargs(pipeline.__call__, candidates))
    frames = getattr(result, "frames", None)
    if not frames:
        raise RuntimeError("视频后端没有返回帧数据")
    output_path = build_video_output_path(task_id)
    export_to_video(frames[0], output_path, fps=fps)
    return output_path

def call_builtin_wan_video_backend(payload, task_id):
    model_ref = resolve_video_model_ref(payload)
    image_source = resolve_video_image_source(payload)
    payload_model = str(payload.get("model", "") or "").strip()
    pipeline_kind = "i2v" if image_source and "i2v" in payload_model else "ti2v"
    cache_key = "wan::" + pipeline_kind + "::" + model_ref
    cached = VIDEO_PIPELINES.get(cache_key)
    if cached:
        pipeline = cached["pipeline"]
        device = cached["device"]
    else:
        try:
            import torch
            from diffusers import AutoencoderKLWan, WanImageToVideoPipeline, WanPipeline
        except Exception as error:
            raise RuntimeError("backend_dependency_missing: 请在 AutoDL 镜像中安装 torch、diffusers、transformers、accelerate、safetensors、imageio") from error
        device = "cuda" if torch.cuda.is_available() else "cpu"
        kwargs = {
            "torch_dtype": video_torch_dtype_from_env(torch),
        }
        if os.environ.get("AUTOGPU_VIDEO_LOCAL_FILES_ONLY", "").strip().lower() in ("1", "true", "yes"):
            kwargs["local_files_only"] = True
        vae = AutoencoderKLWan.from_pretrained(model_ref, subfolder="vae", **kwargs)
        loader = WanImageToVideoPipeline if image_source and "i2v" in payload_model else WanPipeline
        pipeline = loader.from_pretrained(model_ref, vae=vae, **kwargs)
        if torch.cuda.is_available() and hasattr(pipeline, "to"):
            pipeline = pipeline.to(device)
        elif hasattr(pipeline, "to"):
            pipeline = pipeline.to("cpu")
        if hasattr(pipeline, "enable_attention_slicing"):
            pipeline.enable_attention_slicing()
        VIDEO_PIPELINES[cache_key] = {
            "pipeline": pipeline,
            "device": device,
        }
    try:
        import torch
        from diffusers.utils import export_to_video
    except Exception as error:
        raise RuntimeError("backend_dependency_missing: 请在 AutoDL 镜像中安装 torch、diffusers、imageio") from error
    prompt = render_video_prompt(payload)
    fps = resolve_video_fps(payload)
    width, height = resolve_video_dimensions(payload, 832, 480)
    width = round_to_multiple(width, 16)
    height = round_to_multiple(height, 16)
    candidates = {
        "prompt": prompt,
        "negative_prompt": str(payload.get("negative_prompt", "") or os.environ.get("AUTOGPU_VIDEO_NEGATIVE_PROMPT", "")).strip(),
        "width": width,
        "height": height,
        "num_frames": resolve_video_num_frames(payload, fps),
        "num_inference_steps": resolve_video_steps(payload),
        "guidance_scale": resolve_video_guidance_scale(payload),
    }
    reference_image = load_reference_image(image_source)
    if reference_image is not None:
        candidates["image"] = reference_image
    seed = payload.get("seed")
    if isinstance(seed, int) and seed >= 0:
        generator_device = cached["device"] if cached else ("cuda" if torch.cuda.is_available() else "cpu")
        candidates["generator"] = torch.Generator(device=generator_device).manual_seed(seed)
    result = pipeline(**filter_callable_kwargs(pipeline.__call__, candidates))
    frames = getattr(result, "frames", None)
    if not frames:
        raise RuntimeError("视频后端没有返回帧数据")
    output_path = build_video_output_path(task_id)
    export_to_video(frames[0], output_path, fps=fps)
    return output_path

def start_builtin_video_task(payload):
    backend_name = resolve_video_backend_name(payload)
    if not backend_name:
        raise BackendMissing("VIDEO")
    task_id = str(uuid.uuid4())
    TASKS[task_id] = {
        "id": task_id,
        "status": "pending",
    }
    def _runner():
        TASKS[task_id] = {
            "id": task_id,
            "status": "running",
        }
        try:
            if backend_name == "ltx":
                output_path = call_builtin_ltx_video_backend(payload, task_id)
            else:
                output_path = call_builtin_wan_video_backend(payload, task_id)
            TASKS[task_id] = {
                "id": task_id,
                "status": "completed",
                "output_path": output_path,
            }
        except Exception as error:
            TASKS[task_id] = {
                "id": task_id,
                "status": "failed",
                "error": {"message": str(error)},
            }
    threading.Thread(target=_runner, daemon=True).start()
    return TASKS[task_id]

def resolve_tts_backend_name(payload):
    payload_model = str(payload.get("model", "") or "").strip()
    backend_kind = tts_backend_kind()
    if backend_kind not in ("auto", "builtin", "local"):
        return ""
    if payload_model == "f5-tts-v1":
        return "f5-tts"
    if payload_model == "cosyvoice3-0.5b":
        return "cosyvoice"
    return ""

def extract_first_audio_file(root_dir):
    candidates = []
    for root, _, files in os.walk(root_dir):
        for name in files:
            if name.lower().endswith((".wav", ".mp3", ".flac", ".ogg", ".m4a")):
                full_path = os.path.join(root, name)
                candidates.append((os.path.getmtime(full_path), full_path))
    if not candidates:
        return None
    candidates.sort(reverse=True)
    return candidates[0][1]

def call_builtin_f5_tts_backend(payload):
    try:
        import shutil
    except Exception as error:
        raise RuntimeError("backend_dependency_missing: Python 缺少 shutil") from error
    command = shutil.which("f5-tts_infer-cli")
    if not command:
        raise RuntimeError("backend_dependency_missing: 请在 AutoDL 镜像中安装 f5-tts")
    input_text = resolve_tts_input_text(payload)
    reference_audio_source = resolve_tts_reference_audio_source(payload)
    if not reference_audio_source:
        raise RuntimeError("TTS_REFERENCE_AUDIO_REQUIRED")
    reference_audio_path = write_source_to_temp_file(reference_audio_source, ".wav")
    if not reference_audio_path:
        raise RuntimeError("TTS_REFERENCE_AUDIO_INVALID")
    temp_dir = tempfile.mkdtemp(prefix="autogpu-f5-")
    model_ref = resolve_tts_model_ref(payload) or DEFAULT_TTS_MODEL_REFS["f5-tts-v1"]
    reference_text = resolve_tts_reference_text(payload)
    command_args = [
        command,
        "--model",
        model_ref,
        "--ref_audio",
        reference_audio_path,
        "--gen_text",
        input_text,
    ]
    if reference_text:
        command_args.extend(["--ref_text", reference_text])
    completed = subprocess.run(
        command_args,
        cwd=temp_dir,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        timeout=backend_timeout("TTS"),
    )
    if completed.returncode != 0:
        raise RuntimeError((completed.stderr or completed.stdout or "f5-tts failed")[-600:])
    output_file = extract_first_audio_file(temp_dir)
    if not output_file:
        raise RuntimeError("F5_TTS_OUTPUT_MISSING")
    with open(output_file, "rb") as file:
        return normalize_binary_payload("audio/wav", file.read())

def load_cosyvoice_model(payload):
    model_ref = resolve_tts_model_ref(payload) or DEFAULT_TTS_MODEL_REFS["cosyvoice3-0.5b"]
    cache_key = "cosyvoice::" + model_ref
    if cache_key in TTS_MODELS:
        return TTS_MODELS[cache_key]
    repo_dir = os.environ.get("AUTOGPU_TTS_COSYVOICE_REPO_DIR", "").strip()
    if repo_dir and os.path.isdir(repo_dir):
        if repo_dir not in sys.path:
            sys.path.insert(0, repo_dir)
        matcha_dir = os.path.join(repo_dir, "third_party", "Matcha-TTS")
        if os.path.isdir(matcha_dir) and matcha_dir not in sys.path:
            sys.path.insert(0, matcha_dir)
    try:
        from cosyvoice.cli.cosyvoice import AutoModel
    except Exception as error:
        raise RuntimeError("backend_dependency_missing: 请在 AutoDL 镜像中安装或挂载 CosyVoice") from error
    model = AutoModel(model_dir=model_ref)
    TTS_MODELS[cache_key] = model
    return model

def call_builtin_cosyvoice_backend(payload):
    model = load_cosyvoice_model(payload)
    input_text = resolve_tts_input_text(payload)
    reference_audio_source = resolve_tts_reference_audio_source(payload)
    if not reference_audio_source:
        raise RuntimeError("TTS_REFERENCE_AUDIO_REQUIRED")
    reference_audio_path = write_source_to_temp_file(reference_audio_source, ".wav")
    if not reference_audio_path:
        raise RuntimeError("TTS_REFERENCE_AUDIO_INVALID")
    instruction = resolve_tts_instruction(payload)
    reference_text = resolve_tts_reference_text(payload)
    try:
        if instruction and hasattr(model, "inference_instruct2"):
            output = model.inference_instruct2(input_text, instruction, prompt_audio_16k=reference_audio_path, stream=False)
        elif hasattr(model, "inference_cross_lingual"):
            output = model.inference_cross_lingual(input_text, prompt_audio_16k=reference_audio_path, stream=False)
        elif hasattr(model, "inference_zero_shot"):
            if not reference_text:
                raise RuntimeError("COSYVOICE_REFERENCE_TEXT_REQUIRED")
            output = model.inference_zero_shot(input_text, reference_text, prompt_audio_16k=reference_audio_path, stream=False)
        else:
            raise RuntimeError("COSYVOICE_INFERENCE_METHOD_MISSING")
    except TypeError:
        if not reference_text or not hasattr(model, "inference_zero_shot"):
            raise
        output = model.inference_zero_shot(input_text, reference_text, prompt_audio_16k=reference_audio_path, stream=False)
    item = next(iter(output), None)
    if not item or "tts_speech" not in item:
        raise RuntimeError("COSYVOICE_OUTPUT_MISSING")
    try:
        import soundfile as sf
    except Exception as error:
        raise RuntimeError("backend_dependency_missing: 请在 AutoDL 镜像中安装 soundfile") from error
    speech = item["tts_speech"]
    if hasattr(speech, "detach"):
        speech = speech.detach().cpu().numpy()
    if hasattr(speech, "squeeze"):
        speech = speech.squeeze()
    buffer = io.BytesIO()
    sample_rate = getattr(model, "sample_rate", 22050)
    sf.write(buffer, speech, sample_rate, format="WAV")
    return normalize_binary_payload("audio/wav", buffer.getvalue())

def call_builtin_tts_backend(payload):
    backend_name = resolve_tts_backend_name(payload)
    if backend_name == "f5-tts":
        return call_builtin_f5_tts_backend(payload)
    if backend_name == "cosyvoice":
        return call_builtin_cosyvoice_backend(payload)
    raise BackendMissing("TTS")

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

    if kind == "IMAGE" and image_backend_kind() in ("auto", "diffusers"):
        return call_builtin_image_backend(payload)

    if kind == "TTS" and resolve_tts_backend_name(payload):
        return call_builtin_tts_backend(payload)

    if kind == "LLM" and llm_backend_kind() == "transformers":
        return call_builtin_llm_backend(payload)

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

def call_llm_backend(payload):
    result = call_direct_backend("LLM", payload)
    if isinstance(result, dict) and isinstance(result.get("choices"), list):
        return result
    text = first_value(result, ("text", "content", "output", "answer", "response", "message"))
    if not text and isinstance(result, str):
        text = result
    if not text:
        raise RuntimeError("文字后端没有返回文本")
    model = str(payload.get("model", "") or os.environ.get("AUTOGPU_MODEL_BUNDLE", "autogpu-llm")).strip()
    return {
        "id": "chatcmpl-" + str(uuid.uuid4()),
        "object": "chat.completion",
        "created": int(time.time()),
        "model": model,
        "choices": [{
            "index": 0,
            "message": {"role": "assistant", "content": text},
            "finish_reason": "stop",
        }],
    }

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
    if stored_task.get("output_path"):
        return stored_task
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

def build_request_base_url(handler):
    forwarded_proto = handler.headers.get("x-forwarded-proto", "").split(",")[0].strip()
    if forwarded_proto:
        scheme = forwarded_proto
    else:
        scheme = "https" if handler.headers.get("x-forwarded-port", "") == "443" else "http"
    host = handler.headers.get("x-forwarded-host", "").split(",")[0].strip() or handler.headers.get("host", "").strip()
    if not host:
        host = "127.0.0.1:" + str(os.environ.get("AUTOGPU_WORKER_PORT", "6006"))
    return scheme + "://" + host

def build_video_file_url(handler, task_id):
    return build_request_base_url(handler).rstrip("/") + "/v1/autogpu/videos/" + quote(task_id, safe="") + "/file"

def backend_presence(kind):
    available_model_types = [model["type"] for model in selected_models()]
    if kind == "IMAGE" and image_backend_kind() in ("auto", "diffusers"):
        return "image" in available_model_types
    if kind == "VIDEO" and video_backend_kind() in ("auto", "diffusers"):
        return "video" in available_model_types
    if kind == "TTS" and tts_backend_kind() in ("auto", "builtin", "local"):
        return "audio" in available_model_types
    if kind == "LLM" and llm_backend_kind() == "transformers":
        return "llm" in available_model_types
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
                "message": "AutoGPU Worker 已启动，但还没有准备好 " + kind + " 本地推理后端、直接 API 或脚本。"
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
            if resolve_video_backend_name(payload):
                stored = start_builtin_video_task(payload)
                self._json(200, stored)
                return
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
            if next_status.get("output_path"):
                next_status = {
                    **next_status,
                    "video_url": build_video_file_url(self, task_id),
                }
            TASKS[task_id] = next_status
            self._json(200, next_status)
        except Exception as error:
            self._backend_error(error)

    def _handle_video_file(self, task_id):
        stored = TASKS.get(task_id)
        if not stored or not stored.get("output_path") or not os.path.exists(stored["output_path"]):
            self._json(404, {"ok": False, "error": "not_found"})
            return
        with open(stored["output_path"], "rb") as file:
            self._bytes(200, "video/mp4", file.read())

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
                    "llm": backend_presence("LLM"),
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
        if path.startswith("/v1/autogpu/videos/") and path.endswith("/file"):
            task_id = path.rstrip("/").split("/")[-2]
            self._handle_video_file(task_id)
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
        if path in ("/v1/chat/completions", "/v1/completions"):
            try:
                self._json(200, call_llm_backend(read_json_body(self)))
            except BackendMissing as error:
                self._backend_missing(error.kind)
            except Exception as error:
                self._backend_error(error)
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

if [ "\${AUTOGPU_INSTALL_MODEL_DEPS:-1}" = "1" ]; then
  if ! python3 -m pip --version >/dev/null 2>&1; then
    apt-get update
    DEBIAN_FRONTEND=noninteractive apt-get install -y python3-pip
  fi
  python3 - <<'PY' || true
import importlib.util
import os
import shutil
import subprocess
import sys

required = []

def ensure_package(package_name, spec_name=None):
    if importlib.util.find_spec(spec_name or package_name) is None and package_name not in required:
        required.append(package_name)

image_backend = os.environ.get("AUTOGPU_IMAGE_BACKEND", "diffusers").strip().lower()
video_backend = os.environ.get("AUTOGPU_VIDEO_BACKEND", "auto").strip().lower()
tts_backend = os.environ.get("AUTOGPU_TTS_BACKEND", "auto").strip().lower()
llm_backend = os.environ.get("AUTOGPU_LLM_BACKEND", "transformers").strip().lower()

if llm_backend == "transformers" or image_backend in ("auto", "diffusers") or video_backend in ("auto", "diffusers"):
    ensure_package("transformers")
    ensure_package("accelerate")
    ensure_package("safetensors")
    ensure_package("sentencepiece")

if image_backend in ("auto", "diffusers") or video_backend in ("auto", "diffusers"):
    ensure_package("diffusers")
    ensure_package("pillow", "PIL")
    ensure_package("imageio")
    ensure_package("imageio-ffmpeg", "imageio_ffmpeg")

if tts_backend in ("auto", "builtin", "local"):
    ensure_package("soundfile")
    if shutil.which("f5-tts_infer-cli") is None:
        required.append("f5-tts")

if required:
    subprocess.check_call([sys.executable, "-m", "pip", "install", "-U", *required])
PY
  if [ -n "\${AUTOGPU_TTS_COSYVOICE_REPO_DIR:-}" ] && [ -f "\${AUTOGPU_TTS_COSYVOICE_REPO_DIR}/requirements.txt" ]; then
    python3 -m pip install -r "\${AUTOGPU_TTS_COSYVOICE_REPO_DIR}/requirements.txt" || true
  fi
fi

if command -v pkill >/dev/null 2>&1; then
  pkill -f "$WORKDIR/worker.py" >/dev/null 2>&1 || true
fi

nohup python3 "$WORKDIR/worker.py" > "$WORKDIR/worker.log" 2>&1 &
echo "AutoGPU Worker started on port $PORT with model bundle $MODEL_BUNDLE"
`.replaceAll('\\${', '${')
}
