import type { Job } from 'bullmq'
import {
  createVoiceDesign as createBailianVoiceDesign,
  validatePreviewText,
  validateVoicePrompt,
  type VoiceDesignInput,
  type VoiceDesignResult,
} from '@/lib/providers/bailian/voice-design'
import {
  createXiaomiMiMoVoiceDesign,
  type XiaomiMiMoVoiceDesignResult,
} from '@/lib/providers/xiaomi-mimo/voice-design'
import { getProviderConfig, resolveModelSelection } from '@/lib/api-config'
import { isXiaomiMiMoProviderId } from '@/lib/xiaomi-mimo'
import { reportTaskProgress } from '@/lib/workers/shared'
import { assertTaskActive } from '@/lib/workers/utils'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'

function readRequiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${field} is required`)
  }
  return value.trim()
}

function readLanguage(value: unknown): 'zh' | 'en' {
  return value === 'en' ? 'en' : 'zh'
}

function getProviderKey(providerId: string): string {
  const colonIndex = providerId.indexOf(':')
  return colonIndex === -1 ? providerId : providerId.slice(0, colonIndex)
}

function readVoiceDesignModel(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('Voice design model not configured')
  }
  return value.trim()
}

type VoiceDesignProviderResult = VoiceDesignResult | XiaomiMiMoVoiceDesignResult

export async function handleVoiceDesignTask(job: Job<TaskJobData>) {
  const payload = (job.data.payload || {}) as Record<string, unknown>
  const voicePrompt = readRequiredString(payload.voicePrompt, 'voicePrompt')
  const previewText = readRequiredString(payload.previewText, 'previewText')
  const preferredName = typeof payload.preferredName === 'string' && payload.preferredName.trim()
    ? payload.preferredName.trim()
    : 'custom_voice'
  const language = readLanguage(payload.language)

  const promptValidation = validateVoicePrompt(voicePrompt)
  if (!promptValidation.valid) {
    throw new Error(promptValidation.error || 'invalid voicePrompt')
  }
  const textValidation = validatePreviewText(previewText)
  if (!textValidation.valid) {
    throw new Error(textValidation.error || 'invalid previewText')
  }

  await reportTaskProgress(job, 25, {
    stage: 'voice_design_submit',
    stageLabel: '提交声音设计任务',
    displayMode: 'detail',
  })
  await assertTaskActive(job, 'voice_design_submit')

  const input: VoiceDesignInput = {
    voicePrompt,
    previewText,
    preferredName,
    language,
  }
  const voiceDesignModel = await resolveModelSelection(
    job.data.userId,
    readVoiceDesignModel(payload.voiceDesignModel),
    'audio',
  )
  const providerKey = getProviderKey(voiceDesignModel.provider).toLowerCase()
  let designed: VoiceDesignProviderResult
  if (providerKey === 'bailian') {
    const { apiKey } = await getProviderConfig(job.data.userId, voiceDesignModel.provider)
    designed = await createBailianVoiceDesign(input, apiKey)
  } else if (providerKey === 'openai-compatible' && isXiaomiMiMoProviderId(voiceDesignModel.provider)) {
    designed = await createXiaomiMiMoVoiceDesign({
      ...input,
      userId: job.data.userId,
      providerId: voiceDesignModel.provider,
      modelId: voiceDesignModel.modelId,
    })
  } else {
    throw new Error(`VOICE_DESIGN_PROVIDER_UNSUPPORTED: ${voiceDesignModel.provider}`)
  }
  if (!designed.success) {
    throw new Error(designed.error || '声音设计失败')
  }

  await reportTaskProgress(job, 96, {
    stage: 'voice_design_done',
    stageLabel: '声音设计完成',
    displayMode: 'detail',
  })

  return {
    success: true,
    voiceId: designed.voiceId,
    targetModel: designed.targetModel,
    audioBase64: designed.audioBase64,
    sampleRate: designed.sampleRate,
    responseFormat: designed.responseFormat,
    usageCount: designed.usageCount,
    requestId: designed.requestId,
    taskType: job.data.type === TASK_TYPE.ASSET_HUB_VOICE_DESIGN ? TASK_TYPE.ASSET_HUB_VOICE_DESIGN : TASK_TYPE.VOICE_DESIGN,
  }
}
