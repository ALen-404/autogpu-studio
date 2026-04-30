import { beforeEach, describe, expect, it, vi } from 'vitest'

const openAIState = vi.hoisted(() => ({
  chatCreate: vi.fn(),
}))

const getProviderConfigMock = vi.hoisted(() => vi.fn(async () => ({
  id: 'openai-compatible:xiaomi-mimo',
  apiKey: 'mimo-key',
  baseUrl: 'https://token-plan-cn.xiaomimimo.com/v1',
})))

vi.mock('openai', () => ({
  default: class OpenAI {
    chat = {
      completions: {
        create: openAIState.chatCreate,
      },
    }
  },
}))

vi.mock('@/lib/api-config', () => ({
  getProviderConfig: getProviderConfigMock,
}))

import {
  runOpenAICompatChatCompletion,
  runOpenAICompatResponsesCompletion,
} from '@/lib/model-gateway/openai-compat'

describe('openai-compatible xiaomi mimo model id', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getProviderConfigMock.mockResolvedValue({
      id: 'openai-compatible:xiaomi-mimo',
      apiKey: 'mimo-key',
      baseUrl: 'https://token-plan-cn.xiaomimimo.com/v1',
    })
  })

  it('sends lowercase model id to xiaomi mimo chat completions', async () => {
    openAIState.chatCreate.mockResolvedValueOnce({
      id: 'chatcmpl-1',
      choices: [{ message: { content: 'ok' } }],
    })

    await runOpenAICompatChatCompletion({
      userId: 'user-1',
      providerId: 'openai-compatible:xiaomi-mimo',
      modelId: 'MiMo-V2.5-Pro',
      messages: [{ role: 'user', content: 'ping' }],
      temperature: 0,
    })

    expect(openAIState.chatCreate).toHaveBeenCalledWith(expect.objectContaining({
      model: 'mimo-v2.5-pro',
    }))
  })

  it('sends lowercase model id to xiaomi mimo responses endpoint', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      output_text: 'ok',
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await runOpenAICompatResponsesCompletion({
      userId: 'user-1',
      providerId: 'openai-compatible:xiaomi-mimo',
      modelId: 'MiMo-V2.5-Pro',
      messages: [{ role: 'user', content: 'ping' }],
      temperature: 0,
    })

    const firstCall = fetchMock.mock.calls[0] as unknown as [unknown, RequestInit?] | undefined
    const body = JSON.parse(String(firstCall?.[1]?.body || '{}')) as { model?: string }
    expect(body.model).toBe('mimo-v2.5-pro')
  })
})
