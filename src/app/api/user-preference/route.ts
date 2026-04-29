import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { ApiError, apiHandler } from '@/lib/api-errors'
import { isArtStyleValue } from '@/lib/constants'
import { isAutoDLProfileId, upsertAutoDLWorkerProvider } from '@/lib/autodl'

type UserPreferenceRecord = Awaited<ReturnType<typeof loadUserPreference>>

const ACTIVE_AUTODL_SESSION_STATUSES = ['created', 'booting', 'running', 'worker_ready'] as const

function validateArtStyleField(value: unknown): string {
  if (typeof value !== 'string') {
    throw new ApiError('INVALID_PARAMS', {
      code: 'INVALID_ART_STYLE',
      field: 'artStyle',
      message: 'artStyle must be a supported value',
    })
  }
  const artStyle = value.trim()
  if (!isArtStyleValue(artStyle)) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'INVALID_ART_STYLE',
      field: 'artStyle',
      message: 'artStyle must be a supported value',
    })
  }
  return artStyle
}

async function loadUserPreference(userId: string) {
  return await prisma.userPreference.findUnique({
    where: { userId },
  })
}

async function ensureAutoDLModelDefaults(userId: string, preference: NonNullable<UserPreferenceRecord>) {
  if (preference.analysisModel?.trim()) return preference

  const readySession = await prisma.autoDLInstanceSession.findFirst({
    where: {
      userId,
      status: 'worker_ready',
      workerBaseUrl: { not: null },
      workerSharedSecretCiphertext: { not: null },
    },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      profileId: true,
      modelBundle: true,
      workerBaseUrl: true,
      workerSharedSecretCiphertext: true,
    },
  })

  if (
    !readySession?.workerBaseUrl ||
    !readySession.workerSharedSecretCiphertext ||
    !isAutoDLProfileId(readySession.profileId)
  ) {
    return preference
  }

  await upsertAutoDLWorkerProvider({
    userId,
    sessionId: readySession.id,
    profileId: readySession.profileId,
    modelBundle: readySession.modelBundle,
    workerBaseUrl: readySession.workerBaseUrl,
    workerSharedSecretCiphertext: readySession.workerSharedSecretCiphertext,
  })

  return await loadUserPreference(userId) ?? preference
}

async function buildModelSetupPayload(userId: string, preference: NonNullable<UserPreferenceRecord>) {
  const latestAutoDLSession = await prisma.autoDLInstanceSession.findFirst({
    where: {
      userId,
      status: { in: [...ACTIVE_AUTODL_SESSION_STATUSES] },
    },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      profileId: true,
      modelBundle: true,
      status: true,
      autodlStatus: true,
      workerBaseUrl: true,
      updatedAt: true,
    },
  })

  const hasAnalysisModel = !!preference.analysisModel?.trim()
  const autoDLWorkerReady = latestAutoDLSession?.status === 'worker_ready'

  return {
    ready: hasAnalysisModel || autoDLWorkerReady,
    hasAnalysisModel,
    autoDLWorkerReady,
    latestAutoDLSession: latestAutoDLSession ? {
      id: latestAutoDLSession.id,
      profileId: latestAutoDLSession.profileId,
      modelBundle: latestAutoDLSession.modelBundle,
      status: latestAutoDLSession.status,
      autodlStatus: latestAutoDLSession.autodlStatus,
      hasWorkerBaseUrl: !!latestAutoDLSession.workerBaseUrl,
      updatedAt: latestAutoDLSession.updatedAt.toISOString(),
    } : null,
  }
}

// GET - 获取用户偏好配置
export const GET = apiHandler(async () => {
  // 🔐 统一权限验证
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  // 获取或创建用户偏好
  let preference = await prisma.userPreference.upsert({
    where: { userId: session.user.id },
    update: {},
    create: { userId: session.user.id }
  })
  preference = await ensureAutoDLModelDefaults(session.user.id, preference)
  const modelSetup = await buildModelSetupPayload(session.user.id, preference)

  return NextResponse.json({ preference, modelSetup })
})

// PATCH - 更新用户偏好配置
export const PATCH = apiHandler(async (request: NextRequest) => {
  // 🔐 统一权限验证
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const { session } = authResult

  const body = await request.json()

  // 只允许更新特定字段
  const allowedFields = [
    'analysisModel',
    'characterModel',
    'locationModel',
    'storyboardModel',
    'editModel',
    'videoModel',
    'audioModel',
    'lipSyncModel',
    'videoRatio',
    'artStyle',
    'ttsRate'
  ]

  const updateData: Record<string, unknown> = {}
  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      if (field === 'artStyle') {
        updateData[field] = validateArtStyleField(body[field])
        continue
      }
      updateData[field] = body[field]
    }
  }

  if (Object.keys(updateData).length === 0) {
    throw new ApiError('INVALID_PARAMS')
  }

  // 更新或创建用户偏好
  const preference = await prisma.userPreference.upsert({
    where: { userId: session.user.id },
    update: updateData,
    create: {
      userId: session.user.id,
      ...updateData
    }
  })

  return NextResponse.json({ preference })
})
