import { NextRequest, NextResponse } from 'next/server'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { prisma } from '@/lib/prisma'
import {
  buildAutoDLConnectionView,
  encryptAutoDLToken,
  normalizeAutoDLConnectionInput,
} from '@/lib/autodl'

const connectionSelect = {
  tokenCiphertext: true,
  tokenLast4: true,
  tokenUpdatedAt: true,
  defaultProfileId: true,
  defaultImageUuid: true,
  preferredPort: true,
  status: true,
  lastProbeStatus: true,
  lastProbeMessage: true,
  lastProbeAt: true,
} as const

function toInvalidParams(error: unknown): never {
  throw new ApiError('INVALID_PARAMS', {
    message: error instanceof Error ? error.message : 'AutoDL 连接参数无效',
  })
}

export const GET = apiHandler(async () => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const userId = authResult.session.user.id

  const connection = await prisma.autoDLConnection.findUnique({
    where: { userId },
    select: connectionSelect,
  })

  return NextResponse.json({
    success: true,
    connection: buildAutoDLConnectionView(connection),
  })
})

export const PUT = apiHandler(async (request: NextRequest) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const userId = authResult.session.user.id

  let body: unknown
  try {
    body = await request.json()
  } catch {
    throw new ApiError('INVALID_PARAMS', {
      message: '请求体不是合法 JSON',
    })
  }

  let input
  try {
    input = normalizeAutoDLConnectionInput(body)
  } catch (error) {
    toInvalidParams(error)
  }

  const existing = await prisma.autoDLConnection.findUnique({
    where: { userId },
    select: { tokenCiphertext: true },
  })
  if (!existing?.tokenCiphertext && !input.apiToken) {
    throw new ApiError('MISSING_CONFIG', {
      message: '请先填写 AutoDL 开发者 Token',
    })
  }

  const encrypted = input.apiToken ? encryptAutoDLToken(input.apiToken) : null
  const now = new Date()
  const data = {
    ...(input.defaultProfileId ? { defaultProfileId: input.defaultProfileId } : {}),
    ...(input.defaultImageUuid !== undefined ? { defaultImageUuid: input.defaultImageUuid } : {}),
    ...(input.preferredPort ? { preferredPort: input.preferredPort } : {}),
    ...(encrypted
      ? {
        tokenCiphertext: encrypted.ciphertext,
        tokenLast4: encrypted.last4,
        tokenUpdatedAt: now,
        status: 'configured',
        lastProbeStatus: null,
        lastProbeMessage: null,
        lastProbeAt: null,
      }
      : {}),
  }

  const connection = await prisma.autoDLConnection.upsert({
    where: { userId },
    create: {
      userId,
      defaultProfileId: input.defaultProfileId || '5090-p',
      defaultImageUuid: input.defaultImageUuid ?? null,
      preferredPort: input.preferredPort || 6006,
      ...(encrypted
        ? {
          tokenCiphertext: encrypted.ciphertext,
          tokenLast4: encrypted.last4,
          tokenUpdatedAt: now,
          status: 'configured',
        }
        : {}),
    },
    update: data,
    select: connectionSelect,
  })

  return NextResponse.json({
    success: true,
    connection: buildAutoDLConnectionView(connection),
  })
})

export const DELETE = apiHandler(async () => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const userId = authResult.session.user.id

  await prisma.autoDLConnection.deleteMany({
    where: { userId },
  })

  return NextResponse.json({
    success: true,
    connection: buildAutoDLConnectionView(null),
  })
})
