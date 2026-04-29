import { beforeEach, describe, expect, it, vi } from 'vitest'

const prismaMock = vi.hoisted(() => ({
  userPreference: {
    findUnique: vi.fn(),
  },
}))
const apiConfigMock = vi.hoisted(() => ({
  getModelsByType: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}))
vi.mock('@/lib/api-config', () => apiConfigMock)

import { resolveAnalysisModel } from '@/lib/workers/handlers/resolve-analysis-model'

describe('resolveAnalysisModel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.userPreference.findUnique.mockResolvedValue({
      analysisModel: 'openai-compatible:pref::gpt-4.1-mini',
    })
    apiConfigMock.getModelsByType.mockResolvedValue([
      {
        provider: 'openai-compatible:input',
        modelId: 'gpt-4.1',
        modelKey: 'openai-compatible:input::gpt-4.1',
        type: 'llm',
        name: 'GPT 4.1',
        price: 0,
      },
      {
        provider: 'openai-compatible:project',
        modelId: 'gpt-4.1',
        modelKey: 'openai-compatible:project::gpt-4.1',
        type: 'llm',
        name: 'GPT 4.1',
        price: 0,
      },
      {
        provider: 'openai-compatible:pref',
        modelId: 'gpt-4.1-mini',
        modelKey: 'openai-compatible:pref::gpt-4.1-mini',
        type: 'llm',
        name: 'GPT 4.1 Mini',
        price: 0,
      },
    ])
  })

  it('uses inputModel override when provided', async () => {
    const result = await resolveAnalysisModel({
      userId: 'user-1',
      inputModel: 'openai-compatible:input::gpt-4.1',
      projectAnalysisModel: 'openai-compatible:project::gpt-4.1',
    })

    expect(result).toBe('openai-compatible:input::gpt-4.1')
    expect(prismaMock.userPreference.findUnique).not.toHaveBeenCalled()
  })

  it('uses project analysisModel when inputModel is missing', async () => {
    const result = await resolveAnalysisModel({
      userId: 'user-1',
      projectAnalysisModel: 'openai-compatible:project::gpt-4.1',
    })

    expect(result).toBe('openai-compatible:project::gpt-4.1')
    expect(prismaMock.userPreference.findUnique).not.toHaveBeenCalled()
  })

  it('falls back to user preference analysisModel when project is missing', async () => {
    const result = await resolveAnalysisModel({
      userId: 'user-1',
      projectAnalysisModel: null,
    })

    expect(result).toBe('openai-compatible:pref::gpt-4.1-mini')
    expect(prismaMock.userPreference.findUnique).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      select: { analysisModel: true },
    })
  })

  it('skips stale AutoDL Qwen project model and uses enabled Xiaomi MiMo user default', async () => {
    prismaMock.userPreference.findUnique.mockResolvedValueOnce({
      analysisModel: 'openai-compatible:xiaomi-mimo::mimo-v2.5-pro',
    })
    apiConfigMock.getModelsByType.mockResolvedValueOnce([
      {
        provider: 'openai-compatible:xiaomi-mimo',
        modelId: 'mimo-v2.5-pro',
        modelKey: 'openai-compatible:xiaomi-mimo::mimo-v2.5-pro',
        type: 'llm',
        name: 'MiMo V2.5 Pro',
        price: 0,
      },
    ])

    const result = await resolveAnalysisModel({
      userId: 'user-1',
      projectAnalysisModel: 'openai-compatible:974ffdbd-f182-484c-a9a8-968d4dbe13fe::qwen3-8b-instruct',
    })

    expect(result).toBe('openai-compatible:xiaomi-mimo::mimo-v2.5-pro')
  })

  it('falls back to the first enabled llm when saved analysis defaults are stale', async () => {
    prismaMock.userPreference.findUnique.mockResolvedValueOnce({
      analysisModel: 'openai-compatible:974ffdbd-f182-484c-a9a8-968d4dbe13fe::qwen3-8b-instruct',
    })
    apiConfigMock.getModelsByType.mockResolvedValueOnce([
      {
        provider: 'openai-compatible:xiaomi-mimo',
        modelId: 'mimo-v2.5-pro',
        modelKey: 'openai-compatible:xiaomi-mimo::mimo-v2.5-pro',
        type: 'llm',
        name: 'MiMo V2.5 Pro',
        price: 0,
      },
    ])

    const result = await resolveAnalysisModel({
      userId: 'user-1',
      inputModel: 'openai-compatible:974ffdbd-f182-484c-a9a8-968d4dbe13fe::qwen3-8b-instruct',
      projectAnalysisModel: 'openai-compatible:974ffdbd-f182-484c-a9a8-968d4dbe13fe::qwen3-8b-instruct',
    })

    expect(result).toBe('openai-compatible:xiaomi-mimo::mimo-v2.5-pro')
  })

  it('skips invalid input/project model keys and still falls back to user preference', async () => {
    const result = await resolveAnalysisModel({
      userId: 'user-1',
      inputModel: 'gpt-4.1',
      projectAnalysisModel: 'invalid-model-key',
    })

    expect(result).toBe('openai-compatible:pref::gpt-4.1-mini')
    expect(prismaMock.userPreference.findUnique).toHaveBeenCalledTimes(1)
  })

  it('throws explicit error when all levels are missing', async () => {
    prismaMock.userPreference.findUnique.mockResolvedValueOnce({ analysisModel: null })

    await expect(resolveAnalysisModel({
      userId: 'user-1',
      inputModel: '',
      projectAnalysisModel: null,
    })).rejects.toThrow('ANALYSIS_MODEL_NOT_CONFIGURED')
  })
})
