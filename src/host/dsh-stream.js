/*!
MIT License

Copyright (c) 2026 DeepSeek

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
// Pure public assistant-stream rules from DeepSeek Harness dsh-v0.2.2-rc.5 (9c2670d3),
// packages/llm/llm/src/assistant-stream.ts. Kept in the plugin bundle because DSH
// profiles need not expose dsh-llm to separately installed npm packages.

function isTokenDelta(chunk) {
  switch (chunk?.type) {
    case 'text-delta':
    case 'reasoning-delta':
      return typeof chunk.text === 'string' && chunk.text !== ''
    case 'tool-call-delta':
      return (typeof chunk.argumentsDelta === 'string' && chunk.argumentsDelta !== '') || chunk.name !== undefined
    default:
      return false
  }
}

function runFirstTokenTime(run) {
  const tools = run.type === 'tool-call-chunks'
  if (!tools && run.type !== 'text-chunks' && run.type !== 'reasoning-chunks') return undefined
  if (tools && run.name !== undefined) return run.time0
  const fragments = tools ? run.args : run.texts
  if (!Array.isArray(fragments)) return undefined
  let time = run.time0
  for (let index = 0; index < fragments.length; index += 1) {
    if (index > 0) time += run.dt?.[index - 1]
    if (typeof fragments[index] === 'string' && fragments[index] !== '') return time
  }
  return undefined
}

function firstTokenTime(stream) {
  if (!Array.isArray(stream)) return undefined
  for (const record of stream) {
    if (!record || typeof record !== 'object') continue
    const time = record.type === 'chunk' ? (isTokenDelta(record.chunk) ? record.time : undefined) : runFirstTokenTime(record)
    if (time !== undefined) return Number.isFinite(time) ? time : undefined
  }
  return undefined
}

function lastUsage(stream) {
  if (!Array.isArray(stream)) return undefined
  for (let index = stream.length - 1; index >= 0; index -= 1) {
    const record = stream[index]
    if (record?.type === 'chunk' && record.chunk?.type === 'usage') return record.chunk.usage
  }
  return undefined
}

const helpers = Promise.resolve(Object.freeze({ firstTokenTime, lastUsage }))
export function loadStreamHelpers() { return helpers }
