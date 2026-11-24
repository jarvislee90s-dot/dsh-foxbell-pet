const MINUTE_MS = 60_000
const localOffset = (at) => new Date(at).getTimezoneOffset() * MINUTE_MS

/** Floor the current local occurrence, without collapsing a repeated wall-clock hour. */
export function floorLocalBucket(at, width) {
  const offset = localOffset(at)
  const edge = Math.floor((at - offset) / width) * width + offset
  if (!Number.isFinite(offset)) throw new RangeError('Invalid local clock timestamp')
  if (localOffset(edge) === offset) return edge
  // A forward transition can skip part of a wall-clock bucket, so the
  // nominal edge may be on the other side of the offset transition.
  return floorLocalBucket(edge, width)
}

/** The next wall-clock bucket edge, or the offset transition that clips this bucket. */
export function nextLocalBucket(at, width) {
  const offset = localOffset(at)
  const next = (Math.floor((at - offset) / width) + 1) * width + offset
  if (localOffset(next) === offset) return next
  let low = at
  let high = next
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2)
    if (localOffset(middle) === offset) low = middle
    else high = middle
  }
  return high
}
