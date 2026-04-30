import { afterEach, describe, expect, it, vi } from 'vitest'

const queueConstructorMock = vi.hoisted(() => vi.fn())

vi.mock('bullmq', () => ({
  Queue: queueConstructorMock,
}))

vi.mock('@/lib/redis', () => ({
  queueRedis: {},
}))

describe('task queues build skip', () => {
  const originalBuildSkip = process.env.BUILD_SKIP_RUNTIME_BOOTSTRAP
  const originalNextPhase = process.env.NEXT_PHASE

  afterEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    if (originalBuildSkip === undefined) {
      delete process.env.BUILD_SKIP_RUNTIME_BOOTSTRAP
    } else {
      process.env.BUILD_SKIP_RUNTIME_BOOTSTRAP = originalBuildSkip
    }
    if (originalNextPhase === undefined) {
      delete process.env.NEXT_PHASE
    } else {
      process.env.NEXT_PHASE = originalNextPhase
    }
  })

  it('does not construct BullMQ queues during production build', async () => {
    process.env.BUILD_SKIP_RUNTIME_BOOTSTRAP = '1'
    const { addTaskJob, QUEUE_NAME } = await import('@/lib/task/queues')

    expect(queueConstructorMock).not.toHaveBeenCalled()
    expect(QUEUE_NAME.TEXT).toBe('autogpu-studio-text')
    await expect(addTaskJob({
      taskId: 'task-1',
      type: 'character_profile_confirm',
      locale: 'zh',
      projectId: 'project-1',
      targetType: 'NovelPromotionCharacter',
      targetId: 'character-1',
      userId: 'user-1',
    })).rejects.toThrow('QUEUE_UNAVAILABLE_DURING_BUILD')
  })
})
