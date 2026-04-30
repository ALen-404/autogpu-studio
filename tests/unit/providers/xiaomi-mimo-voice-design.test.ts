import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiConfigMock = vi.hoisted(() => ({
  getProviderConfig: vi.fn(),
}))

vi.mock('@/lib/api-config', () => apiConfigMock)

import { createXiaomiMiMoVoiceDesign } from '@/lib/providers/xiaomi-mimo/voice-design'

describe('xiaomi mimo voice design', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    apiConfigMock.getProviderConfig.mockResolvedValue({
      id: 'openai-compatible:xiaomi-mimo',
      name: 'Xiaomi MiMo',
      apiKey: 'mimo-key',
      baseUrl: 'https://api.xiaomimimo.com/v1',
    })
  })

  it('sends the official lowercase voice design model id to xiaomi mimo api', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      id: 'chatcmpl-1',
      choices: [
        {
          message: {
            audio: {
              data: 'base64-audio',
            },
          },
        },
      ],
      usage: { total_tokens: 7 },
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await createXiaomiMiMoVoiceDesign({
      userId: 'user-1',
      providerId: 'openai-compatible:xiaomi-mimo',
      modelId: 'MiMo-V2.5-TTS-VoiceDesign',
      voicePrompt: '温柔的女声',
      previewText: '你好世界',
      preferredName: 'mimo_voice',
    })

    expect(result.success).toBe(true)
    const firstCall = fetchMock.mock.calls[0] as unknown as [unknown, RequestInit?] | undefined
    const body = JSON.parse(String(firstCall?.[1]?.body || '{}')) as { model?: string }
    expect(body.model).toBe('mimo-v2.5-tts-voicedesign')
  })
})
