# LayerPiP delivery rules

> **每轮开工前读 [`AGENT_SYNC.md`](./AGENT_SYNC.md)，收工前更新它。**
> 我和 Codex 轮流改这个项目。若上一轮被中断（例如额度用完），接手方要靠这份文件的「中断点」知道做到哪。
> 更新后单独提交该文件（一次提交只含它）。

Read `PROJECT_IDENTITY.md` for identity and delivery boundaries.

- The user has authorized future reviewed updates to be built and delivered to the repository-root `dist` automatically. This is the permanent unpacked extension path.
- Use `pnpm build` or `node scripts/build-local.mjs`; build in staging, verify, preserve the previous output, and only then replace `dist`. Never direct the user to install from temporary build paths.
- Increment the package version for changed deliveries. Keep the extension ID and data namespaces unchanged.
- The user reloads the extension and performs real-device acceptance. Do not block source delivery on permission for agent-driven browser installation or acceptance.
- Do not claim installed, reloaded, or fully accepted based on a build. Record the actual delivered version and verification in `progress.md`.
- Preserve unrelated dirty worktree changes; do not touch the stable predecessor.
- For changes to keyboard configuration, player focus, or Document PiP input-window ownership, run `node scripts/keyboard-regression.mjs` before delivery. Preserve coverage for malformed shortcuts, pointer-button focus, editable controls, blur release, and repeated window binding. The fixture does not replace user acceptance of actual Document PiP.

## Git rules

我和 Codex 轮流改这个项目（通常不同时）。历史是共享的：

1. **不改写历史**：不要 `git rebase` / `commit --amend` / `reset --hard` / force push，往上加新提交。
2. **不用宽泛暂存**：不要 `git add -A` / `git add .`，只 stage 明确路径；提交前用 `git diff --cached --name-only` 核对。
3. **不动本地回退资料**：`dist/`、`dist 2/` … `dist N/`、`.delivery/`、`test-results/` 不提交也不删除。
4. **一次提交一件事**，并在提交信息里写清改了什么、验证到哪一步。


