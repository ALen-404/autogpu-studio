import { describe, expect, it } from 'vitest'
import {
  hasConfiguredAnalysisModel,
  hasReadyModelRuntime,
  readConfiguredAnalysisModel,
  readModelSetupNotice,
  shouldGuideToModelSetup,
} from '@/lib/workspace/model-setup'

describe('workspace model setup guidance', () => {
  it('有 analysisModel -> 不需要引导设置', () => {
    const payload = {
      preference: {
        analysisModel: 'openai::gpt-4.1',
      },
    }

    expect(hasConfiguredAnalysisModel(payload)).toBe(true)
    expect(hasReadyModelRuntime(payload)).toBe(true)
    expect(readConfiguredAnalysisModel(payload)).toBe('openai::gpt-4.1')
    expect(readModelSetupNotice(payload)).toBeNull()
    expect(shouldGuideToModelSetup(payload)).toBe(false)
  })

  it('AutoDL Worker 已就绪 -> 不需要引导设置', () => {
    const payload = {
      preference: {
        analysisModel: null,
      },
      modelSetup: {
        ready: true,
        latestAutoDLSession: {
          status: 'worker_ready',
          autodlStatus: 'running',
        },
      },
    }

    expect(hasConfiguredAnalysisModel(payload)).toBe(false)
    expect(hasReadyModelRuntime(payload)).toBe(true)
    expect(readModelSetupNotice(payload)).toBeNull()
    expect(shouldGuideToModelSetup(payload)).toBe(false)
  })

  it('AutoDL 实例运行但 Worker 未就绪 -> 提示模型包接入中', () => {
    const payload = {
      preference: {
        analysisModel: null,
      },
      modelSetup: {
        ready: false,
        latestAutoDLSession: {
          status: 'running',
          autodlStatus: 'running',
        },
      },
    }

    expect(hasReadyModelRuntime(payload)).toBe(false)
    expect(readModelSetupNotice(payload)).toBe('autodl-starting')
    expect(shouldGuideToModelSetup(payload)).toBe(true)
  })

  it('analysisModel 为空 -> 需要引导设置', () => {
    const payload = {
      preference: {
        analysisModel: '   ',
      },
    }

    expect(hasConfiguredAnalysisModel(payload)).toBe(false)
    expect(hasReadyModelRuntime(payload)).toBe(false)
    expect(readConfiguredAnalysisModel(payload)).toBeNull()
    expect(readModelSetupNotice(payload)).toBe('missing')
    expect(shouldGuideToModelSetup(payload)).toBe(true)
  })

  it('payload 非法 -> 需要引导设置', () => {
    expect(hasConfiguredAnalysisModel(null)).toBe(false)
    expect(readConfiguredAnalysisModel(null)).toBeNull()
    expect(hasConfiguredAnalysisModel({})).toBe(false)
    expect(readConfiguredAnalysisModel({})).toBeNull()
    expect(readModelSetupNotice({})).toBe('missing')
    expect(shouldGuideToModelSetup({})).toBe(true)
  })
})
