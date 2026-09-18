# LayerPiP delivery rules

Read `PROJECT_IDENTITY.md` for identity and delivery boundaries.

- The user has authorized future reviewed updates to be built and delivered to the repository-root `dist` automatically. This is the permanent unpacked extension path.
- Use `pnpm build` or `node scripts/build-local.mjs`; build in staging, verify, preserve the previous output, and only then replace `dist`. Never direct the user to install from temporary build paths.
- Increment the package version for changed deliveries. Keep the extension ID and data namespaces unchanged.
- The user reloads the extension and performs real-device acceptance. Do not block source delivery on permission for agent-driven browser installation or acceptance.
- Do not claim installed, reloaded, or fully accepted based on a build. Record the actual delivered version and verification in `progress.md`.
- Preserve unrelated dirty worktree changes; do not touch the stable predecessor.
- For changes to keyboard configuration, player focus, or Document PiP input-window ownership, run `node scripts/keyboard-regression.mjs` before delivery. Preserve coverage for malformed shortcuts, pointer-button focus, editable controls, blur release, and repeated window binding. The fixture does not replace user acceptance of actual Document PiP.
