import { NextResponse } from 'next/server'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler } from '@/lib/api-errors'
import {
  AUTODL_CONNECTION_MODES,
  getAutoDLDefaultImageUuid,
  getAutoDLDefaultProfileId,
  getAutoDLModelBundles,
  getAutoDLOfficialUrl,
  getAutoDLProfiles,
} from '@/lib/autodl'

export const GET = apiHandler(async () => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult
  const profiles = getAutoDLProfiles()

  return NextResponse.json({
    success: true,
    officialUrl: getAutoDLOfficialUrl(),
    defaultProfileId: getAutoDLDefaultProfileId(),
    defaultImageReadyByProfile: Object.fromEntries(
      profiles.map((profile) => [profile.id, !!getAutoDLDefaultImageUuid(profile.id)]),
    ),
    connectionModes: AUTODL_CONNECTION_MODES,
    modelBundles: getAutoDLModelBundles(),
    profiles,
  })
})
