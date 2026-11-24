// Synthetic DSH dsh-v0.2.2-rc.5 settlement events. No real session content is used.
const usageOf = ({ input = 30, output = 20, cacheRead = null, cacheWrite = null }) => ({
  inputTokens: input,
  outputTokens: output,
  cacheReadTokens: cacheRead,
  cacheWriteTokens: cacheWrite,
})

const streamOf = (at, usage) => [
  { type: 'chunk', time: at - 2_000, chunk: { type: 'text-delta', text: 'synthetic-fixture' } },
  { type: 'chunk', time: at - 1_000, chunk: { type: 'usage', usage } },
  { type: 'chunk', time: at - 500, chunk: { type: 'finish', reason: 'stop' } },
]

const envelope = (type, at, seq, data) => ({ type, time: at, seq, data })

export function loggedStep({
  at, seq, provider, model, input = 30, output = 20, cacheRead = null, cacheWrite = null,
  turn = 1, step = 1, interrupted = false,
}) {
  const usage = usageOf({ input, output, cacheRead, cacheWrite })
  return [
    envelope('step/start', at - 3_000, seq, { turn, step }),
    envelope('assistant/message', at, seq + 1, {
      turn,
      step,
      message: {
        role: 'assistant',
        source: { kind: 'model', provider, model },
        content: [{ type: 'text', text: 'synthetic-fixture' }],
      },
      stream: streamOf(at, usage),
      usage,
      ...(interrupted ? { interrupted: true } : {}),
    }),
    envelope('step/end', at + 1, seq + 2, { turn, step }),
  ]
}

export function loggedRetry({
  at, seq, provider, model, failedInput = 8, failedOutput = 4,
  input = 30, output = 10, turn = 1, step = 1,
}) {
  const failedUsage = usageOf({ input: failedInput, output: failedOutput })
  const final = loggedStep({ at, seq: seq + 3, provider, model, input, output, turn, step })
  return [
    envelope('step/start', at - 8_000, seq, { turn, step }),
    envelope('assistant/attempt', at - 5_000, seq + 1, {
      turn,
      step,
      stream: streamOf(at - 5_000, failedUsage),
    }),
    envelope('llm/retry-started', at - 4_000, seq + 2, { turn, step }),
    ...final.slice(1).map((event, index) => ({ ...event, seq: seq + 3 + index })),
  ]
}
