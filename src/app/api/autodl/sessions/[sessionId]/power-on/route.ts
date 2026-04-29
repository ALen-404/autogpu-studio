import { NextRequest, NextResponse } from 'next/server'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { prisma } from '@/lib/prisma'
import {
  buildAutoDLSessionView,
  buildSessionStartCommand,
  decryptAutoDLToken,
  getAutoDLPublicServerUrl,
  isAutoDLPublicServerUrlReachableFromInstance,
  powerOnAutoDLInstance,
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
      status: true,
      modelBundle: true,
      connection: { select: { tokenCiphertext: true, preferredPort: true } },
    },
  })
  if (!session?.instanceUuid) {
    throw new ApiError('NOT_FOUND', { message: 'AutoDL 实例会话不存在' })
  }
  if (session.status === 'released') {
    throw new ApiError('CONFLICT', { message: '实例已经释放，不能再开机' })
  }
  if (!session.connection.tokenCiphertext) {
    throw new ApiError('MISSING_CONFIG', { message: '请先绑定 AutoDL 开发者 Token' })
  }

  const serverUrl = getAutoDLPublicServerUrl(request.nextUrl.origin)
  if (!isAutoDLPublicServerUrlReachableFromInstance(serverUrl)) {
    throw new ApiError('MISSING_CONFIG', {
      message: '请先把 AUTODL_PUBLIC_SERVER_URL 设置为公网域名，例如 https://cryptotools.bar',
    })
  }

  const preferredPort = session.connection.preferredPort === 6008 ? 6008 : 6006
  const start = buildSessionStartCommand({
    serverUrl,
    preferredPort,
    modelBundle: session.modelBundle || 'balanced',
  })
  await powerOnAutoDLInstance({
    token: decryptAutoDLToken(session.connection.tokenCiphertext),
    instanceUuid: session.instanceUuid,
    startCommand: start.startCommand,
  })

  const updated = await prisma.autoDLInstanceSession.update({
    where: { id: session.id },
    data: {
      status: 'booting',
      autodlStatus: 'booting',
      workerSharedSecretCiphertext: start.workerSecret.ciphertext,
      startedAt: new Date(),
    },
    select: sessionSelect,
  })

  return NextResponse.json({
    success: true,
    session: buildAutoDLSessionView(updated),
  })
})
