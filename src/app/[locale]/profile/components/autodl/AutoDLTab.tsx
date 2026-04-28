'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { AppIcon } from '@/components/ui/icons'
import { apiFetch } from '@/lib/api-fetch'

type AutoDLProfileId = 'pro6000-p' | '5090-p'
type AutoDLPreferredPort = 6006 | 6008

interface AutoDLProfile {
  id: AutoDLProfileId
  displayName: string
  specId: string
  gpuName: string
  purpose: string
  recommendedUseCases: string[]
  priceMarkupPercent: number
}

interface LocalModel {
  id: string
  name: string
  modality: 'video' | 'image' | 'tts'
  supportedProfileIds: AutoDLProfileId[]
  recommendedProfileId: AutoDLProfileId
  status: 'supported' | 'experimental'
  licenseNote: string
}

interface ProfilesPayload {
  success: boolean
  officialUrl: string
  defaultProfileId: AutoDLProfileId
  defaultImageReadyByProfile?: Partial<Record<AutoDLProfileId, boolean>>
  profiles: AutoDLProfile[]
}

interface LocalModelsPayload {
  success: boolean
  profileId: AutoDLProfileId
  models: LocalModel[]
}

interface AutoDLConnection {
  configured: boolean
  tokenMasked: string | null
  tokenUpdatedAt: string | null
  defaultProfileId: AutoDLProfileId
  defaultImageUuid: string | null
  preferredPort: AutoDLPreferredPort
  status: 'unconfigured' | 'configured' | 'verified' | 'verify_failed'
  lastProbeStatus: 'success' | 'failed' | null
  lastProbeMessage: string | null
  lastProbeAt: string | null
}

interface AutoDLConnectionPayload {
  success: boolean
  connection: AutoDLConnection
}

interface AutoDLProbePayload {
  success: boolean
  probe?: {
    ok: boolean
    message: string
    instanceCount?: number
  }
  connection?: AutoDLConnection
  message?: string
}

interface AutoDLSession {
  id: string
  instanceUuid: string | null
  profileId: AutoDLProfileId
  imageUuid: string | null
  modelBundle: string | null
  status: 'created' | 'booting' | 'running' | 'worker_ready' | 'stopped' | 'released' | 'failed'
  autodlStatus: string | null
  workerBaseUrl: string | null
  paygPrice: number | null
  createdAt: string
  updatedAt: string
  startedAt: string | null
  releasedAt: string | null
}

interface AutoDLSessionsPayload {
  success: boolean
  sessions: AutoDLSession[]
}

interface AutoDLSessionPayload {
  success: boolean
  session?: AutoDLSession | null
  message?: string
}

const AUTODL_PORTS: AutoDLPreferredPort[] = [6006, 6008]
const DEFAULT_MODEL_BUNDLE = 'default'

function formatDateTime(value: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString()
}

export function AutoDLTab() {
  const t = useTranslations('profile.autodl')
  const tc = useTranslations('common')
  const [profiles, setProfiles] = useState<AutoDLProfile[]>([])
  const [officialUrl, setOfficialUrl] = useState('https://www.autodl.com/home')
  const [selectedProfileId, setSelectedProfileId] = useState<AutoDLProfileId>('5090-p')
  const [models, setModels] = useState<LocalModel[]>([])
  const [sessions, setSessions] = useState<AutoDLSession[]>([])
  const [connection, setConnection] = useState<AutoDLConnection | null>(null)
  const [apiToken, setApiToken] = useState('')
  const [defaultImageReadyByProfile, setDefaultImageReadyByProfile] = useState<Partial<Record<AutoDLProfileId, boolean>>>({})
  const [preferredPort, setPreferredPort] = useState<AutoDLPreferredPort>(6006)
  const [selectedModelBundle, setSelectedModelBundle] = useState(DEFAULT_MODEL_BUNDLE)
  const [loading, setLoading] = useState(true)
  const [modelsLoading, setModelsLoading] = useState(false)
  const [connectionBusy, setConnectionBusy] = useState<'save' | 'test' | 'delete' | null>(null)
  const [sessionBusy, setSessionBusy] = useState<string | null>(null)
  const [connectionMessage, setConnectionMessage] = useState<string | null>(null)
  const [sessionMessage, setSessionMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadProfiles() {
      setLoading(true)
      setError(null)
      try {
        const [response, connectionResponse, sessionsResponse] = await Promise.all([
          apiFetch('/api/autodl/profiles'),
          apiFetch('/api/autodl/connection'),
          apiFetch('/api/autodl/sessions'),
        ])
        if (!response.ok || !connectionResponse.ok || !sessionsResponse.ok) throw new Error('profiles')
        const payload = await response.json() as ProfilesPayload
        const connectionPayload = await connectionResponse.json() as AutoDLConnectionPayload
        const sessionsPayload = await sessionsResponse.json() as AutoDLSessionsPayload
        if (!payload.success || !Array.isArray(payload.profiles)) throw new Error('profiles')
        if (cancelled) return
        setProfiles(payload.profiles)
        setOfficialUrl(payload.officialUrl || 'https://www.autodl.com/home')
        setDefaultImageReadyByProfile(payload.defaultImageReadyByProfile || {})
        setConnection(connectionPayload.connection || null)
        setSelectedProfileId(connectionPayload.connection?.defaultProfileId || payload.defaultProfileId || '5090-p')
        setPreferredPort(connectionPayload.connection?.preferredPort || 6006)
        setSessions(Array.isArray(sessionsPayload.sessions) ? sessionsPayload.sessions : [])
      } catch {
        if (!cancelled) setError(t('loadFailed'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadProfiles()

    return () => {
      cancelled = true
    }
  }, [t])

  useEffect(() => {
    let cancelled = false

    async function loadModels() {
      setModelsLoading(true)
      try {
        const response = await apiFetch(`/api/local-models?profileId=${encodeURIComponent(selectedProfileId)}`)
        if (!response.ok) throw new Error('models')
        const payload = await response.json() as LocalModelsPayload
        if (!payload.success || !Array.isArray(payload.models)) throw new Error('models')
        if (!cancelled) setModels(payload.models)
      } catch {
        if (!cancelled) setError(t('loadFailed'))
      } finally {
        if (!cancelled) setModelsLoading(false)
      }
    }

    void loadModels()

    return () => {
      cancelled = true
    }
  }, [selectedProfileId, t])

  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId)
  const connectionStatus = connection?.status || 'unconfigured'
  const tokenUpdatedAt = formatDateTime(connection?.tokenUpdatedAt || null)
  const probeAt = formatDateTime(connection?.lastProbeAt || null)
  const selectedBundleName = selectedModelBundle === DEFAULT_MODEL_BUNDLE
    ? t('modelBundleDefault')
    : models.find((model) => model.id === selectedModelBundle)?.name || selectedModelBundle
  const imageReady = !!connection?.defaultImageUuid || !!defaultImageReadyByProfile[selectedProfileId]
  const canStartSession = sessionBusy === null && !!connection?.configured && imageReady

  useEffect(() => {
    if (selectedModelBundle !== DEFAULT_MODEL_BUNDLE && !models.some((model) => model.id === selectedModelBundle)) {
      setSelectedModelBundle(DEFAULT_MODEL_BUNDLE)
    }
  }, [models, selectedModelBundle])

  function upsertSession(nextSession: AutoDLSession | null | undefined) {
    if (!nextSession) return
    setSessions((current) => {
      const existingIndex = current.findIndex((item) => item.id === nextSession.id)
      if (existingIndex === -1) return [nextSession, ...current]
      const next = [...current]
      next[existingIndex] = nextSession
      return next
    })
  }

  function getSessionStatusClass(status: AutoDLSession['status']) {
    if (status === 'worker_ready') return 'glass-chip-success'
    if (status === 'running' || status === 'booting' || status === 'created') return 'glass-chip-info'
    if (status === 'released' || status === 'stopped') return 'glass-chip-warning'
    return 'glass-chip-warning'
  }

  function formatPaygPrice(value: number | null) {
    if (typeof value !== 'number') return t('unknownPrice')
    return String(value)
  }

  async function handleSaveConnection() {
    if (!connection?.configured && !apiToken.trim()) {
      setConnectionMessage(null)
      setError(t('tokenRequired'))
      return
    }

    setConnectionBusy('save')
    setConnectionMessage(null)
    setError(null)
    try {
      const response = await apiFetch('/api/autodl/connection', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(apiToken.trim() ? { apiToken: apiToken.trim() } : {}),
          defaultProfileId: selectedProfileId,
          preferredPort,
        }),
      })
      const payload = await response.json() as AutoDLConnectionPayload
      if (!response.ok || !payload.success) throw new Error('save')
      setConnection(payload.connection)
      setApiToken('')
      setConnectionMessage(t('saveSuccess'))
    } catch {
      setError(t('saveFailed'))
    } finally {
      setConnectionBusy(null)
    }
  }

  async function handleTestConnection() {
    setConnectionBusy('test')
    setConnectionMessage(null)
    setError(null)
    try {
      const response = await apiFetch('/api/autodl/connection/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(apiToken.trim() ? { apiToken: apiToken.trim() } : {}),
      })
      const payload = await response.json() as AutoDLProbePayload
      if (payload.connection) setConnection(payload.connection)
      if (!response.ok || !payload.success) {
        throw new Error(payload.probe?.message || payload.message || t('testFailed'))
      }
      const countText = typeof payload.probe?.instanceCount === 'number'
        ? t('probeInstanceCount', { count: payload.probe.instanceCount })
        : ''
      setConnectionMessage(`${payload.probe?.message || t('testSuccess')}${countText ? ` · ${countText}` : ''}`)
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t('testFailed'))
    } finally {
      setConnectionBusy(null)
    }
  }

  async function handleDeleteConnection() {
    if (!window.confirm(t('deleteConfirm'))) return

    setConnectionBusy('delete')
    setConnectionMessage(null)
    setError(null)
    try {
      const response = await apiFetch('/api/autodl/connection', {
        method: 'DELETE',
      })
      const payload = await response.json() as AutoDLConnectionPayload
      if (!response.ok || !payload.success) throw new Error('delete')
      setConnection(payload.connection)
      setApiToken('')
      setPreferredPort(6006)
      setConnectionMessage(t('deleteSuccess'))
    } catch {
      setError(t('deleteFailed'))
    } finally {
      setConnectionBusy(null)
    }
  }

  async function handleStartSession() {
    if (!connection?.configured) {
      setConnectionMessage(null)
      setError(t('startRequiresToken'))
      return
    }
    if (!imageReady) {
      setConnectionMessage(null)
      setError(t('startRequiresImage'))
      return
    }

    setSessionBusy('start')
    setSessionMessage(null)
    setError(null)
    try {
      const response = await apiFetch('/api/autodl/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId: selectedProfileId,
          modelBundle: selectedModelBundle,
          instanceName: `AutoGPU ${selectedBundleName}`,
        }),
      })
      const payload = await response.json() as AutoDLSessionPayload
      if (!response.ok || !payload.success) throw new Error(payload.message || t('startFailed'))
      upsertSession(payload.session)
      setSessionMessage(t('startSuccess'))
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t('startFailed'))
    } finally {
      setSessionBusy(null)
    }
  }

  async function handleSessionAction(sessionId: string, action: 'sync' | 'power-off' | 'release') {
    if (action === 'release' && !window.confirm(t('releaseConfirm'))) return

    setSessionBusy(`${sessionId}:${action}`)
    setSessionMessage(null)
    setError(null)
    try {
      const response = await apiFetch(`/api/autodl/sessions/${encodeURIComponent(sessionId)}/${action}`, {
        method: 'POST',
      })
      const payload = await response.json() as AutoDLSessionPayload
      if (!response.ok || !payload.success) throw new Error(payload.message || t(`${action.replace('-', '')}Failed`))
      upsertSession(payload.session)
      setSessionMessage(t(`${action.replace('-', '')}Success`))
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t(`${action.replace('-', '')}Failed`))
    } finally {
      setSessionBusy(null)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-[var(--glass-stroke-base)] px-6 py-4">
        <div>
          <h2 className="text-lg font-semibold text-[var(--glass-text-primary)]">{t('title')}</h2>
          <p className="mt-1 text-xs text-[var(--glass-text-tertiary)]">{t('simpleSubtitle')}</p>
        </div>
        <a
          href={officialUrl}
          target="_blank"
          rel="noreferrer"
          className="glass-btn-base glass-btn-secondary flex items-center gap-2 px-3 py-2 text-sm"
        >
          <AppIcon name="externalLink" className="h-4 w-4" />
          {t('officialLink')}
        </a>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-5xl space-y-5 p-5">
          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-500">
              <AppIcon name="alert" className="h-4 w-4" />
              {error}
            </div>
          )}

          <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="rounded-2xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-muted)] p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-xs font-medium text-[var(--glass-text-tertiary)]">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--glass-tone-info-bg)] text-[var(--glass-tone-info-fg)]">1</span>
                    {t('stepAccount')}
                  </div>
                  <h3 className="mt-3 text-base font-semibold text-[var(--glass-text-primary)]">{t('connectionTitle')}</h3>
                  <p className="mt-1 text-xs text-[var(--glass-text-tertiary)]">{t('simpleConnectionDescription')}</p>
                </div>
                <span className={`glass-chip text-[11px] ${
                  connectionStatus === 'verified'
                    ? 'glass-chip-success'
                    : connectionStatus === 'verify_failed'
                      ? 'glass-chip-warning'
                      : 'glass-chip-info'
                }`}>
                  {t(`connectionStatus.${connectionStatus}`)}
                </span>
              </div>

              <div className="mt-4 space-y-3">
                <label className="block">
                  <span className="block text-xs font-medium text-[var(--glass-text-tertiary)]">{t('tokenLabel')}</span>
                  <input
                    type="password"
                    value={apiToken}
                    onChange={(event) => setApiToken(event.target.value)}
                    placeholder={connection?.configured ? t('tokenPlaceholderConfigured', { token: connection.tokenMasked || '' }) : t('tokenPlaceholder')}
                    autoComplete="off"
                    className="mt-2 w-full rounded-xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] px-3 py-2 text-sm text-[var(--glass-text-primary)] outline-none transition focus:border-[var(--glass-tone-info-fg)]"
                  />
                </label>

                <details className="rounded-xl border border-[var(--glass-stroke-subtle)] bg-[var(--glass-bg-surface)] px-3 py-2">
                  <summary className="cursor-pointer text-xs font-medium text-[var(--glass-text-secondary)]">{t('advancedSettings')}</summary>
                  <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_180px]">
                    <div className="rounded-xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-muted)] px-3 py-2">
                      <span className="block text-xs font-medium text-[var(--glass-text-tertiary)]">{t('platformImageTitle')}</span>
                      <span className={`mt-2 inline-flex rounded-full px-2 py-1 text-xs ${
                        imageReady
                          ? 'bg-[var(--glass-tone-success-bg)] text-[var(--glass-tone-success-fg)]'
                          : 'bg-[var(--glass-tone-warning-bg)] text-[var(--glass-tone-warning-fg)]'
                      }`}>
                        {imageReady ? t('platformImageReady') : t('platformImageMissing')}
                      </span>
                    </div>
                    <div>
                      <span className="block text-xs font-medium text-[var(--glass-text-tertiary)]">{t('preferredPort')}</span>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        {AUTODL_PORTS.map((port) => (
                          <button
                            key={port}
                            type="button"
                            onClick={() => setPreferredPort(port)}
                            className={`rounded-xl border px-3 py-2 text-sm transition ${
                              preferredPort === port
                                ? 'border-[var(--glass-tone-info-fg)] bg-[var(--glass-tone-info-bg)]/20 text-[var(--glass-text-primary)]'
                                : 'border-[var(--glass-stroke-base)] bg-[var(--glass-bg-muted)] text-[var(--glass-text-secondary)]'
                            }`}
                          >
                            {port}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </details>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-xs text-[var(--glass-text-tertiary)]">
                    {connectionMessage && <span className="text-[var(--glass-tone-success-fg)]">{connectionMessage}</span>}
                    {!connectionMessage && (
                      <span>
                        {connection?.configured ? t('tokenSaved') : t('tokenNotSaved')}
                        {tokenUpdatedAt ? ` · ${t('tokenUpdatedAt', { time: tokenUpdatedAt })}` : ''}
                        {probeAt ? ` · ${t('lastProbeAt', { time: probeAt })}` : ''}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleTestConnection}
                      disabled={connectionBusy !== null || (!connection?.configured && !apiToken.trim())}
                      className="glass-btn-base glass-btn-secondary flex items-center gap-2 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <AppIcon name={connectionBusy === 'test' ? 'loader' : 'refresh'} className={`h-4 w-4 ${connectionBusy === 'test' ? 'animate-spin' : ''}`} />
                      {connectionBusy === 'test' ? t('testing') : t('testConnection')}
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveConnection}
                      disabled={connectionBusy !== null}
                      className="glass-btn-base glass-btn-primary flex items-center gap-2 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <AppIcon name={connectionBusy === 'save' ? 'loader' : 'lock'} className={`h-4 w-4 ${connectionBusy === 'save' ? 'animate-spin' : ''}`} />
                      {connectionBusy === 'save' ? t('saving') : t('saveConnection')}
                    </button>
                    {connection?.configured && (
                      <button
                        type="button"
                        onClick={handleDeleteConnection}
                        disabled={connectionBusy !== null}
                        className="glass-btn-base glass-btn-secondary flex items-center gap-2 px-3 py-2 text-sm text-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <AppIcon name={connectionBusy === 'delete' ? 'loader' : 'trash'} className={`h-4 w-4 ${connectionBusy === 'delete' ? 'animate-spin' : ''}`} />
                        {connectionBusy === 'delete' ? t('deleting') : t('deleteConnection')}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <aside className="rounded-2xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-muted)] p-5">
              <div className="flex items-center gap-2 text-sm font-semibold text-[var(--glass-text-primary)]">
                <AppIcon name="badgeCheck" className="h-4 w-4" />
                {t('simpleRuleTitle')}
              </div>
              <div className="mt-4 space-y-3 text-sm text-[var(--glass-text-secondary)]">
                <div className="flex gap-2">
                  <AppIcon name="coins" className="mt-0.5 h-4 w-4 text-[var(--glass-text-tertiary)]" />
                  <span>{t('simpleRuleBilling')}</span>
                </div>
                <div className="flex gap-2">
                  <AppIcon name="link" className="mt-0.5 h-4 w-4 text-[var(--glass-text-tertiary)]" />
                  <span>{t('simpleRulePlatform')}</span>
                </div>
                <div className="flex gap-2">
                  <AppIcon name="trash" className="mt-0.5 h-4 w-4 text-[var(--glass-text-tertiary)]" />
                  <span>{t('simpleRuleRelease')}</span>
                </div>
              </div>
            </aside>
          </section>

          <section className="rounded-2xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-muted)] p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-xs font-medium text-[var(--glass-text-tertiary)]">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--glass-tone-info-bg)] text-[var(--glass-tone-info-fg)]">2</span>
                  {t('stepMachine')}
                </div>
                <h3 className="mt-3 text-base font-semibold text-[var(--glass-text-primary)]">{t('profiles')}</h3>
              </div>
              {loading && <span className="text-xs text-[var(--glass-text-tertiary)]">{tc('loading')}</span>}
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {profiles.map((profile) => {
                const active = profile.id === selectedProfileId
                return (
                  <button
                    key={profile.id}
                    type="button"
                    onClick={() => setSelectedProfileId(profile.id)}
                    className={`rounded-xl border p-4 text-left transition-all ${
                      active
                        ? 'border-[var(--glass-tone-info-fg)] bg-[var(--glass-tone-info-bg)]/15'
                        : 'border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] hover:border-[var(--glass-stroke-strong)]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-base font-semibold text-[var(--glass-text-primary)]">{profile.displayName}</div>
                        <div className="mt-1 text-xs text-[var(--glass-text-tertiary)]">{profile.purpose}</div>
                      </div>
                      <AppIcon name={active ? 'check' : 'cpu'} className="h-5 w-5 text-[var(--glass-text-tertiary)]" />
                    </div>
                  </button>
                )
              })}
            </div>
          </section>

          <section className="rounded-2xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-muted)] p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-xs font-medium text-[var(--glass-text-tertiary)]">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--glass-tone-info-bg)] text-[var(--glass-tone-info-fg)]">3</span>
                  {t('stepLaunch')}
                </div>
                <h3 className="mt-3 text-base font-semibold text-[var(--glass-text-primary)]">{t('instancesTitle')}</h3>
                <p className="mt-1 text-xs text-[var(--glass-text-tertiary)]">
                  {selectedProfile ? t('selectedMachine', { profile: selectedProfile.displayName }) : t('instancesDescription')}
                </p>
              </div>
              <button
                type="button"
                onClick={handleStartSession}
                disabled={!canStartSession}
                className="glass-btn-base glass-btn-primary flex items-center gap-2 px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                <AppIcon name={sessionBusy === 'start' ? 'loader' : 'play'} className={`h-4 w-4 ${sessionBusy === 'start' ? 'animate-spin' : ''}`} />
                {sessionBusy === 'start' ? t('starting') : t('startInstance')}
              </button>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(220px,0.45fr)]">
              <label className="block">
                <span className="block text-xs font-medium text-[var(--glass-text-tertiary)]">{t('modelBundleLabel')}</span>
                <select
                  value={selectedModelBundle}
                  onChange={(event) => setSelectedModelBundle(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] px-3 py-2 text-sm text-[var(--glass-text-primary)] outline-none transition focus:border-[var(--glass-tone-info-fg)]"
                >
                  <option value={DEFAULT_MODEL_BUNDLE}>{t('modelBundleDefault')}</option>
                  {models.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                    </option>
                  ))}
                </select>
                <span className="mt-2 block text-[11px] text-[var(--glass-text-tertiary)]">
                  {modelsLoading ? tc('loading') : t('modelCount', { count: models.length })}
                </span>
              </label>
              <div className="rounded-xl border border-[var(--glass-stroke-subtle)] bg-[var(--glass-bg-surface)] px-3 py-2 text-xs leading-relaxed text-[var(--glass-text-secondary)]">
                {imageReady ? t('readyToStart') : t('imageRequiredInline')}
              </div>
            </div>

            <div className="mt-4 min-h-5 text-xs">
              {sessionMessage && <span className="text-[var(--glass-tone-success-fg)]">{sessionMessage}</span>}
            </div>

            <div className="mt-3 space-y-2">
              {sessions.map((session) => {
                const canOperate = session.status !== 'released'
                return (
                  <div key={session.id} className="rounded-xl border border-[var(--glass-stroke-subtle)] bg-[var(--glass-bg-surface)] p-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-[var(--glass-text-primary)]">
                            {session.modelBundle || t('modelBundleDefault')}
                          </span>
                          <span className={`glass-chip text-[10px] ${getSessionStatusClass(session.status)}`}>
                            {t(`sessionStatus.${session.status}`)}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-[var(--glass-text-tertiary)]">
                          <span>{session.profileId}</span>
                          <span>{t('paygPrice', { price: formatPaygPrice(session.paygPrice) })}</span>
                          {session.autodlStatus ? <span>AutoDL {session.autodlStatus}</span> : null}
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => handleSessionAction(session.id, 'sync')}
                          disabled={sessionBusy !== null || !canOperate}
                          className="glass-btn-base glass-btn-secondary flex items-center gap-2 px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <AppIcon name={sessionBusy === `${session.id}:sync` ? 'loader' : 'refresh'} className={`h-3.5 w-3.5 ${sessionBusy === `${session.id}:sync` ? 'animate-spin' : ''}`} />
                          {t('syncSession')}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSessionAction(session.id, 'power-off')}
                          disabled={sessionBusy !== null || !canOperate || session.status === 'stopped'}
                          className="glass-btn-base glass-btn-secondary flex items-center gap-2 px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <AppIcon name={sessionBusy === `${session.id}:power-off` ? 'loader' : 'pause'} className={`h-3.5 w-3.5 ${sessionBusy === `${session.id}:power-off` ? 'animate-spin' : ''}`} />
                          {t('powerOffSession')}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSessionAction(session.id, 'release')}
                          disabled={sessionBusy !== null || !canOperate}
                          className="glass-btn-base glass-btn-secondary flex items-center gap-2 px-3 py-2 text-xs text-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <AppIcon name={sessionBusy === `${session.id}:release` ? 'loader' : 'trash'} className={`h-3.5 w-3.5 ${sessionBusy === `${session.id}:release` ? 'animate-spin' : ''}`} />
                          {t('releaseSession')}
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
              {sessions.length === 0 && (
                <div className="rounded-xl border border-dashed border-[var(--glass-stroke-base)] px-3 py-8 text-center text-xs text-[var(--glass-text-tertiary)]">
                  {t('noSessions')}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
