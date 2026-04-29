import { NextRequest, NextResponse } from 'next/server'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { prisma } from '@/lib/prisma'
import {
  buildAutoDLSessionView,
  decryptAutoDLToken,
  powerOffAutoDLInstance,
  removeAutoDLWorkerProvider,
  releaseAutoDLInstance,
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
      status: true,
      connection: { select: { tokenCiphertext: true } },
    },
  })
  if (!session?.instanceUuid) {
    throw new ApiError('NOT_FOUND', { message: 'AutoDL 实例会话不存在' })
  }
  if (session.status === 'released') {
    const released = await prisma.autoDLInstanceSession.findUnique({
      where: { id: session.id },
      select: sessionSelect,
    })
    return NextResponse.json({
      success: true,
      session: released ? buildAutoDLSessionView(released) : null,
    })
  }
  if (!session.connection.tokenCiphertext) {
    throw new ApiError('MISSING_CONFIG', { message: '请先绑定 AutoDL 开发者 Token' })
  }

  const token = decryptAutoDLToken(session.connection.tokenCiphertext)
  await powerOffAutoDLInstance({
    token,
    instanceUuid: session.instanceUuid,
  }).catch(() => undefined)
  await releaseAutoDLInstance({
    token,
    instanceUuid: session.instanceUuid,
  })

  const updated = await prisma.autoDLInstanceSession.update({
    where: { id: session.id },
    data: {
      status: 'released',
      autodlStatus: 'released',
      releasedAt: new Date(),
    },
    select: sessionSelect,
  })

  await removeAutoDLWorkerProvider({
    userId,
    sessionId: session.id,
  }).catch(() => undefined)

  return NextResponse.json({
    success: true,
    session: buildAutoDLSessionView(updated),
  })
})
