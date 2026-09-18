# 对 Codex 审阅报告的回应与补充验证

日期：2026-09-17。性质：对 `new-feature-report-review-2026-09-17.md` 的逐条回应 + 补充实验。
状态：**未实现任何功能**。本轮只改文档。

被审阅对象：[多画面实施文档](./multi-video-single-window-plan.md)、[高能进度条实施文档](./high-energy-progress-bar-plan.md)。

---

## 0. 摘要

Codex 的审阅质量很高。结论先说清楚：

| 类别 | 数量 | 处理 |
| --- | --- | --- |
| **Codex 指出、我实测确认的硬缺陷**（会直接导致实现错误） | 3 | 全部确认，两份文档已修正 |
| Codex 指出、我确认的其它问题（表述/事实/范围） | 8 | 全部确认，已修正 |
| Codex 指出方向、我补做了实验（其中有 Codex 未提到的关键边界） | 5 | 见第 3 节 |
| **我保留不同意见** | 3 | 见第 4 节，均有证据 |

一句话：**Codex 抓到的都是我文档里的真实错误，我没有任何一条能反驳**；分歧只在产品语义与 P0 边界，不在技术事实。

其中最有价值的一条是 Codex 提议用 `HTMLMediaElement.played` 替代手工采样。我做了实验，**它不仅更好，而且恰好一举消除了我原伪代码里的两个 bug**（见 §3.1）。

---

## 1. 硬缺陷：我确认并已修正

### 1.1 接口契约错位（Codex §4.3）

**Codex 的判断正确。** 我的文档同时给了「顶层是 `modules` 的响应体」和「读 `res.data.modules` 的解析代码」，两者不可能同时成立。

实测（浏览器页面上下文，`fetch(...).json()`）：

```json
{"status":200,"topKeys":["modules"],"hasModules":true,"n":95}
```

顶层键就是 `modules`，没有 `data` 包装。`res.data.modules` 会得到 `undefined` → **把有数据的视频误判为「无曲线」**。

- 原因：官方代码里的 `t.data.modules` 是它自家 HTTP 客户端的响应包装（axios 风格），不是 `fetch().json()` 的返回体。我照抄官方 `parse()` 时没有做这层解包，属于我的移植错误。
- 已修正为：直接读 `body.modules`；若将来复用带包装的网络层，在边界处解包一次。
- 同时采纳 Codex 的硬化要求：`step_sec` 校验为**有限正数**（不是 truthy）、`points` 校验为有界数组且元素为有限非负数、**不执行**返回的 `script_src`。

### 1.2 已看采集伪代码有两处错（Codex §4.1）

**对，两处都是我的错。**

**错误一：比例与秒混用。** 我写的是 `onTimeupdate(ratio)` 之后做 `ratio - lastUpdateTime > 1.5`（标注「秒」）。1000 秒的视频从 100s 跳到 500s，比例差只有 0.4，**这个跳跃检测永远不触发**，整段会被误记为已看。
官方脚本里 `lastUpdateTime` 存的是**秒**、`zebraStart/zebraEnd` 存的是**比例**，我把两个量纲合并成了一个参数。官方代码确实存在反向减法（`15 <= lastUpdateTime - a`，前向播放时恒不成立），但**官方有缺陷不构成我复刻缺陷的理由**。

**错误二：seek 结算取错值。** 我的 `commit()` 写「`zebraEnd = currentTime / duration`」，又在 `onSeeking()` 里调用它。seeking 发生时 `currentTime` 已经是**目的时间**，于是 100s→500s 的跳转会被写成 `[?, 0.5]` —— 整个跳过区间被误记为已看。
官方在 seeking 时调用的是 `_saveZebraAreas()`（用已记录的 `zebraStart/zebraEnd`），不是 `executeZebraCached()`；是我把两者混为一谈。

**修正方向**：改用 `played`，见 §3.1——它从根上不依赖采样，这两个 bug 自然消失。

### 1.3 进度条几何与配置名已过期（Codex §4.6）

**对。** 我的文档引用的 `top:-8px` / `height:16px` / `--offset:38px` / `--progress-track-height:3px` / `--load-color` 属于**旧源码**。当前（0.2.14）实际是：

```less
.played-progress-bar {
  --progress-scale: 1;
  position: absolute; top: -12px; left: 12px;
  width: calc(100% - 24px); height: 20px; z-index: 7; cursor: pointer;
  &:hover, &:has(.rc-slider-handle:focus-visible), &.is-seeking { --progress-scale: 1.5; }
}
.rc-slider-rail  { background: rgba(255,255,255,0.2); height: 4px; border-radius: 1.5px;
                   transform: translateY(-50%) scaleY(var(--progress-scale)); }
.rc-slider-track { background: var(--progress-color, #00a1d6) !important; }
.fc-progress-buffer span { background: rgba(255,255,255,0.3); }
.bottom-progress { position: fixed; inset: auto 0 0; height: 2px;
                   background: rgba(255,255,255,0.2);
                   span { background: var(--progress-color, #00a1d6); } }
```

要点（对实现有影响）：
1. 命中区是**稳定的 20px**，视觉轨道通过 `scaleY(var(--progress-scale))` 在 hover/seeking 时放大到 1.5 倍 —— **不要按「轨道自身变形」的思路做**。
2. 颜色变量已从 `--load-color` 改为 **`--progress-color`**（默认 `#00a1d6`）。
3. 缓冲层已经在用**真实 `webVideo.buffered` 区间**渲染（`.fc-progress-buffer`），不是单一前缀 —— 这正好是「用 TimeRanges 表达区间」的既有先例，与 §3.1 用 `played` 是同一套思路。
4. 存在一条独立的 `.bottom-progress` **常驻底部 2px 细线**（由 `playedPercent` 驱动），控制栏显隐时语义会变，接线时要一起考虑。

已按上述内容修正文档并去掉过期行号引用。

---

## 2. 其它我确认的问题（已修正）

| # | Codex 的指摘 | 我的确认 |
| --- | --- | --- |
| 2.1 | `all_frames` ≠ 业务逻辑可用 | **成立且重要**。`src/contents/main.ts` 明确 `if (isTop) { main() } else { 仅响应 detectVideo_req }`；且顶层 `import './floatButton'` 在所有 frame 有副作用。我原文「pane 内的页面天然会跑本项目的逻辑」是过度乐观——我只验证了 manifest 声明，没读门控逻辑 |
| 2.2 | `sessionStorage` 兜底 pane 标识会串 | **实测成立**（§3.3）。我原文与「不写站点存储」原则也冲突 |
| 2.3 | 「两路不可能同时出声」不是浏览器限制 | **实测证伪了我的表述**（§3.4）。这是产品选择，我写成了平台限制 |
| 2.4 | 「非激活 pane 默认暂停」与目标冲突 | **成立**。用户要的就是同时播放，我把它列成默认是自相矛盾 |
| 2.5 | 嵌入式播放器「没有本项目的注入」不成立 | **成立**。`matches: ['<all_urls>']` + `all_frames: true` 覆盖 `player.bilibili.com`。该句还与我自己 §2.2④ 的结论互相矛盾 |
| 2.6 | 资产库版本/store/事务语义 | **源码确认**：`layerpip-assets-v1` 版本 1 且只有 `subtitle-assets` 一个 store；`runRequest` 在 `request.onsuccess` 就 resolve，不是 `transaction.oncomplete`。新增观看记录不能「沿用」而必须走版本升级 |
| 2.7 | `last_play_time` 不是区间来源 | **成立**。它是单一「上次位置」，我把它列进「三路并集」是措辞错误，已从区间来源中移除，只保留为位置标记 |
| 2.8 | 「其它标签页 DOM 绝对不可访问」过头 | **成立**。有 opener 且同源的窗口对象可访问；我的绝对化表述不对。仍不建议首版依赖它 |

---

## 3. 我补做的实验（Codex 指出方向，我做了验证）

### 3.1 `HTMLMediaElement.played` 是正确原语 —— 决定性实验 ✅

Codex 建议评估 `played`。我实测（真实 B 站页面，MSE/blob 播放，duration 213s）：

| 步骤 | `video.played` |
| --- | --- |
| 初始 | `[]` |
| 播放 0 → 6.96s | `[[0, 6.96]]` |
| **seek 到 120s（尚未播放）** | `[[0, 6.96]]` ← **跳过区间没有被记为已看** |
| 在 120s 播放 7s | `[[0, 6.96], [120, 126.96]]` |
| **seek 到 190s（未播放）** | `[[0, 6.96], [120, 126.96]]` ← 仍未污染 |
| 在 190s 播放 3s | 追加 `[190, 192.96]` |

累计 `totalPlayedSeconds = 16.88`，与真实播放量一致。

**结论**：
- `played` 天然就是「媒体实际播放过的区间集合」，**跳过的区间不会被标记**，正是 F1 需要的语义。
- 它同时消除了 §1.2 的两个 bug：不需要自己猜 seek，也不会把 seek 目标当成段尾。
- 且它在 B 站 MSE 播放路径下工作正常。

**Codex 未提到、但我实测到的关键边界**（决定实现顺序）：

### 3.2 `played` 在换源时会被重置 ⚠️

同一次实验，在播放后把同一 `src` 重新赋值 + `load()`：

```text
播放后        played = [[0, 5.96]]
src 重赋 + load 后  played = [[5.79, 7.37]]   ← 原区间已丢失
```

**实现含义**：`played` 是**当前媒体资源**的区间，且**不持久化**。因此：
- **必须在换 P / 换源 / 关闭前，先把 `played` 快照写入存储**，否则区间丢失。
- 快照要绑定 `cid`；无法确认归属的样本不写入。
- 不能指望「反正 `played` 一直在」——它随时可能被重置。

这条边界让「以 `played` 为准」的方案必须配一个**快照时机表**（见 §5.1），Codex 的原文没有展开这一点。

### 3.3 `sessionStorage` 确实跨同源 iframe 共享 ✅（Codex §6.3 成立）

本地同源页面：父页 + 两个同源 iframe。

```text
iframe A 写 sessionStorage['shared'] = 'from-a'
iframe B 读 → 'from-a'
父页   读 → 'from-a'
```

**三处共享同一份存储**。所以用通用的 `layerpip_pane=1` 标志会**串 pane、还会被顶层页面看到**。Codex 的判断成立，我的兜底建议作废。

替代方案的实测边界：`window.name` **能跨同源导航保留**（`location.replace` 后仍为 `PANEMARKER`），但**子页面可以覆盖它**（父页设 `iframe.name='HOSTSET'`，子页 `window.name='PANEMARKER'` 后，父页读 `f.name` 仍是 `HOSTSET`、读 `contentWindow.name` 变成 `PANEMARKER`）。
→ 即 `window.name` 可作**发现提示**，但**不可作授权依据**，与 Codex 结论一致；且比 Codex 描述的更脆弱（可被覆盖）。

### 3.4 两路可以同时出声 ✅（证伪了我的表述）

默认自动播放策略（**未加** `--autoplay-policy`），两个同源 B 站 iframe，各自有真实用户手势后：

```text
muted 两路并播           → paused = [false, false]
解除静音两路（均 play）  → paused = [false, false]，muted = [false, false]
                           时间轴 21.3 / 21.0 继续前进
```

**两路同时有声是可行的**。我之前「过不了自动播放策略」的说法是错的——那次实验只是在 PiP 窗口内**没有用户手势**时解除静音，不能推广成平台限制。

**但「最多一路有声」仍然是正确的产品选择**（多路同时出声没有可听性），只是要写成产品规则，不是浏览器限制。

### 3.5 Codex 的 HTTP 412 是环境性风控 ⚠️

Codex 报告匿名 GET 返回 412。我在同一份报告的基础上复测（curl 与浏览器页面上下文各一次）：

```text
curl（官方 URL + r=loader）                      → 200，802 bytes
curl（附加 Sec-Fetch-* 浏览器头）                → 200
浏览器页面上下文 fetch(credentials:'omit')       → 200，topKeys=["modules"]，95 点
```

**我这边仍稳定 200**。结论：
- 接口没有失效，412 是**风控按环境/IP/频次触发**，Codex 的谨慎是对的——**可用性不能被当作保证**。
- 因此文档要区分三态：`有数据` / `正常无数据（err_id:3）` / `暂时失败（412/网络/非法响应）`，并且**暂时失败不能缓存为「无数据」**，也不能每帧重试。这条我采纳并已写入。

---

## 4. 我保留不同意见的地方

只有三条，都在产品语义与 P0 边界，**不在技术事实**。

### 4.1 「蓝色前缀冲突」是产品决策，不是我的设计缺陷（对 Codex §4.2）

Codex 说：当前主轨道是「当前位置前全部蓝色」，与「已看区间可不连续」冲突；若 00:30 跳到 08:00，前缀会把整段染蓝，watched 覆盖层放下面无效、放上面仍误导。

**我部分不同意。** 事实是：**B 站自己的播放器就是这个双层结构**。我在本轮取证中实测到：

- `.bpx-player-progress-schedule-current`（主轨道已播放前缀）= `rgb(0, 174, 236)`；
- 高能条 SVG 里的 `playedRect` = 主题色，裁剪到**已看区间**。

即「主轨道前缀蓝」与「高能条已看蓝」在 B 站里**同时存在、含义不同**，用户要求的就是复刻这个行为。所以这不是我的设计引入的冲突。

**但 Codex 的正确内核我接受**：必须**显式声明主轨道不变**，否则实施者会误以为要改主轨道。我的文档原来没有写死这一点，属于表述缺失。已在两处补上：

> 主轨道（`.rc-slider-track` / `.bottom-progress`）= 本次播放位置，**保持现状不动**；新增的蓝色只作用于高能曲线层，表示**历史已看区间**。两者语义不同，不要合并。

### 4.2 关于「规范恒定事实」的措辞（对 Codex §7 第 1 条）

Codex 认为我把「进程单槽位」当成规范恒定事实。我的原文其实写的是「**这是 Chromium 的平台限制**」，并引用了规范 §6.5 中「跨 top-level traversable 是否只允许一个由实现与平台决定」的原文——即我并未声称它是规范强制。

不过 Codex 的提醒有价值：**作用域应该收紧到「目标 Edge / 同一浏览器实例」**，不要外推成所有浏览器永久结论。已调整措辞。

### 4.3 P0 边界：同意提一部分，不同意全提（对 Codex §6.6/§6.7）

- **同意**把「禁止递归开窗 + 加载失败安全关闭 + 原视频交接」提到 P0：这三项成本低，不做会**丢用户状态或顶掉小窗**，属于必须。
- **不同意**把完整 pane 移交事务、pane 控制协议、站点布局限域全部压进 P0：P0 的定位是「**验证形态成立**」，塞进完整会话架构会让 P0 无法收敛。建议 P0 = 「可打开、可播放、可安全退出、不误触」的双路窗口；P1 = 完整 pane 模式与音频/焦点策略。
- Codex 说「站点布局限域是两路最小版本的必要条件」——**这条我同意其重要性**，但它是**可用性**门槛而非能力门槛，放在 P0 的验收项、P1 的实现项更合适。

---

## 5. 修订后的设计要点（给实施者）

### 5.1 F1 已看区间：以 `played` 为准

```ts
// 采集：不再自己采样
function snapshotPlayed(video: HTMLVideoElement): [number, number][] {
  const out: [number, number][] = []
  for (let i = 0; i < video.played.length; i++) {
    out.push([video.played.start(i), video.played.end(i)])   // 媒体秒
  }
  return out
}
```

**快照时机表（必须全部覆盖，否则丢数据）**：

| 时机 | 原因 |
| --- | --- |
| 周期性（墙钟节流，如 5–15s，且仅在区间有变化时） | `played` 不持久化 |
| `pause` / `ended` | 用户可能就此离开 |
| **换 P / 换源 / SPA 换视频之前** | **`played` 会随资源重选被重置**（§3.2 实测） |
| 取消小窗 / 关闭页面前 | 只能作为补充，不能依赖异步 unload 必然完成 |
| 切换 CID 时 | 未确认归属的样本丢弃 |

其它要点：
- 存储用**媒体秒**（`startSec/endSec`），渲染时才除以有效 `duration`；避免 Codex 指出的量纲混淆。
- 合并由 background 用**事务**完成，避免两路/两标签写同一 cid 后写覆盖先写。
- `played` 的语义是「媒体实际播放过」，**不等于用户看过**；静音 pane、后台播放是否计入是产品语义，需显式定义（见 §6）。
- 观看记录**独立建库**（不复用 `layerpip-assets-v1` 的版本 1），或走正式升级流程。

### 5.2 F2 曲线：接口与缓存状态机

```ts
type CurveState =
  | { kind: 'loading' }
  | { kind: 'ready'; points: number[]; stepSec: number }
  | { kind: 'none' }                       // step_sec=0 / err_id:3 —— 可负缓存
  | { kind: 'error'; retryable: boolean }  // 412 / 网络 / 非法响应 —— 不可负缓存
```

- 解析：直接读 `body.modules`（§1.1）；`step_sec` 有限正数；points 有界有限非负；**不执行** `script_src`。
- `none` 与 `error` 必须分开：前者可缓存，后者要有退避重试且**不能每帧重试**。
- 关掉开关就不再请求。

### 5.3 多画面：先定义会话所有权

Codex 指出的缺口成立：现有 `DocPIPWebProvider.onOpenPlayer()` 已经初始化单路 `HtmlVideoPlayer` 并把它的 `playerRootEl` 挂进 PiP；若 pane[0] 再加载一次当前视频，会出现**两个媒体实例**（重复音频、双解码、两套位置、关闭恢复歧义）。

两条路线都要显式设计，**不能默认其中一条而不写交接**：

| | 方案 A：原视频留作主 pane + 新增 iframe | 方案 B：全部 iframe |
| --- | --- | --- |
| 优点 | 原视频、字幕绑定、播放位置连续 | 控制模型统一 |
| 代价 | 两种 pane 适配器并存 | 需要暂停并保留原视频、传递时间与播放意图 |
| 必须设计的路径 | 单路→多路、失败退回单路、退出多路→恢复主路、关闭整个小窗（**四条**） | 同左 |

其它修订：
- pane 标识：宿主持有 frame→pane 映射 + 限定 origin/source/paneId/会话代次的握手；**不用 sessionStorage**（§3.3），`window.name` 只作发现提示。
- 音频：默认两路播放、**最多一路有声是产品约束**（§3.4），并以真实 `muted/paused/play()` 结果更新 UI，而不是只置 `soloed=true`。
- 焦点与键盘：`activePane` 与 `audiblePane` 分开；键盘不跨文档冒泡，需要路由；**禁用插件自己的 Media Session ≠ 禁用 B 站注册的 handler**，验收要看真实系统媒体键目标。
- `iframe.allow` 去掉 `fullscreen`（PiP 窗口内 fullscreen 被规范禁止，留着是误导入口）。
- 站点布局限域（把 pane 收敛到播放器区域）进 P0 验收项。

---

## 6. 仍需用户决策

1. **多画面的当前视频**：保留原媒体（方案 A）还是重载进 iframe（方案 B）？退出时恢复到哪个视频的哪个时间？
2. **已看口径**：是否统计原网页已播放部分、静音 pane、非激活 pane？建议默认「按实际播放统计」并提供清除入口。
3. **最多一路有声**：作为默认（可放开）还是硬约束？建议首版作明确约束，UI 区分焦点路与有声路。
4. **优先级**：建议先交付改动范围小的 F1/F2，再单独推进多画面。
5. **`played` 的兼容基线**：目标 Edge 版本是否都支持？（本轮在 Chromium 上验证；`played` 是 HTML 标准 API，风险低但建议实机确认。）

---

## 7. 证据附录

### 7.1 本轮实验（2026-09-17）

| 实验 | 方法 | 结果 |
| --- | --- | --- |
| 接口现行状态 | curl + 浏览器页面上下文 fetch | **200**，`topKeys=["modules"]`，95 点（Codex 那边的 412 未在我处复现 → 环境性风控） |
| 响应形状 | `fetch().json()` 读顶层键 | `modules`（**无 `data` 包装**） |
| `played` 语义 | B 站页面，播放 0→7s、seek 120s、播放、seek 190s | 跳过区间**不入** `played`；区间正确求并集 |
| `played` 换源重置 | 同 src 重赋 + `load()` | 原区间**丢失** |
| sessionStorage 跨 iframe | 本地父页 + 两个同源 iframe | **三者共享**（`from-a` 被 B 与父页读到） |
| `window.name` | iframe 内 `location.replace` 后读 | 跨导航**保留**；但**子页可覆盖**（父页 `f.name` 与 `contentWindow.name` 不一致） |
| 双路同时出声 | 默认策略 + 各自真实点击后解除静音 | **两路 `paused=false, muted=false` 并播** |
| 当前进度条源码 | 读 `PlayerProgressBar.less` / `.tsx` | `top:-12px`、`height:20px`、`--progress-scale 1→1.5`、轨道 4px、`--progress-color #00a1d6`、`.fc-progress-buffer` 用真实 `buffered` 区间 |
| 内容脚本门控 | 读 `src/contents/main.ts` | `if (isTop) main() else 仅 detectVideo_req`；顶层 `import './floatButton'` |
| 资产库 | 读 `src/background/subtitleAssets.ts` | 版本 1、单 store `subtitle-assets`、`request.onsuccess` 即 resolve |

### 7.2 外部依据

- [HTML 媒体规范 · `played`](https://html.spec.whatwg.org/multipage/media.html#dom-media-played)
- [Chrome 自动播放策略](https://developer.chrome.com/blog/autoplay/)
- [Document PiP 规范 §6.5 One PiP Window](https://wicg.github.io/document-picture-in-picture/#one-pip-window) / [§3.2.4 Fullscreen](https://wicg.github.io/document-picture-in-picture/#fullscreen) / [§3.3 Iframes](https://wicg.github.io/document-picture-in-picture/#iframes)
- [Chrome 内容脚本 · 指定 frame](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts#specify-frames)
- [HTML Web Storage 规范](https://html.spec.whatwg.org/multipage/webstorage.html)

### 7.3 未验证

- 未在真实 macOS Edge 中验证 `played`、双路出声与 pane 行为。
- 未验证 `played` 在 B 站「换 P 而不换 video 元素」时是重置还是沿用（本轮用 `src` 重赋 + `load()` 模拟，观察到重置）。
- 未在本环境复现 Codex 的 412，因此**无法给出 412 的触发条件**；只能确认它存在。
