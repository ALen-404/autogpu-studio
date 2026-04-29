import { NextRequest, NextResponse } from 'next/server'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { prisma } from '@/lib/prisma'
import {
  buildAutoDLSessionView,
  buildSessionStartCommand,
  createAutoDLInstance,
  decryptAutoDLToken,
  getAutoDLDefaultImageUuid,
  getAutoDLModelBundle,
  getAutoDLPublicServerUrl,
  isAutoDLPublicServerUrlReachableFromInstance,
  isAutoDLProfileId,
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

function readTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readCreateBody(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ApiError('INVALID_PARAMS', { message: '请求体无效' })
  }
  const raw = body as Record<string, unknown>
  const profileId = readTrimmedString(raw.profileId)
  if (!isAutoDLProfileId(profileId)) {
    throw new ApiError('INVALID_PARAMS', { message: 'AutoDL GPU 档位无效' })
  }
  const requestedBundle = getAutoDLModelBundle(readTrimmedString(raw.modelBundle))
  const modelBundle = requestedBundle.supportedProfileIds.includes(profileId)
    ? requestedBundle.id
    : getAutoDLModelBundle('balanced').id
  return {
    profileId,
    imageUuid: readTrimmedString(raw.imageUuid),
    modelBundle,
    instanceName: readTrimmedString(raw.instanceName) || `AutoGPU Studio ${profileId}`,
  }
}

export const GET = apiHandler(async () => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const userId = authResult.session.user.id

  const sessions = await prisma.autoDLInstanceSession.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: sessionSelect,
  })

  return NextResponse.json({
    success: true,
    sessions: sessions.map(buildAutoDLSessionView),
  })
})

export const POST = apiHandler(async (request: NextRequest) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const userId = authResult.session.user.id

  let body: unknown
  try {
    body = await request.json()
  } catch {
    throw new ApiError('INVALID_PARAMS', { message: '请求体不是合法 JSON' })
  }
  const input = readCreateBody(body)

  const connection = await prisma.autoDLConnection.findUnique({
    where: { userId },
    select: {
      id: true,
      tokenCiphertext: true,
      defaultImageUuid: true,
      preferredPort: true,
    },
  })
  if (!connection?.tokenCiphertext) {
    throw new ApiError('MISSING_CONFIG', { message: '请先绑定 AutoDL 开发者 Token' })
  }

  const imageUuid = input.imageUuid || connection.defaultImageUuid || getAutoDLDefaultImageUuid(input.profileId) || ''
  if (!imageUuid) {
    throw new ApiError('MISSING_CONFIG', {
      message: '平台还没有配置可启动的 AutoDL 默认镜像，请管理员先在 .env 设置 AUTODL_DEFAULT_IMAGE_UUID，或按档位设置 AUTODL_DEFAULT_IMAGE_UUID_5090_P / AUTODL_DEFAULT_IMAGE_UUID_PRO6000_P',
    })
  }

  const token = decryptAutoDLToken(connection.tokenCiphertext)
  const serverUrl = getAutoDLPublicServerUrl(request.nextUrl.origin)
  if (!isAutoDLPublicServerUrlReachableFromInstance(serverUrl) && process.env.AUTODL_ALLOW_LOCAL_PUBLIC_URL !== '1') {
    throw new ApiError('MISSING_CONFIG', {
      message: '请先把 AUTODL_PUBLIC_SERVER_URL 设置为公网域名，例如 https://cryptotools.bar',
    })
  }
  const preferredPort = connection.preferredPort === 6008 ? 6008 : 6006
  const start = buildSessionStartCommand({
    serverUrl,
    preferredPort,
    modelBundle: input.modelBundle,
  })

  const created = await createAutoDLInstance({
    token,
    profileId: input.profileId,
    imageUuid,
    instanceName: input.instanceName,
    startCommand: start.startCommand,
  })

  const now = new Date()
  const session = await prisma.autoDLInstanceSession.create({
    data: {
      userId,
      connectionId: connection.id,
      instanceUuid: created.instanceUuid,
      profileId: input.profileId,
      imageUuid,
      modelBundle: input.modelBundle,
      status: 'booting',
      autodlStatus: 'created',
      workerSharedSecretCiphertext: start.workerSecret.ciphertext,
      startedAt: now,
    },
    select: sessionSelect,
  })

  return NextResponse.json({
    success: true,
    session: buildAutoDLSessionView(session),
  }, { status: 201 })
})
