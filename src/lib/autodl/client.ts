import { request as undiciRequest } from 'undici'
import { isAutoDLProfileId, type AutoDLProfileId } from './catalog'
import { normalizeAutoDLPreferredPort, normalizeAutoDLTokenInput, type AutoDLPreferredPort } from './connection'

const AUTODL_API_BASE_URL_FALLBACK = 'https://api.autodl.com'

interface AutoDLApiResponse<T> {
  code?: string
  data?: T
  msg?: string
  request_id?: string
}

type AutoDLRequestQueryValue = string | number | boolean | null | undefined

interface AutoDLErrorParams {
  autoDLCode?: string
  httpStatus: number
  message: string
  requestId?: string
}

export class AutoDLError extends Error {
  code: string
  autoDLCode: string
  httpStatus: number
  provider = 'AutoDL'
  requestId?: string
  details: Record<string, unknown>

  constructor(params: AutoDLErrorParams) {
    const autoDLCode = params.autoDLCode || `AUTODL_HTTP_${params.httpStatus}`
    super(params.message)
    this.name = 'AutoDLError'
    this.code = inferAutoDLUnifiedErrorCode(autoDLCode, params.message, params.httpStatus)
    this.autoDLCode = autoDLCode
    this.httpStatus = params.httpStatus
    this.requestId = params.requestId
    this.details = {
      provider: this.provider,
      autoDLCode,
      autoDLRequestId: params.requestId,
      autoDLHttpStatus: params.httpStatus,
      message: params.message,
    }
  }
}

interface AutoDLInstanceListData {
  result_total?: number
  list?: unknown[]
}

export interface AutoDLListedInstance {
  instanceUuid: string
  displayName: string | null
  profileId: AutoDLProfileId | null
  status: string | null
  subStatus: string | null
  createdAt: string | null
  startedAt: string | null
  statusAt: string | null
  regionName: string | null
  chargeType: string | null
  gpuAmount: number | null
}

export interface AutoDLInstanceListResult {
  total: number
  instances: AutoDLListedInstance[]
  requestId?: string
}

export interface AutoDLCreateInstanceParams {
  token: string
  profileId: AutoDLProfileId
  imageUuid: string
  instanceName?: string
  startCommand?: string
  fetcher?: typeof fetch
  baseUrl?: string
}

export interface AutoDLCreateInstanceResult {
  instanceUuid: string
  requestId?: string
}

export interface AutoDLInstanceActionParams {
  token: string
  instanceUuid: string
  fetcher?: typeof fetch
  baseUrl?: string
}

export interface AutoDLPowerOnInstanceParams extends AutoDLInstanceActionParams {
  startCommand?: string | null
}

export interface AutoDLInstanceSnapshot {
  payg_price?: number
  origin_pay_price?: number
  snapshot_gpu_alias_name?: string
  ssh_command?: string
  proxy_host?: string
  root_password?: string
  ssh_port?: number
  jupyter_domain?: string
  service_6006_domain?: string
  service_6006_port_protocol?: string
  service_6008_domain?: string
  service_6008_port_protocol?: string
}

export interface AutoDLActionResult {
  ok: boolean
  requestId?: string
  message: string
}

export interface AutoDLProbeResult {
  ok: boolean
  code: string
  message: string
  requestId?: string
  instanceCount?: number
}

export interface AutoDLWalletBalance {
  rawBalance: number | null
  balanceCny: number | null
  displayBalance: string
  requestId?: string
}

export interface ProbeAutoDLTokenParams {
  token: string
  fetcher?: typeof fetch
  baseUrl?: string
}

export interface ListAutoDLInstancesParams extends ProbeAutoDLTokenParams {
  pageIndex?: number
  pageSize?: number
}

function getAutoDLApiBaseUrl(rawBaseUrl?: string): string {
  const configured = rawBaseUrl || process.env.AUTODL_API_BASE_URL || AUTODL_API_BASE_URL_FALLBACK
  try {
    const parsed = new URL(configured)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return AUTODL_API_BASE_URL_FALLBACK
    return parsed.toString().replace(/\/+$/, '')
  } catch {
    return AUTODL_API_BASE_URL_FALLBACK
  }
}

async function parseAutoDLJson<T>(response: Response): Promise<AutoDLApiResponse<T> | null> {
  try {
    return await response.json() as AutoDLApiResponse<T>
  } catch {
    return null
  }
}

function parseAutoDLJsonText<T>(text: string): AutoDLApiResponse<T> | null {
  try {
    return JSON.parse(text) as AutoDLApiResponse<T>
  } catch {
    return null
  }
}

function readNonEmptyString(value: unknown, code: string): string {
  const normalized = typeof value === 'string' ? value.trim() : ''
  if (!normalized) throw new Error(code)
  return normalized
}

function readBalanceNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.trim())
    return Number.isFinite(parsed) ? parsed : null
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const raw = value as Record<string, unknown>
    for (const key of ['assets', 'balance', 'wallet_balance', 'walletBalance', 'amount', 'money', 'available', 'availableBalance', 'cash']) {
      const parsed = readBalanceNumber(raw[key])
      if (parsed !== null) return parsed
    }
  }
  return null
}

function readStringField(raw: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = raw[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function readNumberField(raw: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = raw[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value.trim())
      if (Number.isFinite(parsed)) return parsed
    }
  }
  return null
}

function readAutoDLTime(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>
  if (raw.Valid === false) return null
  return typeof raw.Time === 'string' && raw.Time.trim() ? raw.Time.trim() : null
}

function readTimeField(raw: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = readAutoDLTime(raw[key])
    if (value) return value
  }
  return null
}

function normalizeAutoDLListedInstance(value: unknown): AutoDLListedInstance | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>
  const instanceUuid = readStringField(raw, ['uuid', 'instance_uuid', 'instanceUuid'])
  if (!instanceUuid) return null
  const profileId = readStringField(raw, ['gpu_spec_uuid', 'gpuSpecUuid', 'gpu_spec'])
  return {
    instanceUuid,
    displayName: readStringField(raw, ['name', 'instance_name', 'instanceName', 'machine_alias']),
    profileId: profileId && isAutoDLProfileId(profileId) ? profileId : null,
    status: readStringField(raw, ['status']),
    subStatus: readStringField(raw, ['sub_status', 'subStatus']),
    createdAt: readTimeField(raw, ['created_at', 'createdAt']),
    startedAt: readTimeField(raw, ['started_at', 'startedAt']),
    statusAt: readTimeField(raw, ['status_at', 'statusAt']),
    regionName: readStringField(raw, ['region_name', 'regionName']),
    chargeType: readStringField(raw, ['charge_type', 'chargeType']),
    gpuAmount: readNumberField(raw, ['req_gpu_amount', 'gpu_amount', 'gpuAmount']),
  }
}

function inferAutoDLUnifiedErrorCode(autoDLCode: string, message: string, httpStatus: number): string {
  const normalizedCode = autoDLCode.trim()
  const normalizedMessage = message.trim().toLowerCase()
  if (normalizedCode === 'RequestParameterIsWrong' || normalizedMessage.includes('参数错误')) return 'INVALID_PARAMS'
  if (normalizedMessage.includes('实名认证') || normalizedMessage.includes('开发者 token')) return 'MISSING_CONFIG'
  if (normalizedMessage.includes('余额不足') || normalizedMessage.includes('余额不够') || normalizedMessage.includes('请充值')) {
    return 'INSUFFICIENT_BALANCE'
  }
  if (httpStatus === 401) return 'UNAUTHORIZED'
  if (httpStatus === 403) return 'FORBIDDEN'
  if (httpStatus === 404) return 'NOT_FOUND'
  if (httpStatus === 429) return 'RATE_LIMIT'
  if (httpStatus >= 500) return 'EXTERNAL_ERROR'
  return 'EXTERNAL_ERROR'
}

function buildAutoDLRequestUrl(
  baseUrl: string,
  path: string,
  query?: Record<string, AutoDLRequestQueryValue>,
): string {
  const url = new URL(`${baseUrl}${path}`)
  for (const [key, value] of Object.entries(query || {})) {
    if (value === null || value === undefined) continue
    url.searchParams.set(key, String(value))
  }
  return url.toString()
}

async function requestAutoDL<T>(params: {
  token: string
  path: string
  body?: Record<string, unknown>
  query?: Record<string, AutoDLRequestQueryValue>
  fetcher?: typeof fetch
  baseUrl?: string
  method?: 'GET' | 'POST'
}): Promise<AutoDLApiResponse<T>> {
  const token = normalizeAutoDLTokenInput(params.token)
  const fetcher = params.fetcher || fetch
  const baseUrl = getAutoDLApiBaseUrl(params.baseUrl)
  const method = params.method || 'POST'
  const url = buildAutoDLRequestUrl(baseUrl, params.path, params.query)
  const headers = {
    Authorization: token,
    'Content-Type': 'application/json',
  }
  const body = params.body ? JSON.stringify(params.body) : undefined

  let status = 0
  let ok = false
  let payload: AutoDLApiResponse<T> | null = null

  if (method === 'GET' && !params.fetcher) {
    // AutoDL Pro API 文档中的 GET 接口需要请求体，标准 fetch 不支持 GET body。
    const response = await undiciRequest(url, {
      method,
      headers,
      body,
    })
    status = response.statusCode
    ok = status >= 200 && status < 300
    payload = parseAutoDLJsonText<T>(await response.body.text())
  } else {
    const response = await fetcher(url, {
      method,
      headers,
      body,
    })
    status = response.status
    ok = response.ok
    payload = await parseAutoDLJson<T>(response)
  }

  if (!payload) {
    throw new AutoDLError({
      httpStatus: status,
      message: `AutoDL 返回 HTTP ${status}`,
    })
  }
  if (!ok || payload.code !== 'Success') {
    throw new AutoDLError({
      autoDLCode: payload.code,
      httpStatus: status,
      message: payload.msg || payload.code || `AutoDL 返回 HTTP ${status}`,
      requestId: payload.request_id,
    })
  }
  return payload
}

export async function probeAutoDLToken(params: ProbeAutoDLTokenParams): Promise<AutoDLProbeResult> {
  const token = normalizeAutoDLTokenInput(params.token)
  const fetcher = params.fetcher || fetch
  const baseUrl = getAutoDLApiBaseUrl(params.baseUrl)

  try {
    const response = await fetcher(`${baseUrl}/api/v1/dev/instance/pro/list`, {
      method: 'POST',
      headers: {
        Authorization: token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ page_index: 1, page_size: 1 }),
    })

    const payload = await parseAutoDLJson<AutoDLInstanceListData>(response)
    const requestId = payload?.request_id
    if (!response.ok) {
      return {
        ok: false,
        code: `HTTP_${response.status}`,
        message: payload?.msg || `AutoDL 返回 HTTP ${response.status}`,
        requestId,
      }
    }

    if (payload?.code !== 'Success') {
      return {
        ok: false,
        code: payload?.code || 'AUTODL_PROBE_FAILED',
        message: payload?.msg || 'AutoDL Token 验证失败',
        requestId,
      }
    }

    return {
      ok: true,
      code: 'Success',
      message: 'AutoDL Token 验证成功',
      requestId,
      instanceCount: typeof payload.data?.result_total === 'number' ? payload.data.result_total : undefined,
    }
  } catch (error) {
    return {
      ok: false,
      code: 'AUTODL_NETWORK_ERROR',
      message: error instanceof Error ? error.message : 'AutoDL 网络请求失败',
    }
  }
}

export async function listAutoDLInstances(params: ListAutoDLInstancesParams): Promise<AutoDLInstanceListResult> {
  const pageIndex = Number.isFinite(params.pageIndex) ? Math.max(1, Math.floor(params.pageIndex || 1)) : 1
  const pageSize = Number.isFinite(params.pageSize) ? Math.min(100, Math.max(1, Math.floor(params.pageSize || 20))) : 20
  const payload = await requestAutoDL<AutoDLInstanceListData>({
    token: params.token,
    path: '/api/v1/dev/instance/pro/list',
    fetcher: params.fetcher,
    baseUrl: params.baseUrl,
    body: {
      page_index: pageIndex,
      page_size: pageSize,
    },
  })
  const list = Array.isArray(payload.data?.list) ? payload.data.list : []
  return {
    total: typeof payload.data?.result_total === 'number' ? payload.data.result_total : list.length,
    instances: list.map(normalizeAutoDLListedInstance).filter((item): item is AutoDLListedInstance => !!item),
    requestId: payload.request_id,
  }
}

export async function getAutoDLWalletBalance(params: ProbeAutoDLTokenParams): Promise<AutoDLWalletBalance> {
  const payload = await requestAutoDL<unknown>({
    token: params.token,
    path: '/api/v1/dev/wallet/balance',
    fetcher: params.fetcher,
    baseUrl: params.baseUrl,
    body: {},
  })
  const rawBalance = readBalanceNumber(payload.data)
  const balanceCny = rawBalance === null ? null : rawBalance / 1000
  return {
    rawBalance,
    balanceCny,
    displayBalance: balanceCny === null ? '未知' : `¥${balanceCny.toFixed(2)}`,
    requestId: payload.request_id,
  }
}

export async function createAutoDLInstance(params: AutoDLCreateInstanceParams): Promise<AutoDLCreateInstanceResult> {
  if (!isAutoDLProfileId(params.profileId)) throw new Error('AUTODL_PROFILE_INVALID')
  const imageUuid = readNonEmptyString(params.imageUuid, 'AUTODL_IMAGE_UUID_REQUIRED')
  const payload = await requestAutoDL<string>({
    token: params.token,
    path: '/api/v1/dev/instance/pro/create',
    fetcher: params.fetcher,
    baseUrl: params.baseUrl,
    body: {
      req_gpu_amount: 1,
      expand_system_disk_by_gb: 0,
      gpu_spec_uuid: params.profileId,
      image_uuid: imageUuid,
      cuda_v_from: 113,
      ...(params.instanceName ? { instance_name: params.instanceName } : {}),
      ...(params.startCommand ? { start_command: params.startCommand } : {}),
    },
  })
  if (typeof payload.data !== 'string' || !payload.data.trim()) {
    throw new Error('AUTODL_CREATE_RESPONSE_INVALID')
  }
  return {
    instanceUuid: payload.data.trim(),
    requestId: payload.request_id,
  }
}

export async function powerOffAutoDLInstance(params: AutoDLInstanceActionParams): Promise<AutoDLActionResult> {
  const instanceUuid = readNonEmptyString(params.instanceUuid, 'AUTODL_INSTANCE_UUID_REQUIRED')
  const payload = await requestAutoDL<null>({
    token: params.token,
    path: '/api/v1/dev/instance/pro/power_off',
    fetcher: params.fetcher,
    baseUrl: params.baseUrl,
    body: { instance_uuid: instanceUuid },
  })
  return {
    ok: true,
    requestId: payload.request_id,
    message: payload.msg || 'AutoDL 实例关机请求已提交',
  }
}

export async function powerOnAutoDLInstance(params: AutoDLPowerOnInstanceParams): Promise<AutoDLActionResult> {
  const instanceUuid = readNonEmptyString(params.instanceUuid, 'AUTODL_INSTANCE_UUID_REQUIRED')
  const startCommand = typeof params.startCommand === 'string' ? params.startCommand.trim() : ''
  const payload = await requestAutoDL<null>({
    token: params.token,
    path: '/api/v1/dev/instance/pro/power_on',
    fetcher: params.fetcher,
    baseUrl: params.baseUrl,
    body: {
      instance_uuid: instanceUuid,
      payload: 'gpu',
      ...(startCommand ? { start_command: startCommand } : {}),
    },
  })
  return {
    ok: true,
    requestId: payload.request_id,
    message: payload.msg || 'AutoDL 实例开机请求已提交',
  }
}

export async function releaseAutoDLInstance(params: AutoDLInstanceActionParams): Promise<AutoDLActionResult> {
  const instanceUuid = readNonEmptyString(params.instanceUuid, 'AUTODL_INSTANCE_UUID_REQUIRED')
  const payload = await requestAutoDL<null>({
    token: params.token,
    path: '/api/v1/dev/instance/pro/release',
    fetcher: params.fetcher,
    baseUrl: params.baseUrl,
    body: { instance_uuid: instanceUuid },
  })
  return {
    ok: true,
    requestId: payload.request_id,
    message: payload.msg || 'AutoDL 实例释放请求已提交',
  }
}

export async function getAutoDLInstanceSnapshot(params: AutoDLInstanceActionParams): Promise<AutoDLInstanceSnapshot> {
  const instanceUuid = readNonEmptyString(params.instanceUuid, 'AUTODL_INSTANCE_UUID_REQUIRED')
  const payload = await requestAutoDL<AutoDLInstanceSnapshot>({
    token: params.token,
    path: '/api/v1/dev/instance/pro/snapshot',
    fetcher: params.fetcher,
    baseUrl: params.baseUrl,
    method: 'GET',
    query: { instance_uuid: instanceUuid },
  })
  return payload.data || {}
}

export async function getAutoDLInstanceStatus(params: AutoDLInstanceActionParams): Promise<string> {
  const instanceUuid = readNonEmptyString(params.instanceUuid, 'AUTODL_INSTANCE_UUID_REQUIRED')
  const payload = await requestAutoDL<string>({
    token: params.token,
    path: '/api/v1/dev/instance/pro/status',
    fetcher: params.fetcher,
    baseUrl: params.baseUrl,
    method: 'GET',
    query: { instance_uuid: instanceUuid },
  })
  return typeof payload.data === 'string' ? payload.data : ''
}

export function resolveAutoDLWorkerBaseUrl(
  snapshot: AutoDLInstanceSnapshot,
  preferredPort: AutoDLPreferredPort,
): string | null {
  const port = normalizeAutoDLPreferredPort(preferredPort)
  const domain = port === 6008 ? snapshot.service_6008_domain : snapshot.service_6006_domain
  const protocol = port === 6008 ? snapshot.service_6008_port_protocol : snapshot.service_6006_port_protocol
  if (!domain) return null
  const normalizedProtocol = protocol === 'https' || domain.endsWith(':8443') ? 'https' : 'http'
  return `${normalizedProtocol}://${domain}`
}
