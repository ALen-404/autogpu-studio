import type { ClipMatchLevel } from './clip-matching'

export type ClipFallbackSeed = {
  id?: string
  startText: string
  endText: string
  summary: string
  location: string | null
  characters: string[]
  props: string[]
}

export type ClipFallbackMatch = {
  id: string
  startText: string
  endText: string
  summary: string
  location: string | null
  characters: string[]
  props: string[]
  content: string
  matchLevel: ClipMatchLevel
  matchConfidence: number
}

type ContentRange = {
  start: number
  end: number
}

const FALLBACK_MATCH_LEVEL: ClipMatchLevel = 'L3'
const FALLBACK_MATCH_CONFIDENCE = 0.5
const ANCHOR_SNIPPET_LENGTH = 36
const BOUNDARY_SEARCH_WINDOW = 96

function normalizeSnippet(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function buildAnchorSnippet(value: string, side: 'start' | 'end'): string {
  const normalized = normalizeSnippet(value)
  if (!normalized) return ''
  if (normalized.length <= ANCHOR_SNIPPET_LENGTH) return normalized
  return side === 'start'
    ? normalized.slice(0, ANCHOR_SNIPPET_LENGTH)
    : normalized.slice(-ANCHOR_SNIPPET_LENGTH)
}

function collectBoundaryCandidates(content: string): number[] {
  const candidates = new Set<number>()
  for (let index = 0; index < content.length; index += 1) {
    const current = content[index]
    if (current === '\n' || current === '\r') {
      candidates.add(index + 1)
      continue
    }
    if (/[。！？!?；;，,]/u.test(current)) {
      candidates.add(index + 1)
    }
  }
  return Array.from(candidates)
    .filter((value) => value > 0 && value < content.length)
    .sort((a, b) => a - b)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function pickClosestBoundary(
  candidates: number[],
  target: number,
  min: number,
  max: number,
): number | null {
  let best: number | null = null
  let bestDistance = Number.POSITIVE_INFINITY
  for (const candidate of candidates) {
    if (candidate < min || candidate > max) continue
    const distance = Math.abs(candidate - target)
    if (distance > BOUNDARY_SEARCH_WINDOW) continue
    if (distance < bestDistance) {
      best = candidate
      bestDistance = distance
    }
  }
  return best
}

function buildFallbackRanges(content: string, desiredCount: number): ContentRange[] {
  if (desiredCount <= 1 || content.length <= 1) {
    return [{ start: 0, end: content.length }]
  }

  const candidates = collectBoundaryCandidates(content)
  const ranges: ContentRange[] = []
  let cursor = 0

  for (let index = 1; index < desiredCount; index += 1) {
    const ideal = Math.floor((content.length * index) / desiredCount)
    const min = cursor + 1
    const max = content.length - (desiredCount - index)
    const picked = pickClosestBoundary(candidates, ideal, min, max)
    const boundary = picked ?? clamp(ideal, min, max)
    ranges.push({ start: cursor, end: boundary })
    cursor = boundary
  }

  ranges.push({ start: cursor, end: content.length })
  return ranges.filter((range) => range.end > range.start)
}

function readRangeContent(content: string, range: ContentRange): string {
  const slice = content.slice(range.start, range.end)
  const trimmed = slice.trim()
  return trimmed || slice || content
}

export function buildFallbackClipMatches(
  content: string,
  seeds: ClipFallbackSeed[],
): ClipFallbackMatch[] {
  if (!content.trim() || seeds.length === 0) return []

  const ranges = buildFallbackRanges(content, Math.max(1, seeds.length))
  const matches = seeds.slice(0, Math.max(1, ranges.length)).map((seed, index) => {
    const segment = readRangeContent(content, ranges[index] || { start: 0, end: content.length })
    return {
      id: seed.id || `clip_${index + 1}`,
      startText: buildAnchorSnippet(segment, 'start'),
      endText: buildAnchorSnippet(segment, 'end'),
      summary: seed.summary,
      location: seed.location,
      characters: seed.characters,
      props: seed.props,
      content: segment,
      matchLevel: FALLBACK_MATCH_LEVEL,
      matchConfidence: FALLBACK_MATCH_CONFIDENCE,
    }
  })

  if (matches.length > 0) return matches

  const first = seeds[0]
  const segment = content.trim() || content
  return [{
    id: first.id || 'clip_1',
    startText: buildAnchorSnippet(segment, 'start'),
    endText: buildAnchorSnippet(segment, 'end'),
    summary: first.summary,
    location: first.location,
    characters: first.characters,
    props: first.props,
    content: segment,
    matchLevel: FALLBACK_MATCH_LEVEL,
    matchConfidence: FALLBACK_MATCH_CONFIDENCE,
  }]
}
