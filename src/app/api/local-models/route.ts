import { NextResponse } from 'next/server'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { getLocalModelCatalog, isAutoDLProfileId } from '@/lib/autodl'

export const GET = apiHandler(async (req) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult

  const rawProfileId = req.nextUrl.searchParams.get('profileId')
  if (rawProfileId && !isAutoDLProfileId(rawProfileId)) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'AUTODL_PROFILE_INVALID',
      field: 'profileId',
    })
  }

  const profileId = rawProfileId && isAutoDLProfileId(rawProfileId) ? rawProfileId : null

  return NextResponse.json({
    success: true,
    profileId,
    models: getLocalModelCatalog(profileId),
  })
})
