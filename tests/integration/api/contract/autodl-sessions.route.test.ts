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
    findFirst: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
}))

const autoDLMock = vi.hoisted(() => ({
  decryptAutoDLToken: vi.fn(() => 'autodl-token'),
  buildSessionStartCommand: vi.fn(),
  getAutoDLPublicServerUrl: vi.fn(() => 'https://cryptotools.bar'),
  listAutoDLInstances: vi.fn(),
  getAutoDLInstanceSnapshot: vi.fn(),
  isAutoDLPublicServerUrlReachableFromInstance: vi.fn(() => true),
  powerOnAutoDLInstance: vi.fn(),
}))

vi.mock('@/lib/api-auth', () => authMock)
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/autodl', async () => {
  const actual = await vi.importActual<typeof import('@/lib/autodl')>('@/lib/autodl')
  return {
    ...actual,
    decryptAutoDLToken: autoDLMock.decryptAutoDLToken,
    buildSessionStartCommand: autoDLMock.buildSessionStartCommand,
    getAutoDLPublicServerUrl: autoDLMock.getAutoDLPublicServerUrl,
    getAutoDLInstanceSnapshot: autoDLMock.getAutoDLInstanceSnapshot,
    isAutoDLPublicServerUrlReachableFromInstance: autoDLMock.isAutoDLPublicServerUrlReachableFromInstance,
    listAutoDLInstances: autoDLMock.listAutoDLInstances,
    powerOnAutoDLInstance: autoDLMock.powerOnAutoDLInstance,
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
    prismaMock.autoDLInstanceSession.findFirst.mockResolvedValue(null)
    autoDLMock.buildSessionStartCommand.mockReturnValue({
      workerSecret: {
        plaintext: 'worker-secret',
        ciphertext: 'encrypted-worker-secret',
      },
      startCommand: 'AUTOGPU_SERVER_URL=https://cryptotools.bar bash -lc start',
    })
    autoDLMock.powerOnAutoDLInstance.mockResolvedValue({
      ok: true,
      message: 'ok',
      requestId: 'req_power_on',
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

  it('POST /api/autodl/sessions/:id/power-on 会重新注入最新 Worker 启动命令', async () => {
    prismaMock.autoDLInstanceSession.findFirst.mockResolvedValue({
      id: 'session-1',
      instanceUuid: 'pro-77742ca0bda5',
      status: 'stopped',
      modelBundle: 'balanced',
      connection: {
        tokenCiphertext: 'encrypted-token',
        preferredPort: 6006,
      },
    })
    prismaMock.autoDLInstanceSession.update.mockResolvedValue({
      id: 'session-1',
      instanceUuid: 'pro-77742ca0bda5',
      profileId: 'pro6000-p',
      imageUuid: 'base-image',
      modelBundle: 'balanced',
      status: 'booting',
      autodlStatus: 'booting',
      workerBaseUrl: null,
      workerSharedSecretCiphertext: 'encrypted-worker-secret',
      paygPrice: 1970,
      createdAt: new Date('2026-04-29T05:00:00.000Z'),
      updatedAt: new Date('2026-04-29T05:10:00.000Z'),
      startedAt: new Date('2026-04-29T05:10:00.000Z'),
      releasedAt: null,
    })

    const mod = await import('@/app/api/autodl/sessions/[sessionId]/power-on/route')
    const req = buildMockRequest({
      path: '/api/autodl/sessions/session-1/power-on',
      method: 'POST',
    })

    const res = await mod.POST(req, { params: Promise.resolve({ sessionId: 'session-1' }) })
    const json = await res.json() as {
      success: boolean
      session: { id: string; status: string }
    }

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(autoDLMock.powerOnAutoDLInstance).toHaveBeenCalledWith({
      token: 'autodl-token',
      instanceUuid: 'pro-77742ca0bda5',
      startCommand: 'AUTOGPU_SERVER_URL=https://cryptotools.bar bash -lc start',
    })
    expect(prismaMock.autoDLInstanceSession.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'session-1' },
      data: expect.objectContaining({
        status: 'booting',
        autodlStatus: 'booting',
        workerSharedSecretCiphertext: 'encrypted-worker-secret',
      }),
    }))
    expect(json.session).toMatchObject({
      id: 'session-1',
      status: 'booting',
    })
  })
})
