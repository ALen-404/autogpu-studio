import { NextRequest, NextResponse } from 'next/server'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { prisma } from '@/lib/prisma'
import {
  buildAutoDLSessionView,
  decryptAutoDLToken,
  decryptAutoDLWorkerSecret,
  getAutoDLInstanceSnapshot,
  getAutoDLInstanceStatus,
  normalizeAutoDLPaygPrice,
  probeAutoDLWorkerReadiness,
  resolveAutoDLSessionRuntimeStatus,
  resolveAutoDLWorkerBaseUrl,
  upsertAutoDLWorkerProvider,
} from '@/lib/autodl'

const sessionSelect = {
  id: true,
  instanceUuid: true,
  profileId: true,
  imageUuid: true,
  modelBundle: true,
  status: true,
  autodlStatus: true,
  workerBaseUrl: true,
  paygPrice: true,
  createdAt: true,
  updatedAt: true,
  startedAt: true,
  releasedAt: true,
} as const

export const POST = apiHandler(async (
  _request: NextRequest,
  context: { params: Promise<{ sessionId: string }> },
) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const userId = authResult.session.user.id
  const { sessionId } = await context.params

  const session = await prisma.autoDLInstanceSession.findFirst({
    where: { id: sessionId, userId },
    select: {
      id: true,
      instanceUuid: true,
      profileId: true,
      modelBundle: true,
      startedAt: true,
      workerSharedSecretCiphertext: true,
      connection: {
        select: {
          tokenCiphertext: true,
          preferredPort: true,
        },
      },
    },
  })
  if (!session?.instanceUuid) {
    throw new ApiError('NOT_FOUND', { message: 'AutoDL 实例会话不存在' })
  }
  if (!session.connection.tokenCiphertext) {
    throw new ApiError('MISSING_CONFIG', { message: '请先绑定 AutoDL 开发者 Token' })
  }

  const token = decryptAutoDLToken(session.connection.tokenCiphertext)
  const preferredPort = session.connection.preferredPort === 6008 ? 6008 : 6006
  const autodlStatus = await getAutoDLInstanceStatus({
    token,
    instanceUuid: session.instanceUuid,
  })

  let workerBaseUrl: string | null = null
  let paygPrice: number | null = null
  try {
    const snapshot = await getAutoDLInstanceSnapshot({
      token,
      instanceUuid: session.instanceUuid,
    })
    workerBaseUrl = resolveAutoDLWorkerBaseUrl(snapshot, preferredPort)
    paygPrice = normalizeAutoDLPaygPrice(snapshot.payg_price)
  } catch {
    // AutoDL 偶尔会在实例刚创建时无法返回详情，状态同步仍可继续。
  }

  let workerHealthy = false
  let workerUnauthorized = false
  if (workerBaseUrl && session.workerSharedSecretCiphertext) {
    const readiness = await probeAutoDLWorkerReadiness({
      workerBaseUrl,
      workerSecret: decryptAutoDLWorkerSecret(session.workerSharedSecretCiphertext),
    })
    workerHealthy = readiness.healthy
    workerUnauthorized = readiness.unauthorized
  }

  const provider = workerHealthy && workerBaseUrl && session.workerSharedSecretCiphertext
    ? await upsertAutoDLWorkerProvider({
      userId,
      sessionId: session.id,
      profileId: session.profileId === 'pro6000-p' ? 'pro6000-p' : '5090-p',
      modelBundle: session.modelBundle,
      workerBaseUrl,
      workerSharedSecretCiphertext: session.workerSharedSecretCiphertext,
    }).catch(() => null)
    : null

  const status = resolveAutoDLSessionRuntimeStatus(autodlStatus, workerHealthy, workerBaseUrl, {
    workerExpected: !!session.workerSharedSecretCiphertext,
    workerUnauthorized,
    startedAt: session.startedAt,
  })
  const updated = await prisma.autoDLInstanceSession.update({
    where: { id: session.id },
    data: {
      status,
      autodlStatus,
      ...(workerBaseUrl ? { workerBaseUrl } : {}),
      ...(paygPrice !== null ? { paygPrice } : {}),
      ...(status === 'released' ? { releasedAt: new Date() } : {}),
    },
    select: sessionSelect,
  })

  return NextResponse.json({
    success: true,
    workerHealthy,
    provider,
    session: buildAutoDLSessionView(updated),
  })
})
