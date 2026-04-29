import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'

const authMock = vi.hoisted(() => ({
  requireUserAuth: vi.fn(async () => ({
    session: { user: { id: 'user-1' } },
  })),
  isErrorResponse: vi.fn((value: unknown) => value instanceof Response),
}))

const prismaMock = vi.hoisted(() => ({
  userPreference: {
    upsert: vi.fn(),
    findUnique: vi.fn(),
  },
  autoDLInstanceSession: {
    findFirst: vi.fn(),
  },
}))

const autoDLMock = vi.hoisted(() => ({
  isAutoDLProfileId: vi.fn(() => true),
  upsertAutoDLWorkerProvider: vi.fn(),
}))

vi.mock('@/lib/api-auth', () => authMock)
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/autodl', () => autoDLMock)

describe('api contract - user preference model setup', () => {
  const routeContext = { params: Promise.resolve({}) }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    prismaMock.userPreference.upsert.mockResolvedValue({
      userId: 'user-1',
      analysisModel: null,
    })
    prismaMock.userPreference.findUnique.mockResolvedValue({
      userId: 'user-1',
      analysisModel: null,
    })
    autoDLMock.isAutoDLProfileId.mockReturnValue(true)
    autoDLMock.upsertAutoDLWorkerProvider.mockResolvedValue({})
  })

  it('GET /api/user-preference 返回 AutoDL 模型接入中状态', async () => {
    prismaMock.autoDLInstanceSession.findFirst.mockImplementation(async (args: { where: { status?: unknown } }) => {
      if (args.where.status === 'worker_ready') return null
      return {
        id: 'session-1',
        profileId: '5090-p',
        modelBundle: 'balanced',
        status: 'running',
        autodlStatus: 'running',
        workerBaseUrl: 'https://worker.example:8443',
        updatedAt: new Date('2026-04-29T04:00:00.000Z'),
      }
    })

    const mod = await import('@/app/api/user-preference/route')
    const req = buildMockRequest({
      path: '/api/user-preference',
      method: 'GET',
    })

    const res = await mod.GET(req, routeContext)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.modelSetup).toMatchObject({
      ready: false,
      hasAnalysisModel: false,
      autoDLWorkerReady: false,
      latestAutoDLSession: {
        id: 'session-1',
        status: 'running',
        autodlStatus: 'running',
        hasWorkerBaseUrl: true,
      },
    })
    expect(autoDLMock.upsertAutoDLWorkerProvider).not.toHaveBeenCalled()
  })

  it('GET /api/user-preference 在 Worker 就绪时自动补齐默认模型', async () => {
    prismaMock.userPreference.findUnique.mockResolvedValue({
      userId: 'user-1',
      analysisModel: 'openai-compatible:session-1::qwen3-4b',
    })
    prismaMock.autoDLInstanceSession.findFirst.mockImplementation(async (args: { where: { status?: unknown } }) => {
      if (args.where.status === 'worker_ready') {
        return {
          id: 'session-1',
          profileId: '5090-p',
          modelBundle: 'balanced',
          workerBaseUrl: 'https://worker.example:8443',
          workerSharedSecretCiphertext: 'encrypted-secret',
        }
      }
      return {
        id: 'session-1',
        profileId: '5090-p',
        modelBundle: 'balanced',
        status: 'worker_ready',
        autodlStatus: 'running',
        workerBaseUrl: 'https://worker.example:8443',
        updatedAt: new Date('2026-04-29T04:00:00.000Z'),
      }
    })

    const mod = await import('@/app/api/user-preference/route')
    const req = buildMockRequest({
      path: '/api/user-preference',
      method: 'GET',
    })

    const res = await mod.GET(req, routeContext)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(autoDLMock.upsertAutoDLWorkerProvider).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      sessionId: 'session-1',
      profileId: '5090-p',
      workerBaseUrl: 'https://worker.example:8443',
    }))
    expect(json.modelSetup).toMatchObject({
      ready: true,
      hasAnalysisModel: true,
      autoDLWorkerReady: true,
    })
  })
})
