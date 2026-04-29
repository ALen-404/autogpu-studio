import { prisma } from '@/lib/prisma'
import { composeModelKey, parseModelKeyStrict } from '@/lib/model-config-contract'
import { getModelsByType } from '@/lib/api-config'

type ResolveAnalysisModelInput = {
  userId: string
  inputModel?: unknown
  projectAnalysisModel?: unknown
}

function normalizeModelKey(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  const parsed = parseModelKeyStrict(trimmed)
  if (!parsed) return null
  return composeModelKey(parsed.provider, parsed.modelId)
}

function buildEnabledModelKeys(models: Awaited<ReturnType<typeof getModelsByType>>): string[] {
  const modelKeys: string[] = []
  const seen = new Set<string>()
  for (const model of models) {
    const modelKey = composeModelKey(model.provider, model.modelId)
    if (!modelKey || seen.has(modelKey)) continue
    seen.add(modelKey)
    modelKeys.push(modelKey)
  }
  return modelKeys
}

function pickEnabledModelKey(value: unknown, enabledModelKeys: Set<string>): string | null {
  const modelKey = normalizeModelKey(value)
  if (!modelKey) return null
  return enabledModelKeys.has(modelKey) ? modelKey : null
}

export async function resolveEnabledAnalysisModelKey(input: ResolveAnalysisModelInput): Promise<string> {
  const enabledLlmModels = await getModelsByType(input.userId, 'llm')
  const enabledModelKeys = buildEnabledModelKeys(enabledLlmModels)
  const enabledModelKeySet = new Set(enabledModelKeys)

  const modelFromInput = pickEnabledModelKey(input.inputModel, enabledModelKeySet)
  if (modelFromInput) return modelFromInput

  const modelFromProject = pickEnabledModelKey(input.projectAnalysisModel, enabledModelKeySet)
  if (modelFromProject) return modelFromProject

  const userPreference = await prisma.userPreference.findUnique({
    where: { userId: input.userId },
    select: { analysisModel: true },
  })
  const modelFromUserPreference = pickEnabledModelKey(userPreference?.analysisModel, enabledModelKeySet)
  if (modelFromUserPreference) return modelFromUserPreference

  const hasStaleConfiguredModel = Boolean(
    normalizeModelKey(input.inputModel)
    || normalizeModelKey(input.projectAnalysisModel)
    || normalizeModelKey(userPreference?.analysisModel),
  )
  if (hasStaleConfiguredModel && enabledModelKeys.length > 0) {
    return enabledModelKeys[0]
  }

  throw new Error('ANALYSIS_MODEL_NOT_CONFIGURED: 请先在设置页面配置分析模型')
}

export async function resolveAnalysisModel(input: ResolveAnalysisModelInput): Promise<string> {
  return resolveEnabledAnalysisModelKey(input)
}
