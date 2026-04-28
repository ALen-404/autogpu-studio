import { describe, expect, it, vi } from 'vitest'
import {
  maskAutoDLToken,
  normalizeAutoDLConnectionInput,
  normalizeAutoDLTokenInput,
} from '@/lib/autodl/connection'
import { probeAutoDLToken } from '@/lib/autodl/client'

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
})
