import { NextRequest, NextResponse } from 'next/server'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { prisma } from '@/lib/prisma'
import {
  buildAutoDLExternalSessionView,
  buildAutoDLSessionView,
  buildSessionStartCommand,
  createAutoDLInstance,
  decryptAutoDLToken,
  getAutoDLDefaultImageUuid,
  getAutoDLInstanceSnapshot,
  getAutoDLModelBundle,
  getAutoDLPublicServerUrl,
  inferAutoDLModelBundleFromName,
  listAutoDLInstances,
  isAutoDLPublicServerUrlReachableFromInstance,
  isAutoDLProfileId,
  normalizeAutoDLPaygPrice,
  resolveAutoDLSessionRuntimeStatus,
  resolveAutoDLWorkerBaseUrl,
  type AutoDLListedInstance,
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
  workerSharedSecretCiphertext: true,
  paygPrice: true,
  createdAt: true,
  updatedAt: true,
  startedAt: true,
  releasedAt: true,
} as const

function readTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readDate(value: string | null | undefined): Date | undefined {
  if (!value) return undefined
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date
}

function readImportInstanceUuid(body: unknown): string {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return ''
  return readTrimmedString((body as Record<string, unknown>).importInstanceUuid)
}

function findRemoteInstance(instances: AutoDLListedInstance[], instanceUuid: string): AutoDLListedInstance | null {
  return instances.find((instance) => instance.instanceUuid === instanceUuid) || null
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

  const [sessions, connection] = await Promise.all([
    prisma.autoDLInstanceSession.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: sessionSelect,
    }),
    prisma.autoDLConnection.findUnique({
      where: { userId },
      select: {
        tokenCiphertext: true,
      },
    }),
  ])

  let accountInstanceCount = 0
  let accountInstanceSyncError: string | null = null
  const localInstanceUuids = new Set(sessions.map((session) => session.instanceUuid).filter((uuid): uuid is string => !!uuid))
  const remoteSessionViews = []

  if (connection?.tokenCiphertext) {
    try {
      const listed = await listAutoDLInstances({
        token: decryptAutoDLToken(connection.tokenCiphertext),
        pageSize: 50,
      })
      accountInstanceCount = listed.total
      for (const instance of listed.instances) {
        if (localInstanceUuids.has(instance.instanceUuid)) continue
        remoteSessionViews.push(buildAutoDLExternalSessionView(instance))
      }
    } catch (error) {
      accountInstanceSyncError = error instanceof Error ? error.message : 'AutoDL 实例列表同步失败'
    }
  }

  return NextResponse.json({
    success: true,
    accountInstanceCount,
    untrackedInstanceCount: remoteSessionViews.length,
    accountInstanceSyncError,
    sessions: [
      ...sessions.map((session) => buildAutoDLSessionView(session, {
        managedByPlatform: !!session.workerSharedSecretCiphertext,
      })),
      ...remoteSessionViews,
    ],
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
  const importInstanceUuid = readImportInstanceUuid(body)
  const input = importInstanceUuid ? null : readCreateBody(body)

  const connection = await prisma.autoDLConnection.findUnique({
    where: { userId },
    select: {
      id: true,
      tokenCiphertext: true,
      defaultImageUuid: true,
      defaultProfileId: true,
      preferredPort: true,
    },
  })
  if (!connection?.tokenCiphertext) {
    throw new ApiError('MISSING_CONFIG', { message: '请先绑定 AutoDL 开发者 Token' })
  }

  const token = decryptAutoDLToken(connection.tokenCiphertext)
  const preferredPort = connection.preferredPort === 6008 ? 6008 : 6006

  if (importInstanceUuid) {
    const listed = await listAutoDLInstances({
      token,
      pageSize: 50,
    })
    const remoteInstance = findRemoteInstance(listed.instances, importInstanceUuid)
    if (!remoteInstance) {
      throw new ApiError('NOT_FOUND', { message: '没有在当前 AutoDL 账号中找到这台实例' })
    }

    const existing = await prisma.autoDLInstanceSession.findUnique({
      where: { instanceUuid: importInstanceUuid },
      select: {
        id: true,
        userId: true,
        workerSharedSecretCiphertext: true,
      },
    })
    if (existing && existing.userId !== userId) {
      throw new ApiError('FORBIDDEN', { message: '这台 AutoDL 实例已被其他用户加入控制台' })
    }

    let workerBaseUrl: string | null = null
    let paygPrice: number | null = null
    try {
      const snapshot = await getAutoDLInstanceSnapshot({
        token,
        instanceUuid: importInstanceUuid,
      })
      workerBaseUrl = resolveAutoDLWorkerBaseUrl(snapshot, preferredPort)
      paygPrice = normalizeAutoDLPaygPrice(snapshot.payg_price)
    } catch {
      // 已有实例刚启动时详情可能短暂不可用，先加入控制台，后续同步再补齐。
    }

    const profileId = remoteInstance.profileId || (isAutoDLProfileId(connection.defaultProfileId) ? connection.defaultProfileId : '5090-p')
    const modelBundle = inferAutoDLModelBundleFromName(remoteInstance.displayName) || 'balanced'
    const status = resolveAutoDLSessionRuntimeStatus(remoteInstance.status, false, workerBaseUrl)
    const data = {
      connectionId: connection.id,
      profileId,
      imageUuid: null,
      modelBundle,
      status,
      autodlStatus: remoteInstance.status,
      ...(workerBaseUrl ? { workerBaseUrl } : {}),
      ...(paygPrice !== null ? { paygPrice } : {}),
      ...(readDate(remoteInstance.startedAt) ? { startedAt: readDate(remoteInstance.startedAt) } : {}),
    }

    const session = existing
      ? await prisma.autoDLInstanceSession.update({
        where: { id: existing.id },
        data,
        select: sessionSelect,
      })
      : await prisma.autoDLInstanceSession.create({
        data: {
          userId,
          instanceUuid: importInstanceUuid,
          workerSharedSecretCiphertext: null,
          ...data,
        },
        select: sessionSelect,
      })

    return NextResponse.json({
      success: true,
      session: buildAutoDLSessionView(session, {
        displayName: remoteInstance.displayName,
        managedByPlatform: !!session.workerSharedSecretCiphertext,
      }),
    }, { status: existing ? 200 : 201 })
  }

  if (!input) {
    throw new ApiError('INVALID_PARAMS', { message: '请求参数无效' })
  }

  const imageUuid = input.imageUuid || connection.defaultImageUuid || getAutoDLDefaultImageUuid(input.profileId)
  if (!imageUuid) {
    throw new ApiError('MISSING_CONFIG', {
      message: '平台没有找到可启动的 AutoDL 镜像，请刷新页面后重试',
    })
  }

  const serverUrl = getAutoDLPublicServerUrl(request.nextUrl.origin)
  if (!isAutoDLPublicServerUrlReachableFromInstance(serverUrl) && process.env.AUTODL_ALLOW_LOCAL_PUBLIC_URL !== '1') {
    throw new ApiError('MISSING_CONFIG', {
      message: '请先把 AUTODL_PUBLIC_SERVER_URL 设置为公网域名，例如 https://cryptotools.bar',
    })
  }
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
