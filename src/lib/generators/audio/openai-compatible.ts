import { BaseAudioGenerator, type AudioGenerateParams, type GenerateResult } from '../base'
import {
  readStringOption,
  resolveOpenAICompatClientConfig,
} from '@/lib/model-gateway/openai-compat/common'

function resolveAudioModel(options: Record<string, unknown>): string {
  return readStringOption(options.modelId, 'modelId') || 'gpt-4o-mini-tts'
}

function resolveVoice(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return 'alloy'
  return value.trim()
}

function normalizeSpeed(value: number | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  return Math.min(4, Math.max(0.25, value))
}

function readAudioUrlFromPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  const raw = payload as {
    audio_url?: unknown
    audioUrl?: unknown
    output?: { audio_url?: unknown; url?: unknown }
    data?: Array<{ url?: unknown }>
  }
  const audioUrl = raw.audio_url || raw.audioUrl || raw.output?.audio_url || raw.output?.url || raw.data?.[0]?.url
  return typeof audioUrl === 'string' && audioUrl.trim() ? audioUrl.trim() : null
}

function buildSpeechEndpoint(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/audio/speech`
}

function appendStringBodyField(
  body: Record<string, unknown>,
  field: string,
  value: unknown,
  optionName: string,
) {
  const normalized = readStringOption(value, optionName)
  if (normalized) {
    body[field] = normalized
  }
}

export class OpenAICompatibleAudioGenerator extends BaseAudioGenerator {
  private readonly providerId?: string

  constructor(providerId?: string) {
    super()
    this.providerId = providerId
  }

  protected async doGenerate(params: AudioGenerateParams): Promise<GenerateResult> {
    const { userId, text, options = {} } = params
    const providerId = this.providerId || 'openai-compatible'
    const config = await resolveOpenAICompatClientConfig(userId, providerId)
    const model = resolveAudioModel(options)

    const requestBody: Record<string, unknown> = {
      model,
      input: text,
      voice: resolveVoice(params.voice),
    }
    const speed = normalizeSpeed(params.rate)
    if (speed) {
      requestBody.speed = speed
    }

    appendStringBodyField(requestBody, 'reference_audio_url', options.referenceAudioUrl, 'referenceAudioUrl')
    appendStringBodyField(requestBody, 'reference_text', options.referenceText, 'referenceText')
    appendStringBodyField(requestBody, 'prompt_audio_url', options.promptAudioUrl, 'promptAudioUrl')
    appendStringBodyField(requestBody, 'prompt_text', options.promptText, 'promptText')
    appendStringBodyField(requestBody, 'instruction', options.instruction, 'instruction')
    appendStringBodyField(requestBody, 'emotion_prompt', options.emotionPrompt, 'emotionPrompt')
    appendStringBodyField(requestBody, 'response_format', options.responseFormat, 'responseFormat')

    if (options.body && typeof options.body === 'object' && !Array.isArray(options.body)) {
      Object.assign(requestBody, options.body)
    }

    const response = await fetch(buildSpeechEndpoint(config.baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, audio/*',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
      const payload = await response.json().catch(() => null)
      const errorMessage = readAudioUrlFromPayload(payload)
        || (payload && typeof payload === 'object' && !Array.isArray(payload)
          ? ((payload as { error?: { message?: unknown } }).error?.message as string | undefined)
          : undefined)
        || `OPENAI_COMPAT_AUDIO_REQUEST_FAILED(${response.status})`
      throw new Error(errorMessage)
    }

    const contentType = response.headers.get('content-type') || 'audio/mpeg'
    if (contentType.includes('application/json')) {
      const payload = await response.json().catch(() => null)
      const audioUrl = readAudioUrlFromPayload(payload)
      if (audioUrl) {
        return {
          success: true,
          audioUrl,
        }
      }
      throw new Error('OPENAI_COMPAT_AUDIO_EMPTY_RESPONSE')
    }

    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.length === 0) {
      throw new Error('OPENAI_COMPAT_AUDIO_EMPTY_RESPONSE')
    }

    return {
      success: true,
      audioUrl: `data:${contentType};base64,${buffer.toString('base64')}`,
    }
  }
}
