import { describe, expect, it, vi } from 'vitest'

vi.mock('bullmq', () => ({
  Queue: class MockQueue {
    readonly name: string

    constructor(name: string) {
      this.name = name
    }
  },
}))

vi.mock('@/lib/redis', () => ({
  queueRedis: {},
}))

describe('task queue names', () => {
  it('uses AutoGPU Studio branded queue names', async () => {
    const { QUEUE_NAME } = await import('@/lib/task/queues')

    expect(QUEUE_NAME).toEqual({
      IMAGE: 'autogpu-studio-image',
      VIDEO: 'autogpu-studio-video',
      VOICE: 'autogpu-studio-voice',
      TEXT: 'autogpu-studio-text',
    })
  })
})
