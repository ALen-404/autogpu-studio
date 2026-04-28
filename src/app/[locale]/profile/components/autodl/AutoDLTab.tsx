'use client'

import { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { AppIcon } from '@/components/ui/icons'
import { apiFetch } from '@/lib/api-fetch'

type AutoDLProfileId = 'pro6000-p' | '5090-p'
type LocalModelModality = 'video' | 'image' | 'tts'
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

interface AutoDLConnectionMode {
  id: 'manual' | 'user_api_key'
  displayName: string
  scope: 'public_demo_safe' | 'self_hosted_only'
  requiresApiKey: boolean
}

interface LocalModel {
  id: string
  name: string
  modality: LocalModelModality
  supportedProfileIds: AutoDLProfileId[]
  recommendedProfileId: AutoDLProfileId
  status: 'supported' | 'experimental'
  licenseNote: string
}

interface ProfilesPayload {
  success: boolean
  officialUrl: string
  defaultProfileId: AutoDLProfileId
  connectionModes: AutoDLConnectionMode[]
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

const MODALITIES: LocalModelModality[] = ['video', 'image', 'tts']
const AUTODL_PORTS: AutoDLPreferredPort[] = [6006, 6008]

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
  const [connectionModes, setConnectionModes] = useState<AutoDLConnectionMode[]>([])
  const [officialUrl, setOfficialUrl] = useState('https://www.autodl.com/home')
  const [selectedProfileId, setSelectedProfileId] = useState<AutoDLProfileId>('5090-p')
  const [models, setModels] = useState<LocalModel[]>([])
  const [connection, setConnection] = useState<AutoDLConnection | null>(null)
  const [apiToken, setApiToken] = useState('')
  const [defaultImageUuid, setDefaultImageUuid] = useState('')
  const [preferredPort, setPreferredPort] = useState<AutoDLPreferredPort>(6006)
  const [loading, setLoading] = useState(true)
  const [modelsLoading, setModelsLoading] = useState(false)
  const [connectionBusy, setConnectionBusy] = useState<'save' | 'test' | 'delete' | null>(null)
  const [connectionMessage, setConnectionMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadProfiles() {
      setLoading(true)
      setError(null)
      try {
        const [response, connectionResponse] = await Promise.all([
          apiFetch('/api/autodl/profiles'),
          apiFetch('/api/autodl/connection'),
        ])
        if (!response.ok || !connectionResponse.ok) throw new Error('profiles')
        const payload = await response.json() as ProfilesPayload
        const connectionPayload = await connectionResponse.json() as AutoDLConnectionPayload
        if (!payload.success || !Array.isArray(payload.profiles)) throw new Error('profiles')
        if (cancelled) return
        setProfiles(payload.profiles)
        setConnectionModes(Array.isArray(payload.connectionModes) ? payload.connectionModes : [])
        setOfficialUrl(payload.officialUrl || 'https://www.autodl.com/home')
        setConnection(connectionPayload.connection || null)
        setSelectedProfileId(connectionPayload.connection?.defaultProfileId || payload.defaultProfileId || '5090-p')
        setDefaultImageUuid(connectionPayload.connection?.defaultImageUuid || '')
        setPreferredPort(connectionPayload.connection?.preferredPort || 6006)
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
  const groupedModels = useMemo(() => {
    return MODALITIES.map((modality) => ({
      modality,
      models: models.filter((model) => model.modality === modality),
    }))
  }, [models])

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
          defaultImageUuid,
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
      setDefaultImageUuid('')
      setPreferredPort(6006)
      setConnectionMessage(t('deleteSuccess'))
    } catch {
      setError(t('deleteFailed'))
    } finally {
      setConnectionBusy(null)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-[var(--glass-stroke-base)] px-6 py-4">
        <div>
          <h2 className="text-lg font-semibold text-[var(--glass-text-primary)]">{t('title')}</h2>
          <p className="mt-1 text-xs text-[var(--glass-text-tertiary)]">{t('subtitle')}</p>
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
        <div className="space-y-6 p-6">
          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-500">
              <AppIcon name="alert" className="h-4 w-4" />
              {error}
            </div>
          )}

          <section className="grid gap-3 md:grid-cols-3">
            <div className="glass-surface-soft rounded-2xl border border-[var(--glass-stroke-base)] p-4">
              <div className="flex items-center gap-2 text-xs font-medium text-[var(--glass-text-tertiary)]">
                <AppIcon name="badgeCheck" className="h-4 w-4" />
                {t('nonCommercial')}
              </div>
              <p className="mt-3 text-xl font-semibold text-[var(--glass-text-primary)]">{t('userOwned')}</p>
            </div>
            <div className="glass-surface-soft rounded-2xl border border-[var(--glass-stroke-base)] p-4">
              <div className="flex items-center gap-2 text-xs font-medium text-[var(--glass-text-tertiary)]">
                <AppIcon name="coins" className="h-4 w-4" />
                {t('pricing')}
              </div>
              <p className="mt-3 text-xl font-semibold text-[var(--glass-text-primary)]">{t('zeroMarkup')}</p>
            </div>
            <div className="glass-surface-soft rounded-2xl border border-[var(--glass-stroke-base)] p-4">
              <div className="flex items-center gap-2 text-xs font-medium text-[var(--glass-text-tertiary)]">
                <AppIcon name="link" className="h-4 w-4" />
                {t('mode')}
              </div>
              <p className="mt-3 text-xl font-semibold text-[var(--glass-text-primary)]">{t('manualFirst')}</p>
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-[var(--glass-text-primary)]">{t('connectionTitle')}</h3>
                <p className="mt-1 text-xs text-[var(--glass-text-tertiary)]">{t('connectionDescription')}</p>
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

            <div className="rounded-2xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-muted)] p-4">
              <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
                <div className="space-y-3">
                  <label className="block text-xs font-medium text-[var(--glass-text-tertiary)]">
                    {t('tokenLabel')}
                  </label>
                  <input
                    type="password"
                    value={apiToken}
                    onChange={(event) => setApiToken(event.target.value)}
                    placeholder={connection?.configured ? t('tokenPlaceholderConfigured', { token: connection.tokenMasked || '' }) : t('tokenPlaceholder')}
                    autoComplete="off"
                    className="w-full rounded-xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] px-3 py-2 text-sm text-[var(--glass-text-primary)] outline-none transition focus:border-[var(--glass-tone-info-fg)]"
                  />
                  <div className="flex flex-wrap gap-2 text-[11px] text-[var(--glass-text-tertiary)]">
                    <span>{connection?.configured ? t('tokenSaved') : t('tokenNotSaved')}</span>
                    {tokenUpdatedAt && <span>{t('tokenUpdatedAt', { time: tokenUpdatedAt })}</span>}
                    {probeAt && <span>{t('lastProbeAt', { time: probeAt })}</span>}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="block text-xs font-medium text-[var(--glass-text-tertiary)]">{t('imageUuidLabel')}</span>
                    <input
                      type="text"
                      value={defaultImageUuid}
                      onChange={(event) => setDefaultImageUuid(event.target.value)}
                      placeholder={t('imageUuidPlaceholder')}
                      className="mt-2 w-full rounded-xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] px-3 py-2 text-sm text-[var(--glass-text-primary)] outline-none transition focus:border-[var(--glass-tone-info-fg)]"
                    />
                  </label>

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
                              : 'border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] text-[var(--glass-text-secondary)]'
                          }`}
                        >
                          {port}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="min-h-5 text-xs">
                  {connectionMessage && <span className="text-[var(--glass-tone-success-fg)]">{connectionMessage}</span>}
                  {connection?.lastProbeMessage && !connectionMessage && (
                    <span className="text-[var(--glass-text-tertiary)]">{connection.lastProbeMessage}</span>
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
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[var(--glass-text-primary)]">{t('profiles')}</h3>
              {loading && <span className="text-xs text-[var(--glass-text-tertiary)]">{tc('loading')}</span>}
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {profiles.map((profile) => {
                const active = profile.id === selectedProfileId
                return (
                  <button
                    key={profile.id}
                    type="button"
                    onClick={() => setSelectedProfileId(profile.id)}
                    className={`min-h-[150px] rounded-2xl border p-4 text-left transition-all ${
                      active
                        ? 'border-[var(--glass-tone-info-fg)] bg-[var(--glass-tone-info-bg)]/15'
                        : 'border-[var(--glass-stroke-base)] bg-[var(--glass-bg-muted)] hover:border-[var(--glass-stroke-strong)]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-lg font-semibold text-[var(--glass-text-primary)]">{profile.displayName}</div>
                        <div className="mt-1 font-mono text-xs text-[var(--glass-text-tertiary)]">{profile.specId}</div>
                      </div>
                      <AppIcon name={active ? 'check' : 'cpu'} className="h-5 w-5 text-[var(--glass-text-tertiary)]" />
                    </div>
                    <p className="mt-3 text-sm text-[var(--glass-text-secondary)]">{profile.purpose}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {profile.recommendedUseCases.map((item) => (
                        <span key={item} className="glass-chip glass-chip-info text-[11px]">
                          {item}
                        </span>
                      ))}
                    </div>
                  </button>
                )
              })}
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-[var(--glass-text-primary)]">{t('connectionModes')}</h3>
            <div className="grid gap-3 md:grid-cols-2">
              {connectionModes.map((mode) => (
                <div key={mode.id} className="rounded-2xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-muted)] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-[var(--glass-text-primary)]">
                      <AppIcon name={mode.requiresApiKey ? 'lock' : 'link'} className="h-4 w-4" />
                      {mode.displayName}
                    </div>
                    <span className={`glass-chip text-[11px] ${mode.scope === 'self_hosted_only' ? 'glass-chip-warning' : 'glass-chip-success'}`}>
                      {t(`modeScope.${mode.scope}`)}
                    </span>
                  </div>
                  <p className="mt-3 text-xs leading-relaxed text-[var(--glass-text-secondary)]">
                    {t(`modeDescription.${mode.id}`)}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[var(--glass-text-primary)]">
                {selectedProfile ? t('modelsFor', { profile: selectedProfile.displayName }) : t('models')}
              </h3>
              {modelsLoading && <span className="text-xs text-[var(--glass-text-tertiary)]">{tc('loading')}</span>}
            </div>

            <div className="grid gap-3 xl:grid-cols-3">
              {groupedModels.map((group) => (
                <div key={group.modality} className="rounded-2xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-muted)] p-4">
                  <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--glass-text-primary)]">
                    <AppIcon
                      name={group.modality === 'video' ? 'video' : group.modality === 'image' ? 'image' : 'audioWave'}
                      className="h-4 w-4"
                    />
                    {t(`modality.${group.modality}`)}
                    <span className="text-xs font-normal text-[var(--glass-text-tertiary)]">{group.models.length}</span>
                  </div>
                  <div className="space-y-2">
                    {group.models.map((model) => (
                      <div key={model.id} className="rounded-xl border border-[var(--glass-stroke-subtle)] bg-[var(--glass-bg-surface)] px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="min-w-0 truncate text-sm font-medium text-[var(--glass-text-primary)]">{model.name}</span>
                          <span className={`glass-chip text-[10px] ${model.status === 'experimental' ? 'glass-chip-warning' : 'glass-chip-success'}`}>
                            {t(`modelStatus.${model.status}`)}
                          </span>
                        </div>
                        <div className="mt-1 font-mono text-[10px] text-[var(--glass-text-tertiary)]">{model.id}</div>
                      </div>
                    ))}
                    {group.models.length === 0 && (
                      <div className="rounded-xl border border-dashed border-[var(--glass-stroke-base)] px-3 py-6 text-center text-xs text-[var(--glass-text-tertiary)]">
                        {t('noModels')}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
