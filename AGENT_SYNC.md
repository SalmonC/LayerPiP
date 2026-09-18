# LayerPiP 进度交接

我和 Codex 轮流改这个项目，一般不会同时进行。
唯一要防的是：**一方执行到一半中断**（比如额度用完），接手方不知道做到哪、有没有留下半成品。

规则只有一条：**每轮开始前读这里，每轮结束后更新这里。**
写之前重读一次；提交时只 stage 本文件。

---

## 1. 当前状态

- 版本（package.json / dist）：`0.2.15` / `0.2.15`
- dist SHA-256：`74cf68734ecf4bd65988b0f4c802e13633681f7d47d69b277726c4d382814dce`
- 最近交付提交：`94a1bbc`（release 0.2.15）
- 工作区：干净
- 标签：`checkpoint/0.2.14`、`fix/docpip-default-size`
- 扩展 ID：`jnonlboihmjeahenhlbkjdijicakfnjj`（不变）
- 更新人 / 时间：DeepSeek / 2026-09-18

## 2. 中断点 ← 接手时先看这里

> 没有就写「无」。这是本文件最有价值的一节。

**无。** 上一轮（DeepSeek，0.2.15）已完整收尾：改动已提交、已构建交付、工作区干净。

---

## 3. 变更记录（新的在上）

模板：

```markdown
### YYYY-MM-DD · <agent>
- 做了什么：
- 提交：
- git 操作：
- 交付：版本 / dist 是否更新 / SHA-256（无就写「无」）
- 验证：
- 遗留：
```

### 2026-09-18 · DeepSeek · 修复小窗默认尺寸极小 + 交付 0.2.15

- **做了什么**：修「每次打开小窗尺寸都极小」。原因是窗口几何被写成了快速隐藏的 240×52（`pagehide` 保存时 `isQuickHiding` 已被 `onUnload()` 置回 false），而该键没有重置入口。
  - `src/utils/docPIP.ts` 新增 `DOC_PIP_QUICK_HIDE_SIZE` / `DOC_PIP_MIN_USABLE_SIZE` / `isUsableDocPIPSize()`
  - `src/core/WebProvider/DocPIPWebProvider.ts` 读/写窗口几何都做可用性校验（坏值忽略并回退视频尺寸 → 已写坏的历史值自愈）
  - `src/core/WebProvider/WebProvider.ts` 快速隐藏的恢复改用后台 `chrome.windows.update`（PiP 窗口内 `resizeTo` 会抛 `NotAllowedError`）
  - `scripts/build-local.mjs` 的 `excluded` 改为 `/^dist \d+$/`；`.gitignore` 忽略 `/dist [0-9]*/` 与 `/test-results/`
- **提交**：`94a1bbc` `e861133` `39396cb` `3a1be1d` `cc93159` `288ae6f` `0274ff1` `d743fc0`
- **git 操作**：把积压的 122 个未提交改动固化为检查点 `cc93159`；打标签 `checkpoint/0.2.14`、`fix/docpip-default-size`；改动 3 个文件前做了非破坏性快照 ref `checkpoint/wip-20260918-152142`。未 rebase / amend / reset / 切分支
- **交付**：**0.2.15** 已构建并替换 dist；SHA-256 `74cf6873…814dce`；收据 `.delivery/receipt-0.2.15-2026-09-18T07-28-00-692Z.json`
- **验证**：tsc 92 条 == 基线（改动文件 0 条）；改动文件 eslint 通过；构建通过；产物核对新增日志文案在 `dist/*.js` 且 `dist/main.js` 已无 `resizeTo`。**未实机验收**
- **遗留**：需要用户重新加载扩展 + 刷新 B 站页面实机验收（用过「快速隐藏」后再开不应变小）。若继续在 0.2.15 之上交付，请递增版本号

---

## 4. 别碰的 / 常见恢复

**不要提交也不要删除**（本地回退资料）：`dist/`、`dist 2/` … `dist N/`（各约 93MB）、`.delivery/`、`test-results/`。

**不要改写共享历史**：`git rebase` / `commit --amend` / `reset --hard` / force push。往上加新提交。

**常见中断残留与处理**：

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 构建报 `EEXIST` 且 `.delivery/build.lock` 存在 | 上次构建被强杀，`finally` 没跑到 | 确认没有构建在跑，然后 `rmdir .delivery/build.lock`（只是个空目录）再构建 |
| 工作区有一堆不属于自己的改动 | 上一轮中断在提交前 | 先 `git log --oneline` 看有没有检查点提交；不要 `git checkout .` |
| 不确定某个版本对应哪些改动 | — | 查本文件「3. 变更记录」与 `progress.md`；`.delivery/receipt-*.json` 里有 `sourceCommit` |
