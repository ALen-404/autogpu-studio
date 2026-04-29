import { NextResponse } from 'next/server'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { prisma } from '@/lib/prisma'
import { decryptAutoDLToken, getAutoDLWalletBalance } from '@/lib/autodl'

export const GET = apiHandler(async () => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const userId = authResult.session.user.id

  const connection = await prisma.autoDLConnection.findUnique({
    where: { userId },
    select: { tokenCiphertext: true },
  })
  if (!connection?.tokenCiphertext) {
    throw new ApiError('MISSING_CONFIG', { message: '请先保存 AutoDL 开发者 Token' })
  }

  const balance = await getAutoDLWalletBalance({
    token: decryptAutoDLToken(connection.tokenCiphertext),
  })

  return NextResponse.json({
    success: true,
    balance,
  })
})
