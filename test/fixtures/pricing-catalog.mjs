// 全合成公开价目录夹具：不含用户路由、Token、会话、路径或凭据。
export const FIXTURE_PROVIDER = 'zhipuai'
export const FIXTURE_MODEL = 'synthetic-cny-model'
export const FIXTURE_NATIVE_PATH = `providers/${FIXTURE_PROVIDER}/models/${FIXTURE_MODEL}.toml`

export const USD_CATALOG_FIXTURE = {
  [FIXTURE_PROVIDER]: {
    id: FIXTURE_PROVIDER,
    name: 'Synthetic fixture provider',
    models: {
      [FIXTURE_MODEL]: {
        id: FIXTURE_MODEL,
        cost: { input: 2, cache_read: 0.25, cache_write: 0.5, output: 8 },
      },
      'synthetic-usd-only': {
        id: 'synthetic-usd-only',
        cost: { input: 1, output: 3 },
      },
    },
  },
  'fixture-other-provider': {
    models: {
      [FIXTURE_MODEL]: { cost: { input: 99, output: 99 } },
    },
  },
}

export const NATIVE_CNY_FIXTURE = `
# Synthetic fixture; prices are not real provider prices.
# CNY per 1M tokens: 14 in / 28 out / 1.4 cache read / 2.8 cache write
[cost.text.input]
price = 999
`

export const NATIVE_TREE_FIXTURE = {
  tree: [
    { path: FIXTURE_NATIVE_PATH, type: 'blob' },
    { path: 'providers/not-allowlisted/models/ignored.toml', type: 'blob' },
    { path: 'providers/zhipuai/models/../escape.toml', type: 'blob' },
    { path: 'README.md', type: 'blob' },
  ],
}

export const FX_FIXTURE = {
  result: 'success',
  time_last_update_unix: 1_793_721_600,
  rates: { USD: 1, CNY: 7.13 },
}

export function pricingSnapshotFixture(overrides = {}) {
  return {
    id: 'synthetic-snapshot-id',
    usd: [
      {
        provider: FIXTURE_PROVIDER,
        model: FIXTURE_MODEL,
        prices: { inputTokens: '2', cacheReadTokens: '0.25', cacheWriteTokens: '0.5', outputTokens: '8' },
      },
      {
        provider: FIXTURE_PROVIDER,
        model: 'synthetic-usd-only',
        prices: { inputTokens: '1', cacheReadTokens: null, cacheWriteTokens: null, outputTokens: '3' },
      },
    ],
    native: [
      {
        provider: FIXTURE_PROVIDER,
        model: FIXTURE_MODEL,
        prices: { inputTokens: '14', cacheReadTokens: '1.4', cacheWriteTokens: '2.8', outputTokens: '28' },
      },
    ],
    usdAt: 1_793_721_600_000,
    nativeAt: 1_793_721_700_000,
    fxAt: 1_793_721_800_000,
    syncedAt: 1_793_721_800_000,
    fx: { cnyPerUsd: 7 },
    stale: false,
    sources: {
      usd: { attemptedAt: 1_793_721_600_000, error: null },
      native: { attemptedAt: 1_793_721_700_000, error: null },
      fx: { attemptedAt: 1_793_721_800_000, error: null },
    },
    ...overrides,
  }
}
