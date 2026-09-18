# LayerPiP delivery rules

Read `PROJECT_IDENTITY.md` for identity and delivery boundaries.

- The user has authorized future reviewed updates to be built and delivered to the repository-root `dist` automatically. This is the permanent unpacked extension path.
- Use `pnpm build` or `node scripts/build-local.mjs`; build in staging, verify, preserve the previous output, and only then replace `dist`. Never direct the user to install from temporary build paths.
- Increment the package version for changed deliveries. Keep the extension ID and data namespaces unchanged.
- The user reloads the extension and performs real-device acceptance. Do not block source delivery on permission for agent-driven browser installation or acceptance.
- Do not claim installed, reloaded, or fully accepted based on a build. Record the actual delivered version and verification in `progress.md`.
- Preserve unrelated dirty worktree changes; do not touch the stable predecessor.
- For changes to keyboard configuration, player focus, or Document PiP input-window ownership, run `node scripts/keyboard-regression.mjs` before delivery. Preserve coverage for malformed shortcuts, pointer-button focus, editable controls, blur release, and repeated window binding. The fixture does not replace user acceptance of actual Document PiP.

## Git rules for concurrent agents

More than one agent may work in this working tree at the same time. History is shared and must never be rewritten. Follow these rules:

1. **Never use broad staging.** `git add -A` / `git add .` will sweep in files another agent is mid-edit on. Stage explicit paths only.
2. **Keep commits small and scoped to one change.** One fix or one feature per commit, with the affected paths listed.
3. **Check the tree before you start.** `git status --short` and `git diff <file>` first. If a file you must edit is already dirty, that diff belongs to someone else — never revert it, never `git checkout -- <file>`.
4. **Only the `dist` root is a build target.** `dist 2/` … `dist N/`, `dist/`, `.delivery/` and `test-results/` are ignored local artifacts. Never commit or delete them; they are rollback material.
5. **Never rewrite shared history**: no `git rebase`, `git commit --amend`, `git reset --hard`, or force-push on a branch another agent may be using. Add new commits instead.
6. **Do not switch branches** while the tree is dirty; other agents share this checkout. Commit on the current branch.
7. **Before anything risky** (large refactor, build that replaces `dist`), take a non-destructive snapshot: `git stash create` and point a ref at it, e.g.
   `SHA=$(git stash create "snapshot") && git update-ref refs/heads/checkpoint/<name> "$SHA"`.
   It records the dirty state without touching the working tree.
8. **Before committing, verify what you staged**: `git diff --cached --name-only` and confirm nothing from another agent's work and no artifacts are included.
9. **Report the commit in `progress.md`** — hash, scope and verification — so the other agent can see what landed.

