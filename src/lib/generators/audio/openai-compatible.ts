import { BaseAudioGenerator, type AudioGenerateParams, type GenerateResult } from '../base'
import {
  createOpenAICompatClient,
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
  const raw = payload as { audio_url?: unknown; audioUrl?: unknown; output?: { audio_url?: unknown; url?: unknown } }
  const audioUrl = raw.audio_url || raw.audioUrl || raw.output?.audio_url || raw.output?.url
  return typeof audioUrl === 'string' && audioUrl.trim() ? audioUrl.trim() : null
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
    const client = createOpenAICompatClient(config)
    const model = resolveAudioModel(options)

    const response = await client.audio.speech.create({
      model,
      input: text,
      voice: resolveVoice(params.voice) as 'alloy',
      ...(normalizeSpeed(params.rate) ? { speed: normalizeSpeed(params.rate) } : {}),
    } as Parameters<typeof client.audio.speech.create>[0]) as unknown as Response

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
