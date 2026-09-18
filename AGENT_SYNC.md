# LayerPiP 进度交接

我和 Codex 轮流改这个项目，一般不会同时进行。
唯一要防的是：**一方执行到一半中断**（比如额度用完），接手方不知道做到哪、有没有留下半成品。

规则只有一条：**每轮开始前读这里，每轮结束后更新这里。**
写之前重读一次；提交时只 stage 本文件。

---

## 1. 当前状态

- 版本（package.json / dist）：`0.2.19` / `0.2.19`
- dist SHA-256：`41e4a52908623d3574a28a1e68483acfb0d247a42931043537006b1c90bd1dac`（构建脚本自报；未独立回读）
- 最近交付提交：`94d4055`（fix(docpip)：热力条跟随控制栏显隐 + 设置面板落点加固）
- **回退基线**：标签 `baseline/0.2.15` → `6fd1c42`（用户指定的"可用版本"）
- 工作区：干净
- 标签：`baseline/0.2.15`、`checkpoint/0.2.14`、`fix/docpip-default-size`
- 扩展 ID：`jnonlboihmjeahenhlbkjdijicakfnjj`（不变）
- 更新人 / 时间：DeepSeek / 2026-09-18

**回退方法**（改出问题就退回 0.2.15）：
1. 代码：`git checkout baseline/0.2.15 -- .`；
2. 产物：0.2.15 的 dist 已由 0.2.16 构建自动备份为
   `.delivery/rollback-0.2.15-2026-09-18T08-21-12-704Z` 与
   `.delivery/safety-0.2.15-2026-09-18T08-21-12-704Z`，需要时把该目录内容复制回 `dist`
   （**不要删除任何回退目录**）。

## 2. 中断点 ← 接手时先看这里

> 没有就写「无」。这是本文件最有价值的一节。

**无。** 特性 1（高能进度条 + 已看双色 + 控制栏跟随显隐）已实现、已构建交付 **0.2.19**、已提交，工作区干净。

**待用户复测的一件事**：「小窗里点『更多播放设置』，面板跑到网页里」在 0.2.18 上**未能复现**——
实测面板完整渲染在小窗内（阴影根 / 154 字内容 / 尺寸等于小窗内尺寸），网页 `document` 里没有该宿主。
本轮只做了防御性加固（`handleOpenSetting` 增加 `ownerDocument !== document` 判断，
避免 `isDocPIP` 的跨 realm 身份比较失败时静默退回网页）。
若用户在新版本上仍能看到，需要问清：**扩展版本 + 具体点击路径**（小窗控制栏齿轮 → 更多播放设置？
还是网页浮动入口的齿轮？还是字幕菜单里的「字幕设置与视频关联」？），以及当时小窗是增强小窗还是原生小窗。

尚未完成的是**用户实机验收**与**视觉细节**：
- 需要重新加载扩展 + 刷新 B 站页面，确认曲线形态、已看配色与位置符合预期；
- 覆盖层的 `bottom/height`（`PlayerProgressBar.less` 里 `.fc-heatbar`）是按估算给的，
  需要和「控制栏常驻 / 贴底细线」两种状态一起做一次视觉核对；
- `ja/ko/fr/es` 四个语言的文案目前是英文占位，待翻译。

**测试时的坑（供接手者省时间）**：
1. `.start-pip-btn` 由 **mousemove** 惰性创建，自动化测试必须先 `page.mouse.move()` 划过播放器区域。
2. 构建脚本拒绝「同版本重发不同产物」（`Changed artifact needs a new package.json version`），改了源码就要递增版本号。
3. **Less 嵌套要小心**：写在 `.played-progress-bar {}` 里的 `.video-player-v2:not(.active) .fc-heatbar`
   会被编译成 `.video-player-v2 .played-progress-bar .video-player-v2…`，永远匹配不到。
   本轮的热力条显隐 bug 就是这么来的；跨层级的规则要写在对应层级上（或显式用 `&`）。

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

### 2026-09-18 · DeepSeek · 热力条跟随控制栏显隐 + 设置面板落点加固，交付 0.2.19

- **做了什么**：用户报两个问题。
  1. **热力条只在控制栏激活时显示**（与 B 站原生一致）——根因是我上一轮那条规则**嵌错了层级**：写在 `.played-progress-bar` 里，Less 编译成 `.video-player-v2 .played-progress-bar .video-player-v2:not(.active) .fc-heatbar`，要求进度条里再嵌一个播放器根节点，永远匹配不到，所以规则是死的。已移到 `.video-player-v2` 层，并把「拖拽进度 / 菜单打开 / 控件聚焦」这些等价于激活的状态排除掉。
  2. **小窗里打开「更多播放设置」时面板跑到网页里** —— 在 0.2.18 上**未能复现**（实测面板完整渲染在小窗内，网页 document 无该宿主）。本轮只做防御性加固：`handleOpenSetting` 增加 `target.ownerDocument !== document` 判断。原实现只用 `isDocPIP()`，而它是跨 realm 的 window 身份比较，对不上时会静默走 `postMessageToTop` 把面板渲染到网页——正是用户描述的割裂现象。
- **提交**：`94d4055`
- **git 操作**：只 stage 3 个路径，提交前核对无产物混入。未 rebase / amend / reset / 切分支
- **交付**：**0.2.19** 已构建并替换 `dist`；SHA-256 `41e4a52908623d3574a28a1e68483acfb0d247a42931043537006b1c90bd1dac`
- **验证**：真实浏览器实测——控制栏未激活时 `.fc-heatbar` computed `opacity = 0`，手动加回 `.active` 后 `= 1`；设置面板回归仍在小窗内（网页 = false，内容长度 154）；0 控制台错误。`tsc` 92 条 == 基线；改动文件 eslint 通过
- **遗留**：问题 2 未复现，**需用户在新版本上复测**；若仍出现，需要具体版本 + 点击路径（见「2. 中断点」）

### 2026-09-18 · DeepSeek · 已看区间改为优先同步 B 站官方记录，交付 0.2.18

- **做了什么**：用户反馈「热力条有了，但已看着色没和 B 站自带的同步」。原因是上一版只用我们自己采集的 `played`，完全没读 B 站自己的已看记录。
  - 新增 `src/core/HighEnergyBar/officialWatched.ts`：只读 B 站写在**页面源** IndexedDB `pbp3` / `pbpZebraCache` 的已看区间（`{cid, data:[[startRatio,endRatio]], expire}`，比例需 ×duration 换算成秒；`expire`/`expireTime` 都读）。用 `indexedDB.databases()` 先探测、`onupgradeneeded` 里中止升级，**不留下副作用空库**。
  - `controller.ts` 把数据分成两份：`officialRanges`（只读、不写回、不并入我们的存储）与 `ownRanges`（照旧持久化），渲染用两者并集；官方数据需要 duration，切 cid 时可能还没拿到，在 `durationchange` 补读一次。
- **提交**：`d0d16b2`
- **git 操作**：只 stage 3 个路径（`package.json`、`controller.ts`、`officialWatched.ts`），提交前核对无产物混入。未 rebase / amend / reset / 切分支
- **交付**：**0.2.18** 已构建并替换 `dist`；SHA-256 `99147f028cacfc193a6230fa03310807135a329e0655b54401f1f8ec4bd18865`
- **验证**：真实浏览器（加载 dist 的持久化上下文）两阶段隔离测试 ——
  阶段A 不开小窗只看视频：B 站自己写出 `pbp3=[[0,0.1277],[0.6,0.6821]]`，同时扩展自己的已看键为空；
  阶段B 新标签页（全新 video 元素）打开小窗：本会话 `played` 只有 `[[0.2,15.5]]`，但已看路径为 `M 0.00→127.70` 与 `M 600.00→682.10`，与官方比例 ×1000 逐位吻合，中间空档保持灰色，0 控制台错误。
  `tsc` 92 条 == 基线；改动文件 eslint 通过。
- **遗留**：① 待用户实机验收；② 先构建了 0.2.17 并完成上述验证，之后仅一处 prettier 格式化改动，构建脚本按规则拒绝同版本重发，故递增到 0.2.18（两次构建行为等价）；③ 其余遗留同上

### 2026-09-18 · DeepSeek · 实施特性 1「高能进度条 + 已看双色」并交付 0.2.16

- **做了什么**：按 `docs/high-energy-progress-bar-plan.md` 实现特性 1。
  - 新增 `src/utils/highEnergyBar/geometry.ts`（归一化 / 贝塞尔路径 / 区间并集 / 比例换算 / 峰值降采样）
  - 新增 `src/api/bilibili/pbp.ts`（取数，带 `r=loader`，解析顶层 `modules`，区分 `none` 与 `error`）
  - 新增 `src/core/HighEnergyBar/{store,controller}.ts`（展示状态 + `played` 采集 + 按 cid 持久化 + 曲线取数）
  - 新增 `src/components/VideoPlayerV2/bottomPanel/HeatBarOverlay.tsx`
  - 改动：`PlayerProgressBar.tsx/.less`（挂覆盖层 + `.fc-heatbar` 样式）、`web-provider/bilibili/video/index.ts`（绑定 aid/cid）、`shared/storeKey.ts`、`store/config/index.tsx`、7 个语言文件
- **提交**：`6c0dde9`（特性 + 版本号，独立提交）
- **git 操作**：只 stage 本次相关路径，提交前用 `git diff --cached --name-only` 核对无回退产物、无他人文件。未 rebase / amend / reset / 切分支
- **交付**：**0.2.16** 已构建并替换 `dist`；SHA-256 `b370e5c5abde77a48bcb091d9c902b226f1375a2c9d86321711e1f770d79c778`；构建脚本已自动备份 0.2.15 到 `.delivery/rollback-0.2.15-2026-09-18T08-21-12-704Z` 与 `safety-0.2.15-…`
- **验证**：
  - 几何与「独立照官方源码重写的参考实现」逐字符串对拍，**23/23 通过**
  - `tsc` 全仓 92 条 == 基线（改动文件 0 条）；改动文件 eslint 通过
  - **真实浏览器冒烟（加载 `dist` 的持久化上下文）**：曲线取数成功并渲染（clipPath d 长度 3511）、0 控制台错误；跳到 60% 再播后 `played=[[0.2,14.9],[127.8,139.5]]`，watched 路径出现两段且第二段正好从 x=600 开始 —— **跳过区间没有被误记为已看**；重开会话后 watched 路径仍有两段，确认**跨会话持久化生效**
- **遗留**：① 待用户实机验收（视觉与交互）；② `.fc-heatbar` 的 `bottom/height` 是按估算给的，需与控制栏两种状态一起做视觉核对；③ `ja/ko/fr/es` 文案是英文占位待译。回退基线与方法见「1. 当前状态」

### 2026-09-18 · Codex · 确认交接规则与 0.2.15 基线

- **做了什么**：阅读当前状态与中断点，确认以后每轮先读、收工更新，中断时记录任务/进度/下一步/风险；核对源码和 dist 均为 0.2.15。本轮未实施新功能、未修改报告或代码。
- **提交**：无功能提交；接手 HEAD 为 `77dc8dc`，最近交付提交仍为 `94a1bbc`。本条单独提交的 hash 以 `git log -1 -- AGENT_SYNC.md` 为准，避免在文件中自引用提交 hash。
- **git 操作**：只暂存并单独提交 `AGENT_SYNC.md`；不推送，不改写历史，不动回退资料。开工时工作区和暂存区均干净。
- **交付**：无新交付，dist 未更新；仍为 **0.2.15**，独立回读 SHA-256 `74cf68734ecf4bd65988b0f4c802e13633681f7d47d69b277726c4d382814dce`。
- **验证**：版本与产物整体哈希核对一致；文档差异检查。不运行构建或测试，不声称实机验收。
- **遗留**：0.2.15 的小窗尺寸修复待用户实机确认；新功能报告保持审阅阶段，未获得本轮实施指令。后续改变交付内容时从 0.2.15 继续递增版本。

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
