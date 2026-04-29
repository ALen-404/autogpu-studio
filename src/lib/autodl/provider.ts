import { prisma } from '@/lib/prisma'
import { composeModelKey } from '@/lib/model-config-contract'
import type { UnifiedModelType } from '@/lib/model-config-contract'
import type { OpenAICompatMediaTemplate } from '@/lib/openai-compat-media-template'
import {
  getLocalModelCatalogForBundle,
  isAutoDLProfileId,
  type AutoDLProfileId,
  type LocalModelCatalogItem,
} from './catalog'

type AutoDLWorkerModelType = UnifiedModelType

interface StoredProvider {
  id: string
  name: string
  baseUrl?: string
  apiKey?: string
  hidden?: boolean
  gatewayRoute?: 'official' | 'openai-compat'
}

interface StoredModel {
  modelId: string
  modelKey: string
  name: string
  type: AutoDLWorkerModelType
  provider: string
  price: number
  compatMediaTemplate?: OpenAICompatMediaTemplate
  compatMediaTemplateCheckedAt?: string
  compatMediaTemplateSource?: 'manual'
}

export interface AutoDLWorkerProviderConfig {
  provider: StoredProvider
  models: StoredModel[]
}

export interface BuildAutoDLWorkerProviderConfigParams {
  sessionId: string
  profileId: AutoDLProfileId
  workerBaseUrl: string
  workerSharedSecretCiphertext: string
  modelBundle?: string | null
  supportedModelIds?: string[] | null
  backendAvailability?: {
    image?: boolean
    video?: boolean
    llm?: boolean
    tts?: boolean
  } | null
}

export interface UpsertAutoDLWorkerProviderParams extends BuildAutoDLWorkerProviderConfigParams {
  userId: string
}

export interface RemoveAutoDLWorkerProviderParams {
  userId: string
  sessionId: string
}

const USER_DEFAULT_FIELDS = [
  { field: 'analysisModel', type: 'llm' },
  { field: 'characterModel', type: 'image' },
  { field: 'locationModel', type: 'image' },
  { field: 'storyboardModel', type: 'image' },
  { field: 'editModel', type: 'image' },
  { field: 'videoModel', type: 'video' },
  { field: 'audioModel', type: 'audio' },
] as const

const PROJECT_MODEL_FIELDS = [
  { field: 'analysisModel', type: 'llm' },
  { field: 'imageModel', type: 'image' },
  { field: 'characterModel', type: 'image' },
  { field: 'locationModel', type: 'image' },
  { field: 'storyboardModel', type: 'image' },
  { field: 'editModel', type: 'image' },
  { field: 'videoModel', type: 'video' },
  { field: 'audioModel', type: 'audio' },
] as const

const USER_PREFERENCE_MODEL_SELECT = {
  customProviders: true,
  customModels: true,
  characterModel: true,
  locationModel: true,
  storyboardModel: true,
  editModel: true,
  videoModel: true,
  audioModel: true,
  analysisModel: true,
} as const

function parseArray<T>(rawValue: string | null | undefined): T[] {
  if (!rawValue) return []
  try {
    const parsed = JSON.parse(rawValue) as unknown
    return Array.isArray(parsed) ? parsed as T[] : []
  } catch {
    return []
  }
}

function toWorkerModelType(model: LocalModelCatalogItem): AutoDLWorkerModelType {
  if (model.modality === 'tts') return 'audio'
  if (model.modality === 'llm') return 'llm'
  return model.modality
}

function normalizeWorkerBaseUrl(value: string): string {
  const parsed = new URL(value)
  if (parsed.protocol === 'http:' && parsed.port === '8443') {
    parsed.protocol = 'https:'
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/, '')
  const base = parsed.toString().replace(/\/+$/, '')
  return `${base}/v1`
}

function buildDirectApiImageTemplate(): OpenAICompatMediaTemplate {
  return {
    version: 1,
    mediaType: 'image',
    mode: 'sync',
    create: {
      method: 'POST',
      path: '/autogpu/images',
      contentType: 'application/json',
      bodyTemplate: {
        model: '{{model}}',
        prompt: '{{prompt}}',
        images: '{{images}}',
        size: '{{size}}',
        resolution: '{{resolution}}',
        aspect_ratio: '{{aspect_ratio}}',
      },
    },
    response: {
      outputUrlPath: '$.data[0].url',
      outputUrlsPath: '$.data',
      errorPath: '$.error.message',
    },
  }
}

function buildDirectApiVideoTemplate(): OpenAICompatMediaTemplate {
  return {
    version: 1,
    mediaType: 'video',
    mode: 'async',
    create: {
      method: 'POST',
      path: '/autogpu/videos',
      contentType: 'application/json',
      bodyTemplate: {
        model: '{{model}}',
        prompt: '{{prompt}}',
        image: '{{image}}',
        duration: '{{duration}}',
        size: '{{size}}',
        resolution: '{{resolution}}',
        aspect_ratio: '{{aspect_ratio}}',
      },
    },
    status: {
      method: 'GET',
      path: '/autogpu/videos/{{task_id}}',
    },
    response: {
      taskIdPath: '$.id',
      statusPath: '$.status',
      outputUrlPath: '$.video_url',
      errorPath: '$.error.message',
    },
    polling: {
      intervalMs: 5000,
      timeoutMs: 1800000,
      doneStates: ['completed', 'succeeded', 'success', 'done'],
      failStates: ['failed', 'error', 'cancelled', 'canceled'],
    },
  }
}

function buildDirectApiTemplateForModel(model: LocalModelCatalogItem): Pick<StoredModel, 'compatMediaTemplate' | 'compatMediaTemplateCheckedAt' | 'compatMediaTemplateSource'> {
  if (model.modality === 'image') {
    return {
      compatMediaTemplate: buildDirectApiImageTemplate(),
      compatMediaTemplateCheckedAt: new Date(0).toISOString(),
      compatMediaTemplateSource: 'manual',
    }
  }
  if (model.modality === 'video') {
    return {
      compatMediaTemplate: buildDirectApiVideoTemplate(),
      compatMediaTemplateCheckedAt: new Date(0).toISOString(),
      compatMediaTemplateSource: 'manual',
    }
  }
  return {}
}

function isModelAllowedByBackend(
  model: LocalModelCatalogItem,
  backendAvailability: BuildAutoDLWorkerProviderConfigParams['backendAvailability'],
): boolean {
  if (model.modality === 'image') return backendAvailability?.image !== false
  if (model.modality === 'video') return backendAvailability?.video !== false
  if (model.modality === 'tts') return backendAvailability?.tts !== false
  if (model.modality === 'llm') return backendAvailability?.llm !== false
  return true
}

function findFirstModelKeyByType(models: StoredModel[], type: AutoDLWorkerModelType): string | null {
  return models.find((model) => model.type === type)?.modelKey || null
}

function buildFirstModelKeyByType(models: StoredModel[]): Partial<Record<AutoDLWorkerModelType, string | null>> {
  return {
    llm: findFirstModelKeyByType(models, 'llm'),
    image: findFirstModelKeyByType(models, 'image'),
    video: findFirstModelKeyByType(models, 'video'),
    audio: findFirstModelKeyByType(models, 'audio'),
  }
}

async function updateAutoDLProjectModelBindings(params: {
  userId: string
  providerPrefix: string
  validProviderModelKeysByType: Partial<Record<AutoDLWorkerModelType, string[]>>
  fallbackModelKeyByType: Partial<Record<AutoDLWorkerModelType, string | null>>
}) {
  await Promise.all(
    PROJECT_MODEL_FIELDS.map(async ({ field, type }) => {
      const validProviderModelKeys = params.validProviderModelKeysByType[type] || []
      await prisma.novelPromotionProject.updateMany({
        where: {
          project: { userId: params.userId },
          [field]: validProviderModelKeys.length > 0
            ? {
              startsWith: params.providerPrefix,
              notIn: validProviderModelKeys,
            }
            : {
              startsWith: params.providerPrefix,
            },
        },
        data: {
          [field]: params.fallbackModelKeyByType[type] ?? null,
        },
      })
    }),
  )
}

export function buildAutoDLWorkerProviderConfig(
  params: BuildAutoDLWorkerProviderConfigParams,
): AutoDLWorkerProviderConfig {
  if (!params.sessionId.trim()) throw new Error('AUTODL_SESSION_ID_REQUIRED')
  if (!isAutoDLProfileId(params.profileId)) throw new Error('AUTODL_PROFILE_INVALID')
  if (!params.workerSharedSecretCiphertext.trim()) throw new Error('AUTODL_WORKER_SECRET_REQUIRED')

  const providerId = `openai-compatible:${params.sessionId}`
  const supportedModelIdSet = Array.isArray(params.supportedModelIds)
    ? new Set(params.supportedModelIds)
    : null
  const models = getLocalModelCatalogForBundle(params.profileId, params.modelBundle)
    .filter((model) => model.modality !== 'llm')
    .filter((model) => isModelAllowedByBackend(model, params.backendAvailability))
    .filter((model) => supportedModelIdSet ? supportedModelIdSet.has(model.id) : true)
    .map((model) => ({
      modelId: model.id,
      modelKey: composeModelKey(providerId, model.id),
      name: `AutoDL ${model.name}`,
      type: toWorkerModelType(model),
      provider: providerId,
      price: 0,
      ...buildDirectApiTemplateForModel(model),
    }))

  return {
    provider: {
      id: providerId,
      name: `AutoDL Worker ${params.profileId}`,
      baseUrl: normalizeWorkerBaseUrl(params.workerBaseUrl),
      apiKey: params.workerSharedSecretCiphertext,
      hidden: false,
      gatewayRoute: 'openai-compat',
    },
    models,
  }
}

export async function upsertAutoDLWorkerProvider(
  params: UpsertAutoDLWorkerProviderParams,
): Promise<AutoDLWorkerProviderConfig> {
  const config = buildAutoDLWorkerProviderConfig(params)
  const pref = await prisma.userPreference.findUnique({
    where: { userId: params.userId },
    select: USER_PREFERENCE_MODEL_SELECT,
  })

  const providers = parseArray<StoredProvider>(pref?.customProviders)
    .filter((provider) => provider.id !== config.provider.id)
    .concat(config.provider)
  const models = parseArray<StoredModel>(pref?.customModels)
    .filter((model) => model.provider !== config.provider.id)
    .concat(config.models)

  const firstImageModel = config.models.find((model) => model.type === 'image')?.modelKey
  const firstVideoModel = config.models.find((model) => model.type === 'video')?.modelKey
  const firstAudioModel = config.models.find((model) => model.type === 'audio')?.modelKey
  const providerPrefix = `${config.provider.id}::`
  const enabledModelKeySet = new Set(models.map((model) => model.modelKey))
  const firstProviderModelKeyByType = buildFirstModelKeyByType(config.models)
  const firstMergedModelKeyByType = buildFirstModelKeyByType(models)
  const defaults = Object.fromEntries(
    USER_DEFAULT_FIELDS.flatMap(({ field, type }) => {
      const currentValue = pref?.[field]
      if (typeof currentValue === 'string' && currentValue.trim() && enabledModelKeySet.has(currentValue)) {
        return []
      }
      if (typeof currentValue === 'string' && currentValue.startsWith(providerPrefix)) {
        return [[field, firstMergedModelKeyByType[type] ?? null]]
      }
      if (!currentValue && firstProviderModelKeyByType[type]) {
        return [[field, firstProviderModelKeyByType[type]]]
      }
      return []
    }),
  ) as Partial<Record<(typeof USER_DEFAULT_FIELDS)[number]['field'], string | null>>

  await prisma.userPreference.upsert({
    where: { userId: params.userId },
    create: {
      userId: params.userId,
      customProviders: JSON.stringify(providers),
      customModels: JSON.stringify(models),
      ...(firstImageModel ? {
        characterModel: firstImageModel,
        locationModel: firstImageModel,
        storyboardModel: firstImageModel,
        editModel: firstImageModel,
      } : {}),
      ...(firstVideoModel ? { videoModel: firstVideoModel } : {}),
      ...(firstAudioModel ? { audioModel: firstAudioModel } : {}),
    },
    update: {
      customProviders: JSON.stringify(providers),
      customModels: JSON.stringify(models),
      ...defaults,
    },
  })

  await updateAutoDLProjectModelBindings({
    userId: params.userId,
    providerPrefix,
    validProviderModelKeysByType: {
      llm: config.models.filter((model) => model.type === 'llm').map((model) => model.modelKey),
      image: config.models.filter((model) => model.type === 'image').map((model) => model.modelKey),
      video: config.models.filter((model) => model.type === 'video').map((model) => model.modelKey),
      audio: config.models.filter((model) => model.type === 'audio').map((model) => model.modelKey),
    },
    fallbackModelKeyByType: firstMergedModelKeyByType,
  })

  return config
}

export async function removeAutoDLWorkerProvider(
  params: RemoveAutoDLWorkerProviderParams,
): Promise<void> {
  const providerId = `openai-compatible:${params.sessionId}`
  const providerPrefix = `${providerId}::`
  const pref = await prisma.userPreference.findUnique({
    where: { userId: params.userId },
    select: USER_PREFERENCE_MODEL_SELECT,
  })

  if (!pref) return

  const providers = parseArray<StoredProvider>(pref.customProviders)
    .filter((provider) => provider.id !== providerId)
  const models = parseArray<StoredModel>(pref.customModels)
    .filter((model) => model.provider !== providerId)
  const firstRemainingModelKeyByType = buildFirstModelKeyByType(models)

  const defaults = Object.fromEntries(
    USER_DEFAULT_FIELDS.flatMap(({ field, type }) => {
      const currentValue = pref[field]
      if (typeof currentValue === 'string' && currentValue.startsWith(providerPrefix)) {
        return [[field, firstRemainingModelKeyByType[type] ?? null]]
      }
      return []
    }),
  ) as Partial<Record<(typeof USER_DEFAULT_FIELDS)[number]['field'], string | null>>

  await prisma.userPreference.update({
    where: { userId: params.userId },
    data: {
      customProviders: JSON.stringify(providers),
      customModels: JSON.stringify(models),
      ...defaults,
    },
  })

  await updateAutoDLProjectModelBindings({
    userId: params.userId,
    providerPrefix,
    validProviderModelKeysByType: {},
    fallbackModelKeyByType: firstRemainingModelKeyByType,
  })
}
