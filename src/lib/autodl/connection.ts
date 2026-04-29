import { decryptApiKey, encryptApiKey } from '@/lib/crypto-utils'
import { isAutoDLProfileId, type AutoDLProfileId } from './catalog'

export type AutoDLPreferredPort = 6006 | 6008
export type AutoDLConnectionStatus = 'unconfigured' | 'configured' | 'verified' | 'verify_failed'
export type AutoDLProbeStatus = 'success' | 'failed'

export interface NormalizedAutoDLConnectionInput {
  apiToken?: string
  defaultProfileId?: AutoDLProfileId
  defaultImageUuid?: string | null
  preferredPort?: AutoDLPreferredPort
}

export interface AutoDLWorkerStartCommandInput {
  serverUrl: string
  workerSecret: string
  preferredPort: AutoDLPreferredPort
  modelBundle?: string | null
}

export interface AutoDLConnectionView {
  configured: boolean
  tokenMasked: string | null
  tokenUpdatedAt: string | null
  defaultProfileId: AutoDLProfileId
  defaultImageUuid: string | null
  preferredPort: AutoDLPreferredPort
  status: AutoDLConnectionStatus
  lastProbeStatus: AutoDLProbeStatus | null
  lastProbeMessage: string | null
  lastProbeAt: string | null
}

interface AutoDLConnectionRow {
  tokenCiphertext?: string | null
  tokenLast4?: string | null
  tokenUpdatedAt?: Date | string | null
  defaultProfileId?: string | null
  defaultImageUuid?: string | null
  preferredPort?: number | null
  status?: string | null
  lastProbeStatus?: string | null
  lastProbeMessage?: string | null
  lastProbeAt?: Date | string | null
}

function readTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

const AUTODL_DEFAULT_IMAGE_UUID_ENV_KEYS: Record<AutoDLProfileId, string> = {
  '5090-p': 'AUTODL_DEFAULT_IMAGE_UUID_5090_P',
  'pro6000-p': 'AUTODL_DEFAULT_IMAGE_UUID_PRO6000_P',
}

// AutoDL 官方公共基础镜像：PyTorch 2.0.0 / Python 3.8 / CUDA 11.8 / Ubuntu 22.04。
export const AUTODL_PUBLIC_BASE_IMAGE_UUID = 'base-image-l2t43iu6uk'

export function getAutoDLDefaultImageUuid(profileId?: AutoDLProfileId | null): string {
  const profileImageUuid = profileId
    ? readTrimmedString(process.env[AUTODL_DEFAULT_IMAGE_UUID_ENV_KEYS[profileId]])
    : ''
  return profileImageUuid || readTrimmedString(process.env.AUTODL_DEFAULT_IMAGE_UUID) || AUTODL_PUBLIC_BASE_IMAGE_UUID
}

function toIsoString(value: Date | string | null | undefined): string | null {
  if (!value) return null
  if (value instanceof Date) return value.toISOString()
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString()
}

export function normalizeAutoDLTokenInput(value: unknown): string {
  const token = readTrimmedString(value)
  if (!token) {
    throw new Error('AUTODL_TOKEN_REQUIRED')
  }
  return token
}

export function maskAutoDLToken(token: string): string {
  const normalized = normalizeAutoDLTokenInput(token)
  return `••••${normalized.slice(-4)}`
}

export function normalizeAutoDLPreferredPort(value: unknown): AutoDLPreferredPort {
  const port = typeof value === 'number' ? value : Number(readTrimmedString(value))
  if (port === 6006 || port === 6008) return port
  throw new Error('AUTODL_PORT_INVALID')
}

export function normalizeAutoDLConnectionInput(input: unknown): NormalizedAutoDLConnectionInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('AUTODL_CONNECTION_PAYLOAD_INVALID')
  }

  const raw = input as Record<string, unknown>
  const normalized: NormalizedAutoDLConnectionInput = {}

  if ('apiToken' in raw) {
    normalized.apiToken = normalizeAutoDLTokenInput(raw.apiToken)
  }

  if ('defaultProfileId' in raw) {
    const profileId = readTrimmedString(raw.defaultProfileId)
    if (!isAutoDLProfileId(profileId)) {
      throw new Error('AUTODL_PROFILE_INVALID')
    }
    normalized.defaultProfileId = profileId
  }

  if ('defaultImageUuid' in raw) {
    const imageUuid = readTrimmedString(raw.defaultImageUuid)
    normalized.defaultImageUuid = imageUuid || null
  }

  if ('preferredPort' in raw) {
    normalized.preferredPort = normalizeAutoDLPreferredPort(raw.preferredPort)
  }

  return normalized
}

export function encryptAutoDLToken(token: string): { ciphertext: string; last4: string } {
  const normalized = normalizeAutoDLTokenInput(token)
  return {
    ciphertext: encryptApiKey(normalized),
    last4: normalized.slice(-4),
  }
}

export function decryptAutoDLToken(ciphertext: string): string {
  return decryptApiKey(ciphertext)
}

function shellValue(value: string): string {
  if (/^[A-Za-z0-9._~:/?#\[\]@!$&()*+,;=%-]+$/.test(value)) {
    return value
  }
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function normalizeServerUrl(value: string): string {
  const rawUrl = readTrimmedString(value)
  if (!rawUrl) throw new Error('AUTODL_SERVER_URL_REQUIRED')
  const parsed = new URL(rawUrl)
  return parsed.toString().replace(/\/+$/, '')
}

const AUTODL_WORKER_BACKEND_ENV_KEYS = [
  'AUTOGPU_IMAGE_BACKEND',
  'AUTOGPU_IMAGE_API_URL',
  'AUTOGPU_IMAGE_API_KEY',
  'AUTOGPU_IMAGE_HEADERS_JSON',
  'AUTOGPU_IMAGE_SCRIPT',
  'AUTOGPU_IMAGE_TIMEOUT_SECONDS',
  'AUTOGPU_IMAGE_DIFFUSERS_MODEL',
  'AUTOGPU_IMAGE_DIFFUSERS_DTYPE',
  'AUTOGPU_IMAGE_DIFFUSERS_LOCAL_FILES_ONLY',
  'AUTOGPU_IMAGE_DEFAULT_WIDTH',
  'AUTOGPU_IMAGE_DEFAULT_HEIGHT',
  'AUTOGPU_IMAGE_DEFAULT_STEPS',
  'AUTOGPU_IMAGE_DEFAULT_GUIDANCE_SCALE',
  'AUTOGPU_IMAGE_MAX_PIXELS',
  'AUTOGPU_IMAGE_NEGATIVE_PROMPT',
  'AUTOGPU_IMAGE_SEED',
  'AUTOGPU_IMAGE_MODEL_FLUX2_KLEIN_4B',
  'AUTOGPU_IMAGE_MODEL_QWEN_IMAGE_EDIT',
  'AUTOGPU_IMAGE_MODEL_SDXL_SD35_MEDIUM',
  'AUTOGPU_VIDEO_API_URL',
  'AUTOGPU_VIDEO_API_KEY',
  'AUTOGPU_VIDEO_HEADERS_JSON',
  'AUTOGPU_VIDEO_BACKEND',
  'AUTOGPU_VIDEO_SCRIPT',
  'AUTOGPU_VIDEO_STATUS_API_URL',
  'AUTOGPU_VIDEO_STATUS_METHOD',
  'AUTOGPU_VIDEO_TIMEOUT_SECONDS',
  'AUTOGPU_VIDEO_DTYPE',
  'AUTOGPU_VIDEO_LOCAL_FILES_ONLY',
  'AUTOGPU_VIDEO_DEFAULT_WIDTH',
  'AUTOGPU_VIDEO_DEFAULT_HEIGHT',
  'AUTOGPU_VIDEO_DEFAULT_DURATION_SECONDS',
  'AUTOGPU_VIDEO_DEFAULT_FPS',
  'AUTOGPU_VIDEO_DEFAULT_STEPS',
  'AUTOGPU_VIDEO_DEFAULT_GUIDANCE_SCALE',
  'AUTOGPU_VIDEO_NEGATIVE_PROMPT',
  'AUTOGPU_VIDEO_SEED',
  'AUTOGPU_VIDEO_MODEL_LTX_VIDEO_2B_DISTILLED',
  'AUTOGPU_VIDEO_MODEL_LTX_VIDEO_13B_FP8',
  'AUTOGPU_VIDEO_MODEL_WAN2_2_TI2V_5B',
  'AUTOGPU_VIDEO_MODEL_WAN2_2_I2V_A14B',
  'AUTOGPU_TTS_API_URL',
  'AUTOGPU_TTS_API_KEY',
  'AUTOGPU_TTS_HEADERS_JSON',
  'AUTOGPU_TTS_BACKEND',
  'AUTOGPU_TTS_SCRIPT',
  'AUTOGPU_TTS_TIMEOUT_SECONDS',
  'AUTOGPU_TTS_MODEL_F5_TTS_V1',
  'AUTOGPU_TTS_MODEL_COSYVOICE3_0_5B',
  'AUTOGPU_TTS_COSYVOICE_REPO_DIR',
  'AUTOGPU_TTS_REFERENCE_TEXT',
  'AUTOGPU_INSTALL_MODEL_DEPS',
  'AUTOGPU_LLM_BACKEND',
  'AUTOGPU_LLM_API_URL',
  'AUTOGPU_LLM_API_KEY',
  'AUTOGPU_LLM_HEADERS_JSON',
  'AUTOGPU_LLM_SCRIPT',
  'AUTOGPU_LLM_TIMEOUT_SECONDS',
  'AUTOGPU_LLM_TRANSFORMERS_MODEL',
  'AUTOGPU_LLM_MODEL_QWEN3_8B_INSTRUCT',
  'AUTOGPU_LLM_MODEL_QWEN3_32B_INSTRUCT',
  'AUTOGPU_LLM_DTYPE',
  'AUTOGPU_LLM_MAX_NEW_TOKENS',
  'AUTOGPU_LLM_LOCAL_FILES_ONLY',
  'AUTOGPU_SCRIPT_DIR',
] as const

function buildWorkerBackendEnvAssignments(): string[] {
  return AUTODL_WORKER_BACKEND_ENV_KEYS.flatMap((key) => {
    const value = readTrimmedString(process.env[key])
    return value ? [`${key}=${shellValue(value)}`] : []
  })
}

export function buildAutoDLWorkerStartCommand(input: AutoDLWorkerStartCommandInput): string {
  const serverUrl = normalizeServerUrl(input.serverUrl)
  const workerSecret = readTrimmedString(input.workerSecret)
  if (!workerSecret) throw new Error('AUTODL_WORKER_SECRET_REQUIRED')
  const modelBundle = readTrimmedString(input.modelBundle) || 'default'

  return [
    `AUTOGPU_SERVER_URL=${shellValue(serverUrl)}`,
    `AUTOGPU_WORKER_SECRET=${shellValue(workerSecret)}`,
    `AUTOGPU_WORKER_PORT=${input.preferredPort}`,
    `AUTOGPU_MODEL_BUNDLE=${shellValue(modelBundle)}`,
    ...buildWorkerBackendEnvAssignments(),
    'bash -lc',
    shellValue('curl -fsSL "$AUTOGPU_SERVER_URL/api/autodl/worker/bootstrap" | bash'),
  ].join(' ')
}

export function buildAutoDLConnectionView(row: AutoDLConnectionRow | null | undefined): AutoDLConnectionView {
  const defaultProfileId = isAutoDLProfileId(row?.defaultProfileId) ? row.defaultProfileId : '5090-p'
  const preferredPort = row?.preferredPort === 6008 ? 6008 : 6006
  const configured = !!row?.tokenCiphertext
  const defaultImageUuid = readTrimmedString(row?.defaultImageUuid) || getAutoDLDefaultImageUuid(defaultProfileId)
  const status = row?.status === 'verified' || row?.status === 'verify_failed' || row?.status === 'configured'
    ? row.status
    : configured
      ? 'configured'
      : 'unconfigured'
  const lastProbeStatus = row?.lastProbeStatus === 'success' || row?.lastProbeStatus === 'failed'
    ? row.lastProbeStatus
    : null

  return {
    configured,
    tokenMasked: row?.tokenLast4 ? `••••${row.tokenLast4}` : null,
    tokenUpdatedAt: toIsoString(row?.tokenUpdatedAt),
    defaultProfileId,
    defaultImageUuid,
    preferredPort,
    status,
    lastProbeStatus,
    lastProbeMessage: row?.lastProbeMessage || null,
    lastProbeAt: toIsoString(row?.lastProbeAt),
  }
}
