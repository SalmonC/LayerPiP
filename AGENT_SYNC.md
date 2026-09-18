# LayerPiP 双 Agent 同步台

> **用途**：同一个工作区会被多个 agent 同时修改（当前是 **DeepSeek Harness** 与 **Codex**）。
> 本文件是双方唯一的同步入口：谁在改什么、改到哪、交付了什么版本、做过哪些 git 操作，全部记在这里。
>
> **本文件由两个 agent 共同维护。开工前必读，收工前必写。**

---

## 0. 规则（两个 agent 都必须遵守）

1. **开工前先读本文件**：看「一、当前状态」「二、进行中占用」「三、变更日志」的最新几条，确认没有人正在改你要改的文件。
2. **动手前登记占用**：在「二、进行中占用」加一行，写清 agent 名、开始时间、目的、**涉及的具体文件**。
3. **涉及同一文件时不要并行**：如果目标文件已被另一方占用，停下来等，或先问用户。这是最容易冲突的地方。
4. **收工后按顺序更新本文件**：
   a. 刷新「一、当前状态」；
   b. 在「三、变更日志」**顶部**追加一条；
   c. 把「二、进行中占用」里自己那行标记为完成或删除；
   d. **立即单独提交本文件**（一次提交只包含本文件，方便对方用 `git log` 看到）。
5. **只追加，不删除他人条目**。发现别人写错了：保留原文，另起一行写「更正」。
6. **写本文件前必须重新读一遍**：两个 agent 在同一份文件上写会产生「后写覆盖先写」的丢更新。读完立刻写、写完立刻提交，缩短窗口。
7. **版本相关的任何事都要记**：改了哪些文件、提交 hash、打的标签、构建/交付的版本与哈希、有没有动 `dist`、有没有跑回归、留了什么尾巴。
8. 其余 git 与交付规则见 `AGENTS.md`（「Git rules for concurrent agents」与交付规则）。冲突时以 `AGENTS.md` 与 `PROJECT_IDENTITY.md` 为准。

---

## 一、当前状态

> 每次操作后更新这一节。**这一节是双方判断"现在能不能动手"的第一依据。**

| 项 | 值 | 更新人 | 更新时间 |
| --- | --- | --- | --- |
| 工作分支 | `feature/layerpip-dual-mode` | DeepSeek | 2026-09-18 |
| HEAD | `94a1bbc` | DeepSeek | 2026-09-18 |
| 工作区 | 干净（0 未提交） | DeepSeek | 2026-09-18 |
| `package.json` 版本 | `0.2.15` | DeepSeek | 2026-09-18 |
| 固定 `dist` 版本 | `0.2.15`（已回读） | DeepSeek | 2026-09-18 |
| `dist` 整体 SHA-256 | `74cf68734ecf4bd65988b0f4c802e13633681f7d47d69b277726c4d382814dce` | DeepSeek | 2026-09-18 |
| 扩展 ID | `jnonlboihmjeahenhlbkjdijicakfnjj`（未变） | DeepSeek | 2026-09-18 |
| 构建锁 `.delivery/build.lock` | 无（可构建） | DeepSeek | 2026-09-18 |
| 最近标签 | `checkpoint/0.2.14`、`fix/docpip-default-size` | DeepSeek | 2026-09-18 |
| 兜底快照 ref | `checkpoint/wip-20260918-152142`（改动前状态） | DeepSeek | 2026-09-18 |

**不可提交的本地产物**（已在 `.gitignore` 忽略，**任何 agent 都不得提交或删除**）：
`dist/`、`dist 2/` … `dist N/`（各约 93MB，回退用）、`.delivery/`（构建收据与回滚副本）、`test-results/`。

---

## 二、进行中占用

> 开工前加一行；收工后把状态改成「完成」。
> **涉及同一文件的改动不要并行**；后到者必须等前一个结束。

| Agent | 开始时间 | 目的 | 涉及文件 | 状态 |
| --- | --- | --- | --- | --- |
| DeepSeek | 2026-09-18 | 小窗默认尺寸极小修复 + 交付 0.2.15 + git 整理 | `src/utils/docPIP.ts`、`src/core/WebProvider/DocPIPWebProvider.ts`、`src/core/WebProvider/WebProvider.ts`、`scripts/build-local.mjs`、`package.json`、`AGENTS.md`、`progress.md` | **完成** |

---

## 三、变更日志

> **只追加，最新在最上面。** 每条至少包含：agent、时间、目的、提交 hash、改动文件、git 操作、验证、遗留。
> 复制下面这个模板写新条目：

```markdown
### YYYY-MM-DD HH:MM · <agent 名> · <一句话目的>
- **提交**：`<hash>` (＋未提交/未构建等状态说明)
- **改动文件**：`path`（做了什么）
- **git 操作**：提交 / 打标签 / 建分支 / 是否 rebase（默认不允许） / 是否动过 index
- **交付**：版本号、dist 是否更新、SHA-256、收据路径（没有就写「无」）
- **验证**：tsc / eslint / 键盘回归 / 构建 / 实机验收（写清做到哪一步）
- **遗留 / 需要对方注意**：
```

---

### 2026-09-18 · DeepSeek · 修复小窗默认尺寸极小，并建立并发 Git 规范

- **提交**：`94a1bbc` `e861133` `39396cb` `3a1be1d` `cc93159` `288ae6f`（均已提交，工作区干净）
- **改动文件**：
  - `src/utils/docPIP.ts` — 新增 `DOC_PIP_QUICK_HIDE_SIZE`(240×52) / `DOC_PIP_MIN_USABLE_SIZE`(320×180) / `isUsableDocPIPSize()`
  - `src/core/WebProvider/DocPIPWebProvider.ts` — 读取与保存窗口几何时都做可用性校验（坏值忽略并回退视频尺寸，实现历史坏值自愈）；DPR 修正只在采用已保存尺寸时套用
  - `src/core/WebProvider/WebProvider.ts` — 快速隐藏的恢复从 `docWin.resizeTo()` 改为后台 `chrome.windows.update`（`resizeTo` 在 PiP 窗口内无瞬时激活会抛 `NotAllowedError`），并加 `try/catch`；快速隐藏尺寸改为引用同一常量
  - `scripts/build-local.mjs` — `excluded` 由硬编码列表改为 `/^dist \d+$/` 模式，避免 `dist 4/5` 被当源码复制进构建暂存目录
  - `package.json` — 0.2.14 → 0.2.15
  - `AGENTS.md` — 新增「Git rules for concurrent agents」
  - `.gitignore` — 忽略 `/dist [0-9]*/` 与 `/test-results/`
- **git 操作**：
  - 覆盖修改前用 `git stash create` 做了**非破坏性快照** `checkpoint/wip-20260918-152142`（未改动工作区）
  - 把此前积压的 122 个未提交改动 + 48 个未跟踪文件固化为检查点提交 `cc93159`（128 文件，原样快照，无功能改动）
  - 打标签 `checkpoint/0.2.14`、`fix/docpip-default-size`
  - **没有** rebase / amend / reset --hard / 切换分支 / 删除任何回退产物
  - 覆盖修改前未提交状态：先把 3 个目标文件还原到改动前，因此 `3a1be1d` 只含本次修复
- **交付**：**0.2.15** 已构建并替换固定 `dist`；SHA-256 `74cf68734ecf4bd65988b0f4c802e13633681f7d47d69b277726c4d382814dce`；收据 `.delivery/receipt-0.2.15-2026-09-18T07-28-00-692Z.json`
- **验证**：`tsc` 92 条错误 == 改动前基线（改动文件 0 条）；改动文件 eslint 通过；构建成功（ESM+IIFE+AI 资源）；产物核对三条新增日志文案均在 `dist/*.js` 且 `dist/main.js` 已无 `resizeTo`。**未安装、未重新加载、未实机验收**
- **遗留 / 需要对方注意**：
  1. 需要用户重新加载扩展并刷新 B 站页面后实机验收（用过「快速隐藏」后再开也不应变小）
  2. 若你在 0.2.15 之上继续交付，请**递增版本号**并更新本表
  3. 构建前确认 `.delivery/build.lock` 不存在；构建会替换整个 `dist`，**同一时间只应有一个 agent 构建**

### 2026-09-18 · DeepSeek · 建立本同步文件

- **提交**：本次提交（`AGENT_SYNC.md` + `AGENTS.md` 指针）
- **目的**：给两个 agent 一个共同的进度与占用登记处，避免并行改同一文件、重复交付、互相覆盖
- **需要对方注意**：Codex 首次接入时请在本节上方追加一条，说明自己的身份与当前计划

---

## 四、已知风险与恢复手段

| 风险 | 症状 | 恢复 |
| --- | --- | --- |
| 双方同时改同一文件 | 后写覆盖先写，丢更新 | 开工前看「二、进行中占用」；写本文件前重读 |
| 误提交 93MB 的 `dist N` | 仓库体积暴涨 | 已在 `.gitignore` 忽略；若已提交用 `git rm -r --cached "dist 4"` 后提交 |
| 双方同时构建 | `dist` 互相覆盖 | `scripts/build-local.mjs` 有 `.delivery/build.lock` 互斥；报错说明另一方在构建，等对方结束 |
| 误删未提交改动 | 工作区被 `git checkout .` 清空 | 先看是否有检查点：`git log --oneline` 找 `chore: checkpoint …`；兜底 ref `checkpoint/wip-20260918-152142` |
| 不知道某版本对应哪些改动 | — | 用本文件「三、变更日志」按版本号检索；`progress.md` 有更详细的交付记录与收据路径 |

**回退产物位置**：`.delivery/rollback-*`、`.delivery/safety-*`、`.delivery/receipt-*.json`，以及 `dist 2/` … `dist N/`。**只能读取，不要移动或删除。**
