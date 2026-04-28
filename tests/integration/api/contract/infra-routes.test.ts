import fs from 'node:fs/promises'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ROUTE_CATALOG } from '../../../contracts/route-catalog'
import { buildMockRequest } from '../../../helpers/request'

const authState = vi.hoisted(() => ({
  authenticated: false,
}))

const loggingMock = vi.hoisted(() => ({
  readAllLogs: vi.fn(async () => 'worker log line 1\nworker log line 2'),
}))

const storageMock = vi.hoisted(() => ({
  getSignedObjectUrl: vi.fn(async (key: string, ttl: number) => `https://signed.example/${key}?expires=${ttl}`),
}))

vi.mock('@/lib/api-auth', () => {
  const unauthorized = () => new Response(
    JSON.stringify({ error: { code: 'UNAUTHORIZED' } }),
    { status: 401, headers: { 'content-type': 'application/json' } },
  )

  return {
    isErrorResponse: (value: unknown) => value instanceof Response,
    requireUserAuth: async () => {
      if (!authState.authenticated) return unauthorized()
      return { session: { user: { id: 'user-1' } } }
    },
  }
})

vi.mock('@/lib/logging/file-writer', () => loggingMock)
vi.mock('@/lib/storage', () => storageMock)

describe('api contract - infra routes (behavior)', () => {
  const routes = ROUTE_CATALOG.filter((entry) => entry.contractGroup === 'infra-routes')
  const originalUploadDir = process.env.UPLOAD_DIR
  const tempState = {
    uploadDirAbs: '',
    uploadDirRel: '',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    authState.authenticated = false
    vi.resetModules()
  })

  afterEach(async () => {
    vi.resetModules()
    if (tempState.uploadDirAbs) {
      await fs.rm(tempState.uploadDirAbs, { recursive: true, force: true })
      tempState.uploadDirAbs = ''
      tempState.uploadDirRel = ''
    }
    if (originalUploadDir === undefined) {
      delete process.env.UPLOAD_DIR
    } else {
      process.env.UPLOAD_DIR = originalUploadDir
    }
  })

  async function prepareUploadDir(): Promise<void> {
    const unique = `test-uploads-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    tempState.uploadDirRel = path.join('.tmp', unique)
    tempState.uploadDirAbs = path.join(process.cwd(), tempState.uploadDirRel)
    process.env.UPLOAD_DIR = tempState.uploadDirRel
    await fs.mkdir(tempState.uploadDirAbs, { recursive: true })
  }

  it('infra route group exists', () => {
    expect(routes.map((entry) => entry.routeFile)).toEqual(expect.arrayContaining([
      'src/app/api/admin/download-logs/route.ts',
      'src/app/api/autodl/profiles/route.ts',
      'src/app/api/cos/image/route.ts',
      'src/app/api/files/[...path]/route.ts',
      'src/app/api/local-models/route.ts',
      'src/app/api/storage/sign/route.ts',
      'src/app/api/system/boot-id/route.ts',
    ]))
  })

  it('GET /api/autodl/profiles returns non-commercial user-owned AutoDL profiles', async () => {
    authState.authenticated = true
    const mod = await import('@/app/api/autodl/profiles/route')
    const req = buildMockRequest({
      path: '/api/autodl/profiles',
      method: 'GET',
    })

    const res = await mod.GET(req, { params: Promise.resolve({}) })
    const json = await res.json() as {
      success: boolean
      officialUrl: string
      connectionModes: Array<{ id: string }>
      profiles: Array<{
        id: string
        displayName: string
        resaleAllowed: boolean
        billingMode: string
        priceMarkupPercent: number
      }>
    }

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.officialUrl).toBe('https://www.autodl.com/home')
    expect(json.connectionModes.map((mode) => mode.id)).toEqual(['manual', 'user_api_key'])
    expect(json.profiles.map((profile) => profile.id)).toEqual(['pro6000-p', '5090-p'])
    expect(json.profiles.map((profile) => profile.displayName)).toEqual(['PRO6000', 'RTX 5090'])
    expect(json.profiles.every((profile) => profile.resaleAllowed === false)).toBe(true)
    expect(json.profiles.every((profile) => profile.billingMode === 'user_owned_autodl_account')).toBe(true)
    expect(json.profiles.every((profile) => profile.priceMarkupPercent === 0)).toBe(true)
  })

  it('GET /api/local-models filters local model catalog by AutoDL profile', async () => {
    authState.authenticated = true
    const mod = await import('@/app/api/local-models/route')
    const req = buildMockRequest({
      path: '/api/local-models?profileId=5090-p',
      method: 'GET',
    })

    const res = await mod.GET(req, { params: Promise.resolve({}) })
    const json = await res.json() as {
      success: boolean
      profileId: string
      models: Array<{ id: string; modality: string; supportedProfileIds: string[] }>
    }

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.profileId).toBe('5090-p')
    expect(json.models.length).toBeGreaterThan(0)
    expect(json.models.every((model) => model.supportedProfileIds.includes('5090-p'))).toBe(true)
    expect(json.models.some((model) => model.id === 'wan2.2-i2v-a14b')).toBe(false)
    expect(json.models.some((model) => model.modality === 'video')).toBe(true)
    expect(json.models.some((model) => model.modality === 'image')).toBe(true)
    expect(json.models.some((model) => model.modality === 'tts')).toBe(true)
  })

  it('GET /api/admin/download-logs rejects unauthenticated requests', async () => {
    const mod = await import('@/app/api/admin/download-logs/route')
    const req = buildMockRequest({
      path: '/api/admin/download-logs',
      method: 'GET',
    })

    const res = await mod.GET(req, { params: Promise.resolve({}) })
    expect(res.status).toBe(401)
    expect(loggingMock.readAllLogs).not.toHaveBeenCalled()
  })

  it('GET /api/admin/download-logs returns attachment headers when authenticated', async () => {
    authState.authenticated = true
    const mod = await import('@/app/api/admin/download-logs/route')
    const req = buildMockRequest({
      path: '/api/admin/download-logs',
      method: 'GET',
    })

    const res = await mod.GET(req, { params: Promise.resolve({}) })
    const text = await res.text()

    expect(res.status).toBe(200)
    expect(text).toContain('worker log line 1')
    expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8')
    expect(res.headers.get('content-disposition')).toMatch(/^attachment; filename="autogpu-studio-logs-/)
  })

  it('GET /api/cos/image redirects to signed storage route with normalized query', async () => {
    const mod = await import('@/app/api/cos/image/route')
    const req = buildMockRequest({
      path: '/api/cos/image?key=folder/a.png&expires=7200',
      method: 'GET',
    })

    const res = await mod.GET(req, { params: Promise.resolve({}) })

    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('http://localhost:3000/api/storage/sign?key=folder%2Fa.png&expires=7200')
  })

  it('GET /api/storage/sign redirects to signed object url with default ttl', async () => {
    const mod = await import('@/app/api/storage/sign/route')
    const req = buildMockRequest({
      path: '/api/storage/sign?key=folder/a.png',
      method: 'GET',
    })

    const res = await mod.GET(req, { params: Promise.resolve({}) })

    expect(storageMock.getSignedObjectUrl).toHaveBeenCalledWith('folder/a.png', 3600)
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('https://signed.example/folder/a.png?expires=3600')
  })

  it('GET /api/system/boot-id returns the current server boot id', async () => {
    const mod = await import('@/app/api/system/boot-id/route')
    const serverBoot = await import('@/lib/server-boot')
    const res = await mod.GET()
    const json = await res.json() as { bootId: string }

    expect(res.status).toBe(200)
    expect(json.bootId).toBe(serverBoot.SERVER_BOOT_ID)
    expect(typeof json.bootId).toBe('string')
    expect(json.bootId.length).toBeGreaterThan(0)
  })

  it('GET /api/files/[...path] rejects path traversal attempts', async () => {
    await prepareUploadDir()
    const mod = await import('@/app/api/files/[...path]/route')
    const req = buildMockRequest({
      path: '/api/files/%2E%2E/secret.txt',
      method: 'GET',
    })

    const res = await mod.GET(req, {
      params: Promise.resolve({ path: ['..', 'secret.txt'] }),
    })
    const json = await res.json() as { error: string }

    expect(res.status).toBe(403)
    expect(json.error).toBe('Access denied')
  })

  it('GET /api/files/[...path] returns 404 when the file is missing', async () => {
    await prepareUploadDir()
    const mod = await import('@/app/api/files/[...path]/route')
    const req = buildMockRequest({
      path: '/api/files/missing.txt',
      method: 'GET',
    })

    const res = await mod.GET(req, {
      params: Promise.resolve({ path: ['missing.txt'] }),
    })
    const json = await res.json() as { error: string }

    expect(res.status).toBe(404)
    expect(json.error).toBe('File not found')
  })

  it('GET /api/files/[...path] serves local files from the configured upload dir', async () => {
    await prepareUploadDir()
    const nestedDir = path.join(tempState.uploadDirAbs, 'folder')
    await fs.mkdir(nestedDir, { recursive: true })
    await fs.writeFile(path.join(nestedDir, 'hello.txt'), 'hello local file', 'utf8')

    const mod = await import('@/app/api/files/[...path]/route')
    const req = buildMockRequest({
      path: '/api/files/folder/hello.txt',
      method: 'GET',
    })

    const res = await mod.GET(req, {
      params: Promise.resolve({ path: ['folder', 'hello.txt'] }),
    })
    const text = await res.text()

    expect(res.status).toBe(200)
    expect(text).toBe('hello local file')
    expect(res.headers.get('content-type')).toBe('text/plain')
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000')
  })
})
