import { getProviderConfig } from '@/lib/api-config'

export interface XiaomiMiMoVoiceDesignInput {
  voicePrompt: string
  previewText: string
  preferredName?: string
  language?: 'zh' | 'en'
  userId: string
  providerId: string
  modelId: string
}

export interface XiaomiMiMoVoiceDesignResult {
  success: boolean
  voiceId?: string
  targetModel?: string
  audioBase64?: string
  sampleRate?: number
  responseFormat?: string
  usageCount?: number
  requestId?: string
  error?: string
}

interface XiaomiMiMoChatCompletionResponse {
  id?: string
  request_id?: string
  choices?: Array<{
    message?: {
      audio?: {
        data?: string
      }
    }
  }>
  usage?: {
    total_tokens?: number
  }
  error?: {
    message?: string
  }
  message?: string
}

function buildChatCompletionsEndpoint(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/chat/completions`
}

function readAudioBase64(data: XiaomiMiMoChatCompletionResponse): string | null {
  const audioBase64 = data.choices?.[0]?.message?.audio?.data
  return typeof audioBase64 === 'string' && audioBase64.trim() ? audioBase64.trim() : null
}

export async function createXiaomiMiMoVoiceDesign(
  input: XiaomiMiMoVoiceDesignInput,
): Promise<XiaomiMiMoVoiceDesignResult> {
  const config = await getProviderConfig(input.userId, input.providerId)
  if (!config.baseUrl) {
    return {
      success: false,
      error: `PROVIDER_BASE_URL_MISSING: ${config.id}`,
    }
  }

  const response = await fetch(buildChatCompletionsEndpoint(config.baseUrl), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'api-key': config.apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: input.modelId,
      messages: [
        {
          role: 'user',
          content: input.voicePrompt,
        },
        {
          role: 'assistant',
          content: input.previewText,
        },
      ],
      audio: {
        format: 'wav',
      },
    }),
  })

  const data = (await response.json().catch(() => ({}))) as XiaomiMiMoChatCompletionResponse
  if (!response.ok) {
    return {
      success: false,
      error: data.error?.message || data.message || `XIAOMI_MIMO_VOICE_DESIGN_FAILED(${response.status})`,
      requestId: data.request_id || data.id,
    }
  }

  const audioBase64 = readAudioBase64(data)
  if (!audioBase64) {
    return {
      success: false,
      error: 'XIAOMI_MIMO_VOICE_DESIGN_AUDIO_MISSING',
      requestId: data.request_id || data.id,
    }
  }

  return {
    success: true,
    voiceId: `mimo-designed:${input.preferredName || data.id || data.request_id || 'voice'}`,
    targetModel: input.modelId,
    audioBase64,
    sampleRate: 24000,
    responseFormat: 'wav',
    usageCount: data.usage?.total_tokens,
    requestId: data.request_id || data.id,
  }
}
