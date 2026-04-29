import { describe, expect, it } from 'vitest'
import {
  applyXiaomiMiMoTextDefaults,
  mergeProvidersForDisplay,
} from '@/app/[locale]/profile/components/api-config/hooks'
import {
  XIAOMI_MIMO_DEFAULT_MODEL_ID,
  XIAOMI_MIMO_DEFAULT_MODEL_KEY,
  XIAOMI_MIMO_PROVIDER_ID,
} from '@/app/[locale]/profile/components/api-config/types'
import type { Provider } from '@/app/[locale]/profile/components/api-config/types'

describe('useProviders provider order merge', () => {
  it('preserves saved providers order and appends missing presets at the end', () => {
    const presetProviders: Provider[] = [
      { id: 'ark', name: '火山引擎 Ark' },
      { id: 'google', name: 'Google AI Studio' },
      { id: 'bailian', name: '阿里云百炼' },
    ]
    const savedProviders: Provider[] = [
      { id: 'google', name: 'Google Legacy Name', apiKey: 'google-key', hidden: true },
      { id: 'openai-compatible:oa-2', name: 'OpenAI B', baseUrl: 'https://oa-b.test', apiKey: 'oa-key' },
      { id: 'ark', name: 'Ark Legacy Name', apiKey: 'ark-key' },
    ]

    const merged = mergeProvidersForDisplay(savedProviders, presetProviders)
    expect(merged.map((provider) => provider.id)).toEqual([
      'google',
      'openai-compatible:oa-2',
      'ark',
      'bailian',
    ])
    expect(merged[0]?.hidden).toBe(true)
  })

  it('uses preset localized names for preset providers while keeping apiKey/baseUrl from saved data', () => {
    const presetProviders: Provider[] = [
      { id: 'google', name: 'Google AI Studio', baseUrl: 'https://google.default' },
    ]
    const savedProviders: Provider[] = [
      { id: 'google', name: 'Google Old Name', baseUrl: 'https://google.custom', apiKey: 'google-key' },
    ]

    const merged = mergeProvidersForDisplay(savedProviders, presetProviders)
    expect(merged).toHaveLength(1)
    expect(merged[0]).toMatchObject({
      id: 'google',
      name: 'Google AI Studio',
      baseUrl: 'https://google.custom',
      apiKey: 'google-key',
      hasApiKey: true,
    })
  })

  it('uses preset official baseUrl for minimax even when saved payload contains a custom baseUrl', () => {
    const presetProviders: Provider[] = [
      { id: 'minimax', name: 'MiniMax Hailuo', baseUrl: 'https://api.minimaxi.com/v1' },
    ]
    const savedProviders: Provider[] = [
      { id: 'minimax', name: 'MiniMax Legacy', baseUrl: 'https://custom.minimax.proxy/v1', apiKey: 'mm-key' },
    ]

    const merged = mergeProvidersForDisplay(savedProviders, presetProviders)
    expect(merged).toHaveLength(1)
    expect(merged[0]).toMatchObject({
      id: 'minimax',
      name: 'MiniMax Hailuo',
      baseUrl: 'https://api.minimaxi.com/v1',
      apiKey: 'mm-key',
      hasApiKey: true,
    })
  })

  it('merges exact openai-compatible preset providers without duplicating Xiaomi MiMo', () => {
    const presetProviders: Provider[] = [
      { id: XIAOMI_MIMO_PROVIDER_ID, name: '小米 MiMo', baseUrl: 'https://api.xiaomimimo.com/v1' },
      { id: 'ark', name: '火山引擎 Ark' },
    ]
    const savedProviders: Provider[] = [
      {
        id: XIAOMI_MIMO_PROVIDER_ID,
        name: 'Xiaomi MiMo Old',
        baseUrl: 'https://api.xiaomimimo.com/v1',
        apiKey: 'mimo-key',
      },
    ]

    const merged = mergeProvidersForDisplay(savedProviders, presetProviders)

    expect(merged.map((provider) => provider.id)).toEqual([XIAOMI_MIMO_PROVIDER_ID, 'ark'])
    expect(merged[0]).toMatchObject({
      id: XIAOMI_MIMO_PROVIDER_ID,
      name: '小米 MiMo',
      hasApiKey: true,
    })
  })

  it('enables Xiaomi MiMo Pro and makes it the analysis default after API key setup', () => {
    const applied = applyXiaomiMiMoTextDefaults({
      models: [
        {
          modelId: XIAOMI_MIMO_DEFAULT_MODEL_ID,
          modelKey: XIAOMI_MIMO_DEFAULT_MODEL_KEY,
          name: 'MiMo V2.5 Pro',
          type: 'llm',
          provider: XIAOMI_MIMO_PROVIDER_ID,
          price: 0,
          enabled: false,
        },
      ],
      defaultModels: {
        analysisModel: 'openai-compatible:old-worker::qwen3-8b-instruct',
      },
    })

    expect(applied.changed).toBe(true)
    expect(applied.defaultModels.analysisModel).toBe(XIAOMI_MIMO_DEFAULT_MODEL_KEY)
    expect(applied.models[0]).toMatchObject({
      enabled: true,
      llmProtocol: 'chat-completions',
    })
  })
})
