import { composeModelKey, parseModelKeyStrict } from './model-config-contract'

export const XIAOMI_MIMO_PROVIDER_ID = 'openai-compatible:xiaomi-mimo'
export const XIAOMI_MIMO_BASE_URL = 'https://token-plan-cn.xiaomimimo.com/v1'
export const XIAOMI_MIMO_DEFAULT_MODEL_ID = 'MiMo-V2.5-Pro'
export const XIAOMI_MIMO_DEFAULT_MODEL_KEY = composeModelKey(
  XIAOMI_MIMO_PROVIDER_ID,
  XIAOMI_MIMO_DEFAULT_MODEL_ID,
)
export const XIAOMI_MIMO_AUDIO_MODEL_ID = 'MiMo-V2.5-TTS'
export const XIAOMI_MIMO_AUDIO_MODEL_KEY = composeModelKey(
  XIAOMI_MIMO_PROVIDER_ID,
  XIAOMI_MIMO_AUDIO_MODEL_ID,
)
export const XIAOMI_MIMO_VOICE_DESIGN_MODEL_ID = 'MiMo-V2.5-TTS-VoiceDesign'
export const XIAOMI_MIMO_VOICE_DESIGN_MODEL_KEY = composeModelKey(
  XIAOMI_MIMO_PROVIDER_ID,
  XIAOMI_MIMO_VOICE_DESIGN_MODEL_ID,
)

const XIAOMI_MIMO_BASE_URL_ALIASES = new Set([
  'https://api.xiaomimimo.com',
  'https://api.xiaomimimo.com/v1',
  'https://token-plan-cn.xiaomimimo.com',
  'https://token-plan-cn.xiaomimimo.com/v1',
])

const XIAOMI_MIMO_MODEL_ID_ALIASES: Record<string, string> = {
  'mimo-v2.5-pro': 'MiMo-V2.5-Pro',
  'mimo-v2.5': 'MiMo-V2.5',
  'mimo-v2-pro': 'MiMo-V2-Pro',
  'mimo-v2-omni': 'MiMo-V2-Omni',
  'mimo-v2.5-tts-voiceclone': 'MiMo-V2.5-TTS-VoiceClone',
  'mimo-v2.5-tts-voicedesign': 'MiMo-V2.5-TTS-VoiceDesign',
  'mimo-v2.5-tts': 'MiMo-V2.5-TTS',
  'mimo-v2-tts': 'MiMo-V2-TTS',
  'mimo-v2-flash': XIAOMI_MIMO_DEFAULT_MODEL_ID,
}

const XIAOMI_MIMO_API_MODEL_ID_ALIASES: Record<string, string> = {
  'mimo-v2.5-tts-voiceclone': 'mimo-v2.5-tts-voiceclone',
  'mimo-v2.5-tts-voicedesign': 'mimo-v2.5-tts-voicedesign',
  'mimo-v2.5-tts': 'mimo-v2.5-tts',
}

function readTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function isXiaomiMiMoProviderId(providerId: string | null | undefined): boolean {
  return readTrimmedString(providerId).toLowerCase() === XIAOMI_MIMO_PROVIDER_ID
}

export function normalizeXiaomiMiMoBaseUrl(baseUrl: string | null | undefined): string {
  const value = readTrimmedString(baseUrl)
  if (!value) return XIAOMI_MIMO_BASE_URL

  try {
    const parsed = new URL(value)
    const normalizedUrl = `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}`.toLowerCase()
    if (XIAOMI_MIMO_BASE_URL_ALIASES.has(normalizedUrl)) {
      return XIAOMI_MIMO_BASE_URL
    }
    return value
  } catch {
    return value
  }
}

export function normalizeXiaomiMiMoModelId(modelId: string | null | undefined): string {
  const value = readTrimmedString(modelId)
  if (!value) return ''
  return XIAOMI_MIMO_MODEL_ID_ALIASES[value.toLowerCase()] || value
}

export function toXiaomiMiMoApiModelId(modelId: string | null | undefined): string {
  const value = readTrimmedString(modelId)
  if (!value) return ''
  return XIAOMI_MIMO_API_MODEL_ID_ALIASES[value.toLowerCase()] || value
}

export function normalizeXiaomiMiMoModelKey(modelKey: string | null | undefined): string {
  const value = readTrimmedString(modelKey)
  if (!value) return ''
  const parsed = parseModelKeyStrict(value)
  if (!parsed || !isXiaomiMiMoProviderId(parsed.provider)) {
    return value
  }
  return composeModelKey(parsed.provider, normalizeXiaomiMiMoModelId(parsed.modelId))
}
