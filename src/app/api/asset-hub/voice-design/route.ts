import { createHash } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError, getRequestId } from '@/lib/api-errors'
import { submitTask } from '@/lib/task/submitter'
import { resolveRequiredTaskLocale } from '@/lib/task/resolve-locale'
import { TASK_TYPE } from '@/lib/task/types'
import { buildDefaultTaskBillingInfo } from '@/lib/billing'
import { validatePreviewText, validateVoicePrompt } from '@/lib/providers/bailian/voice-design'
import { parseModelKeyStrict } from '@/lib/model-config-contract'

/**
 * 声音设计 API (Asset Hub)
 * POST /api/asset-hub/voice-design
 */
export const POST = apiHandler(async (request: NextRequest) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const locale = resolveRequiredTaskLocale(request, body)
  const voicePrompt = typeof body.voicePrompt === 'string' ? body.voicePrompt.trim() : ''
  const previewText = typeof body.previewText === 'string' ? body.previewText.trim() : ''
  const preferredName = typeof body.preferredName === 'string' && body.preferredName.trim()
    ? body.preferredName.trim()
    : 'custom_voice'
  const language = body.language === 'en' ? 'en' : 'zh'

  const promptValidation = validateVoicePrompt(voicePrompt)
  if (!promptValidation.valid) {
    throw new ApiError('INVALID_PARAMS')
  }
  const textValidation = validatePreviewText(previewText)
  if (!textValidation.valid) {
    throw new ApiError('INVALID_PARAMS')
  }

  const pref = await prisma.userPreference.findUnique({
    where: { userId: session.user.id },
    select: { voiceDesignModel: true },
  })
  const voiceDesignModel = typeof pref?.voiceDesignModel === 'string' ? pref.voiceDesignModel.trim() : ''
  if (!voiceDesignModel) {
    throw new ApiError('MODEL_NOT_CONFIGURED', {
      field: 'voiceDesignModel',
      message: '请先在设置页面配置声音设计模型',
    })
  }
  if (voiceDesignModel && !parseModelKeyStrict(voiceDesignModel)) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'MODEL_KEY_INVALID',
      field: 'voiceDesignModel',
    })
  }

  const digest = createHash('sha1')
    .update(`${session.user.id}:${voicePrompt}:${previewText}:${preferredName}:${language}`)
    .digest('hex')
    .slice(0, 16)

  const payload = {
    voicePrompt,
    previewText,
    preferredName,
    language,
    voiceDesignModel,
    displayMode: 'detail' as const,
  }

  const result = await submitTask({
    userId: session.user.id,
    locale,
    requestId: getRequestId(request),
    projectId: 'global-asset-hub',
    type: TASK_TYPE.ASSET_HUB_VOICE_DESIGN,
    targetType: 'GlobalAssetHubVoiceDesign',
    targetId: session.user.id,
    payload,
    dedupeKey: `${TASK_TYPE.ASSET_HUB_VOICE_DESIGN}:${digest}`,
    billingInfo: buildDefaultTaskBillingInfo(TASK_TYPE.ASSET_HUB_VOICE_DESIGN, payload),
  })

  return NextResponse.json(result)
})
