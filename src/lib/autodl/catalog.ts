export type AutoDLProfileId = 'pro6000-p' | '5090-p'
export type AutoDLConnectionModeId = 'manual' | 'user_api_key'
export type LocalModelModality = 'video' | 'image' | 'llm' | 'tts'
export type AutoDLModelBundleId = 'starter' | 'balanced' | 'advanced'

export interface AutoDLGpuProfile {
  id: AutoDLProfileId
  displayName: string
  specId: AutoDLProfileId
  gpuName: string
  purpose: string
  recommendedUseCases: string[]
  billingMode: 'user_owned_autodl_account'
  resaleAllowed: false
  priceMarkupPercent: 0
}

export interface AutoDLConnectionMode {
  id: AutoDLConnectionModeId
  displayName: string
  scope: 'public_demo_safe' | 'self_hosted_only'
  requiresApiKey: boolean
}

export interface LocalModelCatalogItem {
  id: string
  name: string
  modality: LocalModelModality
  supportedProfileIds: AutoDLProfileId[]
  recommendedProfileId: AutoDLProfileId
  status: 'supported' | 'experimental'
  licenseNote: string
}

export interface AutoDLModelBundle {
  id: AutoDLModelBundleId
  displayName: string
  tagline: string
  description: string
  recommendedProfileId: AutoDLProfileId
  supportedProfileIds: AutoDLProfileId[]
  modelIds: string[]
  featureTags: string[]
}

export const AUTODL_OFFICIAL_URL_FALLBACK = 'https://www.autodl.com/home'

const AUTODL_PROFILE_IDS: AutoDLProfileId[] = ['pro6000-p', '5090-p']
const AUTODL_MODEL_BUNDLE_IDS: AutoDLModelBundleId[] = ['starter', 'balanced', 'advanced']

const AUTODL_GPU_PROFILES: AutoDLGpuProfile[] = [
  {
    id: 'pro6000-p',
    displayName: 'PRO6000',
    specId: 'pro6000-p',
    gpuName: 'NVIDIA RTX PRO 6000',
    purpose: '高质量视频、大图和高质量 TTS',
    recommendedUseCases: ['高质量视频', '图生视频', '大图生成', '高质量 TTS'],
    billingMode: 'user_owned_autodl_account',
    resaleAllowed: false,
    priceMarkupPercent: 0,
  },
  {
    id: '5090-p',
    displayName: 'RTX 5090',
    specId: '5090-p',
    gpuName: 'NVIDIA GeForce RTX 5090',
    purpose: '快速视频、图片和轻量 TTS',
    recommendedUseCases: ['快速视频', '文生图', '图片编辑', '轻量 TTS'],
    billingMode: 'user_owned_autodl_account',
    resaleAllowed: false,
    priceMarkupPercent: 0,
  },
]

export const AUTODL_CONNECTION_MODES: AutoDLConnectionMode[] = [
  {
    id: 'manual',
    displayName: '手动连接',
    scope: 'public_demo_safe',
    requiresApiKey: false,
  },
  {
    id: 'user_api_key',
    displayName: '用户自带 API Key',
    scope: 'self_hosted_only',
    requiresApiKey: true,
  },
]

const LOCAL_MODEL_CATALOG: LocalModelCatalogItem[] = [
  {
    id: 'wan2.2-ti2v-5b',
    name: 'Wan2.2 TI2V 5B',
    modality: 'video',
    supportedProfileIds: ['pro6000-p', '5090-p'],
    recommendedProfileId: '5090-p',
    status: 'supported',
    licenseNote: '按模型许可证使用',
  },
  {
    id: 'wan2.2-i2v-a14b',
    name: 'Wan2.2 I2V A14B',
    modality: 'video',
    supportedProfileIds: ['pro6000-p'],
    recommendedProfileId: 'pro6000-p',
    status: 'supported',
    licenseNote: '按模型许可证使用',
  },
  {
    id: 'ltx-video-2b-distilled',
    name: 'LTX-Video 2B Distilled',
    modality: 'video',
    supportedProfileIds: ['pro6000-p', '5090-p'],
    recommendedProfileId: '5090-p',
    status: 'supported',
    licenseNote: '按模型许可证使用',
  },
  {
    id: 'ltx-video-13b-fp8',
    name: 'LTX-Video 13B Distilled FP8',
    modality: 'video',
    supportedProfileIds: ['pro6000-p'],
    recommendedProfileId: 'pro6000-p',
    status: 'supported',
    licenseNote: '按模型许可证使用',
  },
  {
    id: 'flux2-klein-4b',
    name: 'FLUX.2 klein 4B',
    modality: 'image',
    supportedProfileIds: ['pro6000-p', '5090-p'],
    recommendedProfileId: '5090-p',
    status: 'supported',
    licenseNote: '按模型许可证使用',
  },
  {
    id: 'qwen-image-edit',
    name: 'Qwen-Image / Qwen-Image-Edit',
    modality: 'image',
    supportedProfileIds: ['pro6000-p'],
    recommendedProfileId: 'pro6000-p',
    status: 'supported',
    licenseNote: '按模型许可证使用',
  },
  {
    id: 'sdxl-sd35-medium',
    name: 'SDXL / SD 3.5 Medium',
    modality: 'image',
    supportedProfileIds: ['pro6000-p', '5090-p'],
    recommendedProfileId: '5090-p',
    status: 'supported',
    licenseNote: '按模型许可证使用',
  },
  {
    id: 'cosyvoice3-0.5b',
    name: 'CosyVoice 3 0.5B',
    modality: 'tts',
    supportedProfileIds: ['pro6000-p', '5090-p'],
    recommendedProfileId: '5090-p',
    status: 'supported',
    licenseNote: '按模型许可证使用',
  },
  {
    id: 'f5-tts-v1',
    name: 'F5-TTS v1',
    modality: 'tts',
    supportedProfileIds: ['pro6000-p', '5090-p'],
    recommendedProfileId: '5090-p',
    status: 'supported',
    licenseNote: '按模型许可证使用',
  },
  {
    id: 'indextts2',
    name: 'IndexTTS2',
    modality: 'tts',
    supportedProfileIds: ['pro6000-p'],
    recommendedProfileId: 'pro6000-p',
    status: 'experimental',
    licenseNote: '按模型许可证使用',
  },
  {
    id: 'fish-speech',
    name: 'Fish-Speech',
    modality: 'tts',
    supportedProfileIds: ['pro6000-p'],
    recommendedProfileId: 'pro6000-p',
    status: 'experimental',
    licenseNote: '按模型许可证使用',
  },
]

const AUTODL_MODEL_BUNDLES: AutoDLModelBundle[] = [
  {
    id: 'starter',
    displayName: '低级',
    tagline: '省钱，适合先跑通流程',
    description: '轻量视频、基础生图和普通 TTS，文本分析建议使用外部 LLM，适合测试分镜到成片链路。',
    recommendedProfileId: '5090-p',
    supportedProfileIds: ['5090-p', 'pro6000-p'],
    modelIds: ['ltx-video-2b-distilled', 'sdxl-sd35-medium', 'cosyvoice3-0.5b'],
    featureTags: ['省钱', '轻量视频', '基础生图', '外部文本', '普通 TTS'],
  },
  {
    id: 'balanced',
    displayName: '中级',
    tagline: '质量和速度比较均衡',
    description: '更好的视频和图片质量，保留 TTS，文本分析建议使用外部 LLM，适合日常创作。',
    recommendedProfileId: '5090-p',
    supportedProfileIds: ['5090-p', 'pro6000-p'],
    modelIds: ['wan2.2-ti2v-5b', 'flux2-klein-4b', 'f5-tts-v1'],
    featureTags: ['均衡', '视频生成', '高清生图', '外部文本', '自然 TTS'],
  },
  {
    id: 'advanced',
    displayName: '高级',
    tagline: '质量优先，适合正式出片',
    description: '高质量视频、图片编辑、大图生成和高级 TTS，文本分析建议使用外部 LLM，建议用 PRO6000。',
    recommendedProfileId: 'pro6000-p',
    supportedProfileIds: ['pro6000-p'],
    modelIds: ['wan2.2-i2v-a14b', 'ltx-video-13b-fp8', 'qwen-image-edit', 'indextts2', 'fish-speech'],
    featureTags: ['高质量', '图生视频', '图片编辑', '外部文本', '高级 TTS'],
  },
]

export function isAutoDLProfileId(value: unknown): value is AutoDLProfileId {
  return typeof value === 'string' && AUTODL_PROFILE_IDS.includes(value as AutoDLProfileId)
}

export function isAutoDLModelBundleId(value: unknown): value is AutoDLModelBundleId {
  return typeof value === 'string' && AUTODL_MODEL_BUNDLE_IDS.includes(value as AutoDLModelBundleId)
}

function splitProfileIds(rawValue: string | undefined): AutoDLProfileId[] {
  if (!rawValue) return AUTODL_PROFILE_IDS
  const ids = rawValue
    .split(',')
    .map((item) => item.trim())
    .filter(isAutoDLProfileId)
  return ids.length > 0 ? ids : AUTODL_PROFILE_IDS
}

export function getAutoDLOfficialUrl(): string {
  const rawUrl = process.env.AUTODL_OFFICIAL_URL?.trim()
  if (!rawUrl) return AUTODL_OFFICIAL_URL_FALLBACK
  try {
    const parsed = new URL(rawUrl)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return AUTODL_OFFICIAL_URL_FALLBACK
    return parsed.toString()
  } catch {
    return AUTODL_OFFICIAL_URL_FALLBACK
  }
}

export function getAutoDLProfiles(): AutoDLGpuProfile[] {
  const allowedIds = new Set(splitProfileIds(process.env.AUTODL_ALLOWED_GPU_PROFILES))
  return AUTODL_GPU_PROFILES.filter((profile) => allowedIds.has(profile.id))
}

export function getAutoDLDefaultProfileId(): AutoDLProfileId {
  const rawDefault = process.env.AUTODL_DEFAULT_GPU_PROFILE?.trim()
  if (isAutoDLProfileId(rawDefault)) return rawDefault
  return '5090-p'
}

export function getLocalModelCatalog(profileId?: AutoDLProfileId | null): LocalModelCatalogItem[] {
  if (!profileId) return LOCAL_MODEL_CATALOG
  return LOCAL_MODEL_CATALOG.filter((model) => model.supportedProfileIds.includes(profileId))
}

export function getAutoDLModelBundles(profileId?: AutoDLProfileId | null): AutoDLModelBundle[] {
  if (!profileId) return AUTODL_MODEL_BUNDLES
  return AUTODL_MODEL_BUNDLES.filter((bundle) => bundle.supportedProfileIds.includes(profileId))
}

export function getAutoDLModelBundle(bundleId?: string | null): AutoDLModelBundle {
  if (isAutoDLModelBundleId(bundleId)) {
    return AUTODL_MODEL_BUNDLES.find((bundle) => bundle.id === bundleId) || AUTODL_MODEL_BUNDLES[1]
  }
  return AUTODL_MODEL_BUNDLES[1]
}

export function getLocalModelCatalogForBundle(
  profileId: AutoDLProfileId,
  bundleId?: string | null,
): LocalModelCatalogItem[] {
  const bundle = getAutoDLModelBundle(bundleId)
  const modelIds = new Set(bundle.modelIds)
  return getLocalModelCatalog(profileId).filter((model) => modelIds.has(model.id))
}
