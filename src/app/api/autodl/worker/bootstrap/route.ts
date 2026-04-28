import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/api-errors'
import { buildAutoDLWorkerBootstrapScript } from '@/lib/autodl'

export const dynamic = 'force-dynamic'

export const GET = apiHandler(async () => {
  return new NextResponse(buildAutoDLWorkerBootstrapScript(), {
    status: 200,
    headers: {
      'Content-Type': 'text/x-shellscript; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
})
