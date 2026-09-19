# LayerPiP 进度交接

我和 Codex 轮流改这个项目，一般不会同时进行。
唯一要防的是：**一方执行到一半中断**（比如额度用完），接手方不知道做到哪、有没有留下半成品。

规则只有一条：**每轮开始前读这里，每轮结束后更新这里。**
写之前重读一次；提交时只 stage 本文件。

---

## 1. 当前状态

- 版本（package.json / dist）：`0.2.22` / `0.2.22`
- dist SHA-256：`c02c60665882de5bdec4c97fc1fbb2eb809e1eeb82a4c7af990d4f079f38d5ff`（构建后独立回读一致）
- 源码基线：`ffc314d`。本轮源码、依赖补丁和说明 **尚未提交**；构建 receipt 的 sourceInputs 记录实际输入指纹，不能把基线 hash 当成 0.2.22 的源码提交。
- 工作区：开工时干净；当前除本文件外的所有改动均来自本轮 Codex，包含新的 `src/core/MultiVideo/`、`src/background/watchedRanges.ts`、`patches/webext-bridge.patch` 和审阅说明。保留它们继续推进，不要回退覆盖。
- Git：本轮仅按明确授权单独提交 AGENT_SYNC.md；没有源代码提交、push、tag 或历史改写。
- 回退基线：`baseline/0.2.15` → `6fd1c42`；用户验收记录仍是 `verified/0.2.19` → `a709be3`。
- 扩展 ID：`jnonlboihmjeahenhlbkjdijicakfnjj`（不变）；存储键与数据库身份未改。
- 交付为仓库根目录 `dist`，没有替用户重载、安装或实机验收。
- 更新人 / 时间：Codex / 2026-09-20。

回退资料全部保留；0.2.20 与 0.2.21 的双副本已独立回读。具体路径、hash 在 progress.md 和 .delivery/receipt-0.2.21-*.json、receipt-0.2.22-*.json。若需回退，先明确目标并保留当前改动；不要使用原记录中的整仓 `git checkout … -- .` 覆盖工作区。

## 2. 中断点 ← 接手时先看这里

**本轮审阅修复和双画面首版已完成交付；整体多画面特性仍未全部做完。** 源码未提交，不是干净工作区。下一位先读 `docs/code-review-and-multi-video-2026-09-20.md`，再看当前 diff；旧实施报告原文保留。

已完成：
- 高能曲线开关即时响应；采集器关闭/重开、同 cid 换源、路由先于媒体、异步迟到隔离；后台串行合并观看记录，保留原存储结构。
- 非法接口响应区分 error/none，err_id=3 支持 debug JSON 字符串，播放中退避重试，限制曲线数组分配；官方 IDB 迟到连接清理。
- 四语文案；菜单可用高度扣除播放器 top；BFCache 断连补丁已接入。**纠正旧记录：rc-util 补丁原本就在 pnpm-workspace.yaml / lock 中生效，不是 patches 整体未接入。**
- 双画面入口、保留主路、受限子帧、独奏/控制中标记、扩展全局命令路由、窄窗上下排列、退出恢复、加载失败释放。主页面切视频会退出多画面。

下一步与未完成：
1. 四路、拖动分隔、布局记忆尚未实现；不要展示空入口。
2. 子路目前用 B 站原生字幕/弹幕/控制栏；插件字幕与 AI 未整合；系统媒体会话仍属主路。
3. 真实 Edge / B 站的双路播放、裁剪、自动播放和长时间稳定性尚未验收。用户要求统一验收，勿以隔离夹具冒充站点实测，也尽量不使用 Computer use。
4. 原“齿轮 → 快捷键为空”在 DeepSeek 0.2.20 未复现，本轮未凭猜测改它；若再报需明确入口/版本。
5. 源码提交需要相应授权后按明确路径分组暂存；本轮仅已授权单独提交交接文件。不能误说 0.2.22 源码已提交。

验证边界：生产构建及产物/回退 hash 回读通过；92 项既有 TypeScript 错误无新增；定向 lint、规定键盘回归和两个本地隔离夹具通过。未操作生产观看记录，未重载用户扩展。继续改动交付必须递增版本，下一版至少 0.2.23。

---

## 3. 变更记录（新的在上）

### 2026-09-20 · Codex · 审阅修复与双画面首版，交付 0.2.22

- 做了什么：修复高能条响应式/生命周期/异步身份/并发写入及异常数据问题，补齐四语文案、BFCache 断连处理；实现保留主路的双画面首版。详细范围见新审阅说明。
- 提交：源代码未提交，基于 `ffc314d`；本条所在交接提交请以 `git log -1 -- AGENT_SYNC.md` 查询，避免自引用 hash。
- git 操作：仅明确暂存 AGENT_SYNC.md 并单独 commit；未宽泛暂存、未 push/tag、未改写历史。
- 交付：0.2.22 已更新固定 dist；SHA-256 `c02c60665882de5bdec4c97fc1fbb2eb809e1eeb82a4c7af990d4f079f38d5ff`，独立回读一致；0.2.21、0.2.20 双回退副本均保留且回读一致。
- 验证：定向 lint、键盘回归、采集器与双画面隔离检查通过；类型检查 92 项旧错误无新增；构建与身份验证通过。未安装/重载/实机验收。
- 遗留：源码与新文档保留为本轮未提交改动；多画面后续阶段、真实站点与用户验收见第 2 节，不能写成整个特性全部完成。


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

### 2026-09-18 · DeepSeek · 弹层随内容重排 + 去掉重复的「历史字幕」，交付 0.2.20

- **做了什么**：用户报三个问题。
  1. **弹幕菜单展开「高级设置」后新增内容看不见、收起时位置不回收** —— 根因是 rc-trigger 不会因弹层内容尺寸变化而重新对齐；另外可用高度写死为 `player.clientHeight - 60`，小窗里浪费空间。修复：`Dropdown` 增加对弹层自身的 ResizeObserver，尺寸变化时调用 `trigger.forceAlign()` 并重算可用高度（用「值没变就不重设」避免自激循环）；可用高度改为按触发按钮上边缘到播放器顶部的真实距离；弹幕「高级设置」展开后 `scrollIntoView` 把新内容滚入可视区。
  2. **齿轮选单里的「历史字幕」与控制栏 `SubtitleHistoryButton` 重复** —— 删除选单里的开关，保留控制栏按钮作为唯一入口。顺带修了同文件既有的 import/order lint 报错。
  3. **齿轮选单 → 快捷键 点进去什么都没有** —— **未能复现**：实测弹窗正常渲染且内容完整（21 行 / 298 字），设置面板「快捷键」标签页也有 9 条 + 说明。已列为待用户刷新后复测。
- **提交**：`4a2f80f`
- **git 操作**：只 stage 4 个路径。未 rebase / amend / reset / 切分支
- **交付**：**0.2.20** 已构建并替换 `dist`；SHA-256 `bfd6f3ab3d9df7967a9962119dbaeac2c24e9307ef5ead5174aaf29ab1747d3d`
- **验证**：480×320 小窗实测——可用高度 260→272px；展开后 popTop 47→4、菜单滚动 7px、新增输入框在可视区内 = true；收起后 popTop 回 47、滚动归零；齿轮选单文本已无「历史字幕」；0 控制台错误。`tsc` 92 条 == 基线；改动文件 eslint 通过
- **遗留**：问题 3 待用户复测

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
