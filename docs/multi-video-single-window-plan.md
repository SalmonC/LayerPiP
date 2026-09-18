# 小窗内多视频同时播放（多画面拼接）— 开发实施文档

状态：2026-09-16 初稿，**2026-09-17 依独立审阅修订**（未实现）。本文不改源码、不改依赖、不递增版本。
交付边界见 `../PROJECT_IDENTITY.md`；当前交付版本见 `../progress.md`。

> ⚠️ **修订说明**：本文已按独立审阅（[审阅回应与补充验证](./review-response-2026-09-17.md)）修正若干**已验证的错误**，涉及：pane 模式标识（原 `sessionStorage` 方案作废）、音频约束（原「不可能同时出声」为误）、非激活 pane 默认暂停（与目标冲突）、`all_frames` 的乐观结论、嵌入式播放器注入、跨标签页 DOM 的绝对化表述，并补充了缺失的**窗口会话所有权**设计。
> 修订处均在正文内以「修正（2026-09-17）」标注。

> **给实施者**：第 2 节是已验证可跑通的通路，第 3 节是可直接照做的设计，第 4 节是坑清单，第 5 节是分期与验收。
> 第 6 节只保留「不建议走的通路 + 原因」，不需要细读。

---

## 1. 目标与结论

**目标**：在一个增强小窗（Document PiP）里同时播放多个视频，即「多画面拼接」。

**结论：可行，已实测跑通。** 做法是在这个 PiP 窗口内放 N 个 `iframe`，每个指向一个真实的 B 站视频页。
实测在一个窗口内同时播放两个不同视频，两路时间轴都在正常前进：

```text
iframe#1  https://www.bilibili.com/video/BV1xx411c7mD/  → 10.699 → 16.70s   paused=false
iframe#2  https://www.bilibili.com/video/BV1uT4y1P7CX/  → 10.596 → 16.62s   paused=false
窗口内 iframe 数 = 2（视频在各 iframe 内部，均 readyState=4）
```

**不要做「多个小窗」**：一个浏览器进程只有一个画中画槽位，开第二个会强制关闭第一个。原因与证据见 `./multi-window-feasibility-plan.md`（背景资料，不必细读）。

---

## 2. 可跑通的通路：iframe 分屏

### 2.1 最小验证代码

在任意 B 站视频页的控制台里执行即可复现：

```js
// 在 https://www.bilibili.com/video/<任意BV>/ 页面执行
const w = await window.documentPictureInPicture.requestWindow({ width: 1200, height: 500 })
const mk = (url, style) => {
  const f = w.document.createElement('iframe')
  f.src = url
  f.style.cssText = style
  w.document.body.appendChild(f)
  return f
}
mk('https://www.bilibili.com/video/BV1xx411c7mD/', 'width:50%;height:100%;border:0')
mk('https://www.bilibili.com/video/BV1uT4y1P7CX/', 'width:50%;height:100%;border:0')
// 两路都会各自加载 B 站播放器并可播放
```

### 2.2 为什么这条路成立（四条实测依据）

**① B 站页面允许被 iframe 嵌入**

| 页面 | `X-Frame-Options` / `frame-ancestors` |
| --- | --- |
| `https://www.bilibili.com/video/BV...` | **无** |
| `https://player.bilibili.com/player.html?...` | **无** |

额外稳健性：PiP 窗口继承 opener 的源（即 `www.bilibili.com`），所以即使 B 站将来加上 `frame-ancestors 'self'`，**同源嵌套仍然满足**。

**② PiP 窗口与 B 站 iframe 同源，可直接控制**

PiP 文档 URL 是 `about:blank`，但**继承 opener 的源**。实测可以：读 `iframe.contentDocument`、拿 `video` 元素、设 `muted`、调 `play()`，全部成功。
→ 本项目不只是「显示」这些画面，还能**控制**它们（音量、播放、暂停、进度）。

**③ 每个 iframe 自带正确的 Referer，绕开 CDN 防盗链**

iframe 的文档 URL 是真实的 `https://www.bilibili.com/video/...`，其媒体请求带正常 Referer，B 站 CDN 放行（见 §6.1 的反例）。

**④ 本项目的内容脚本已经注入到所有 frame**

`src/manifest.ts`：

```
entry-init-ext-config.js        run_at: document_start, all_frames: true
entry-inject-all-frames-top.js  run_at: document_start, all_frames: true, world: MAIN
entry-all-frames.js             run_at: document_end,   all_frames: true
host_permissions: ['<all_urls>']
```

→ 脚本**会被注入**到 pane 的每个 frame。

> ⚠️ **但「被注入」≠「业务逻辑会跑」**（本节已于 2026-09-17 修正，早期版本在此过度乐观）。
> `src/contents/main.ts` 的实际门控是：
> ```ts
> import './floatButton'          // ← 顶层导入，所有 frame 都有副作用
> if (isTop) { main() }           // ← 主逻辑只在顶层跑
> else { /* 仅响应 detectVideo_req，回报 video 标签信息 */ }
> ```
> 另外 all-frame 的 MAIN world 入口会加载 `injectPIPFunction` / `fetchHacker`，而 `nativeMediaSession` 安装在 top-only 入口。
>
> **结论**：pane 需要一套**独立的、受限的**适配入口，并**早于相关副作用安装**。
> 绝不能「把 iframe 的 `isTop` 改成 true」来启动整套主逻辑——那会带来递归开窗、键盘抢占、重复 Media Session 等一连串问题。
> 要分别处理两件事：①**阻止现有副作用**；②**接入 pane 真正需要的能力**。


### 2.3 B 站原生播放器带来的免费能力

因为是真实视频页，每个 pane 自动具备：登录态与高清、B 站播放器、原生弹幕、原生字幕。
本项目**不需要**重新解码、重新拉流、重新做弹幕渲染。

---

## 3. 设计（可直接照做）

### 3.1 数据模型

```ts
interface Pane {
  id: string                 // 稳定 id，用于持久化与 React key
  target: {                  // 只存标识，URL 由标识拼出，便于恢复与校验
    bvid?: string
    aid?: string
    cid: string
    page: number             // 分 P
  }
  muted: boolean
  soloed: boolean            // 是否「独奏」（唯一有声）
}

interface MultiPaneLayout {
  version: 1
  panes: Pane[]
  cols: 1 | 2                // 先做 1×2，再做 2×2
  dividerRatios?: number[]   // 分隔条位置，可选
}
```

持久化放在扩展侧（`LAYERPIP_*_V1` / `layerpip-assets-v1`），**不要**写进站点存储。

### 3.1.1 必须先定义「窗口会话所有者」（2026-09-17 补充，早期版本缺失）

> 这是审阅发现的**最关键缺口**：早期版本说「pane[0] = 当前视频」，却没写这个视频**怎么进来**，直接开工会造成两个媒体实例。

现状：`DocPIPWebProvider.onOpenPlayer()` 会先初始化**单路** `HtmlVideoPlayer`，把它的 `playerRootEl` 挂进 PiP，并绑定窗口销毁。
如果 pane[0] 再用 iframe 加载同一个视频，就会出现：**重复音频、双份解码、两个播放位置、关闭时恢复歧义**。

两条路线**都必须显式设计，不能默认其一而不写交接**：

| | 方案 A：原视频留作主 pane + 新增 iframe | 方案 B：全部 iframe |
| --- | --- | --- |
| 做法 | 复用现有 `replaceVideoEl` 单路链路作为 pane 0；额外视频用 iframe | 暂停并保留原视频，全部画面用 iframe；退出时再恢复 |
| 优点 | 原视频、字幕绑定、播放位置**连续** | 控制模型**统一**，pane 适配器只有一种 |
| 代价 | 两种 pane 适配器并存 | 需要把当前时间与播放意图**传给** iframe，退出时定向恢复 |

无论选哪条，**四条路径都必须设计**：

1. 单路 → 多路（进入多画面）
2. 多路失败 → 退回单路
3. 退出多路 → 恢复主路（恢复哪个视频、哪个时间点）
4. 关闭整个小窗（谁负责释放、原视频回到哪里）

### 3.2 创建流程

```text
用户触发「多画面」（入口建议放小窗底部面板或扩展弹窗）
  ↓
1. 校验：当前是否已开小窗？若已开，复用它；否则按现有 DocPIPWebProvider 流程先开
  ↓
2. 组装 pane 列表：pane[0] = 当前视频；其余来自用户输入/收藏/最近观看
  ↓
3. 为每个 pane 生成 iframe：
     src = `https://www.bilibili.com/video/${bvid}/?p=${page}`
     iframe.name = `layerpip-pane:<paneId>`        ← 发现提示（非授权依据，见 3.4）
     iframe.allow = 'autoplay'                     ← 只声明真正需要的权限
     // 不要加 allow="fullscreen" / allowfullscreen：
     // Document PiP 窗口内 fullscreen 被规范禁止，留一个必然失败的入口只会误导用户
     // 需要放大时改用「pane 内放大」或放大整个小窗
  ↓
4. 挂到 PiP 窗口的布局容器里；默认全部 muted = true
  ↓
5. 若存在上次布局，按 3.1 恢复；否则按 pane 数选 1×2 / 2×2
```

要点：
- **iframe 必须在 PiP 窗口的 document 里创建**（`pipWindow.document.createElement`），不能在原页面创建再搬（搬移会重新加载且可能丢状态）。
- 创建 iframe 用 `pipWindow.document.body` 上的布局容器，不要直接挂 `body`，方便后续加分隔条。
- 现有 `DocPIPWebProvider` 已经负责「请求 PiP 窗口、把 playerEl 挂进去、监听 `pagehide`、keepAlive」，多画面应**复用它拿到的同一个 `pipWindow`**，不要重复 `requestWindow`。

### 3.3 布局与尺寸

- `1×2`：左右各 50%，中间 4px 分隔条。
- `2×2`：先水平两行，再每行两列（用 CSS grid：`grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr`）。
- pane 内 iframe 设 `border:0; width:100%; height:100%`；容器 `display:grid; gap:4px; height:100%`。
- 窄窗口（320 / 480 px）降级为**纵向堆叠**（`grid-template-columns: 1fr`），避免每个画面小到不可用。
- 分隔条拖动：可复用项目已有的拖拽思路（`src/components/DraggerContainer.tsx`）。第一版可先不做拖拽。

### 3.4 pane 模式（**必须做，否则会互相打架**）

因为 pane 内也会被注入本项目脚本，必须让它们进入受限模式，否则会出现：

| 风险 | 症状 | 处理 |
| --- | --- | --- |
| pane 内也显示「打开小窗」入口 | 用户点了会**顶掉宿主小窗** | pane 模式禁用所有 PiP 入口 |
| pane 内也接管键盘 / 媒体会话 | 快捷键乱触发、系统媒体键指向错误画面 | pane 模式标记为「非顶层」，不接管键盘与 Media Session |
| 递归 | pane 里再开 pane | 显式禁止 |
| 悬浮按钮 / 侧栏 干扰 | 每个 pane 都冒出 UI | pane 模式隐藏 |

**标识方式**（本节已于 2026-09-17 修订，早期版本的建议有误）：

正确的做法是**宿主持有权威映射**，帧内标识只作发现提示：

1. **宿主侧 frame→pane 映射**（权威）：宿主保存 `WeakMap<HTMLIFrameElement, PaneId>` 或等价结构，并在**导航后重新绑定**。
2. **握手确认**（授权）：通过 `postMessage` 校验 **origin + source + paneId + 会话代次**，四者都对上才认为该帧是本会话的合法 pane。
3. **`iframe.name`**（提示）：可作快速发现线索，但**不可作为唯一授权依据**。
   实测：`window.name` **能跨同源导航保留**（`location.replace` 后仍为 `PANEMARKER`），但**子页面可以覆盖它**——父页设 `iframe.name='HOSTSET'`、子页设 `window.name='PANEMARKER'` 后，父页读 `f.name` 仍是 `HOSTSET`、读 `contentWindow.name` 已是 `PANEMARKER`。所以它既不可信也不可靠。
4. 跨源跳离目标视频页时，进入**不可控/失败状态**，停止向旧对象发命令，而不是继续发。

> ❌ **不要用 `sessionStorage` 做 pane 标识**（早期版本的错误建议）。
> 实测：同一标签页下的**同源 iframe 与顶层页面共享同一份 sessionStorage**——iframe A 写入 `from-a`，iframe B 和父页都能读到。用通用标志会**串 pane、还会被顶层页面看到**，同时也违反项目「不写站点存储」的原则。

### 3.5 音频（**先设计再写代码**）

实测（默认自动播放策略）结论：

| 操作 | 结果 |
| --- | --- |
| 两路 `muted = true` 后 `play()` | ✅ 两路同时播放，时间轴都前进 |
| **无任何用户手势**时把两路都改为 `muted = false` | ❌ 两路都被暂停（该文档还没有用户激活） |
| **各 pane 内先有一次真实点击**，再解除两路静音 | ✅ **两路 `paused=false, muted=false` 同时出声**（已实测） |

> ⚠️ **修正（2026-09-17）**：早期版本写的「多路不可能同时出声 / 过不了自动播放策略」是**错的**——那只是一次**无用户手势**实验的结果，不能推广成平台限制。
> 事实是：**两路同时出声在技术上可行**（上表第三行实测）。自动播放策略受用户互动、权限委派、媒体参与度等影响，不要写成浏览器绝对限制。

产品规则（**这是产品选择，不是浏览器限制**）：

1. **默认：全部静音并播。** 每个 iframe 加 `allow="autoplay"`。
2. **单路独奏（solo）**：同一时刻只允许一路有声——理由是**听感**（多路同时出声不可用），不是平台禁止。点某路「独奏」→ 先静音旧路，再尝试目标路解除静音/播放。
3. **以真实状态更新 UI**：不要只把 `soloed = true` 就完事，要读回真实的 `muted` / `paused` / `play()` 结果；被拒绝时提供「进入该 pane 点击一次」的引导。
4. 保留 B 站原生音量控件时，必须**监听其 `volumechange`**，处理用户在另一个 pane 里手动开声——否则「唯一有声」约束很快失效。
5. 要区分「站点自身保存的音量偏好」与「宿主临时静音」，避免多个同源页面的偏好同步反复覆盖宿主的决定。

### 3.6 焦点与键盘归属（高风险区）

多画面 + iframe + Document PiP 三者叠加会放大本项目已经踩过的「输入窗口所有权」问题（`refreshInputWindow`）。

必须显式定义：

- **快捷键作用于「当前激活 pane」**，而不是所有 pane。默认激活 pane = pane[0]，点击某 pane 时切换。
- pane 是 iframe，其内部按键默认留在 iframe 内；宿主在 PiP 文档上的 `KeyBinding` 需要定义拦截/冒泡规则，避免「同一个按键既被宿主处理又被 pane 处理」。
- 全局快捷键（播放/暂停、快进、倍速、小窗自适应）建议**只作用于激活 pane**，并在 UI 上标出激活态。
- **任何涉及键盘配置、播放器焦点、Document PiP 输入窗口所有权的改动，交付前必须跑 `node scripts/keyboard-regression.mjs`**（`AGENTS.md` 硬要求）。

### 3.7 资源与降载

每个 pane 是一个完整 B 站页面（实测单页 DOM 约 50 万字符，含独立播放器与 MSE 缓冲），必须做上限与降载：

- pane 数量上限建议 **≤4**（P0 只做 2）。
- **默认两路持续播放**（这正是需求本身），只保留一路有声。
  > ⚠️ 修正（2026-09-17）：早期版本写「非激活 pane 默认暂停」与目标自相矛盾——用户要的就是**同时播放**。
  > 焦点变化**不能偷偷暂停**另一路。省资源必须做成**显式的可选模式**（如「只播放激活画面」），而不是默认行为。
- 可选降载：非激活 pane 降低渲染优先级、暂停其 AI 字幕等重资源任务（**不暂停播放**）。
- 关闭小窗时确保所有 iframe 被移除（移除 iframe 即释放其页面与媒体），不要只做 `display:none`。

---

## 4. 坑清单（症状 → 原因 → 处理）

| # | 症状 | 原因 | 处理 |
| --- | --- | --- | --- |
| 1 | pane 里的视频一片黑/不加载 | 在**原页面**创建 iframe 再搬进 PiP 窗口 | 一律用 `pipWindow.document.createElement` 创建 |
| 2 | 两路都点开声音后**都停了** | 自动播放策略：解除静音需要该文档的用户激活 | 默认静音；用「单路独奏」；不要自动取消静音 |
| 3 | 一点「打开小窗」，刚开的小窗被关掉 | pane 内的本项目入口也能开窗，顶掉了宿主 | pane 模式标识 + 禁用 pane 内所有 PiP 入口（§3.4） |
| 4 | 快捷键同时作用在多个画面 | 键盘监听在 PiP 文档上，未区分 pane | 定义「激活 pane」，快捷键只对它生效（§3.6） |
| 5 | 系统媒体键/播放暂停键指向错误画面 | 多个 pane 都注册 Media Session | pane 模式不注册 Media Session，只由宿主注册 |
| 6 | 开第二个小窗时第一次的被关掉 | 平台单槽位（不是 bug） | 复用现有小窗，不要重复 `requestWindow`；给用户提示 |
| 7 | 打开 4 路后卡顿、风扇狂转 | N 个完整页面 + N 路媒体同时解码 | pane 上限 ≤4；非激活 pane 暂停；关闭即移除 iframe |
| 8 | 关闭小窗后音频还在响 | iframe 只是被隐藏而非移除 | 关闭时 `iframe.remove()`；确认播放停止 |
| 9 | pane 内在站内跳转后失去 pane 模式 | 帧内标识不是权威来源（`window.name` 可被子页覆盖） | 以**宿主侧 frame→pane 映射 + 握手**为准，导航后重新绑定（§3.4）；**不要**用 sessionStorage |
| 10 | 窄窗口下每个画面都看不清 | 固定 1×2 布局 | 依据窗口高宽比与最小可操作尺寸选择布局；允许纵向堆叠，也允许单路放大 |
| 11 | 想直接在小窗里放 B 站流地址，结果 403 | PiP 窗口发出的媒体请求**不带 Referer**，而 CDN 强制校验 | 首选走 iframe（iframe 自带正确 Referer）；自行拉流是**另一条需要单独设计**的路（§6.1） |
| 12 | 画面比例变形、黑边 | iframe 是整页，B 站播放器有自身布局 | 由 pane 尺寸驱动 B 站播放器自适应；**把 pane 收敛到播放器区域是两路最小版本的必要条件，不是后期优化** |

---

## 5. 分期实施与验收

> 实施按项目既有节奏：子 agent 编码、主 agent 审核、定向回归后按 `AGENTS.md` 构建并替换固定 `dist`，由用户实机验收。

### P0 — 最小可用（先验证形态成立）

- 新增「多画面」入口；pane[0] = 当前视频，用户再指定 1 个 B 站链接。
- 在**已打开/新打开的** PiP 窗口内创建两个 iframe，做 1×2 布局。
- 显式设置两路 `muted = true`，验证同时播放。
- 出口：真实 Edge 中一个置顶小窗内两路视频同时播放。

### P1 — pane 模式与音频

- pane 模式与**独立的受限适配入口**（不复用顶层主逻辑）：抑制 pane 内的 PiP 入口、悬浮按钮、键盘接管、Media Session 与递归；宿主侧 frame→pane 映射 + 握手确认（**不用 sessionStorage**，§3.4）。
- 静音 / 独奏控制，**以真实 `muted`/`paused` 状态更新 UI**；`activePane` 与 `audiblePane` 分开。
- 出口：两路并播、一路有声；pane 内不会误触开窗、不会抢键盘。

### P2 — 布局与体验

- 2×2、可拖拽分隔条、布局与 pane 列表持久化、关闭后恢复。
- 窄窗口降级；非激活 pane 暂停。
- 出口：布局可记忆；窄窗口不塌；多路时不明显卡顿。

### P3 — 与本项目能力整合（可选）

- 让 pane 内的字幕/弹幕/进度条/本地 AI 字幕按 pane 独立工作，并治理多路下的资源占用（**AI 字幕是重资源，绝不能每路各加载一份模型**）。
- 出口：多路下 AI 字幕资源可控。

### 代码侧测试清单

| 项 | 覆盖 |
| --- | --- |
| pane 创建/销毁 | 打开 N 路、关单路、关整个小窗后 iframe 被移除、播放停止、监听释放 |
| pane 模式 | pane 内不出现 PiP 入口；不递归开窗；不抢宿主键盘；不注册 Media Session |
| 音频 | 默认全静音；独奏切换正确；切换后其余仍播放 |
| 布局 | 1×2 / 2×2；320/480 px 降级；分隔条拖动后仍可播放 |
| 生命周期 | 切 P / 换视频 / SPA 时 pane 不串号；关闭重开后布局恢复 |
| 回归 | `node scripts/keyboard-regression.mjs` 必须通过 |

### 用户实机验收（不可替代）

1. 一个置顶小窗内两路 B 站视频同时播放，画面与声音符合预期。
2. 两路能各自暂停/播放/拖动进度，互不影响。
3. 静音/独奏切换符合直觉，不会两路同时出声。
4. pane 内不会意外弹出第二个小窗，也不会把当前小窗顶掉。
5. 关闭小窗后无残留播放（音频停止、CPU 回落）。

---

## 6. 不建议走的通路（保留原因，不必细读）

### 6.1 扩展自行拉流在小窗里播 —— 会被 CDN 403 挡住

看起来更「原生」，但第一跳就断：

| 请求 | 结果 |
| --- | --- |
| 带 `Referer: https://www.bilibili.com/…` 请求 B 站流 | **206** ✅ |
| 带 `Referer: https://player.bilibili.com/` / `https://www.bilibili.com/` | **206** ✅ |
| 不带 Referer | **403** ❌ |
| `Referer: https://example.com/` | **403** ❌ |

而 **Document PiP 窗口发出的媒体请求不带 Referer**（本地双服务器实测：同页主文档正常，PiP 窗口为 `None`），因为 PiP 文档 URL 是 `about:blank`。

→ 在小窗里直接建 `<video src="https://upos-….bilivideo.com/….m4s">` 必然 403。
若确实需要（例如将来要做「不显示 B 站页面 UI 的纯净画面」），**不是只有 DNR 一条路**，例如：
① 用 `declarativeNetRequest` 给 `*.bilivideo.com` 注入 `Referer`（有现成先例：[edit-request-headers](https://github.com/gromnitsky/edit-request-headers)）；
② 在一个**真实 B 站源的 iframe 内部**创建 `<video>`（该帧有真实文档 URL，请求自带正确 Referer）；
③ 在**原页面**（而不是 PiP 窗口）取流再交给小窗播放。
无论哪条，都要自行处理清晰度、WBI、DASH 音视频合成、鉴权与弹幕/字幕——工程量接近在小窗里重做一个播放器，**所以首版不选它**。

> 参考：项目已有 `src/core/AiSubtitle/BilibiliAudioSource.ts` 的 `buildBilibiliPlayUrl()`（`fnval=16`，DASH），实测匿名可用（`dash.video` 4 条、`dash.audio` 3 条，匿名上限 360P）。它适合取音频喂识别，**不适合**直接在小窗播放。

### 6.2 嵌入式播放器 iframe（`player.bilibili.com/player.html`）

页面本身允许被嵌入（无 `X-Frame-Options` / `frame-ancestors`），但实测 9 秒内**没有提交文档**（`contentDocument` 为空）。

> 修正（2026-09-17）：早期版本还写了它「没有本项目的注入」——**这是错的**。manifest 的 `matches: ['<all_urls>']` + `all_frames: true` 同样覆盖 `player.bilibili.com`，脚本照样会注入；区别在**跨源 DOM 不可直接控制**、且嵌入式播放器功能受限、没有本项目的播放器接管。
> 结论不变：**首选完整视频页**，此路仅作备选；「9 秒没加载出来」只足以降低优先级，不足以证明不可行。

### 6.3 把其它标签页的 video 元素搬进小窗

**常规情形不可行**：没有窗口引用的普通标签页无法被直接操作 DOM，不同标签页的 JS 也不能互操作。
> 修正（2026-09-17）：早期版本写成「绝对不可访问」，过头了。**若一个窗口是通过 `window.open` 打开且与 opener 同源**，其 `document` 是可以通过窗口引用访问的。
> 但依赖这一点会让方案**取决于用户以何种方式打开标签页**，不适合作为首版方案。结论：**不建议首版依赖跨标签 DOM**，但不必断言平台上任何情形都不可能。

### 6.4 多个小窗（每个放一个视频）

一个浏览器进程只有一个画中画槽位，第二个会顶掉第一个；增强小窗与原生小窗还共用该槽位。**不可行**，原因与实测矩阵见 `./multi-window-feasibility-plan.md`。

---

## 7. 未验证事项（不要对外宣称）

- 未在**真实 macOS Edge** 中验证（本轮为 Chromium，同内核）。
- 未验证**本项目内容脚本在 pane 内的实际运行效果**（`all_frames: true` 是源码事实，运行行为未测）。
- 未验证**长时间多路播放的稳定性**（内存、CPU、MSE 缓冲、发热）。
- 未验证 **4 路（2×2）**，本轮只验证了 2 路。
- 未验证 **B 站登录态下的清晰度表现**（本轮匿名；iframe 方案理论上继承登录态，但未实测）。
- 未验证 pane 内 AI 字幕的资源占用与可行性。

---

## 8. 证据索引

### 实测命令与环境（2026-09-16）

用 Playwright 驱动 Chromium，在真实 `https://www.bilibili.com/video/BV1h54y1L7oe/` 页面打开 Document PiP 窗口，并在窗口内创建两个指向 B 站视频页的 iframe。

**两路同时播放**

```text
f1 BV1xx411c7mD  title=字幕君交流场所_哔哩哔哩_bilibili   videos=1
                 currentTime 10.699 → 16.70   paused=false  readyState=4  duration=2056
f2 BV1uT4y1P7CX  title=【4K60帧】经典老歌…_哔哩哔哩_bilibili videos=1
                 currentTime 10.596 → 16.62   paused=false  readyState=4  duration=213
PiP 窗口内 iframe=2，直接 video=0（视频在各 iframe 内）
媒体源：blob:https://www.bilibili.com/…（B 站自己的 MSE）
```

**同源可访问**：`iframe.contentDocument` 可读，可 `querySelector('video')`、设 `muted`、调 `play()`。

**框架策略**：`curl -D -` 检查 `www.bilibili.com/video/BV...` 与 `player.bilibili.com/player.html`，均无 `X-Frame-Options` / `Content-Security-Policy: frame-ancestors`。

**CDN Referer 强制**

```bash
curl -H 'Referer: https://www.bilibili.com/' -H 'Range: bytes=0-1023' "$STREAM_URL"   # → 206
curl -H 'Range: bytes=0-1023' "$STREAM_URL"                                            # → 403
curl -H 'Referer: https://example.com/' -H 'Range: bytes=0-1023' "$STREAM_URL"         # → 403
```

**PiP 窗口的 Referer 缺失**（本地双服务器记录请求头）

```text
/media-MAIN.mp4   Referer=http://127.0.0.1:8899/    Sec-Fetch-Site=same-site
/media-PIP.mp4    Referer=None                       Sec-Fetch-Site=same-site
```

**自动播放策略**（默认启动参数，未加 `--autoplay-policy`）

```text
两路 muted=true  → play()  → 都在播放（时间轴前进）
两路改为 muted=false       → 两路都被暂停（paused=true）
```

### 本项目内部参考

- `src/manifest.ts`：`all_frames: true` 与 `host_permissions: ['<all_urls>']`
- `src/core/WebProvider/DocPIPWebProvider.ts`：增强小窗打开、把 `playerEl` 挂入 PiP、`pagehide` 清理、keepAlive
- `src/core/WebProvider/CanvasPIPWebProvider.ts`：已有的 canvas 合成能力（将来做「纯净画面」可参考）
- `src/core/AiSubtitle/BilibiliAudioSource.ts`：`buildBilibiliPlayUrl()`（现有 playurl/DASH 能力）
- `src/components/DraggerContainer.tsx`：分隔条/拖拽可复用
- `docs/multi-window-feasibility-plan.md`：为什么不能开多个小窗（背景资料）
- `docs/system-architecture.md` 第 4 节：增强小窗数据与控制流

### 外部参考

- [Document Picture-in-Picture 规范](https://wicg.github.io/document-picture-in-picture/)（PiP 窗口允许包含 iframe，含跨域）
- [Chromium issue 410878537 · 多 PiP 窗口功能请求](https://issues.chromium.org/issues/410878537)
- [edit-request-headers](https://github.com/gromnitsky/edit-request-headers)（DNR 修改 `Referer`，仅 §6.1 需要）
