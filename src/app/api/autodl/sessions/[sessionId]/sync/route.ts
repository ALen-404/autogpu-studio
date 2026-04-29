import { NextRequest, NextResponse } from 'next/server'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { prisma } from '@/lib/prisma'
import {
  buildAutoDLSessionView,
  buildAutoDLWorkerStartCommand,
  decryptAutoDLToken,
  decryptAutoDLWorkerSecret,
  getAutoDLInstanceSnapshot,
  getAutoDLInstanceStatus,
  getAutoDLPublicServerUrl,
  isAutoDLPublicServerUrlReachableFromInstance,
  normalizeAutoDLPaygPrice,
  probeAutoDLWorkerReadiness,
  removeAutoDLWorkerProvider,
  resolveAutoDLSessionRuntimeStatus,
  resolveAutoDLWorkerBaseUrl,
  upsertAutoDLWorkerProvider,
} from '@/lib/autodl'
import { runAutoDLWorkerStartCommandOverSsh } from '@/lib/autodl/ssh'

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
  request: NextRequest,
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
  let snapshot: Awaited<ReturnType<typeof getAutoDLInstanceSnapshot>> | null = null
  try {
    snapshot = await getAutoDLInstanceSnapshot({
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
  let workerBackends: Awaited<ReturnType<typeof probeAutoDLWorkerReadiness>>['backends'] = null
  const workerSecret = session.workerSharedSecretCiphertext
    ? decryptAutoDLWorkerSecret(session.workerSharedSecretCiphertext)
    : null
  if (workerBaseUrl && session.workerSharedSecretCiphertext) {
    const readiness = await probeAutoDLWorkerReadiness({
      workerBaseUrl,
      workerSecret: workerSecret || '',
    })
    workerHealthy = readiness.healthy
    workerUnauthorized = readiness.unauthorized
    workerBackends = readiness.backends
  }

  const autodlRunning = autodlStatus.trim().toLowerCase() === 'running'
  if (
    autodlRunning
    && !workerHealthy
    && workerUnauthorized
    && workerBaseUrl
    && workerSecret
    && snapshot?.ssh_command
    && snapshot.root_password
  ) {
    const serverUrl = getAutoDLPublicServerUrl(request.nextUrl.origin)
    if (isAutoDLPublicServerUrlReachableFromInstance(serverUrl)) {
      try {
        await runAutoDLWorkerStartCommandOverSsh({
          sshCommand: snapshot.ssh_command,
          rootPassword: snapshot.root_password,
          startCommand: buildAutoDLWorkerStartCommand({
            serverUrl,
            preferredPort,
            modelBundle: session.modelBundle || 'balanced',
            workerSecret,
          }),
        })
        const readiness = await probeAutoDLWorkerReadiness({
          workerBaseUrl,
          workerSecret,
          timeoutMs: 15_000,
        })
        workerHealthy = readiness.healthy
        workerUnauthorized = readiness.unauthorized
        workerBackends = readiness.backends
      } catch {
        // 同步接口不能因为自动修复失败而中断，状态会继续反映当前 Worker 健康情况。
      }
    }
  }

  const provider = workerHealthy && workerBaseUrl && session.workerSharedSecretCiphertext
    ? await upsertAutoDLWorkerProvider({
      userId,
      sessionId: session.id,
      profileId: session.profileId === 'pro6000-p' ? 'pro6000-p' : '5090-p',
      modelBundle: session.modelBundle,
      workerBaseUrl,
      workerSharedSecretCiphertext: session.workerSharedSecretCiphertext,
      backendAvailability: workerBackends,
    }).catch(() => null)
    : null

  const status = resolveAutoDLSessionRuntimeStatus(autodlStatus, workerHealthy, workerBaseUrl, {
    workerExpected: !!session.workerSharedSecretCiphertext,
    workerUnauthorized,
    startedAt: session.startedAt,
  })

  if (status === 'stopped' || status === 'released' || status === 'failed') {
    await removeAutoDLWorkerProvider({
      userId,
      sessionId: session.id,
    }).catch(() => undefined)
  }

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
