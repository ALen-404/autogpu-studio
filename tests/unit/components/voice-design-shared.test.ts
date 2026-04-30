import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_VOICE_SCHEME_COUNT,
  MAX_VOICE_SCHEME_COUNT,
  MIN_VOICE_SCHEME_COUNT,
  buildCharacterVoicePrompt,
  generateVoiceDesignOptions,
  normalizeVoiceSchemeCount,
} from '@/components/voice/voice-design-shared'

describe('voice-design-shared', () => {
  it('clamps scheme count into the supported range', () => {
    expect(normalizeVoiceSchemeCount(undefined)).toBe(DEFAULT_VOICE_SCHEME_COUNT)
    expect(normalizeVoiceSchemeCount('not-a-number')).toBe(DEFAULT_VOICE_SCHEME_COUNT)
    expect(normalizeVoiceSchemeCount(0)).toBe(MIN_VOICE_SCHEME_COUNT)
    expect(normalizeVoiceSchemeCount(99)).toBe(MAX_VOICE_SCHEME_COUNT)
    expect(normalizeVoiceSchemeCount('5')).toBe(5)
  })

  it('generates the requested number of voice options with default preview text fallback', async () => {
    const onDesignVoice = vi
      .fn<(_: {
        voicePrompt: string
        previewText: string
        preferredName: string
        language: 'zh'
      }) => Promise<{ voiceId: string; audioBase64: string }>>()
      .mockResolvedValueOnce({ voiceId: 'voice-1', audioBase64: 'audio-1' })
      .mockResolvedValueOnce({ voiceId: 'voice-2', audioBase64: 'audio-2' })
      .mockResolvedValueOnce({ voiceId: 'voice-3', audioBase64: 'audio-3' })
      .mockResolvedValueOnce({ voiceId: 'voice-4', audioBase64: 'audio-4' })

    const result = await generateVoiceDesignOptions({
      count: '4',
      voicePrompt: ' 温柔女声 ',
      previewText: '   ',
      defaultPreviewText: '默认试听文案',
      onDesignVoice,
      createPreferredName: (index) => `preferred-${index + 1}`,
    })

    expect(result).toEqual([
      { voiceId: 'voice-1', audioBase64: 'audio-1', audioUrl: 'data:audio/wav;base64,audio-1' },
      { voiceId: 'voice-2', audioBase64: 'audio-2', audioUrl: 'data:audio/wav;base64,audio-2' },
      { voiceId: 'voice-3', audioBase64: 'audio-3', audioUrl: 'data:audio/wav;base64,audio-3' },
      { voiceId: 'voice-4', audioBase64: 'audio-4', audioUrl: 'data:audio/wav;base64,audio-4' },
    ])
    expect(onDesignVoice.mock.calls).toEqual([
      [{ voicePrompt: '温柔女声', previewText: '默认试听文案', preferredName: 'preferred-1', language: 'zh' }],
      [{ voicePrompt: '温柔女声', previewText: '默认试听文案', preferredName: 'preferred-2', language: 'zh' }],
      [{ voicePrompt: '温柔女声', previewText: '默认试听文案', preferredName: 'preferred-3', language: 'zh' }],
      [{ voicePrompt: '温柔女声', previewText: '默认试听文案', preferredName: 'preferred-4', language: 'zh' }],
    ])
  })

  it('fails explicitly when a designed voice is missing voiceId', async () => {
    const onDesignVoice = vi.fn(async () => ({ voiceId: '', audioBase64: 'audio-only' }))

    await expect(
      generateVoiceDesignOptions({
        count: 1,
        voicePrompt: '旁白',
        previewText: '测试',
        defaultPreviewText: '默认试听文案',
        onDesignVoice,
      }),
    ).rejects.toThrow('VOICE_DESIGN_INVALID_RESPONSE: missing voiceId')
  })

  it('builds an editable voice prompt from character profile and appearance description', () => {
    const prompt = buildCharacterVoicePrompt({
      name: '老板',
      profileData: JSON.stringify({
        role_level: 'S',
        archetype: '霸道总裁',
        personality_tags: ['克制', '压迫感', '果断'],
        era_period: '现代都市',
        social_class: '上层精英',
        occupation: '集团掌权人',
        costume_tier: 4,
        suggested_colors: ['黑色'],
        visual_keywords: ['冷峻', '西装'],
        gender: '男',
        age_range: '三十到四十岁',
      }),
      variants: [
        {
          description: '眼神锋利，气场强，有不怒自威的掌控感。',
        },
      ],
      introduction: '说话简短直接，不喜欢解释太多。',
    })

    expect(prompt).toContain('老板')
    expect(prompt).toContain('男')
    expect(prompt).toContain('三十到四十岁')
    expect(prompt).toContain('霸道总裁')
    expect(prompt).toContain('克制、压迫感、果断')
    expect(prompt).toContain('眼神锋利')
    expect(prompt).toContain('年龄感、性别感、音色、语速、语调')
    expect(prompt.length).toBeLessThanOrEqual(500)
  })

  it('keeps the voice design instruction when character description is long', () => {
    const prompt = buildCharacterVoicePrompt({
      name: '长描述角色',
      description: '冷静、强势、复杂。'.repeat(120),
    })

    expect(prompt).toContain('年龄感、性别感、音色、语速、语调')
    expect(prompt.length).toBeLessThanOrEqual(500)
  })
})
