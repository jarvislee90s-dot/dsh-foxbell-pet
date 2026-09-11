# E6 对账证据：foldUsage 重放 vs 官方 tokenUsage totals（reconciliation.md）

- 会话样本：`session-2d359772-cefe-4bff-9e37-e1ef0dcb1bdc`（~/.dsh/sessions/--Users-jarvis-Documents-DeepSeek-DeepSeek-plugins--/，session.jsonl.zstd 11.8MB，801 条带 usage 的 assistant/message 事件）
- 方法：`zstd -dc` 解出原始事件流 → 原样喂给**出仓产物内同源实现** `src/host/dashboard.js#foldUsage`（即真机 L3 背后的同一聚合核）→ 与官方 `~/.dsh/storages/session_projcache/.../tokenUsage.totals` 逐口径比对。

## 结果（四口径逐字节相等）

| 口径 | foldUsage grand | 官方 totals | diff |
|---|---|---|---|
| 请求输入（uncached） | 6,015,114 | 6,015,114 | **0** |
| 产出 | 736,436 | 736,436 | **0** |
| 缓存命中 | 305,636,224 | 305,636,224 | **0** |
| 缓存写入 | 0 | 0 | **0** |

- 请求计数：requestCount = 801（= 带 usage 的 assistant/message 结算样本数）。
- 路由维度内部一致性：byRoute 各桶四口径之和 == grand（逐字段相等）；路由 requestCount 之和 == 801。
- 路由分布（按产出 token）：agentplan-cherry/DeepSeek-V4-Flash（500,564）、deepseek-official/deepseek-v4-flash（199,322）、opencode-go/deepseek-v4-flash（36,550）。
- 与 liveTokenUsage.settled 的 uncached 差 −1,807,360 系官方 settled 侧含 3 个结算估计样本（settledEstimates: 3）所致；与最终 tokenUsage.totals（权威值）完全一致。
- 替换语义（同 turn/step 取最新样本冲回旧样本）与路由归因同槽结算的设计经该重放验证无损。

结论：**缓存正确性（R1）与路由归因（R2）在真实数据上与 harness 官方统计完全对账通过。**

复跑方式：

```bash
zstd -dc <session.jsonl.zstd> > /tmp/s.jsonl
node --input-type=module -e "…见 executor report 附录…"
```
