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
    const payload = await response.json().catch(() => null) as { ok?: unknown; error?: unknown } | null
    return {
      healthy: response.ok && payload?.ok === true,
      unauthorized: response.status === 401 || response.status === 403,
      statusCode: response.status,
      message: typeof payload?.error === 'string' ? payload.error : response.statusText || null,
    }
  } catch (error) {
    return {
      healthy: false,
      unauthorized: false,
      statusCode: null,
      message: error instanceof Error ? error.message : 'worker_probe_failed',
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
    "starter": ["ltx-video-2b-distilled", "sdxl-sd35-medium", "qwen3-8b-instruct", "cosyvoice3-0.5b"],
    "balanced": ["wan2.2-ti2v-5b", "flux2-klein-4b", "qwen3-8b-instruct", "f5-tts-v1"],
    "advanced": ["wan2.2-i2v-a14b", "ltx-video-13b-fp8", "qwen-image-edit", "qwen3-32b-instruct", "indextts2", "fish-speech"],
}

def selected_models():
    bundle = os.environ.get("AUTOGPU_MODEL_BUNDLE", "default").strip()
    if bundle in MODEL_BUNDLES:
        return [MODEL_CATALOG[model_id] for model_id in MODEL_BUNDLES[bundle] if model_id in MODEL_CATALOG]
    if bundle and bundle != "default" and bundle in MODEL_CATALOG:
        return [MODEL_CATALOG[bundle]]
    return list(MODEL_CATALOG.values())

TASKS = {}
IMAGE_PIPELINE = None
IMAGE_PIPELINE_KEY = ""
IMAGE_DEVICE = "cpu"
LLM_MODEL = None
LLM_TOKENIZER = None
LLM_MODEL_KEY = ""
DEFAULT_IMAGE_MODEL_REFS = {
    "sdxl-sd35-medium": "stabilityai/stable-diffusion-xl-base-1.0",
}
DEFAULT_LLM_MODEL_REFS = {
    "qwen3-8b-instruct": "Qwen/Qwen3-8B",
    "qwen3-32b-instruct": "Qwen/Qwen3-32B",
}
# 支持环境变量：AUTOGPU_IMAGE_API_URL、AUTOGPU_VIDEO_API_URL、AUTOGPU_TTS_API_URL、AUTOGPU_LLM_BACKEND。
SUPPORTED_BACKEND_ENV_HINTS = (
    "AUTOGPU_IMAGE_API_URL",
    "AUTOGPU_VIDEO_API_URL",
    "AUTOGPU_TTS_API_URL",
    "AUTOGPU_LLM_API_URL",
    "AUTOGPU_LLM_BACKEND",
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
    return os.environ.get("AUTOGPU_IMAGE_BACKEND", "").strip().lower()

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
    source = value.strip()
    try:
        from PIL import Image
    except Exception as error:
        raise RuntimeError("backend_dependency_missing: 请在 AutoDL 镜像中安装 pillow") from error
    if source.startswith("data:"):
        marker = ";base64,"
        if marker not in source:
            return None
        raw = base64.b64decode(source.split(marker, 1)[1])
    elif source.startswith("http://") or source.startswith("https://"):
        with urllib.request.urlopen(source, timeout=60) as response:
            raw = response.read()
    elif os.path.exists(source):
        with open(source, "rb") as file:
            raw = file.read()
    else:
        return None
    return Image.open(io.BytesIO(raw)).convert("RGB")

def load_image_pipeline(payload):
    global IMAGE_PIPELINE
    global IMAGE_PIPELINE_KEY
    global IMAGE_DEVICE
    model_ref = resolve_image_model_ref(payload)
    if not model_ref:
        raise RuntimeError("AUTOGPU_IMAGE_DIFFUSERS_MODEL_REQUIRED")
    if IMAGE_PIPELINE is not None and IMAGE_PIPELINE_KEY == model_ref:
        return IMAGE_PIPELINE
    try:
        import torch
        from diffusers import DiffusionPipeline
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
    pipeline = DiffusionPipeline.from_pretrained(model_ref, **kwargs)
    if hasattr(pipeline, "to"):
        pipeline = pipeline.to(device)
    if hasattr(pipeline, "enable_attention_slicing"):
        pipeline.enable_attention_slicing()
    IMAGE_PIPELINE = pipeline
    IMAGE_PIPELINE_KEY = model_ref
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

    if kind == "IMAGE" and image_backend_kind() == "diffusers":
        return call_builtin_image_backend(payload)

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
    if kind == "IMAGE" and image_backend_kind() == "diffusers":
        return True
    if kind == "LLM" and llm_backend_kind() == "transformers":
        return True
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

if [ "\${AUTOGPU_INSTALL_MODEL_DEPS:-1}" = "1" ] && [ "\${AUTOGPU_LLM_BACKEND:-transformers}" = "transformers" ]; then
  if ! python3 -m pip --version >/dev/null 2>&1; then
    apt-get update
    DEBIAN_FRONTEND=noninteractive apt-get install -y python3-pip
  fi
  python3 - <<'PY' || true
import importlib.util
import subprocess
import sys

required = []
if importlib.util.find_spec("transformers") is None:
    required.extend(["transformers", "accelerate", "safetensors", "sentencepiece"])
if required:
    subprocess.check_call([sys.executable, "-m", "pip", "install", "-U", *required])
PY
fi

if command -v pkill >/dev/null 2>&1; then
  pkill -f "$WORKDIR/worker.py" >/dev/null 2>&1 || true
fi

nohup python3 "$WORKDIR/worker.py" > "$WORKDIR/worker.log" 2>&1 &
echo "AutoGPU Worker started on port $PORT with model bundle $MODEL_BUNDLE"
`.replaceAll('\\${', '${')
}
