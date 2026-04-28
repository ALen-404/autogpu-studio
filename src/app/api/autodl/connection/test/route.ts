import { NextRequest, NextResponse } from 'next/server'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { prisma } from '@/lib/prisma'
import {
  buildAutoDLConnectionView,
  decryptAutoDLToken,
  normalizeAutoDLTokenInput,
  probeAutoDLToken,
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

function readTokenFromBody(body: unknown): string | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  if (!('apiToken' in body)) return null
  return normalizeAutoDLTokenInput((body as Record<string, unknown>).apiToken)
}

export const POST = apiHandler(async (request: NextRequest) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const userId = authResult.session.user.id

  let body: unknown = null
  try {
    body = await request.json()
  } catch {
    body = null
  }

  let transientToken: string | null = null
  try {
    transientToken = readTokenFromBody(body)
  } catch (error) {
    throw new ApiError('INVALID_PARAMS', {
      message: error instanceof Error ? error.message : 'AutoDL Token 无效',
    })
  }

  const existing = await prisma.autoDLConnection.findUnique({
    where: { userId },
    select: connectionSelect,
  })

  const token = transientToken || (existing?.tokenCiphertext ? decryptAutoDLToken(existing.tokenCiphertext) : '')
  if (!token) {
    throw new ApiError('MISSING_CONFIG', {
      message: '请先保存 AutoDL 开发者 Token',
    })
  }

  const probe = await probeAutoDLToken({ token })
  const probeStatus = probe.ok ? 'success' : 'failed'
  const nextStatus = probe.ok ? 'verified' : 'verify_failed'
  const now = new Date()

  const updated = existing
    ? await prisma.autoDLConnection.update({
      where: { userId },
      data: {
        status: nextStatus,
        lastProbeStatus: probeStatus,
        lastProbeMessage: probe.message,
        lastProbeAt: now,
      },
      select: connectionSelect,
    })
    : null

  return NextResponse.json({
    success: probe.ok,
    probe,
    connection: buildAutoDLConnectionView(updated || existing),
  }, {
    status: probe.ok ? 200 : 400,
  })
})
