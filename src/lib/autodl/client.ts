import { normalizeAutoDLTokenInput } from './connection'

const AUTODL_API_BASE_URL_FALLBACK = 'https://api.autodl.com'

interface AutoDLApiResponse<T> {
  code?: string
  data?: T
  msg?: string
  request_id?: string
}

interface AutoDLInstanceListData {
  result_total?: number
  list?: unknown[]
}

export interface AutoDLProbeResult {
  ok: boolean
  code: string
  message: string
  requestId?: string
  instanceCount?: number
}

export interface ProbeAutoDLTokenParams {
  token: string
  fetcher?: typeof fetch
  baseUrl?: string
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
