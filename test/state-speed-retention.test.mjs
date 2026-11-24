import { describe, expect, it } from 'vitest'
import { createStateEngine } from '../src/host/state.js'
import { loggedStep } from './fixtures/dsh-stats.mjs'

const firstTokenTime = (stream) => stream.find((record) => record.chunk?.type === 'text-delta')?.time

describe('state speed-fact retention', () => {
  it('physically prunes expired numeric speed facts instead of only hiding them in one query', () => {
    const base = Date.parse('2026-11-22T12:00:00Z')
    let now = base
    const engine = createStateEngine({ roots: () => [], getSession: () => undefined, getTitle: () => undefined, now: () => now, firstTokenTime })
    engine.noteCorpusSession('s', loggedStep({ at: base - 60 * 60 * 1000, seq: 10, provider: 'p', model: 'm', output: 20 }), false)
    expect(engine.speedFacts().facts).toHaveLength(1)
    expect(engine.usageFacts().facts).toHaveLength(1)

    now = base + 23 * 60 * 60 * 1000 // exactly 24h old: retained interval is (now-24h, now]
    expect(engine.speedFacts().facts).toEqual([])
    now = base // even if a caller clock moves back, the pruned fact does not resurrect without a new fold
    expect(engine.speedFacts().facts).toEqual([])
    expect(engine.usageFacts().facts).toHaveLength(1) // speed retention never deletes Token facts
  })
})
