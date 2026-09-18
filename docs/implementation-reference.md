# LayerPiP 实现参考

本文按运行时职责索引 `0.2.6` 工作树候选源码，2026-09-10 更新本轮修改的路径。未涉及部分沿用此前记录。路径均相对项目根目录；验证范围见 architecture-review.md 第7节。

## 1. 入口与组装

### `src/manifest.ts`

- 定义 MV3 权限、host 权限、content scripts、popup、background、命令和固定签名 key。
- 命令包括后退、前进和播放/暂停，由 background 转发给当前 PiP 会话。

### `src/contents/main.ts`

- 顶层 frame 承担主要入口、设置面板和 PiP provider 创建；iframe 分支上报视频状态并代理跨 frame 消息。
- `openPlayer()` 每次获取新 provider，使用 `isWaiting` 防重复，并处理可信用户激活覆盖层。
- `window.openSettingPanel()` 在 shadow DOM 中挂载设置 UI；样式加载失败有内联回退，关闭时恢复焦点。

### `src/web-provider/getWebProvider.ts`

- 按 `configStore.pipMode` 创建 `DocPIPWebProvider` 或 `CanvasPIPWebProvider`。
- 按 URL 附加 B站视频/直播 SiteAdapter。
- 仍保留通用/替换渲染兼容分支，但 LayerPiP 的隐藏配置缩小了正常产品路径。

## 2. 配置、存储和项目身份

### `src/store/config/layerPip.ts`

- `LAYER_PIP_CORE_CONFIG` 是生产路径隐藏不变量：Document 模式使用原 video 替换渲染、保留 HTML 弹幕等。
- `LAYER_PIP_DEFAULT_CONFIG` 包含模式、原生 opt-in、浮动入口、暂停策略、弹幕/字幕字号、自动缩放、历史字幕等默认值。
- `normalizeLayerPipConfig()` 强制核心不变量、清理旧 `useDocPIP`，并把未 opt-in 的 native 模式退回 document。
- 历史段数最终限制为 1–5；底层 timeline 也防御性接受 0–5。

### `src/store/config/index.tsx`

- 配置以 MobX observable 暴露；设置保存会先归一化，再写入扩展存储。
- 每个 document 保持一次配置订阅，包括隐藏的源页；收到远端变化只更新内存，不重新保存。订阅取消幂等，并忽略取消后或新事件之后迟到的初始读取。

### `src/shared/storeKey.ts`

关键键包括 `LAYERPIP_CONFIG_V1`、`LAYERPIP_WINDOW_CONFIG_V1`、`LAYERPIP_LOCALE_V1`、`LAYERPIP_DANMAKU_VISIBLE_V1` 和单条字幕绑定前缀。旧聚合字幕绑定键只用于迁移读取。

### `PROJECT_IDENTITY.md` 与 `scripts/afterClean.ts`

- `PROJECT_IDENTITY.md` 是身份、回退资产和存储隔离的权威记录。
- `afterClean.ts` 从 Manifest key 计算 Chrome/Edge 扩展 ID，构建时不匹配则失败，并把许可证和使用说明复制进产物。

## 3. B站身份与分P防错

### `src/web-provider/bilibili/video/networkSubtitle.ts`

关键函数：

- `parseBilibiliVideoUrl()`：只接受 B站 BV/av 视频 URL；读取唯一 `p`；重复或非正整数 `p` 直接拒绝。
- `readBilibiliVideoCatalog()`：调用 `/x/web-interface/view`，得到 aid/bvid 和 pages。
- `parseBilibiliPages()`：验证 page/cid 非空、有效且不重复。
- `probeBilibiliNetworkSubtitle()`：手动选择优先于 URL 显式 P，两者皆无时默认 P1。无字幕返回空轨道并保留分P目录，便于改选。按 aid+cid 请求 `/x/player/wbi/v2`，规范化轨道 URL；需登录或无轨道时给出明确错误。

### `src/core/SubtitleSource/bilibili.ts`

- `resolveCurrentBilibiliIdentity()`：当前 URL 未显式 P 时按 P1；若目标不存在则停止。
- `resolveBilibiliTrackByCid()`：跨视频绑定重载时从最新目录查同一 `sourceCid`，再 probe 并二次核对 CID。
- `selectTrack()`：按稳定语言标识选轨；轨道消失不悄悄换另一语言。

### `src/core/SubtitleSource/types.ts`

- `BilibiliVideoIdentity`：目标 aid/bvid/cid/page。
- `SubtitleSourceDescriptor`：`auto`、`current-bilibili`、`linked-bilibili`、`direct-url`、`local-file`、`none` 的判别联合。
- `SubtitleSourceBinding`：target + source + updatedAt。

### `src/core/SubtitleSource/repository.ts`

- `subtitleTargetKey()` 生成 `bilibili:${aid}:${cid}`。
- 新数据按 `LAYERPIP_BINDING:${targetKey}` 单条写入 local storage；读取时兼容旧聚合 map。
- 删除时同时清理新旧位置；storage change listener 只关注单条新键。

## 4. 字幕文件、解析和时间偏移

### `src/core/SubtitleSource/assets.ts` 与 `src/background/subtitleAssets.ts`

- 本地文件只接受 SRT/ASS；读取文本后算 SHA-256，生成 UUID，通过 background 写入 IndexedDB。
- binding 保存 assetId、文件名、格式和内容哈希；加载时重新核对哈希。

### `src/core/SubtitleManager/networkSubtitle.ts`

- HTTP(S) 直链最多 10 MiB。
- 按扩展名或内容特征解析 SRT、ASS、B站 JSON。
- 丢弃无效时间区间，按 startTime 排序。
- `applyNetworkSubtitleOffset()` 使用 `targetTime = sourceTime - offset`，并裁掉偏移后不再有效的区间。

### `src/core/SubtitleManager/index.ts`

`SubtitleManager` 负责：

- 字幕项和解析结果缓存；
- 源 video 事件绑定；
- 当前/历史 snapshot；
- 翻译模式；
- lifecycle generation 与 track generation；
- `reset()`、`resetSubtitleState()` 和 unload。

video 监听 `timeupdate`、`seeking`、`seeked`。snapshot 只有引用集合变化时才更新，row-enter/leave 供其他渲染逻辑使用。

### `src/web-provider/bilibili/video/SubtitleManager.ts`

`BilibiliSubtitleManager` 首先读取当前 B站自带字幕列表，再加载当前 CID 的持久来源：

- `auto` 没有字幕时安静返回；
- 显式来源失败则抛出，让用户知道绑定需要修复；
- linked B站按来源 CID；
- direct URL 下载文本；
- local file 从 IndexedDB 读取并校验；
- current/auto 要求 probe 的 selectedCid 与目标 CID 一致。

## 5. 字幕历史与两种渲染器

### `src/core/SubtitleManager/SubtitleTimeline.ts`

- 构造时过滤空文本、非有限时间和 `end <= start`，再按开始时间排序。
- `at(time, historyLimit)` 对开始时间做二分，再反向扫描收集当前重叠行；`maximumEnd` 前缀数组在更早项目均结束时提前停止。
- 2026-09-09 审查修正：独立维护按结束时间排序的索引，二分取得最近已结束历史，避免长区间较早开始却较晚结束时被遗漏。重叠/回退/结尾历史短检查已通过，尚未实机验收。
- 结果只取决于 `rows + time`，所以 seek 安全。

### `src/core/SubtitleManager/presentation.ts`

`subtitleParagraphs()` 把 snapshot 转为 `{row, history}` 列表；历史开关关闭时只返回当前字幕。

### `src/components/VideoPlayer/subtitle/SubtitleText.tsx`

- Document 模式 DOM 渲染。
- 当前字幕使用完整不透明度，历史字号约 90%、不透明度约 70%。
- `ResizeObserver` 控制历史总高度不超过播放器 35%；从旧到新隐藏溢出历史，给无当前字幕的时刻保留底部基线空间。

### `src/core/SubtitleManager/CanvasSubtitleRenderer.ts`

- 原生模式 Canvas 渲染。
- 按字符测量自动换行；从下往上绘制，使用同一 35% 历史区域限制。
- 字号自动缩放、字体、颜色、背景和透明度读取共享 configStore。

## 6. B站站点适配器

### `src/web-provider/bilibili/video/index.ts`

- 创建 B站字幕、弹幕发送、上下集切换、预览。
- 读取当前 aid/cid，异步获取弹幕并用 generation + latest-only 防止旧结果回写。
- 监听路由变化和字幕 binding storage 变化；当前绑定变化时重建字幕状态。
- 暂时注入 visibilitychange 屏蔽逻辑，unload 时恢复。

### `src/web-provider/bilibili/live.tsx`

- 标记 live，建立发送器和 websocket 弹幕客户端；关闭时释放。
- 直播没有 seek，原生 Media Session 不注册 seek handler。

## 7. Document PiP 实现

### `src/core/WebProvider/DocPIPWebProvider.ts`

- 读取/保存 `PIP_WINDOW_CONFIG`；处理 DPR、边框和上次位置。
- 在 `miniPlayer.init()` 前发送 `beforeStartPIP`，请求窗口后发送 `afterStartPIP`。
- 将 `playerRootEl` 移入 PiP document；注入最小根样式。
- Ctrl+滚轮按角落锚点缩放；pagehide 保存几何、发出 close 并通知 background。
- 每秒 keep-alive，关闭后取消。

### `src/core/VideoPlayer/HtmlVideoPlayer.tsx`

- 按 render mode 创建 `VideoPlayerV2`；当前正常配置走 `replaceVideoEl`。
- 保存并在关闭时恢复原 video DOM 位置/样式。
- 仍包含 captureStream、displayMedia、tabCapture、WebRTC 等继承分支；不在当前核心产品路径，应由审阅者评估维护成本。

### `src/components/VideoPlayerV2/`

- `index.tsx`：播放器上下文、video DOM、控制层、字幕和弹幕组件。
- `context.ts`：共享 `KeyBinding`、eventBus、webVideo、keydownWindow。
- `hooks.ts`：播放切换、5秒 seek、逐帧、长按倍速、video 事件。
- `bottomPanel/ResizeButton.tsx`：按钮和 `command_autoResize`，按 videoWidth/videoHeight 请求小窗 resize。
- `bottomPanel/PlayerProgressBar.tsx/.less`：进度操作、扩大命中区、hover/seeking 加粗和居中 handle；窗口级释放逻辑需重点复核。

### `src/core/KeyBinding.ts`

- 从可见快捷键配置生成 key→command map；支持 keydown、keyup、长按及释放。
- 输入框、textarea、select、button 和 contenteditable 不截获。
- `updateKeydownWindow()` 会清理旧监听并绑定新的 owner window。

### `src/background/docPIP.ts`

- 通过打开前后窗口差异定位 Document PiP 扩展窗口，并处理 resize/move。
- 这是 R 自适配与程序化几何调整能否生效的后台依赖。

## 8. 原生合成 PiP 实现

### `src/core/WebProvider/CanvasPIPWebProvider.ts`

- 创建专用 `pipVideoEl`，设置 `srcObject` 为合成 Canvas stream。
- 打开流程带 AbortController 和 10 秒 deadline；等待 metadata、播放流、请求 PiP。
- PiP resize 时更新合成 Canvas 尺寸。
- 源 video 更换时关闭当前 PiP，避免绑定错误播放器。
- 双向桥接 play/pause/volume；seek 和播放动作最终都作用于源 video。
- 关闭时停止 PiP、流轨、timer、事件和 Media Session。

### `src/core/VideoPlayer/CanvasVideoPlayer.tsx`

保留 VideoPlayerBase 生命周期，不再要求弹幕引擎初始化成功。合成器由 CanvasPIPWebProvider 创建和释放，CanvasDanmakuEngine 通过 useComposite 借用；引擎卸载不释放外部合成器。

### `src/core/danmaku/DanmakuEngine/canvasDanmaku/CanvasDanmakuVideo.ts`

- 继承 `CanvasVideo`，按顺序绘制源视频、弹幕、字幕。
- `ResizeObserver` 跟随容器；subtitle snapshot/配置变化重画；弹幕视觉配置变化强制重建现有弹幕再重画。

### `src/core/CanvasVideo.ts`

- 负责等比尺寸、DPR canvas、requestAnimationFrame、暂停态单帧 redraw 和 `captureStream()`。
- metadata、play、pause、seeked、loadeddata 驱动尺寸或绘制。
- dispose 停止 rAF、stream tracks、监听和 canvas。

### `src/core/WebProvider/NativeMediaSessionBridge.ts`

- content script 生成每会话唯一 channel。
- document_start 的 `src/inject/nativeMediaSession.ts` 在 B站 MAIN world 安装页面 handler 观察器；会话以 CustomEvent 请求借用控制，必须收到成功握手。
- MAIN world 用 CustomEvent 把 action 送回隔离 world；隔离 world 把源 video 状态送回 MAIN world。
- state 同步只更新播放和位置；stop 恢复被借用动作的页面最新 handler。观察器持续到 document 结束，实际控制借用仅限原生会话。
- 未安装早期观察器、方法被未知控制器替换或握手失败时，拒绝本次接管并清理。该机制仍需真实 Edge 的系统按钮与页面控制回归验收。

## 9. 设置和 popup

### `src/components/LayerPipSettings.tsx`

- 播放、字幕、弹幕、快捷键四页；模式分段控件在播放页。
- 字幕页包含历史开关/段数、来源设置、字号、透明度和颜色。
- 设置面板有 modal 语义、焦点循环和关闭按钮。
- 字幕/弹幕页提供持续可访问的错误与重试入口。`AddonRecovery` 只维护运行时状态，以会话代次拒绝旧重试结果；不添加存储键。
- 增强小窗的 `AddonBoundary` 分别包裹字幕和弹幕，渲染失败只卸载对应层；重试或源视频改变后重新挂载，源 video 在边界之外。

### `src/components/NativeSubtitleSourceSettings.tsx`

- 打开时识别当前 aid/cid/page 并读取 binding。
- 网络 probe 用递增 requestId 忽略迟到结果。
- 保存前重新识别目标，防止设置打开期间页面切换。
- `commitSource.ts` 在资产准备之后再次核验目标；绑定写入失败时先回读，已提交的新资产不得回滚，无法确认时保留文件并提示检查。
- 确认未引用的新资产可回滚；旧资产清理失败单独提示，不误报保存失败。现有本地来源修改偏移不要求重新上传。

### `src/popup/index.tsx`

- 不再挂载即打开；用户显式选择“打开小窗”或“设置”。
- 只允许 B站主机，消息有 15 秒超时和错误映射。

## 10. UI 样式

- `src/style/bilibiliSurfaces.css`：popup、设置和网页入口的 B站化表面。
- `src/style/layerpip.css`：LayerPiP 主题和布局覆写。
- `src/style/modernPlayer.css`：播放器控制层现代化样式。
- `PlayerProgressBar.less`：进度条交互细节。

样式层不能修改 Edge/macOS 管理的原生 PiP 系统 chrome。任何“移除系统标题栏”的需求必须先区分 Document PiP 网页内容与系统窗口装饰。
