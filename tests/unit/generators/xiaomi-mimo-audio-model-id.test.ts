import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiConfigMock = vi.hoisted(() => ({
  getProviderConfig: vi.fn(),
}))

vi.mock('@/lib/api-config', () => apiConfigMock)

import { OpenAICompatibleAudioGenerator } from '@/lib/generators/audio/openai-compatible'

describe('xiaomi mimo audio model id', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiConfigMock.getProviderConfig.mockResolvedValue({
      id: 'openai-compatible:xiaomi-mimo',
      apiKey: 'mimo-key',
      baseUrl: 'https://token-plan-cn.xiaomimimo.com/v1',
    })
  })

  it('sends lowercase tts model id to xiaomi mimo audio endpoint', async () => {
    const fetchMock = vi.fn(async () => new Response('audio', {
      status: 200,
      headers: { 'content-type': 'audio/wav' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const generator = new OpenAICompatibleAudioGenerator('openai-compatible:xiaomi-mimo')
    const result = await generator.generate({
      userId: 'user-1',
      text: '你好',
      voice: 'alloy',
      options: {
        modelId: 'MiMo-V2.5-TTS',
      },
    })

    expect(result.success).toBe(true)
    const firstCall = fetchMock.mock.calls[0] as unknown as [unknown, RequestInit?] | undefined
    const body = JSON.parse(String(firstCall?.[1]?.body || '{}')) as { model?: string }
    expect(body.model).toBe('mimo-v2.5-tts')
  })
})
