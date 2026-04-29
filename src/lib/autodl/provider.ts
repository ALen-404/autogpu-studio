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

export function buildAutoDLWorkerProviderConfig(
  params: BuildAutoDLWorkerProviderConfigParams,
): AutoDLWorkerProviderConfig {
  if (!params.sessionId.trim()) throw new Error('AUTODL_SESSION_ID_REQUIRED')
  if (!isAutoDLProfileId(params.profileId)) throw new Error('AUTODL_PROFILE_INVALID')
  if (!params.workerSharedSecretCiphertext.trim()) throw new Error('AUTODL_WORKER_SECRET_REQUIRED')

  const providerId = `openai-compatible:${params.sessionId}`
  const models = getLocalModelCatalogForBundle(params.profileId, params.modelBundle)
    .filter((model) => model.modality !== 'llm')
    .filter((model) => isModelAllowedByBackend(model, params.backendAvailability))
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
    select: {
      customProviders: true,
      customModels: true,
      characterModel: true,
      locationModel: true,
      storyboardModel: true,
      editModel: true,
      videoModel: true,
      audioModel: true,
      analysisModel: true,
    },
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
  const firstProviderModelKeyByType: Partial<Record<AutoDLWorkerModelType, string | null>> = {
    llm: findFirstModelKeyByType(config.models, 'llm'),
    image: findFirstModelKeyByType(config.models, 'image'),
    video: findFirstModelKeyByType(config.models, 'video'),
    audio: findFirstModelKeyByType(config.models, 'audio'),
  }
  const firstMergedModelKeyByType: Partial<Record<AutoDLWorkerModelType, string | null>> = {
    llm: findFirstModelKeyByType(models, 'llm'),
    image: findFirstModelKeyByType(models, 'image'),
    video: findFirstModelKeyByType(models, 'video'),
    audio: findFirstModelKeyByType(models, 'audio'),
  }
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

  await Promise.all(
    PROJECT_MODEL_FIELDS.map(async ({ field, type }) => {
      const validProviderModelKeys = config.models
        .filter((model) => model.type === type)
        .map((model) => model.modelKey)
      await prisma.novelPromotionProject.updateMany({
        where: {
          project: { userId: params.userId },
          [field]: validProviderModelKeys.length > 0
            ? {
              startsWith: providerPrefix,
              notIn: validProviderModelKeys,
            }
            : {
              startsWith: providerPrefix,
            },
        },
        data: {
          [field]: firstMergedModelKeyByType[type] ?? null,
        },
      })
    }),
  )

  return config
}
