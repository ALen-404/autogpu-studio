import { NextResponse } from 'next/server'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler } from '@/lib/api-errors'
import {
  AUTODL_CONNECTION_MODES,
  getAutoDLDefaultProfileId,
  getAutoDLOfficialUrl,
  getAutoDLProfiles,
} from '@/lib/autodl'

export const GET = apiHandler(async () => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult

  return NextResponse.json({
    success: true,
    officialUrl: getAutoDLOfficialUrl(),
    defaultProfileId: getAutoDLDefaultProfileId(),
    connectionModes: AUTODL_CONNECTION_MODES,
    profiles: getAutoDLProfiles(),
  })
})
