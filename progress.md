# Progress Log

## 2026-09-18 特性 1：高能进度条 + 「已看」双色着色，交付 0.2.16

按 `docs/high-energy-progress-bar-plan.md` 实施。提交 `6c0dde9`；固定 `dist` 已构建并替换为 **0.2.16**（SHA-256 `b370e5c5abde77a48bcb091d9c902b226f1375a2c9d86321711e1f770d79c778`）。**未安装、未重新加载**；0.2.15 的 dist 已由构建脚本自动备份为 `.delivery/rollback-0.2.15-2026-09-18T08-21-12-704Z` 与 `safety-0.2.15-…`。

### 实现内容

- **F1 已看双色（所有视频生效）**：`src/core/HighEnergyBar/controller.ts` 用 `HTMLMediaElement.played` 采集——它的语义就是「该资源实际播放过的区间」，跳过/拖动经过的区间不会被标记。这同时避开了早期伪代码的两个坑（比例与秒混用、`seeking` 时把目的时间当段尾）。`played` 换源会重置且不持久化，因此每次 `timeupdate` 读一遍并入内存、换 cid 时才落盘，并用 `emptied`/`loadstart` 挂起采集，避免新媒体源的区间被算进旧 cid。
- **F2 官方曲线（仅有数据时）**：`src/api/bilibili/pbp.ts` 取 `bvc.bilivideo.com/pbp/data`，带 `r=loader`、`credentials: 'omit'`，解析**顶层 `modules`**（官方读 `res.data.modules` 是它自家 HTTP 客户端包的层，直连 fetch 照抄会把有数据的视频误判成无曲线）。「正常无数据」与「412/网络/非法响应」分成两种状态，只有前者可负缓存。
- **渲染**：`HeatBarOverlay.tsx` 挂在 `.played-progress-bar` 内，因此自动出现在增强小窗；`pointer-events: none` 不改变 seek 命中区；主轨道保持原样不动。有曲线时画弹幕密度面积（未看白 20%、已看主题色裁剪），没有曲线时退化成底部纯色带，保证「无论有没有原生热力条都生效」。
- **持久化**：按 cid 分键存 `chrome.storage.local`（读-并-写做并集，避免并发覆盖），带 cid 上限淘汰（200）。纯函数在 `src/utils/highEnergyBar/geometry.ts`，公式逐项照抄官方。
- 配置只加两个概念：`highEnergyBar_show` / `highEnergyBar_curve`；文案补进 7 个语言（zh_CN/zh_TW/en 已翻译，ja/ko/fr/es 英文占位待译）。

### 验证

| 项 | 结果 |
| --- | --- |
| 几何对拍（与独立照官方源码重写的参考实现对拍） | **23/23 通过** |
| `tsc` 全仓 | 92 条 == 基线；本次改动文件 0 条 |
| eslint（改动文件） | 通过 |
| 真实浏览器冒烟（加载 `dist` 的持久化上下文） | 曲线取数并渲染成功（clipPath `d` 长度 3511）、**0 控制台错误** |
| 跳过区间不被误记 | 跳到 60% 再播后 `played=[[0.2,14.9],[127.8,139.5]]`，watched 路径两段且第二段正好从 x=600 开始 ✅ |
| 跨会话持久化 | 重开会话后 watched 路径仍有两段 ✅ |

### 遗留

1. **待用户实机验收**：重新加载扩展 + 刷新 B 站页面，确认曲线形态、已看配色与位置。
2. `.fc-heatbar` 的 `bottom/height` 是按估算给的，需与控制栏「常驻 / 贴底细线」两种状态一起做视觉核对。
3. `ja/ko/fr/es` 文案为英文占位，待翻译。
4. 回退基线：标签 `baseline/0.2.15`（→ `6fd1c42`），回退方法见 `AGENT_SYNC.md` 第 1 节。

## 2026-09-18 修复小窗默认尺寸极小 + 建立并发 Git 规范

用户报告「每次打开小窗，默认尺寸都非常小」。已完成根因定位、修复、Git 整理，并构建交付 **0.2.15**。**未安装、未重新加载、未提交 `dist`**。

### 根因

初始尺寸取自 `storage.sync` 的 `LAYERPIP_WINDOW_CONFIG_V1`，而它可能被写成「快速隐藏」的 240×52：

1. `quickHideToggle` 把窗口缩到 240×52；
2. `pagehide` 保存窗口几何时只有 `isQuickHiding` 一道闸门，但 `WebProvider.onUnload()` 会先把 `isQuickHiding` 置回 `false`（`WebProvider.ts:161`）。源页面卸载/导航时正是这个先后顺序，于是 240×52 被当成「上次窗口大小」存下；
3. 该键没有任何重置入口，一旦写坏，之后每次打开都是 240×52。

实测补充：Document PiP 窗口内的 `resizeTo` 需要瞬时激活，直接抛
`NotAllowedError: resizeTo() requires user activation in document picture-in-picture`；
而快速隐藏的「恢复」正是用它，异常会让后续恢复逻辑整段跳过。另实测 `requestWindow({width,height})` 的尺寸提示会被 Chrome 完全忽略，真正生效的是后台 `chrome.windows.update`。

### 修复（commit `3a1be1d`）

- 新增 `isUsableDocPIPSize()` 与 `DOC_PIP_MIN_USABLE_SIZE`（320×180）、`DOC_PIP_QUICK_HIDE_SIZE`（240×52，单一来源）；
- **保存前**校验，低于阈值不写入；**读取时**同样校验，坏值忽略并回退到视频尺寸 → 已写坏的历史值可自愈，无需用户清空扩展存储；
- DPR 修正只在采用已保存尺寸时套用，避免回退时再缩一次；
- 快速隐藏的恢复改走后台 `chrome.windows.update`（与隐藏路径对称）并加 `try/catch` 保证状态复位。

验证：改动文件 `tsc` 无新增诊断（全仓仍为既有 92 条错误）；改动文件 eslint 通过（`WebProvider.ts` 中其余 lint 报错为改动前既有）。

### Git 整理（本轮新增）

工作区此前有 **122 个未提交改动**（对应已交付的 0.2.12–0.2.14）与 48 个未跟踪文件，其中一个 `git checkout .` 即可全部丢失。已处理：

- `288ae6f` 忽略 `dist N/` 备份产物（各约 93MB）与 `test-results/`；
- `cc93159` 把既有改动固化为检查点（128 个文件，原样快照，不含功能变更）；
- `3a1be1d` 本次修复（3 个文件）；
- 标签 `checkpoint/0.2.14`、`fix/docpip-default-size`；非破坏性快照 ref `checkpoint/wip-20260918-152142`（改动前状态，保留作兜底）；
- 工作区从 122 个未提交文件变为 **0**；
- 在 `AGENTS.md` 新增「Git rules for concurrent agents」，约定与 Codex 并发修改时的规则（禁止宽泛暂存、禁止改写共享历史、禁止切换分支、大改动前先做非破坏性快照）。

未提交时**未**包含 `dist` 回退产物、`.delivery/`、`test-results/`；这些文件仍在磁盘上，未被删除。

### 交付 0.2.15

`node scripts/build-local.mjs` 通过（ESM + IIFE + AI worker/模型资源），固定 `dist` 已独立回读：

- 版本 **0.2.15**，扩展 ID `jnonlboihmjeahenhlbkjdijicakfnjj` 不变（manifest 仍带 `key`）；
- 整体 SHA-256 `74cf68734ecf4bd65988b0f4c802e13633681f7d47d69b277726c4d382814dce`；
- 收据 `.delivery/receipt-0.2.15-2026-09-18T07-28-00-692Z.json`；
- 产物核对：三条新增日志文案（读取忽略、保存跳过、恢复失败）均存在于 `dist/*.js`；`dist/main.js` 中已无 `resizeTo` 调用。

顺带修复 `scripts/build-local.mjs`（commit `e861133`）：其 `excluded` 为硬编码列表（只含 `dist 2/3`），新增的 `dist 4/5`（各约 93MB）会被当作源码参与指纹并整份复制进构建暂存目录；已改为按 `/^dist \d+$/` 模式排除。

待用户实机验收：重新加载扩展并刷新 B 站页面后，关闭小窗再打开应为上次的正常尺寸；使用过「快速隐藏」后再打开也不应变小。若此前已写坏 `LAYERPIP_WINDOW_CONFIG_V1`，本次无需手动清理——读取时会自动忽略坏值并回退到视频尺寸。

## 2026-09-17 回应独立审阅并修正两份实施文档（未实施）

用户在 `docs/new-feature-report-review-2026-09-17.md` 提供了 Codex 对两份实施文档的独立审阅。逐条核对后：**Codex 指出的硬缺陷全部成立**，我没有任何一条能反驳；分歧只在产品语义与 P0 边界。

新增 `docs/review-response-2026-09-17.md` 记录逐条回应、补充实验与保留意见。本轮补做的实证：

- **`HTMLMediaElement.played` 是正确原语**（Codex 提议）：实测播放 0→7s、seek 120s、播放、seek 190s，跳过的区间**不会**进入 `played`，区间正确求并集；B 站 MSE 播放路径下正常。
- **`played` 在换源时会被重置**（Codex 未提到的关键边界）：同 src 重赋 + `load()` 后原区间丢失 → 必须设计快照时机表（周期/暂停/**换 P 之前**/关闭前）。
- **`sessionStorage` 跨同源 iframe 与顶层页面共享**：实测 iframe A 写入后 iframe B 与父页都能读到 → 我原来的 pane 标识兜底方案作废。另实测 `window.name` 能跨同源导航保留，但**子页面可覆盖**（父页 `f.name` 与 `contentWindow.name` 不一致）。
- **两路可以同时出声**：默认自动播放策略下，各 pane 内有真实点击后解除两路静音，两路 `paused=false, muted=false` 并播 → 我原文「过不了自动播放策略」是过度绝对化，应改为产品选择。
- **接口现行状态**：我这边复测仍为 200（`topKeys=["modules"]`，95 点），未复现 Codex 的 412 → 412 属环境性风控，**可用性不能作为保证**。
- 源码核对：`src/contents/main.ts` 主逻辑受 `isTop` 门控（子 frame 仅响应 `detectVideo_req`），`floatButton` 为顶层导入副作用；`PlayerProgressBar.less` 已改为 `top:-12px / height:20px / --progress-scale 1→1.5 / 轨道 4px / --progress-color #00a1d6`；`subtitleAssets.ts` 库版本 1、单 store、`request.onsuccess` 即 resolve。

已按结论修正两份实施文档（勘误：`parse()` 解包、已看采集改为 `played`、`last_play_time` 移出区间来源、进度条几何按 0.2.14 重写、新增观看记录持久化约束；多画面：pane 标识改为宿主映射+握手、音频改为产品选择、非激活 pane 不再默认暂停、`all_frames` 乐观结论纠正、嵌入式播放器注入纠正、跨标签 DOM 表述收窄、补充窗口会话所有权四条路径）。`docs/README.md` 已把审阅回应列为实施者必读。

本轮仅新增 1 份文档并修改 3 份文档；源码、依赖、版本、固定 `dist` 均未改动，未构建、未安装、未重新加载、未提交或推送。

## 2026-09-16 两份调研改写为「开发实施文档」（未实施）

按用户要求把调研产出改成面向开发者的形态：**能跑通的通路与坑写足，跑不通的只保留结论与原因**。用户明确该文档可能交给其他人开发。

- `docs/multi-video-single-window-plan.md` 重写为实施文档：新增最小复现代码、数据模型与创建流程、pane 模式（含 `iframe.name` 标识与 sessionStorage 兜底）、音频独奏规则、焦点与键盘归属、资源降载、12 条「症状→原因→处理」坑表、P0–P3 分期与两端验收清单；把「不建议走的通路」压成第 6 节并保留原因（自行拉流的 Referer 403、嵌入式播放器、跨标签页搬 DOM、多小窗）。
- `docs/high-energy-progress-bar-plan.md` 重写为实施文档：新增可直接复制的接口请求、官方 `parse()` 判定代码、归一化与贝塞尔路径的精确公式与 TS 代码、SVG 结构与容器 CSS 原文、模块划分与代次守卫、14 条坑表、分期与验收；旧结论「接口 404」压成第 9 节，只留原因（缺 `r=loader`）。
- `docs/multi-window-feasibility-plan.md` 压缩为背景资料（327 → 108 行）：保留单槽位结论、规范与实现原因、实测矩阵、对现有代码的影响（含 `closePIP` 竞态缺陷），开发方向指向多视频文档。
- `docs/README.md` 索引改为「开发实施文档 / 背景资料」两层。

本轮仅修改 4 份文档；源码、依赖、版本、固定 `dist` 均未改动，未构建、未安装、未重新加载、未提交或推送。文档结论仍区分「实测确认 / 源码事实 / 未验证」；未在真实 macOS Edge 验收。

## 2026-09-16 单窗口多视频：续作调研与已验证方案（未实施）

用户澄清目标为「多个视频在同一个（增强）小窗里同时播放」，并追问「要开多个小窗的话增强小窗是否也不行」。答复：多小窗确实不行（进程级单槽位）；多视频同窗**可行且已实测跑通**。

本轮新增实测：在一个 Document PiP 窗口内创建两个指向真实 B 站视频页的 iframe，两路视频同时播放，6 秒后时间轴分别推进到 16.70 / 16.62（`paused=false`、`readyState=4`），窗口内 iframe=2。同时确认：PiP 窗口与 `www.bilibili.com` iframe 同源可访问（可直接控制 `video`）；项目 manifest 三个主入口本就是 `all_frames: true`，pane 天然被注入；B 站视频页与嵌入式播放器均无 `X-Frame-Options`/`frame-ancestors` 限制。

同时定位到决定性的技术陷阱：**Document PiP 窗口发出的媒体请求不带 Referer**（本地双服务器记录：主页面 `Referer=http://127.0.0.1:8899/`，PiP 窗口 `Referer=None`），而 B 站 CDN 强制校验 Referer（带 `*.bilibili.com` → 206，不带或错误 → 403）。因此「扩展自己拉流在小窗里播」会被卡住，**iframe 分屏**才是可行路线。另测得默认自动播放策略下两路静音可并播，解除静音则两路都被暂停（需按 pane 的用户激活）。

方案与分期见 `docs/multi-video-single-window-plan.md`，并已在 `docs/README.md` 建索引；已在 `docs/multi-window-feasibility-plan.md` 第 0 节交叉引用并更新推荐路径。

本轮仅新增 1 份文档，并修改 `docs/README.md`、`docs/multi-window-feasibility-plan.md` 两处文档；源码、依赖、版本、固定 `dist` 均未改动，未构建、未安装、未重新加载、未提交或推送。未在真实 macOS Edge 验证，也未验证本项目内容脚本在 pane 内的实际运行效果。

## 2026-09-16 同时开多个小窗：调研与方案（未实施）

用户要求调研「是否有办法支持同时开多个小窗」。结论：**同一浏览器进程内不可行**，这是平台硬限制而非本项目缺陷。用 Playwright 驱动**真实（headed）Chromium** 做对照实测：切换标签页不会关闭小窗（排除干扰因素），但同进程内第二个标签页开小窗会让第一个被浏览器强制关闭；增强小窗与原生（视频）小窗争抢同一个槽位并互相顶掉；同一进程的两个 context 仍只有一个；仅**两个独立浏览器实例**能各自开一个小窗并同时存活。另实测 Document PiP 窗口可容纳多个 video 与 iframe（多画面方案的前提）。

顺带确认一个既有缺陷：`src/background/docPIP.ts` 的 `closePIP` 无条件 `setDocPIPTabId(null)`，跨标签页开窗时可能清掉后开窗者的 tabId，导致移动/缩放退化为按宽度猜测。本轮未修，建议单开一轮。

方案与分期见 `docs/multi-window-feasibility-plan.md`，并已在 `docs/README.md` 建索引。方案排序为：单窗口多画面（推荐）> 多浏览器实例 > 非置顶多窗口。**方法学提醒已写入文档：涉及 PiP 并发/生命周期的验证只能用 headed 真实浏览器，无头 Chromium 会给出相反结论（本轮已实测到该陷阱）。**

本轮仅新增 1 份文档并修改 `docs/README.md` 索引；源码、依赖、版本、固定 `dist` 均未改动，未构建、未安装、未重新加载、未提交或推送。未在真实 macOS Edge 上验证。

## 2026-09-16 高能进度条与已看双色着色：调研与方案（未实施）

用户要求：增强小窗中实现「已看内容蓝色、未看灰色」，对有无原生热力条的视频都生效，且本来有热力条的视频一并显示热力条；本轮只出报告与方案，禁止改代码。

已完成上游实测取证（匿名 Chromium + 直连接口）：旧笔记记录的 404 是缺 `r=loader` 参数所致；接口 `bvc.bilivideo.com/pbp/data` 当前有效，`access-control-allow-origin: *` 且 `withCredentials:false`。无数据视频仍返回 200，但 `step_sec=0`、`events.default` 为空、`debug` 为 `err_id:3 not enough dm`。已逐行确认官方曲线算法（`calcPoints` / `generateBezierCurvePath`）、已看区间采集与并集算法、IndexedDB `pbp3` / `pbpZebraCache`（按 cid、`expire` 30 天）、SVG 结构与配色（白 0.2 曲线 + `var(--bpx-primary-color,#00a1d6)` 已看裁剪叠加）、容器 CSS `.bpx-player-pbp` 与设置项 `highlightProgressBar`/`pbpstate`。方案与分期见 `docs/high-energy-progress-bar-plan.md`，并已在 `docs/README.md` 建索引；该文取代 `player-ui-and-ai-continuity-plan.md` 第 3 节的旧结论。

本轮仅新增 1 份文档并修改 `docs/README.md` 索引；源码、依赖、版本、固定 `dist` 均未改动，未构建、未安装、未重新加载、未提交或推送。文档内所有结论区分「实测确认 / 推断 / 未验证」，未在登录态与真实 Document PiP 中验收。

## 2026-09-16 进度条对照候选 0.2.14 已交付

按用户蓝色进度条截图及 B 站公开播放器资源修正颜色、轨道层次、悬停放大、默认电视形滑块缩放与预览。移除无效 CSS 覆盖及两套厚度规则；读取真实媒体缓冲区间；播放进度按帧更新；拖动直接跳转且保留暂停状态；预览使用轨道坐标、边界限制、异步过期结果保护。范围与来源见 docs/bilibili-ui-refactor-plan.md 第 12 节。高能曲线、个性化 Lottie 未增加。

最终类型诊断与 0.2.13 基线完全一致，无新增诊断，全仓既有类型错误仍存在；生产构建与 diff 检查通过。未新增单元测试、未使用 Computer use，未改快捷键配置、焦点归还或输入窗口所有权。

固定 dist **0.2.14**，ID jnonlboihmjeahenhlbkjdijicakfnjj，整体 SHA-256 13e4f0c0823200a6e22b319e29f7ebaf33443f0c4b52c89dc4d02e8d3072257e。收据 .delivery/receipt-0.2.14-2026-09-16T09-18-58-378Z.json；独立回读 .delivery/progress-ui-readback-0.2.14.json。保留 0.2.13 两份备份 .delivery/rollback-0.2.13-2026-09-16T09-18-58-378Z 和 .delivery/safety-0.2.13-2026-09-16T09-18-58-378Z，回读均为 4c110cc51eae0a2cfc09af46366edc60259d4976c64e626ad07ace24cbc1c9bb。未安装、重新加载、提交或推送；实际颜色、动画手感和拖动行为待用户重新加载及刷新视频页后验收。


## 2026-09-16 参数即时响应修复 0.2.13 已交付

针对用户“拖动弹幕设置无即时反馈，切换弹幕后才生效”的报告，补齐 DanmakuFields 子组件的 MobX 订阅，覆盖小窗菜单及完整设置页；修复快捷菜单回调中历史字幕/滚轮音量开关脱离订阅的问题。HTML 弹幕引擎增加几何参数变化后的当前时间重排，支持暂停时刷新、拖动按帧合并和卸载取消；重复初始化保留图片源文本及重置测量。详细原因与同类审查边界见 docs/bilibili-ui-refactor-plan.md 第 11 节。

验证：最终 TypeScript 诊断与 0.2.12 基线完全一致，无新增诊断（全仓既有错误仍未清零）；生产构建通过，diff 检查通过。未新增单元测试、未使用 Computer use。本轮未改键盘配置、焦点或输入窗口所有权，不重复既有键盘回归。

固定 dist **0.2.13**，ID jnonlboihmjeahenhlbkjdijicakfnjj，整体 SHA-256 4c110cc51eae0a2cfc09af46366edc60259d4976c64e626ad07ace24cbc1c9bb。收据 .delivery/receipt-0.2.13-2026-09-16T09-07-05-992Z.json；独立回读 .delivery/ui-readback-0.2.13.json；两份 0.2.12 备份 .delivery/rollback-0.2.12-2026-09-16T09-07-05-992Z 与 .delivery/safety-0.2.12-2026-09-16T09-07-05-992Z 已回读，均为原哈希 0e169b0d1fbdd2962268ee58067817599b67ad673229355e8c0e39dde9183137。

未安装、重新加载、提交或推送。待用户重新加载并刷新视频页，确认弹幕四个参数在菜单保持打开时即时反馈、暂停时画面刷新，以及快捷设置开关的反馈。不宣称全部 UI/1:1 目标已经验收。


## 2026-09-16 故障修复候选 0.2.12 已交付，待用户实机复核

0.2.11 已被用户退回；此前实施记录不代表验收通过。根因与证据以 `docs/bilibili-ui-refactor-plan.md` 第 10 节为准：跨窗口 Element 判断令菜单停留屏幕外；全局菜单状态隐藏提示；Edge 重复创建上下文菜单；弹幕加载存在先于引擎初始化而直接退出的竞态。对应源码已修正，音量按原生取样调整面板与静音反馈，弹幕恢复点击开关、悬停参数。

本轮未继续 Computer use、未新增单元测试、未更改键盘配置/焦点或输入窗口所有权。TypeScript 诊断与 0.2.11 基线逐字一致，没有新增诊断；既有依赖和旧代码诊断仍使全仓 tsc 返回非零。生产构建通过；交付版本、ID、整体哈希和两份回退副本已独立回读。未安装、重新加载、提交或推送。

固定 `dist` 为 **0.2.12**，扩展 ID `jnonlboihmjeahenhlbkjdijicakfnjj` 不变，SHA-256 `0e169b0d1fbdd2962268ee58067817599b67ad673229355e8c0e39dde9183137`。收据 `.delivery/receipt-0.2.12-2026-09-16T07-05-27-839Z.json`；独立回读 `.delivery/ui-readback-0.2.12.json`。0.2.11 两份保留副本为 `.delivery/rollback-0.2.11-2026-09-16T07-05-27-839Z` 与 `.delivery/safety-0.2.11-2026-09-16T07-05-27-839Z`，哈希均为 `d578c09e79471d905722c9de4532987440b4c1a812ff4850f173963ee62024af`；更早的 0.2.10 备份仍保留。

待复核：用户在 Edge 重新加载 0.2.12、刷新视频页并重新打开小窗后，确认菜单可见/可操作、弹幕重新加载、悬停反馈及新产生的错误。BFCache 端口关闭警告未确认因果且未修复；弹幕历史丢失不能断言仅有竞态一个原因；静音动画尚非原生 Lottie 逐帧一致。整体 1:1 目标仍待完成和验收，不能把本候选标记为全部修复。


## 2026-09-15 UI 重构候选 0.2.11 已交付

共享参数控件、播放器左右分组、倍速（含 0.75x）、竖向音量、字幕与弹幕菜单、两级设置和 popup 视觉已接入。菜单互斥，所属文档挂载，支持 Esc、外部点击、窗口失焦关闭及焦点归还；菜单展开保持控制栏可见。窄窗次要功能通过设置菜单访问。字幕导入与关联保留原保存路径，AI 常态收为一行，详情单独展开，未修改状态机。弹幕速度去掉错误的秒单位，不透明度显示百分比，持久化格式不变。锐化被现有核心配置强制关闭，本次不提供无效选项。

按用户要求统一交付后由用户验收，没有新增单元测试。既有 keyboard-regression 通过，涵盖输入保护、按钮焦点、重复窗口绑定与失焦释放；本次涉及的组件/设置文件没有 TypeScript 诊断，全仓依赖和旧代码仍有既有诊断，不声明全仓类型检查通过。生产构建及交付回读通过。

固定 dist 为 **0.2.11**，ID `jnonlboihmjeahenhlbkjdijicakfnjj`，SHA-256 `d578c09e79471d905722c9de4532987440b4c1a812ff4850f173963ee62024af`。收据 `.delivery/receipt-0.2.11-2026-09-15T03-31-45-816Z.json`，独立回读 `.delivery/ui-readback-0.2.11.json`。两份 0.2.10 回退目录 `rollback-0.2.10-2026-09-15T03-31-45-816Z` 与 `safety-0.2.10-2026-09-15T03-31-45-816Z` 均存在，哈希均为原交付 `5c94fdbd0661b36886ffb3ca026f090a047bc36a4bf6ca151161ca478b7646a0`。

修改前基线为 `.delivery/ui-baseline-20260914-160050/`。保留既有工作，未提交、推送、安装或重新加载扩展。视觉以 9 月 14 日实际观察为基础，未补齐全部原生字幕样本、独立交互稿或逐像素截图对比；不声明像素级一致或已验收。用户重新加载扩展并刷新视频页后统一验收。

## 2026-09-14 B 站 UI 重构规划（未实施）

完成主要 UI 源码梳理及 B 站实际底栏、倍速、弹幕、两级设置观察；新增 `docs/bilibili-ui-refactor-plan.md`，明确功能去向、参数语义、参考缺口、先对照稿后接线的阶段出口与验收规则。同步索引和待办。原生字幕菜单、音量与完整交互/尺寸仍需补齐，未声称取样或 1:1 复刻完成。

本轮仅文档变更及差异/链接检查；源码、版本、dist 未改，未构建、安装、重新加载、提交或推送。交付记录仍为 0.2.10。

## 2026-09-14 设计待办更新（未实现）

新增 `docs/player-ui-and-ai-continuity-plan.md`，记录 B 站按钮与面板复刻、精简字幕菜单、AI 开启意图持久于会话且自动恢复的状态机，以及高能进度条可行性和数据验证前置任务。同步文档入口、待办与旧 AI 设计的替代说明。

只读核查官方播放器脚本进度状态；两个旧热力图接口在本次 CID 样本上返回 404，未取得真实曲线，不能宣称数据接入完成。文档变更检查，不运行测试或构建；源码、依赖、版本和固定 `dist` 均未在本轮更改，交付仍为 0.2.10。下方手动重启描述是旧版实现事实，已被新的目标设计取代。


## 2026-09-12 已交付 0.2.10

固定 `dist` 已构建并独立回读为 **0.2.10**，扩展 ID `jnonlboihmjeahenhlbkjdijicakfnjj` 未变。整体 SHA-256：`5c94fdbd0661b36886ffb3ca026f090a047bc36a4bf6ca151161ca478b7646a0`。收据 `.delivery/receipt-0.2.10-2026-09-12T08-48-07-347Z.json`，独立回读 `.delivery/readback-0.2.10.json`。源码仍在 `feature/layerpip-dual-mode`，基于 `e00d7ba53c329ce8567b6487adfd095cd815c5d7` 的已知未提交修改，未提交或推送。

- Luna / max 完成键盘与预取实现，主 agent 审核并退回具体问题后完成修正。键盘回归通过；AI 预取 8 项定向回归通过，涵盖 Range、等待、取消、SPA 网址和队列错误。相关文件类型检查无新增诊断；全仓仍有既有 legacy 类型错误，不宣称全仓 tsc 通过。
- 主 agent 复核真实音频 PCM：96–103.0118125 秒，112189 个有限样本，errors/external 均为空。ESM、IIFE、AI Worker 生产构建通过；模型清单 SHA 验证通过，交付的 ai-frame/ai-worker 与已通过真实模型测试的 0.2.9 字节一致，MP4Box 许可已随包保留。
- 原主回退目录在事后回读时缺失；根目录 `dist 3` 与安全复制备份 `.delivery/safety-0.2.9-2026-09-12T08-48-07-347Z` 均为完整原 0.2.9，SHA 同为 `fddc1a29e1551d544b4c4c2e01931d8421a43ba2412c6086ceeecb47c6d43a94`。独立安全备份可回退。目录变化原因未确认，没有移动、删除或猜测修复 `dist 3`。后续源码快照排除该保留产物；加载目标始终为 `dist`。
- 未替用户安装、重新加载或清除错误记录。用户需重新加载扩展，并刷新 B 站网页以替换旧注入脚本，再打开小窗验收。当前 AI 仅支持 1 倍速，跳转后手动重新开始；不保证所有设备实时，字幕历史保留。

下方记录是本次交付前的审查过程。

## 2026-09-12 键盘与提前字幕候选（审核中，未交付）

两位 Luna / max 子 agent 在上一轮因额度中断，今天已重新唤起继续。键盘候选涉及 KeyBinding、快捷键配置防御、VideoPlayerV2 焦点与 DocPiP 移动后的输入窗口刷新，以及 `scripts/keyboard-regression.mjs`；音频候选涉及 `BilibiliAudioSource.ts`、controller 和 AI 控制入口。主 agent 负责审核、依赖、隔离冒烟与最终固定目录交付。正式 dist 仍为 0.2.9，未重新加载用户扩展。

键盘部分已完成 Luna 实现与主 agent 审核：回归覆盖配置异常、控件保护、指针点击归还焦点、窗口重绑定、blur/reset 释放和失焦后单击不复用长按计数。Luna 运行 `node scripts/keyboard-regression.mjs` 通过；主 agent 核对生产处理函数和 DocPiP 实际刷新调用，不将 iframe 模拟当成真实 Document PiP 验收。AGENTS.md 已记录以后相关修改的交付前检查。

主 agent 前置实测：公开普通 B 站视频音轨支持 AAC-LC、SIDX 与 206 Range；CORS 允许读取但未暴露 Content-Range。96–104 秒音频经 MP4Box 解封装得到 375 个样本，WebCodecs 解码后，本地 Whisper Base 推理约 2.4 秒得到可读英文，无外部识别请求。此为原理验证；实际 BilibiliAudioSource 模块隔离冒烟也生成 96–103.0118125 秒、112189 个有限 PCM 样本，音频非静音。证据在本地忽略的 `.delivery/prefetch-smoke/`，不代表最终控制器接入已验收。

审查曾发现并退回：提前量等待条件重复扣减造成忙循环；AAC 小帧被最小块门限误丢；停止后晚创建解码器、等待监听累积；实时队列 Promise 未处理；键盘测试手动补焦点掩盖真实点击问题。最终复核与新版本交付待完成。已安装固定 mp4box 2.4.1，package/lock 原文件备份在 `.delivery/prefetch-dependency-backup/`，增量只增加该依赖，BSD-3-Clause 许可随包保留。

## 2026-09-11 本地 AI 字幕最小实现

最终交付：**0.2.9**，固定目录 `dist`，扩展 ID `jnonlboihmjeahenhlbkjdijicakfnjj` 未变。整体 SHA-256：`fddc1a29e1551d544b4c4c2e01931d8421a43ba2412c6086ceeecb47c6d43a94`。收据：`.delivery/receipt-0.2.9-2026-09-11T03-58-27-883Z.json`。ESM/IIFE 和独立 AI Worker 构建通过，模型 SHA-256 与清单一致，交付的 frame/worker 字节与真实冒烟使用的文件完全相同。已核对 0.2.8 的 `rollback-0.2.8-2026-09-11T03-58-27-883Z` 及 `safety-0.2.8-2026-09-11T03-58-27-883Z` 两份副本，哈希均为 `d3fd2c29d283049975653b7e5295d0527860879e09e045c0783cb601dd569a45`。未替用户安装或重新加载扩展。

架构见 docs/local-ai-subtitles.md。按用户要求创建了 gpt-5.6-luna / max 子 agent，但其因额度限制未产出代码；依据用户允许调整策略的授权，由主 agent 接手完成实现和审核，不声称独立双 agent 审查。

- 已接入随包多语言 Whisper Base q8，固定资源约 81.3 MB，WASM 约 11.1 MB。默认关闭，手动启用；识别引擎独立于页面，保留 ModelStore / TranscriptionEngine 接口。
- 真音频浏览器冒烟：8 秒样本直接推理约 2.4 秒；实际 captureStream → iframe → Worker → SubtitleManager 生成字幕及历史快照。禁用和启动取消后 iframe 清零，视频未暂停且继续前进；旧写入句柄拒绝，翻译模式开启也无在线翻译请求。测试记录位于本地忽略的 .delivery/ai-smoke/。
- 当前新增/接入文件未出现 TypeScript 诊断；仓库整体 tsc 仍有既有 Iconfont、旧播放器等错误，未宣称全仓类型检查通过。
- 0.2.8 首次构建成功且产物哈希通过，但事后未找到收据记录的 0.2.7 备份目录。原因未确定；原 0.2.6 回退产物已核对版本、ID 和哈希。重建 0.2.7 的整体哈希与历史记录不一致，因此不作为原始产物。
- 为这项已观察到的交付风险，构建脚本增加替换前的独立复制备份、两次哈希验证和回退副本摘要；异常时若回退副本不可用，不再移除现有 dist。0.2.9 的实际构建和独立回读已验证新备份存在且完整。
- 后续只读检查在根目录新出现的 `dist 2` 找到了原始 0.2.7，整体哈希 `e76b4b07d29b54df266c78f3f8b6b21e69278c07951a7e9e3e99537f66b6ff4b` 与历史收据完全一致，修正了“原始副本找不到”的临时判断。该目录出现/改名的来源未确定，未移动或删除；已标记为保留产物并从 Git/后续构建源码快照排除。正常加载目标始终是 `dist`，不用 `dist 2`。

用户自行重新加载和进行 B 站/Edge 验收。首版约 8 秒非重叠分段、有识别延迟及误识别可能，建议开启历史字幕；没有预转录、云调用、翻译或完整模型管理。本轮未安装浏览器扩展、未提交或推送。

## 固定目录交付：0.2.7

用户明确授权今后更新统一构建并交付到项目 `dist`，用户自行重新加载和验收。已将约定写入 AGENTS.md 与 PROJECT_IDENTITY.md；安装说明不再指向临时目录。

本次从当前未提交源码构建 0.2.7，ESM/IIFE 生产构建及 afterClean 身份检查通过；固定 dist 回读版本、ID、必需资源及整体哈希与收据一致。旧 dist 0.2.6 已保留在忽略的 .delivery/rollback-*；完整源码指纹、产物哈希和回退路径见 .delivery/receipt-0.2.7-*.json。

本次只递交文件产物，没有替用户操作浏览器加载、没有提交或推送。功能体验由用户验收；固定交付目录稳定不代表尚待验收的原生控制问题已解决。以后每次有交付更新递增版本，先构建校验再替换同一 dist。

## 保存与分P默认值续作

保存/回读/补偿逻辑和播放事件交错定向回归通过；实际 React 来源设置交互通过。无 p 默认 P1 已统一到源码和权威需求。第8节记录现存验收边界。源码候选未安装、未提交、未推送。

## 2026-09-10 核心架构候选验证

合成器与弹幕生命周期解耦、媒体控制归还、DOM 附加错误边界、设置重试及隐藏页配置订阅已修改并完成定向检查。完整证据和下一步以 docs/architecture-review.md 第7节为准。未安装、未提交、未推送，真实 Edge 验收仍未完成。

## 19:30 续作：第一批代码与 UI 候选

第一批修改与验证见 docs/architecture-review.md 第6节。代码、样式已修改；隔离目录 ESM/IIFE 编译、身份校验、目标 lint、时间轴回归及 Canvas 异常冒烟通过。真实设置组件静态窄窗口检查通过。未覆盖工作树 dist、未安装/提交/推送。原生完整能力、handler 恢复及长期重试入口仍未完成。

## 2026-09-09 文档分析与架构审查（本轮）

验证：已对照编辑前副本审阅文档差异，9 个编辑文档的相对链接均可解析，git diff --check 通过。仅文档变更，不运行功能测试。

补读相关历史方案并对照权威资料，更新用户已确认产品要求；新增 docs/architecture-review.md，标记 ADR-008 历史时序被较新候选取代。未修改功能代码，未构建、安装、提交或推送。下一步按审查报告核验基础播放与附加功能故障边界，再做 UI；不把文档推论当成代码确定问题。

## 当前：0.2.6 增强小窗键盘窗口重绑

- 用户实机确认 0.2.5 增强小窗所有快捷键仍不生效。
- 根因是 React 在播放器移入 Document PiP 前计算 `ownerWindow(video)`，把 `KeyBinding` 绑定到原网页；DOM adoption 不会触发 context 重新计算。
- 新增窄接口 `refreshInputWindow()`：播放器挂入 PiP document 后只更新 `keydownWindow`，不调用 `updateVideo()`，因此不会删除同一 video 或重现黑屏。
- `HtmlVideoPlayer` 对 React handle 尚未提交的情况保存 pending 标记，ref 到达后立即重绑，消除旧实现依赖提交先后顺序的竞态。
- 目标 ESLint、`git diff --check` 和 0.2.6 生产构建通过；产物回读确认 Manifest v3、版本 0.2.6、固定扩展 ID `jnonlboihmjeahenhlbkjdijicakfnjj`，且 `dist/main.js` 包含新的输入窗口重绑路径。未安装、未提交，等待 Edge 实机验收。

## 当前：0.2.5 恢复旧项目键盘链与 R 自适应

- 0.2.4 的黑屏修复只阻止节点删除，未恢复旧项目原本依赖的首次 React 提交时序，因此用户实机确认空格和方向键仍无效。
- 逐文件对比稳定旧项目后，完整撤销 `DocPIPWebProvider → HtmlVideoPlayer.refreshInputWindow() → updateVideo()` 新增链路；`HtmlVideoPlayer` 恢复为旧项目一致的实现。
- 恢复旧项目 `miniPlayer.init()` 前的 `beforeStartPIP` 通知，使后台能记录 Document PiP 窗口，保证 R/自适应按钮的 resize 命令能找到目标。
- R 功能原链路已保留：默认 `shortcut_autoResize=R`、`command_autoResize`、`ResizeButton`。精简设置页新增“自动适配宽高比 R”提示。
- 目标 ESLint、`git diff --check` 和生产构建通过；产物版本 0.2.5，固定扩展 key 不变。未安装、未提交，等待 Edge 实机验收。

## 当前：0.2.4 增强小窗黑屏修复

- 用户实机反馈增强小窗视频黑屏但弹幕存在。代码路径确认是 0.2.3 键盘窗口刷新调用 `updateVideo(同一 video)`，触发旧视频移除逻辑，把正在播放的视频节点从小窗删除。
- `VideoPlayerV2.updateVideo()` 增加同一对象幂等分支：只重算字幕、播放上下文和键盘所属窗口，不执行换源删除。不同视频换源行为保持不变。
- 目标 ESLint、`git diff --check`、生产构建通过，产物版本 0.2.4。未安装、未提交，等待真实 Edge 回读画面与键盘操作。

## 当前：0.2.3 小窗交互修复候选

- 原生模式将 play/pause/seek Media Session 注册移到 B 站页面 MAIN world，并只在当前 LayerPiP 会话存续期间重申处理器；操作回传到真实视频，时间轴每 750ms 同步。
- 合成视频的静音与音量现在和真实视频双向同步；增强小窗在 DOM 被 Document PiP 接管后重新绑定键盘窗口。
- 进度拖拽增加 `pointerup`、`pointercancel`、窗口失焦和页面隐藏兜底，并随播放器跨 document 重新绑定；控制栏不再因鼠标点击后的普通焦点长期停留。
- Canvas 弹幕外观配置变化会重建当前弹幕并单帧重绘，暂停时修改字号也可生效。
- popup 改为显式点击打开，设置不再与自动小窗请求竞争；删除 popup 和设置页两处无意义声明。
- 目标 ESLint、`git diff --check` 与生产构建通过。构建仅出现项目既有的 nvm / browserslist 提示；产物 0.2.3、固定 key 与主环境桥均已回读。未安装、未提交，Edge 交互由用户验收。

## 当前：0.2.2 原生媒体操作候选

- 根因：Canvas MediaStream 原生 PiP 默认隐藏播放/暂停，原实现未注册 Media Session 操作。依据 Chrome 官方画中画文档。
- 注册 play/pause 与非直播的 seekbackward/seekforward/seekto，原视频为控制对象，默认跳转十秒并限制时间范围；同步 playbackState；关闭解除本次注册。
- 左右键由浏览器自身根据可见按钮及焦点状态派发，不是 DOM keydown；当前 Edge 实机效果待验收。Media Session 无读取旧 action handler API，关闭以 null 恢复默认行为，不声称还原其他扩展自定义处理器。
- 构建与身份回读通过，0.2.2；未安装、未提交。安装更新需先重新加载扩展，再刷新视频页，使模块资源清单一致。

## 当前：2026-09-09 候选 0.2.1

- 修复 onSave 无条件刷新；历史快捷按钮在无已开启字幕时禁用并给出说明；非法数值规范化、未知时长 seek 防护、弹幕请求代次、初始化取消、延迟 Document PiP 返回关闭。
- 设置/弹窗使用浅色与系统深色主题、粉蓝视觉；播放器保持深色。同步 SVG 与 PNG 图标，不改变扩展 ID 或存储命名空间。主要入口面向 B 站，未修改 manifest 权限。
- 短逻辑检查通过：直接执行 onSave 回调两次，验证无 reload；空/非法字幕、非法配置归一化通过。生产构建通过，产物版本 0.2.1，固定 ID 回读符合。
- 图标已目视检查；设置/播放器实机视觉、实际复现场景待用户验收。未安装、未提交、未推送；未修改旧 FloatCaption。

## 当前：2026-09-08 架构重设计候选 0.2.0

- 2026-09-09 收尾：审查指出原生模式视频节点替换后的合成源错配；采用关闭并提示重新打开的确定性处理，暂不实现无缝换源。子 agent 最终审查因额度中止，已收到的明确发现由主 agent 修复，不能视为完整审查通过。

- 当前权威设计为 `docs/learning-player-architecture.md`，下方旧阶段仅作历史。
- 先完成复用/重写决策，再实现纯字幕时间轴、共享历史段落选择、DOM/Canvas 呈现和独立快捷开关。
- 窗口工厂与站点适配器显式组合；修正监听所有权、打开失败清理、Canvas 流释放和暂停时重绘。
- 两种模式均可选择字幕来源；保存后通知当前窗口，逐目标保存避免不同视频映射相互覆盖。
- 基础检查：生产构建成功；短时间轴检查覆盖快进、回退、空档、重叠及开关/段数，通过。未增加测试套。
- 交付状态：源码已修改、候选已构建；未安装、未提交、未推送、未发布。旧 FloatCaption 未修改。
- 待用户验收：真实点击打开两种小窗，音频和方向键，B 链接 P57 字幕，历史开关，关闭后再打开。构建不证明这些设备行为已验证。

## Session: 2026-09-02

### Phase 1: Requirements & Discovery

- **Status:** in_progress
- Actions taken:
  - 确认用户要求双模式并保留全部核心功能。
  - 启动原生模式字幕来源的子 agent 对抗式审查。
  - 启用需求梳理、文件化规划和 UI/UX 设计规范。
  - 完成现有字幕管理、B 站分P解析、设置面板和 PiP 后端的只读审查。
  - 子 agent 提出并审查了 CID 级来源映射、持久化与 fail-closed 方案。
  - 用户确认所有推荐默认，已将完整架构、数据模型、失败语义、UI 约束和分段验收落盘。
- Files created/modified:
  - `task_plan.md`
  - `findings.md`
  - `progress.md`
  - `docs/dual-pip-architecture.md`

## Test Results

| Check                      | Scope                             | Result                                     | Status        |
| -------------------------- | --------------------------------- | ------------------------------------------ | ------------- |
| ESLint                     | 本次变更的 TS/TSX 文件            | 无错误                                     | pass          |
| Production build           | `pnpm build`                      | 构建成功；仅有既有 nvm / browserslist 提示 | pass          |
| TypeScript baseline        | `pnpm exec tsc --noEmit`          | 被既有依赖声明和旧代码错误阻断             | baseline-fail |
| Edge functional validation | 双模式、分P、音频、seek、字幕对齐 | 按用户要求未执行                           | user-owned    |

## Successor isolation

- 稳定旧插件已恢复到 `f7efb70` / `custom-v0.7.1`，其 `dist` 已重新构建并冻结为独立回滚压缩包。
- 双模式开发已迁入独立 `LayerPiP` 工作树，不再修改或构建旧插件目录。
- LayerPiP 使用名称“叠映”、独立图标、固定扩展 ID `jnonlboihmjeahenhlbkjdijicakfnjj`、`LAYERPIP_*_V1` 存储键和 `layerpip-assets-v1` IndexedDB。
- LayerPiP 尚未安装；用户继续使用稳定旧插件，直到新项目成为候选可用版本。

## Error Log

| Timestamp        | Error                      | Attempt | Resolution                               |
| ---------------- | -------------------------- | ------: | ---------------------------------------- |
| 2026-09-02 16:56 | ESLint `import/order`      |       1 | 调整 `PipMode` 导入顺序                  |
| 2026-09-02 17:xx | 无字幕目标身份解析失败风险 |       1 | 将 B 站目录读取从字幕轨道读取中拆出      |
| 2026-09-02 17:xx | 全量 tsc 基线错误          |       1 | 不扩大范围修复；记录并以构建作为交付门槛 |

## 5-Question Reboot Check

| Question             | Answer                                               |
| -------------------- | ---------------------------------------------------- |
| Where am I?          | Phase 5: Adversarial review                          |
| Where am I going?    | 完成审查后交给用户在 Edge 中验收                     |
| What's the goal?     | 可切换的 Document PiP 与 Edge 原生 PiP               |
| What have I learned? | See findings.md                                      |
| What have I done?    | 双模式、CID 来源、IndexedDB、Canvas 合成与 UI 已落地 |
# 2026-09-09 审阅资料包

- 新建 `docs/README.md`，定义文档权威性、状态词和审阅顺序。
- 新建 `docs/product-requirements.md`，从原始 A/B 字幕场景整理产品目标、双模式、历史字幕、可靠性不变量和验收场景。
- 新建 `docs/system-architecture.md`，记录唯一媒体真源、Provider/SiteAdapter 分层、Document PiP 与原生 Canvas PiP 的数据/控制流、字幕身份与存储所有权。
- 新建 `docs/implementation-reference.md`，把当前源码路径、类型、关键函数、算法和生命周期逐项映射。
- 新建 `docs/evolution-and-decisions.md`，记录旧项目复用边界、实质重写模块、ADR 与技术债。
- 新建 `docs/review-and-boundaries.md`，区分用户报告、候选修复和待实机验证，并提供边界矩阵与对抗式审阅问题。
- 给三份历史/专项设计文档增加非权威标记，避免审阅者把旧方案误当当前事实。
- 检查结果：六份权威文档共 903 行；相对链接均可解析，列出的关键源码路径均存在，版本、默认模式、历史默认值和固定 ID 与源码一致，未发现尾随空白。
- 本轮不改功能、不构建、不安装、不提交；只执行了文档 diff、路径、符号和状态措辞检查。
