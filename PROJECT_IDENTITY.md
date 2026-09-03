# LayerPiP project identity

- Product/display name: 叠映 LayerPiP
- Canonical development source: `/Users/salmonc/Documents/笔记/Obsidian/AI学习资料/bilibili-subtitle-bridge/LayerPiP`
- Stable predecessor source: `/Users/salmonc/Documents/笔记/Obsidian/AI学习资料/bilibili-subtitle-bridge/FloatCaption`
- Extension identifier: `jnonlboihmjeahenhlbkjdijicakfnjj`
- Identity source: public key in `src/manifest.ts`; `scripts/afterClean.ts` verifies the derived ID during every build
- Authoritative version source: `package.json`
- Persistent storage namespace: `LAYERPIP_*_V1`
- IndexedDB: `layerpip-assets-v1`
- Build command: `pnpm build`
- Unpacked artifact: `dist`
- Installation policy: do not install or reload over the stable predecessor; load this `dist` as a separate unpacked extension only after candidate verification
- Coexistence policy: until runtime interception is independently verified, do not enable LayerPiP and the stable predecessor in the same Edge profile
- Rollback: disable LayerPiP and re-enable the stable predecessor ID `khhhhgeeifjlccikcaibpeddjhfihlgi`
- Frozen rollback artifact: `/Users/salmonc/Documents/笔记/Obsidian/AI学习资料/bilibili-subtitle-bridge/releases/FloatCaption-0.7.1-stable-f7efb70.zip`
- Frozen rollback SHA-256: `b4b2c9c96c9a097f43920ce58ae00d132556fc5a7433a34b27effb9586ccf966`
- License: CC BY-NC 4.0; retains attribution to `apades/dmMiniPlayer`
