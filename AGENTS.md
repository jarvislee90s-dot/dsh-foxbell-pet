# AGENTS.md — dsh-foxbell-pet 仓库约定

本文件面向在本仓库工作的 AI agent 与协作者，约定随仓库版本化。

## 发版约定（本仓库特有，重要）

- **`main` 是开发分支**，随时合并新代码；**对外稳定版 = `release` 分支**，只在发版时由脚本快进。
  外部用户的安装命令固定指向 `github:jarvislee90s-dot/dsh-foxbell-pet#release`（README「安装」节），
  因此 main 上尚未发版的改动不影响外部用户。
- **发版唯一入口**：先在 `CHANGELOG.md` 写好 `## [x.y.z] - 日期` 条目，然后在 main 上执行

  ```sh
  npm run release -- x.y.z    # 加 --dry-run 只校验不执行
  ```

  脚本 `scripts/release.mjs` 自动完成：前置校验（在 main、工作区干净、与 origin/main 同步、
  CHANGELOG 条目存在、tag 未占用）→ 同步 package.json 与 dsh.plugin.json 的 version →
  `build + validate + test` → 提交 `chore(release): vX.Y.Z` 并打 tag → push →
  `release` 分支 fast-forward 到该提交并 push。

- **禁止事项**：
  - 不要手工向 `release` 分支提交、merge 或 force-push（脚本只接受 fast-forward，历史分叉会中止）。
  - 不要手工打 `vX.Y.Z` 版本 tag（tag 由脚本在发版提交上统一创建）。
  - 手工打完 tag ≠ 已发版：外部用户装的是 `release` 分支，只有脚本跑完才算发布完成。
  - **是否发版、何时发版由用户决定**：agent 未经用户明确确认不得执行 `npm run release`
    （它会推送公共分支与 tag，属于对外发布动作）。
- 版本号口径：package.json 与 dsh.plugin.json 的 `version` 必须一致（脚本发版时会校验/同步）。

## 构建与提交约定

- `lib/index.js`、`lib/client.js` 是发布入口（package.json `main` / `./client`），**必须随仓库提交**；
  改动 `src/` 后必须 `npm run build` 重建 lib，并与 src 改动放进同一提交
  （`npm run validate` 以「重建比对」校验 src↔lib 一致，漂移会被抓出）。
- 提交前自检：`npm run validate && npm test`（vitest）；改动 client TSX 后加跑 `npm run typecheck`。
- `README.md`（中文）与 `README.en.md`（英文）需同步修改；版本相关变更同步更新 `CHANGELOG.md`
  （条目格式 `## [x.y.z] - YYYY-MM-DD`）。
