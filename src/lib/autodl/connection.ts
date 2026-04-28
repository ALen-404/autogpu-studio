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
    'bash -lc',
    shellValue('curl -fsSL "$AUTOGPU_SERVER_URL/api/autodl/worker/bootstrap" | bash'),
  ].join(' ')
}

export function buildAutoDLConnectionView(row: AutoDLConnectionRow | null | undefined): AutoDLConnectionView {
  const defaultProfileId = isAutoDLProfileId(row?.defaultProfileId) ? row.defaultProfileId : '5090-p'
  const preferredPort = row?.preferredPort === 6008 ? 6008 : 6006
  const configured = !!row?.tokenCiphertext
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
    defaultImageUuid: row?.defaultImageUuid || null,
    preferredPort,
    status,
    lastProbeStatus,
    lastProbeMessage: row?.lastProbeMessage || null,
    lastProbeAt: toIsoString(row?.lastProbeAt),
  }
}
