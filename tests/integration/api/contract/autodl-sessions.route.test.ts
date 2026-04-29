import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'

const authMock = vi.hoisted(() => ({
  requireUserAuth: vi.fn(async () => ({
    session: { user: { id: 'user-1' } },
  })),
  isErrorResponse: vi.fn((value: unknown) => value instanceof Response),
}))

const prismaMock = vi.hoisted(() => ({
  autoDLConnection: {
    findUnique: vi.fn(),
  },
  autoDLInstanceSession: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
}))

const autoDLMock = vi.hoisted(() => ({
  decryptAutoDLToken: vi.fn(() => 'autodl-token'),
  listAutoDLInstances: vi.fn(),
  getAutoDLInstanceSnapshot: vi.fn(),
}))

vi.mock('@/lib/api-auth', () => authMock)
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/autodl', async () => {
  const actual = await vi.importActual<typeof import('@/lib/autodl')>('@/lib/autodl')
  return {
    ...actual,
    decryptAutoDLToken: autoDLMock.decryptAutoDLToken,
    getAutoDLInstanceSnapshot: autoDLMock.getAutoDLInstanceSnapshot,
    listAutoDLInstances: autoDLMock.listAutoDLInstances,
  }
})

describe('api contract - AutoDL sessions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    prismaMock.autoDLConnection.findUnique.mockResolvedValue({
      id: 'connection-1',
      tokenCiphertext: 'encrypted-token',
      defaultProfileId: '5090-p',
      preferredPort: 6006,
    })
    prismaMock.autoDLInstanceSession.findMany.mockResolvedValue([])
    autoDLMock.listAutoDLInstances.mockResolvedValue({
      total: 1,
      instances: [
        {
          instanceUuid: 'pro-77742ca0bda5',
          displayName: 'AutoGPU 中级',
          profileId: 'pro6000-p',
          status: 'running',
          subStatus: null,
          createdAt: '2026-04-29T11:43:03+08:00',
          startedAt: '2026-04-29T11:43:11+08:00',
          statusAt: '2026-04-29T11:43:11+08:00',
          regionName: '西北B区',
          chargeType: 'payg',
          gpuAmount: 1,
        },
      ],
    })
    autoDLMock.getAutoDLInstanceSnapshot.mockResolvedValue({
      payg_price: 1970,
      service_6006_domain: 'worker.example.autodl.com:8443',
      service_6006_port_protocol: 'http',
    })
    prismaMock.autoDLInstanceSession.findUnique.mockResolvedValue(null)
    prismaMock.autoDLInstanceSession.create.mockResolvedValue({
      id: 'session-imported',
      instanceUuid: 'pro-77742ca0bda5',
      profileId: 'pro6000-p',
      imageUuid: null,
      modelBundle: 'balanced',
      status: 'running',
      autodlStatus: 'running',
      workerBaseUrl: 'https://worker.example.autodl.com:8443',
      workerSharedSecretCiphertext: null,
      paygPrice: 1970,
      createdAt: new Date('2026-04-29T05:00:00.000Z'),
      updatedAt: new Date('2026-04-29T05:00:00.000Z'),
      startedAt: new Date('2026-04-29T03:43:11.000Z'),
      releasedAt: null,
    })
  })

  it('GET /api/autodl/sessions 会展示 AutoDL 账号里尚未接管的实例', async () => {
    const mod = await import('@/app/api/autodl/sessions/route')
    const req = buildMockRequest({
      path: '/api/autodl/sessions',
      method: 'GET',
    })

    const res = await mod.GET(req, { params: Promise.resolve({}) })
    const json = await res.json() as {
      success: boolean
      accountInstanceCount: number
      untrackedInstanceCount: number
      sessions: Array<{
        id: string
        instanceUuid: string
        displayName: string
        source: string
        managedByPlatform: boolean
        status: string
      }>
    }

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.accountInstanceCount).toBe(1)
    expect(json.untrackedInstanceCount).toBe(1)
    expect(json.sessions).toEqual([
      expect.objectContaining({
        id: 'autodl:pro-77742ca0bda5',
        instanceUuid: 'pro-77742ca0bda5',
        displayName: 'AutoGPU 中级',
        source: 'autodl',
        managedByPlatform: false,
        status: 'running',
      }),
    ])
  })

  it('POST /api/autodl/sessions 可以把 AutoDL 账号已有实例加入控制台', async () => {
    const mod = await import('@/app/api/autodl/sessions/route')
    const req = buildMockRequest({
      path: '/api/autodl/sessions',
      method: 'POST',
      body: {
        importInstanceUuid: 'pro-77742ca0bda5',
      },
    })

    const res = await mod.POST(req, { params: Promise.resolve({}) })
    const json = await res.json() as {
      success: boolean
      session: {
        id: string
        instanceUuid: string
        managedByPlatform: boolean
        displayName: string | null
        status: string
      }
    }

    expect(res.status).toBe(201)
    expect(json.success).toBe(true)
    expect(prismaMock.autoDLInstanceSession.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        instanceUuid: 'pro-77742ca0bda5',
        profileId: 'pro6000-p',
        modelBundle: 'balanced',
        status: 'running',
        autodlStatus: 'running',
        workerSharedSecretCiphertext: null,
      }),
    }))
    expect(json.session).toMatchObject({
      id: 'session-imported',
      instanceUuid: 'pro-77742ca0bda5',
      managedByPlatform: false,
      displayName: 'AutoGPU 中级',
      status: 'running',
    })
  })
})
