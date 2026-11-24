import { describe, expect, it } from 'vitest'
import { loggedRetry, loggedStep } from './fixtures/dsh-stats.mjs'

describe('DSH public settlement fixtures', () => {
  it('pins the minimal successful step envelope and native usage route', () => {
    const events = loggedStep({ at: 10_000, seq: 100, provider: 'p', model: 'm', input: 30, output: 20 })
    expect(events.map((event) => event.type)).toEqual(['step/start', 'assistant/message', 'step/end'])
    expect(events.map((event) => event.seq)).toEqual([100, 101, 102])
    expect(events[0].data).toMatchObject({ turn: 1, step: 1 })
    expect(events[1].data.usage.outputTokens).toBe(20)
    expect(events[1].data.usage.inputTokens).toBe(30)
    expect(events[1].data.message.source).toMatchObject({ provider: 'p', model: 'm' })
    expect(events[1].data.stream[0]).toMatchObject({ type: 'chunk', chunk: { type: 'text-delta' } })
    expect(events[1].data.interrupted).toBeUndefined()
  })

  it('represents failed attempts structurally, never by changing message text', () => {
    const events = loggedRetry({ at: 20_000, seq: 200, provider: 'p', model: 'm', failedOutput: 4, output: 10 })
    expect(events.map((event) => event.type)).toEqual([
      'step/start', 'assistant/attempt', 'llm/retry-started', 'assistant/message', 'step/end',
    ])
    expect(events[1].data.message).toBeUndefined()
    expect(events[1].data.stream.find((record) => record.chunk?.type === 'usage').chunk.usage.outputTokens).toBe(4)
    expect(events[3].data.usage.outputTokens).toBe(10)
  })

  it('uses the native interrupted flag for a cancelled partial message', () => {
    const events = loggedStep({ at: 30_000, seq: 300, provider: 'p', model: 'm', interrupted: true })
    expect(events[1].data.interrupted).toBe(true)
    expect(events[1].data.message.content).not.toBe('failed')
  })
})
