import { Queue } from 'bullmq'
import type { JobsOptions } from 'bullmq'
import { queueRedis } from '@/lib/redis'
import { QueueType, TaskType, TASK_TYPE, type TaskJobData } from './types'

export const QUEUE_NAME = {
  IMAGE: 'autogpu-studio-image',
  VIDEO: 'autogpu-studio-video',
  VOICE: 'autogpu-studio-voice',
  TEXT: 'autogpu-studio-text',
} as const

const defaultJobOptions: JobsOptions = {
  removeOnComplete: 500,
  removeOnFail: 500,
  attempts: 5,
  backoff: {
    type: 'exponential',
    delay: 2_000,
  },
}

const SHOULD_SKIP_QUEUE_CREATION =
  process.env.BUILD_SKIP_RUNTIME_BOOTSTRAP === '1'
  || process.env.BUILD_SKIP_RUNTIME_BOOTSTRAP === 'true'
  || process.env.NEXT_PHASE === 'phase-production-build'

function createUnavailableQueue(name: string): Queue<TaskJobData> {
  return {
    async add() {
      throw new Error(`QUEUE_UNAVAILABLE_DURING_BUILD: ${name}`)
    },
    async getJob() {
      return null
    },
  } as unknown as Queue<TaskJobData>
}

function createTaskQueue(name: string): Queue<TaskJobData> {
  if (SHOULD_SKIP_QUEUE_CREATION) {
    return createUnavailableQueue(name)
  }
  return new Queue<TaskJobData>(name, {
    connection: queueRedis,
    defaultJobOptions,
  })
}

export const imageQueue = createTaskQueue(QUEUE_NAME.IMAGE)
export const videoQueue = createTaskQueue(QUEUE_NAME.VIDEO)
export const voiceQueue = createTaskQueue(QUEUE_NAME.VOICE)
export const textQueue = createTaskQueue(QUEUE_NAME.TEXT)

const ALL_QUEUES = [imageQueue, videoQueue, voiceQueue, textQueue]

const IMAGE_TYPES = new Set<TaskType>([
  TASK_TYPE.IMAGE_PANEL,
  TASK_TYPE.IMAGE_CHARACTER,
  TASK_TYPE.IMAGE_LOCATION,
  TASK_TYPE.PANEL_VARIANT,
  TASK_TYPE.MODIFY_ASSET_IMAGE,
  TASK_TYPE.REGENERATE_GROUP,
  TASK_TYPE.ASSET_HUB_IMAGE,
  TASK_TYPE.ASSET_HUB_MODIFY,
])

const VIDEO_TYPES = new Set<TaskType>([TASK_TYPE.VIDEO_PANEL, TASK_TYPE.LIP_SYNC])
const VOICE_TYPES = new Set<TaskType>([
  TASK_TYPE.VOICE_LINE,
  TASK_TYPE.VOICE_DESIGN,
  TASK_TYPE.ASSET_HUB_VOICE_DESIGN,
])

const SINGLE_ATTEMPT_TASK_TYPES = new Set<TaskType>([
  TASK_TYPE.STORY_TO_SCRIPT_RUN,
  TASK_TYPE.SCRIPT_TO_STORYBOARD_RUN,
])

export function getQueueTypeByTaskType(type: TaskType): QueueType {
  if (IMAGE_TYPES.has(type)) return 'image'
  if (VIDEO_TYPES.has(type)) return 'video'
  if (VOICE_TYPES.has(type)) return 'voice'
  return 'text'
}

export function getQueueByType(type: QueueType) {
  switch (type) {
    case 'image':
      return imageQueue
    case 'video':
      return videoQueue
    case 'voice':
      return voiceQueue
    case 'text':
    default:
      return textQueue
  }
}

export async function addTaskJob(data: TaskJobData, opts?: JobsOptions) {
  const queueType = getQueueTypeByTaskType(data.type)
  const queue = getQueueByType(queueType)
  const priority = typeof opts?.priority === 'number' ? opts.priority : 0
  const attempts = SINGLE_ATTEMPT_TASK_TYPES.has(data.type)
    ? 1
    : (typeof opts?.attempts === 'number' ? opts.attempts : undefined)
  return await queue.add(data.type, data, {
    jobId: data.taskId,
    priority,
    ...(opts || {}),
    ...(attempts !== undefined ? { attempts } : {}),
  })
}

export async function removeTaskJob(taskId: string) {
  for (const queue of ALL_QUEUES) {
    const job = await queue.getJob(taskId)
    if (!job) continue
    await job.remove()
    return true
  }
  return false
}
