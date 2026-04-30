import type { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'

const bailianMock = vi.hoisted(() => ({
  createVoiceDesign: vi.fn(),
  validateVoicePrompt: vi.fn(),
  validatePreviewText: vi.fn(),
}))

const xiaomiMiMoMock = vi.hoisted(() => ({
  createXiaomiMiMoVoiceDesign: vi.fn(),
}))

const apiConfigMock = vi.hoisted(() => ({
  getProviderConfig: vi.fn(),
  resolveModelSelection: vi.fn(),
}))

const workerMock = vi.hoisted(() => ({
  reportTaskProgress: vi.fn(async () => undefined),
  assertTaskActive: vi.fn(async () => undefined),
}))

vi.mock('@/lib/providers/bailian/voice-design', () => bailianMock)
vi.mock('@/lib/providers/xiaomi-mimo/voice-design', () => xiaomiMiMoMock)
vi.mock('@/lib/api-config', () => apiConfigMock)
vi.mock('@/lib/workers/shared', () => ({
  reportTaskProgress: workerMock.reportTaskProgress,
}))
vi.mock('@/lib/workers/utils', () => ({
  assertTaskActive: workerMock.assertTaskActive,
}))

import { handleVoiceDesignTask } from '@/lib/workers/handlers/voice-design'

function buildJob(type: TaskJobData['type'], payload: Record<string, unknown>): Job<TaskJobData> {
  return {
    data: {
      taskId: 'task-voice-1',
      type,
      locale: 'zh',
      projectId: 'project-1',
      episodeId: null,
      targetType: 'VoiceDesign',
      targetId: 'voice-design-1',
      payload,
      userId: 'user-1',
    },
  } as unknown as Job<TaskJobData>
}

describe('worker voice-design behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    bailianMock.validateVoicePrompt.mockReturnValue({ valid: true })
    bailianMock.validatePreviewText.mockReturnValue({ valid: true })
    apiConfigMock.getProviderConfig.mockResolvedValue({ apiKey: 'bailian-key' })
    apiConfigMock.resolveModelSelection.mockImplementation(async (_userId: string, modelKey: string) => {
      if (modelKey === 'openai-compatible:xiaomi-mimo::MiMo-V2.5-TTS-VoiceDesign') {
        return {
          provider: 'openai-compatible:xiaomi-mimo',
          modelId: 'MiMo-V2.5-TTS-VoiceDesign',
          modelKey,
          mediaType: 'audio',
        }
      }
      return {
        provider: 'bailian',
        modelId: 'qwen-voice-design',
        modelKey,
        mediaType: 'audio',
      }
    })
    bailianMock.createVoiceDesign.mockResolvedValue({
      success: true,
      voiceId: 'voice-id-1',
      targetModel: 'bailian-tts',
      audioBase64: 'base64-audio',
      sampleRate: 24000,
      responseFormat: 'mp3',
      usageCount: 11,
      requestId: 'req-1',
    })
    xiaomiMiMoMock.createXiaomiMiMoVoiceDesign.mockResolvedValue({
      success: true,
      voiceId: 'mimo-designed:voice-id-1',
      targetModel: 'MiMo-V2.5-TTS-VoiceDesign',
      audioBase64: 'mimo-base64-audio',
      sampleRate: 24000,
      responseFormat: 'wav',
      usageCount: 13,
      requestId: 'mimo-req-1',
    })
  })

  it('missing required fields -> explicit error', async () => {
    const job = buildJob(TASK_TYPE.VOICE_DESIGN, { previewText: 'hello' })
    await expect(handleVoiceDesignTask(job)).rejects.toThrow('voicePrompt is required')
  })

  it('invalid prompt validation -> explicit error message from validator', async () => {
    bailianMock.validateVoicePrompt.mockReturnValue({ valid: false, error: 'bad prompt' })

    const job = buildJob(TASK_TYPE.VOICE_DESIGN, {
      voicePrompt: 'x',
      previewText: 'hello',
    })
    await expect(handleVoiceDesignTask(job)).rejects.toThrow('bad prompt')
  })

  it('success path -> submits normalized input and returns typed result', async () => {
    const job = buildJob(TASK_TYPE.ASSET_HUB_VOICE_DESIGN, {
      voicePrompt: '  calm female narrator  ',
      previewText: '  hello world  ',
      preferredName: '  custom_name  ',
      language: 'en',
      voiceDesignModel: 'bailian::qwen-voice-design',
    })

    const result = await handleVoiceDesignTask(job)

    expect(apiConfigMock.resolveModelSelection).toHaveBeenCalledWith('user-1', 'bailian::qwen-voice-design', 'audio')
    expect(apiConfigMock.getProviderConfig).toHaveBeenCalledWith('user-1', 'bailian')
    expect(bailianMock.createVoiceDesign).toHaveBeenCalledWith({
      voicePrompt: 'calm female narrator',
      previewText: 'hello world',
      preferredName: 'custom_name',
      language: 'en',
    }, 'bailian-key')

    expect(result).toEqual(expect.objectContaining({
      success: true,
      voiceId: 'voice-id-1',
      taskType: TASK_TYPE.ASSET_HUB_VOICE_DESIGN,
    }))
  })

  it('xiaomi mimo voice design -> uses selected provider instead of bailian', async () => {
    const job = buildJob(TASK_TYPE.VOICE_DESIGN, {
      voicePrompt: '  warm narration voice  ',
      previewText: '  你好世界  ',
      preferredName: '  mimo_voice  ',
      language: 'zh',
      voiceDesignModel: 'openai-compatible:xiaomi-mimo::MiMo-V2.5-TTS-VoiceDesign',
    })

    const result = await handleVoiceDesignTask(job)

    expect(apiConfigMock.resolveModelSelection).toHaveBeenCalledWith(
      'user-1',
      'openai-compatible:xiaomi-mimo::MiMo-V2.5-TTS-VoiceDesign',
      'audio',
    )
    expect(apiConfigMock.getProviderConfig).not.toHaveBeenCalled()
    expect(bailianMock.createVoiceDesign).not.toHaveBeenCalled()
    expect(xiaomiMiMoMock.createXiaomiMiMoVoiceDesign).toHaveBeenCalledWith({
      voicePrompt: 'warm narration voice',
      previewText: '你好世界',
      preferredName: 'mimo_voice',
      language: 'zh',
      userId: 'user-1',
      providerId: 'openai-compatible:xiaomi-mimo',
      modelId: 'MiMo-V2.5-TTS-VoiceDesign',
    })
    expect(result).toEqual(expect.objectContaining({
      success: true,
      voiceId: 'mimo-designed:voice-id-1',
      taskType: TASK_TYPE.VOICE_DESIGN,
    }))
  })
})
