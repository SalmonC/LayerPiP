# LayerPiP 系统架构

> 2026-09-10：已更新本轮涉及的原生合成、媒体控制和故障恢复路径，其他部分保留此前 0.2.6 核对记录。产品要求以 [产品需求](./product-requirements.md) 为准；候选验证范围和未闭合问题见 [文档与架构审查第7节](./architecture-review.md#7-2026-09-10-代码与架构续作)。构建通过不代表 Edge 原生能力已验收。

## 1. 总览

LayerPiP 是 Manifest V3 浏览器扩展。它不复制一套独立播放器状态，而是把 B站页面中的原始 `HTMLVideoElement` 作为唯一媒体真源，在其上接入站点数据、字幕时间轴和弹幕引擎，再选择一种 PiP 表现层。

```text
Bilibili page
  └─ source HTMLVideoElement  ← 唯一播放状态/时间/音量真源
      ├─ Bilibili SiteAdapter
      │   ├─ danmaku source + sender
      │   ├─ subtitle source/binding
      │   └─ route/visibility integration
      ├─ SubtitleManager → SubtitleTimeline → current/history snapshot
      └─ WebProvider factory
          ├─ Document mode → HtmlVideoPlayer → Document PiP DOM
          └─ Native mode   → CanvasVideoPlayer → composite Canvas
                                      → captureStream → video → native PiP
```

## 2. 分层和职责

| 层 | 主要职责 | 代表路径 |
| --- | --- | --- |
| 扩展入口 | Manifest、content script、popup、background 消息 | `src/manifest.ts`, `src/contents/main.ts`, `src/background/` |
| 配置/身份 | 默认值、归一化、存储键、固定 ID | `src/store/config/`, `src/shared/storeKey.ts`, `scripts/afterClean.ts` |
| Provider 编排 | 找到源视频、选择模式、建立/清理会话 | `src/core/WebProvider/` |
| 站点适配 | B站视频/直播身份、弹幕、字幕和 SPA 更新 | `src/web-provider/bilibili/` |
| 字幕领域 | 来源描述、绑定、资产、解析、时间轴与呈现 | `src/core/SubtitleSource/`, `src/core/SubtitleManager/` |
| 播放器表现 | Document PiP UI 或 Canvas 合成流 | `src/core/VideoPlayer/`, `src/components/VideoPlayerV2/`, `src/core/CanvasVideo.ts` |
| 控制桥 | 键盘、后台窗口定位、Media Session、原生 video 事件 | `src/core/KeyBinding.ts`, `src/background/docPIP.ts`, `src/core/WebProvider/NativeMediaSessionBridge.ts` |

依赖方向应保持：入口/Provider 可以组装领域对象；站点适配可以提供数据；字幕领域不应依赖具体 PiP UI；两种渲染器读取同一字幕 snapshot。

## 3. 启动与会话生命周期

### 3.1 打开入口

入口可能来自网页浮动按钮、扩展 popup、右键菜单或扩展命令。`src/contents/main.ts` 最终统一进入 `openPlayer()`：

1. 防止同一时刻重复打开；
2. 每次调用重新执行 provider 工厂，避免复用已关闭会话；
3. 要求可信用户激活；若消息入口没有激活，则在页面显示需要点击的覆盖层；
4. 找到当前主要 video，并建立 provider；
5. 打开成功后报告 `PIP-active`，失败则走同一清理路径。

### 3.2 Provider 状态

概念状态机：

```text
idle → opening → active → closing → idle
          └──────── failure ────────┘
```

`WebProvider.openPlayer()` 在第一次 `await` 之前注册关闭处理。清理顺序覆盖 SiteAdapter、Provider 自身、字幕、预览、事件总线、全局 playerConfig，并根据设置决定是否暂停源视频。`opening` 和 `closing` 用于阻止重入。

### 3.3 B站适配

`getWebProvider()` 在创建 provider 后附加：

- 普通视频：`BilibiliVideoProvider`；
- 直播：`BilibiliLiveProvider`；
- 其他站点：通用回退，不保证产品级验收。

普通视频适配器在初始化时建立 B站字幕管理器、弹幕发送器、上下集切换和预览管理；路由变化后重新读取 aid/cid。异步弹幕加载使用 generation 和 latest-only 语义，字幕管理器也有独立 lifecycle generation，防止旧请求污染新页。

## 4. 模式一：增强小窗（Document PiP）

### 4.1 数据与控制流

```text
source video DOM ──移动──> VideoPlayerV2 inside Document PiP
       │                         ├─ HTML danmaku layer
       │                         ├─ SubtitleText layer
       │                         └─ controls/progress/settings
       └──────────────────────────── direct play/time/volume control
```

当前隐藏核心配置固定使用 `replaceVideoEl`：把原视频节点移入 React 播放器，而不是重新编码视频。优势是画质和音频链最直接；代价是 DOM 所属 document、事件窗口、原网页占位和关闭还原都必须正确处理。

### 4.2 打开顺序

1. 读取上次小窗宽高与位置，按视频适配策略修正；
2. 向 background 发送 `beforeStartPIP`，记录打开前窗口集合；
3. 初始化 `HtmlVideoPlayer`；
4. 请求 `documentPictureInPicture.requestWindow()`；
5. 向 background 发送 `afterStartPIP` 并按策略调整位置/尺寸；
6. 把播放器根节点挂入 PiP document；
7. 绑定 wheel、resize、pagehide、keep-alive；
8. pagehide 时保存窗口几何并清理。

### 4.3 键盘路径

`VideoPlayerV2` 计算视频所在的 `ownerWindow`，`KeyBinding` 在该窗口监听按键，将配置映射成 `PlayerEvent.command_*`。hooks 处理播放、seek、逐帧和倍速；`ResizeButton` 处理 `command_autoResize`。R 还依赖 background 已识别当前 Document PiP 窗口，才能调用扩展窗口 API 调整大小。

这里的主要风险是“React 首次提交”和“视频 DOM 移入 PiP document”的时序。旧项目依赖首次提交发生在迁移后；对同一 video 做额外的更新/重挂载可能删除视频节点或把键盘监听重新绑回原网页。

## 5. 模式二：Edge 原生小窗（合成流）

### 5.1 为什么需要合成

传统 PiP 接收一个 `HTMLVideoElement`，不会自动带上网页 DOM 里的字幕或弹幕。因此当前实现把三类画面先画到 Canvas，再把 Canvas 的 MediaStream 交给一个专用 video 请求原生 PiP。

```text
source video pixels ─┐
danmaku engine ──────┼→ CanvasDanmakuVideo → canvas.captureStream()
subtitle snapshot ───┘                │
                                      ↓
                             pipVideoEl.srcObject
                                      ↓
                           requestPictureInPicture()
```

Canvas 尺寸跟随 `PictureInPictureWindow.resize`。播放时使用 requestAnimationFrame；暂停、seek、resize、字幕/弹幕样式变化触发单帧重画。

### 5.2 为什么媒体控制是另一条链

合成 MediaStream 不等于原视频文件：系统 PiP 看到的是一个捕获流，真实声音仍来自网页源 video。为避免两套时间轴，当前实现把控制桥回源 video：

- `pipVideoEl` 的 play/pause/volumechange 与源 video 双向同步；
- `NativeMediaSessionBridge` 在页面 MAIN world 注册 play、pause、seekbackward、seekforward、seekto；
- 每 750 ms 同步源 video 的 playing、duration、position、playbackRate；
- document_start 的 MAIN world 观察器记录页面 handler 注册；仅在活跃原生会话借用控制，结束时恢复页面最近注册的 handler，不再每次状态同步重注册；
- 直播不注册 seek 动作。

这条“双通道”是高风险区：画面流、网页音频、系统按钮、Media Session 所属 JS world 和 B站自己的 handler 必须保持一致。任何一路单独成功都会产生“画面动但没声音”“按钮有但无效”或“弹幕可见但视频黑屏”等部分失效。

### 5.3 打开和关闭

原生 provider 创建新的 `pipVideoEl` 并独立持有合成 Canvas；弹幕引擎只借用合成器，其初始化失败或重试卸载不停止视频流。媒体控制握手成功后，等待流 metadata，先播放合成 video，再请求 PiP。打开等待有 10 秒截止和 AbortController。源 video 被替换时主动关闭并提示重新打开。关闭时停止监听、Media Session、定时器、PiP、MediaStream tracks，并清空 `srcObject`。

## 6. 字幕来源架构

### 6.1 身份模型

目标身份：`aid + cid + page`，持久绑定主键为：

```text
bilibili:${aid}:${cid}
```

`page` 是面向人的序号，CID 是内容身份。跨视频来源保存 `aid/bvid + sourceCid + sourcePageAtBind + language + offset`。运行时重新读来源目录并按 CID 反查当前 P序；找不到或校验不一致就停止。

### 6.2 选择流程

```text
open settings
  → resolve current URL/catalog → target aid/cid/page
  → read per-target binding
  → select source type
      ├─ current/linked Bilibili → catalog → explicit p or picker → tracks
      ├─ direct URL              → validate HTTP(S)
      ├─ local file              → parse + hash + IndexedDB
      ├─ auto                    → current part first track
      └─ none
  → re-resolve target before save
  → persist binding
  → active BilibiliSubtitleManager reloads
```

网络请求经 background fetch；B站 API 使用当前浏览器登录态。字幕下载 URL 不持久化，因为可能过期。

### 6.3 时间轴和历史

解析后的统一结构是 `{id, startTime, endTime, text, htmlText}`。`SubtitleTimeline` 排序并过滤无效区间；给定任意 `currentTime`，二分找到已开始项目，返回当前重叠行和最近已结束历史。它不维护“已播放事件日志”，因此直接拖动或键盘跳转仍然确定。

`subtitleParagraphs()` 是两种渲染器共享的呈现选择层：增强模式由 `SubtitleText` 渲染 DOM；原生模式由 `CanvasSubtitleRenderer` 绘制 Canvas。

## 7. 状态与存储所有权

| 数据 | 所有者/介质 | 生命周期 |
| --- | --- | --- |
| 播放时间、暂停、音量、时长 | B站源 `HTMLVideoElement` | 页面媒体生命周期 |
| 当前字幕 rows/snapshot | `SubtitleManager` 内存 | 单次 provider/视频生命周期 |
| 当前分P字幕绑定 | `browser.storage.local` 的单条 binding key | 持久 |
| 本地字幕正文 | IndexedDB `layerpip-assets-v1` | 持久，替换绑定时尝试清理旧资产 |
| 用户配置 | 扩展 sync/local 存储，经 configStore 归一化 | 持久 |
| Document PiP 几何 | sync storage | 持久 |
| 原生合成流/Media Session | provider 会话对象 | 打开到关闭 |

设置归一化会强制隐藏核心不变量，并在未显式 opt-in 时把原生合成模式退回增强模式，避免旧配置意外开启实验路径。

## 8. 扩展身份、权限与边界

- Manifest V3，固定 public key；构建后脚本验证生成扩展 ID 等于 `jnonlboihmjeahenhlbkjdijicakfnjj`。
- 新项目使用 `LAYERPIP_*_V1` 存储键、独立 IndexedDB 和 `dist` 产物；旧插件只作为外部回退，不在本架构内升级。
- 当前 Manifest 仍声明 `activeTab`、`storage`、`contextMenus` 和 `<all_urls>` host/content-script 范围。产品主要面向 B站，但源码保留通用视频兼容和背景网络字幕能力；权限是否可收窄应作为安全审阅项。
- content script 运行在隔离 world；需要接管网页 Media Session 时通过受控注入在 MAIN world 建立事件桥。桥只在原生 PiP 会话期间存在，关闭后应撤销 handler。
