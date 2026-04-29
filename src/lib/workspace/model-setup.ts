interface PreferenceRecord {
  analysisModel?: string | null
}

export type ModelSetupNotice = 'missing' | 'autodl-starting'

interface AutoDLSessionSetupRecord {
  status?: string | null
  autodlStatus?: string | null
}

interface ModelSetupRecord {
  ready?: boolean | null
  latestAutoDLSession?: AutoDLSessionSetupRecord | null
}

interface UserPreferencePayload {
  preference?: PreferenceRecord | null
  modelSetup?: ModelSetupRecord | null
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isObjectLike(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function hasConfiguredAnalysisModel(payload: unknown): boolean {
  return readConfiguredAnalysisModel(payload) !== null
}

export function readConfiguredAnalysisModel(payload: unknown): string | null {
  if (!isObjectLike(payload)) return null

  const preferenceValue = payload.preference
  if (!isObjectLike(preferenceValue)) return null

  const preference = preferenceValue as PreferenceRecord
  return isNonEmptyString(preference.analysisModel) ? preference.analysisModel.trim() : null
}

function readModelSetup(payload: unknown): ModelSetupRecord | null {
  if (!isObjectLike(payload)) return null
  return isObjectLike(payload.modelSetup) ? payload.modelSetup as ModelSetupRecord : null
}

function isAutoDLSessionStarting(session: AutoDLSessionSetupRecord | null | undefined): boolean {
  if (!session) return false
  const status = typeof session.status === 'string' ? session.status.trim() : ''
  const autodlStatus = typeof session.autodlStatus === 'string' ? session.autodlStatus.trim() : ''
  return ['created', 'booting', 'running'].includes(status) || ['created', 'booting', 'running'].includes(autodlStatus)
}

export function hasReadyModelRuntime(payload: unknown): boolean {
  const setup = readModelSetup(payload)
  if (setup?.ready === true) return true
  return hasConfiguredAnalysisModel(payload)
}

export function readModelSetupNotice(payload: unknown): ModelSetupNotice | null {
  if (hasReadyModelRuntime(payload)) return null

  const setup = readModelSetup(payload)
  if (isAutoDLSessionStarting(setup?.latestAutoDLSession)) {
    return 'autodl-starting'
  }

  return 'missing'
}

export function shouldGuideToModelSetup(payload: unknown): boolean {
  return !hasReadyModelRuntime(payload)
}

export type { UserPreferencePayload }
