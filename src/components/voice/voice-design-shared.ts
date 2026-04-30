export const DEFAULT_VOICE_SCHEME_COUNT = 3
export const MIN_VOICE_SCHEME_COUNT = 1
export const MAX_VOICE_SCHEME_COUNT = 10
export const MAX_VOICE_PROMPT_LENGTH = 500

export type VoiceDesignMutationPayload = {
  voicePrompt: string
  previewText: string
  preferredName: string
  language: 'zh'
}

export type VoiceDesignMutationResult = {
  voiceId?: string
  audioBase64?: string
  detail?: string
}

export type GeneratedVoice = {
  voiceId: string
  audioBase64: string
  audioUrl: string
}

type CharacterProfileLike = {
  archetype?: unknown
  personality_tags?: unknown
  personalityTags?: unknown
  era_period?: unknown
  eraPeriod?: unknown
  social_class?: unknown
  socialClass?: unknown
  occupation?: unknown
  gender?: unknown
  age_range?: unknown
  ageRange?: unknown
}

export type CharacterVoicePromptSource = CharacterProfileLike & {
  name?: unknown
  introduction?: unknown
  profileData?: unknown
  customDescription?: unknown
  description?: unknown
  variants?: Array<{ description?: unknown; label?: unknown }> | null
  appearances?: Array<{ description?: unknown; changeReason?: unknown }> | null
}

function readTrimmedString(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const value = input.trim().replace(/\s+/g, ' ')
  return value.length > 0 ? value : null
}

function readStringArray(input: unknown): string[] {
  if (Array.isArray(input)) {
    return input.map(readTrimmedString).filter((item): item is string => !!item)
  }
  const value = readTrimmedString(input)
  return value ? [value] : []
}

function readCharacterProfile(input: unknown): CharacterProfileLike | null {
  if (!input) return null
  if (typeof input === 'object' && !Array.isArray(input)) return input as CharacterProfileLike
  if (typeof input !== 'string') return null
  try {
    const parsed = JSON.parse(input)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as CharacterProfileLike
      : null
  } catch {
    return null
  }
}

function firstAvailableString(...values: unknown[]): string | null {
  for (const value of values) {
    const text = readTrimmedString(value)
    if (text) return text
  }
  return null
}

function firstDescription(source: CharacterVoicePromptSource): string | null {
  const direct = firstAvailableString(source.customDescription, source.description)
  if (direct) return direct

  const variantDescription = source.variants?.map((item) => readTrimmedString(item.description)).find(Boolean)
  if (variantDescription) return variantDescription

  return source.appearances?.map((item) => readTrimmedString(item.description)).find(Boolean) ?? null
}

function joinVoicePromptParts(parts: string[], instruction: string): string {
  const body = parts.join('；')
  const prompt = `${body}；${instruction}`
  if (prompt.length <= MAX_VOICE_PROMPT_LENGTH) return prompt

  const bodyLimit = Math.max(0, MAX_VOICE_PROMPT_LENGTH - instruction.length - 1)
  const truncatedBody = body.length > bodyLimit
    ? body.slice(0, Math.max(0, bodyLimit - 3)).trimEnd() + '...'
    : body
  return `${truncatedBody}；${instruction}`
}

export function buildCharacterVoicePrompt(source: CharacterVoicePromptSource | null | undefined): string {
  if (!source) return ''

  const profile = readCharacterProfile(source.profileData)
  const name = readTrimmedString(source.name)
  const gender = firstAvailableString(profile?.gender, source.gender)
  const ageRange = firstAvailableString(profile?.age_range, profile?.ageRange, source.age_range, source.ageRange)
  const archetype = firstAvailableString(profile?.archetype, source.archetype)
  const eraPeriod = firstAvailableString(profile?.era_period, profile?.eraPeriod, source.era_period, source.eraPeriod)
  const socialClass = firstAvailableString(profile?.social_class, profile?.socialClass, source.social_class, source.socialClass)
  const occupation = firstAvailableString(profile?.occupation, source.occupation)
  const personalityTags = [
    ...readStringArray(profile?.personality_tags),
    ...readStringArray(profile?.personalityTags),
    ...readStringArray(source.personality_tags),
    ...readStringArray(source.personalityTags),
  ].filter((item, index, array) => array.indexOf(item) === index)
  const description = firstDescription(source)
  const introduction = readTrimmedString(source.introduction)

  const parts: string[] = []
  const identity = [name, gender, ageRange].filter(Boolean).join('，')
  if (identity) parts.push(`角色：${identity}`)
  if (archetype) parts.push(`人物定位：${archetype}`)

  const background = [eraPeriod, socialClass, occupation].filter(Boolean)
  if (background.length > 0) parts.push(`背景：${background.join('，')}`)
  if (personalityTags.length > 0) parts.push(`性格气质：${personalityTags.slice(0, 6).join('、')}`)
  if (introduction) parts.push(`人物介绍：${introduction}`)
  if (description) parts.push(`人物描述：${description}`)

  if (parts.length === 0) return ''
  return joinVoicePromptParts(
    parts,
    '请据此设计与人物气质匹配的中文配音声音，明确年龄感、性别感、音色、语速、语调和情绪质感。',
  )
}

export function normalizeVoiceSchemeCount(input: string | number | undefined): number {
  const rawValue = typeof input === 'number' ? input : Number.parseInt(input ?? '', 10)
  if (!Number.isFinite(rawValue)) return DEFAULT_VOICE_SCHEME_COUNT
  return Math.min(MAX_VOICE_SCHEME_COUNT, Math.max(MIN_VOICE_SCHEME_COUNT, rawValue))
}

export function createVoiceDesignPreferredName(index: number, now: () => number = Date.now): string {
  return `voice_${now().toString(36)}_${index + 1}`.slice(0, 16)
}

interface GenerateVoiceDesignOptionsParams {
  count: string | number | undefined
  voicePrompt: string
  previewText: string
  defaultPreviewText: string
  language?: 'zh'
  onDesignVoice: (payload: VoiceDesignMutationPayload) => Promise<VoiceDesignMutationResult>
  createPreferredName?: (index: number) => string
}

export async function generateVoiceDesignOptions({
  count,
  voicePrompt,
  previewText,
  defaultPreviewText,
  language = 'zh',
  onDesignVoice,
  createPreferredName = (index) => createVoiceDesignPreferredName(index),
}: GenerateVoiceDesignOptionsParams): Promise<GeneratedVoice[]> {
  const trimmedPrompt = voicePrompt.trim()
  if (!trimmedPrompt) throw new Error('VOICE_PROMPT_REQUIRED')

  const resolvedPreviewText = previewText.trim() || defaultPreviewText
  const resolvedCount = normalizeVoiceSchemeCount(count)
  const voices: GeneratedVoice[] = []

  for (let index = 0; index < resolvedCount; index += 1) {
    const result = await onDesignVoice({
      voicePrompt: trimmedPrompt,
      previewText: resolvedPreviewText,
      preferredName: createPreferredName(index),
      language,
    })

    if (!result.audioBase64) continue
    if (typeof result.voiceId !== 'string' || result.voiceId.length === 0) {
      throw new Error('VOICE_DESIGN_INVALID_RESPONSE: missing voiceId')
    }

    voices.push({
      voiceId: result.voiceId,
      audioBase64: result.audioBase64,
      audioUrl: `data:audio/wav;base64,${result.audioBase64}`,
    })
  }

  if (voices.length === 0) throw new Error('VOICE_DESIGN_EMPTY_RESULT')

  return voices
}
