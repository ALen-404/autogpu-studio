import { describe, expect, it, vi } from 'vitest'
import {
  buildAutoDLWorkerStartCommand,
  maskAutoDLToken,
  normalizeAutoDLConnectionInput,
  normalizeAutoDLTokenInput,
} from '@/lib/autodl/connection'
import {
  createAutoDLInstance,
  getAutoDLInstanceSnapshot,
  getAutoDLInstanceStatus,
  powerOffAutoDLInstance,
  probeAutoDLToken,
  releaseAutoDLInstance,
  resolveAutoDLWorkerBaseUrl,
} from '@/lib/autodl/client'
import {
  buildAutoDLWorkerBootstrapScript,
  resolveAutoDLSessionRuntimeStatus,
} from '@/lib/autodl/session'
import { buildAutoDLWorkerProviderConfig } from '@/lib/autodl/provider'

describe('AutoDL 连接配置', () => {
  it('保存前会清理 Token 并拒绝空 Token', () => {
    expect(normalizeAutoDLTokenInput('  autodl-token-123456  ')).toBe('autodl-token-123456')
    expect(() => normalizeAutoDLTokenInput('   ')).toThrow('AUTODL_TOKEN_REQUIRED')
  })

  it('对外只展示 Token 尾号', () => {
    expect(maskAutoDLToken('autodl-token-123456')).toBe('••••3456')
  })

  it('只允许 AutoDL 映射端口 6006 或 6008', () => {
    expect(normalizeAutoDLConnectionInput({ preferredPort: 6008 }).preferredPort).toBe(6008)
    expect(() => normalizeAutoDLConnectionInput({ preferredPort: 3000 })).toThrow('AUTODL_PORT_INVALID')
  })

  it('使用 AutoDL 开发者 Token 探测实例列表', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      code: 'Success',
      data: {
        result_total: 2,
        list: [],
      },
      msg: '',
      request_id: 'req_test',
    }), { status: 200 }))

    const result = await probeAutoDLToken({
      token: '  autodl-token-123456  ',
      fetcher,
    })

    expect(result.ok).toBe(true)
    expect(result.instanceCount).toBe(2)
    expect(fetcher).toHaveBeenCalledWith(
      'https://api.autodl.com/api/v1/dev/instance/pro/list',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'autodl-token-123456',
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({ page_index: 1, page_size: 1 }),
      }),
    )
  })

  it('创建实例时按 AutoDL Pro API 发送档位、镜像和启动命令', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      code: 'Success',
      data: 'pro-test-instance',
      msg: '',
      request_id: 'req_create',
    }), { status: 200 }))

    const result = await createAutoDLInstance({
      token: 'autodl-token-123456',
      profileId: '5090-p',
      imageUuid: 'image-test',
      instanceName: 'AutoGPU Studio 5090',
      startCommand: 'bash /root/start-worker.sh',
      fetcher,
    })

    expect(result.instanceUuid).toBe('pro-test-instance')
    expect(fetcher).toHaveBeenCalledWith(
      'https://api.autodl.com/api/v1/dev/instance/pro/create',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'autodl-token-123456',
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          req_gpu_amount: 1,
          expand_system_disk_by_gb: 0,
          gpu_spec_uuid: '5090-p',
          image_uuid: 'image-test',
          cuda_v_from: 113,
          instance_name: 'AutoGPU Studio 5090',
          start_command: 'bash /root/start-worker.sh',
        }),
      }),
    )
  })

  it('释放实例前先关机再释放', async () => {
    const calls: string[] = []
    const fetcher = vi.fn(async (url: string | URL | Request) => {
      calls.push(String(url))
      return new Response(JSON.stringify({
        code: 'Success',
        data: null,
        msg: '',
        request_id: 'req_ok',
      }), { status: 200 })
    })

    await powerOffAutoDLInstance({ token: 'autodl-token-123456', instanceUuid: 'pro-test', fetcher })
    await releaseAutoDLInstance({ token: 'autodl-token-123456', instanceUuid: 'pro-test', fetcher })

    expect(calls).toEqual([
      'https://api.autodl.com/api/v1/dev/instance/pro/power_off',
      'https://api.autodl.com/api/v1/dev/instance/pro/release',
    ])
  })

  it('从 AutoDL 详情中解析 Worker 地址', () => {
    expect(resolveAutoDLWorkerBaseUrl({
      service_6006_domain: 'worker-6006.autodl.com:8443',
      service_6006_port_protocol: 'http',
      service_6008_domain: 'worker-6008.autodl.com:8443',
      service_6008_port_protocol: 'http',
    }, 6008)).toBe('http://worker-6008.autodl.com:8443')
  })

  it('生成开机自启动 Worker 命令', () => {
    const command = buildAutoDLWorkerStartCommand({
      serverUrl: 'https://cryptotools.bar',
      workerSecret: 'secret-123',
      preferredPort: 6008,
      modelBundle: 'ltx-video',
    })

    expect(command).toContain('AUTOGPU_SERVER_URL=https://cryptotools.bar')
    expect(command).toContain('AUTOGPU_WORKER_SECRET=secret-123')
    expect(command).toContain('AUTOGPU_WORKER_PORT=6008')
    expect(command).toContain('AUTOGPU_MODEL_BUNDLE=ltx-video')
  })

  it('启动命令会注入 AutoDL Worker 直接 API 后端变量', () => {
    vi.stubEnv('AUTOGPU_IMAGE_API_URL', 'http://127.0.0.1:7001/images')
    vi.stubEnv('AUTOGPU_VIDEO_API_URL', 'http://127.0.0.1:7002/videos')
    vi.stubEnv('AUTOGPU_TTS_API_URL', 'http://127.0.0.1:7003/speech')

    const command = buildAutoDLWorkerStartCommand({
      serverUrl: 'https://cryptotools.bar',
      workerSecret: 'secret-123',
      preferredPort: 6006,
      modelBundle: 'default',
    })

    expect(command).toContain('AUTOGPU_IMAGE_API_URL=http://127.0.0.1:7001/images')
    expect(command).toContain('AUTOGPU_VIDEO_API_URL=http://127.0.0.1:7002/videos')
    expect(command).toContain('AUTOGPU_TTS_API_URL=http://127.0.0.1:7003/speech')
    vi.unstubAllEnvs()
  })

  it('启动命令会注入内置 Diffusers 图片后端配置', () => {
    vi.stubEnv('AUTOGPU_IMAGE_BACKEND', 'diffusers')
    vi.stubEnv('AUTOGPU_IMAGE_DIFFUSERS_MODEL', '/root/autodl-tmp/models/sdxl')
    vi.stubEnv('AUTOGPU_IMAGE_DIFFUSERS_DTYPE', 'float16')
    vi.stubEnv('AUTOGPU_IMAGE_DEFAULT_STEPS', '24')

    const command = buildAutoDLWorkerStartCommand({
      serverUrl: 'https://cryptotools.bar',
      workerSecret: 'secret-123',
      preferredPort: 6006,
      modelBundle: 'sdxl-sd35-medium',
    })

    expect(command).toContain('AUTOGPU_IMAGE_BACKEND=diffusers')
    expect(command).toContain('AUTOGPU_IMAGE_DIFFUSERS_MODEL=/root/autodl-tmp/models/sdxl')
    expect(command).toContain('AUTOGPU_IMAGE_DIFFUSERS_DTYPE=float16')
    expect(command).toContain('AUTOGPU_IMAGE_DEFAULT_STEPS=24')
    vi.unstubAllEnvs()
  })

  it('按 AutoDL 官方 Pro API 使用 GET 查询实例详情和状态', async () => {
    const fetcher = vi.fn(async (url: string | URL | Request) => {
      const endpoint = String(url)
      if (endpoint.endsWith('/snapshot')) {
        return new Response(JSON.stringify({
          code: 'Success',
          data: {
            payg_price: 1970,
            service_6006_domain: 'worker-6006.autodl.com:8443',
            service_6006_port_protocol: 'http',
          },
          msg: '',
          request_id: 'req_snapshot',
        }), { status: 200 })
      }
      return new Response(JSON.stringify({
        code: 'Success',
        data: 'running',
        msg: '',
        request_id: 'req_status',
      }), { status: 200 })
    })

    await expect(getAutoDLInstanceStatus({
      token: 'autodl-token-123456',
      instanceUuid: 'pro-test',
      fetcher,
    })).resolves.toBe('running')
    await expect(getAutoDLInstanceSnapshot({
      token: 'autodl-token-123456',
      instanceUuid: 'pro-test',
      fetcher,
    })).resolves.toMatchObject({ payg_price: 1970 })

    expect(fetcher).toHaveBeenNthCalledWith(1,
      'https://api.autodl.com/api/v1/dev/instance/pro/status',
      expect.objectContaining({
        method: 'GET',
        body: JSON.stringify({ instance_uuid: 'pro-test' }),
      }),
    )
    expect(fetcher).toHaveBeenNthCalledWith(2,
      'https://api.autodl.com/api/v1/dev/instance/pro/snapshot',
      expect.objectContaining({
        method: 'GET',
        body: JSON.stringify({ instance_uuid: 'pro-test' }),
      }),
    )
  })

  it('把 AutoDL 状态和 Worker 健康状态映射为平台会话状态', () => {
    expect(resolveAutoDLSessionRuntimeStatus('running', true, 'http://worker')).toBe('worker_ready')
    expect(resolveAutoDLSessionRuntimeStatus('running', false, 'http://worker')).toBe('running')
    expect(resolveAutoDLSessionRuntimeStatus('stopped', false, null)).toBe('stopped')
    expect(resolveAutoDLSessionRuntimeStatus('failed', false, null)).toBe('failed')
  })

  it('生成可在 AutoDL start_command 中拉取的最小 Worker 脚本', () => {
    const script = buildAutoDLWorkerBootstrapScript()

    expect(script).toContain('AUTOGPU_WORKER_SECRET')
    expect(script).toContain('AUTOGPU_MODEL_BUNDLE')
    expect(script).toContain('export AUTOGPU_WORKER_PORT="$PORT"')
    expect(script).toContain('/health')
    expect(script).toContain('/v1/models')
    expect(script).toContain('/v1/chat/completions')
    expect(script).toContain('/v1/audio/speech')
  })

  it('Worker 就绪后可生成平台 OpenAI 兼容 Provider 和模型配置', () => {
    const config = buildAutoDLWorkerProviderConfig({
      sessionId: 'session-1',
      profileId: '5090-p',
      workerBaseUrl: 'http://worker.autodl.com:8443',
      workerSharedSecretCiphertext: 'encrypted-secret',
    })

    expect(config.provider).toMatchObject({
      id: 'openai-compatible:session-1',
      baseUrl: 'http://worker.autodl.com:8443/v1',
      gatewayRoute: 'openai-compat',
    })
    expect(config.models.some((model) => model.type === 'video')).toBe(true)
    expect(config.models.some((model) => model.type === 'image')).toBe(true)
    expect(config.models.some((model) => model.type === 'llm')).toBe(true)
    expect(config.models.some((model) => model.type === 'audio')).toBe(true)
  })

  it('AutoDL 图片和视频模型会自动注册直接 API 媒体模板', () => {
    const config = buildAutoDLWorkerProviderConfig({
      sessionId: 'session-1',
      profileId: '5090-p',
      workerBaseUrl: 'http://worker.autodl.com:8443',
      workerSharedSecretCiphertext: 'encrypted-secret',
    })

    const imageModel = config.models.find((model) => model.type === 'image')
    const videoModel = config.models.find((model) => model.type === 'video')
    const audioModel = config.models.find((model) => model.type === 'audio')

    expect(imageModel?.compatMediaTemplate).toMatchObject({
      mediaType: 'image',
      mode: 'sync',
      create: {
        method: 'POST',
        path: '/autogpu/images',
      },
      response: {
        outputUrlPath: '$.data[0].url',
      },
    })
    expect(videoModel?.compatMediaTemplate).toMatchObject({
      mediaType: 'video',
      mode: 'async',
      create: {
        method: 'POST',
        path: '/autogpu/videos',
      },
      status: {
        method: 'GET',
        path: '/autogpu/videos/{{task_id}}',
      },
      response: {
        taskIdPath: '$.id',
        statusPath: '$.status',
        outputUrlPath: '$.video_url',
      },
    })
    expect(audioModel?.compatMediaTemplate).toBeUndefined()
  })

  it('Worker bootstrap 暴露直接 API 后端适配入口', () => {
    const script = buildAutoDLWorkerBootstrapScript()

    expect(script).toContain('AUTOGPU_IMAGE_API_URL')
    expect(script).toContain('AUTOGPU_VIDEO_API_URL')
    expect(script).toContain('AUTOGPU_LLM_API_URL')
    expect(script).toContain('AUTOGPU_TTS_API_URL')
    expect(script).toContain('/v1/autogpu/images')
    expect(script).toContain('/v1/autogpu/videos')
    expect(script).toContain('/v1/chat/completions')
    expect(script).toContain('call_direct_backend')
  })

  it('Worker bootstrap 内置 Diffusers 图片后端入口', () => {
    const script = buildAutoDLWorkerBootstrapScript()

    expect(script).toContain('AUTOGPU_IMAGE_BACKEND')
    expect(script).toContain('AUTOGPU_IMAGE_DIFFUSERS_MODEL')
    expect(script).toContain('call_builtin_image_backend')
    expect(script).toContain('DiffusionPipeline')
    expect(script).toContain('backend_dependency_missing')
  })
})
