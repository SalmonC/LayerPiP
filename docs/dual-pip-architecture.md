# LayerPiP 双 PiP 架构与实施方案

> 历史设计：本文件保留用于追溯，不再作为实施依据。当前审阅入口见 [README.md](./README.md)。

## 1. 目标

LayerPiP 提供两个可在设置中切换的小窗后端，共享同一套字幕、弹幕和播放配置。

1. **增强小窗** (`document`)：使用 Document Picture-in-Picture，保留完整 HTML 操作栏、字幕菜单、弹幕设置和快捷键。
2. **Edge 原生小窗** (`native-composite`)：将视频、弹幕和字幕合成到 Canvas，通过传统 `HTMLVideoElement.requestPictureInPicture()` 交给 Edge 原生窗口。

“不削减功能”定义为能力保留，不强制两个后端的入口位置一致。原生小窗中不能容纳的 HTML 设置转移到插件设置面板。

## 2. 默认值与迁移

- 所有用户均默认 `document`，原生模式在真实 Edge 验收前不自动启用。
- 新增枚举 `pipMode: 'document' | 'native-composite'`。
- 不读取或迁移稳定旧插件的配置；两个扩展拥有独立身份与存储。
- LayerPiP 内部只有 `pipMode === 'native-composite'` 且存在显式 `nativeCompositeOptIn` 标记时才启用原生模式；其他情况全部回落到增强小窗。

## 3. 设置信息架构

### 3.1 播放

顶部使用分段控件选择小窗模式：

- 增强小窗
- Edge 原生小窗

模式仅在下一次打开小窗时生效，不在已打开的窗口中强制换后端。

### 3.2 字幕

字幕页分为：

1. **通用外观**：字号、颜色、透明度、背景透明度，两种模式共享。
2. **原生小窗字幕来源**：显示当前目标视频的 BV/AV、P 序和 CID，并管理来源。

可选来源：

- `auto`：显式映射 → 当前 CID 官方字幕 → 无字幕。
- `current-bilibili`：当前视频当前 CID 的 B 站官方字幕。
- `linked-bilibili`：另一个 B 站视频/分P的官方字幕。
- `direct-url`：SRT、ASS 或 B 站 JSON 文件链接。
- `local-file`：导入并持久化到扩展 IndexedDB 的 SRT/ASS。
- `none`：对当前 CID 明确关闭字幕。

## 4. 字幕来源模型

### 4.1 目标身份

```ts
type BilibiliVideoIdentity = {
  aid: string
  bvid?: string
  cid: string
  page: number
  title?: string
  partTitle?: string
}
```

持久化键为 `bilibili:${aid}:${cid}`。`page` 只用于显示与诊断，不作为内容身份。

### 4.2 来源描述符

```ts
type SubtitleSourceDescriptor =
  | { type: 'auto' }
  | { type: 'current-bilibili'; language?: string; offset: number }
  | {
      type: 'linked-bilibili'
      bvid?: string
      aid?: string
      sourceCid: string
      sourcePageAtBind: number
      language?: string
      offset: number
    }
  | { type: 'direct-url'; url: string; offset: number }
  | {
      type: 'local-file'
      assetId: string
      fileName: string
      format: 'srt' | 'ass'
      contentHash: string
      offset: number
    }
  | { type: 'none' }
```

- 不持久化 B 站 `subtitle_url`，因为该 URL 可过期。
- `linked-bilibili` 每次运行重新读取分P，优先按 `sourceCid` 找回内容。
- CID 仍存在但 P 序改变时可继续；CID 消失时停止并要求重新绑定。

### 4.3 持久化

- 来源映射和验证元数据：`browser.storage.local`。
- 本地文件内容：IndexedDB，元数据仍存 local。
- 外观、模式等小体积全局配置：现有 `DM_MINI_PLAYER_CONFIG`。

## 5. 加载与失败语义

- `auto`：显式映射加载失败时，可回退到当前 CID 官方字幕；仍失败则无字幕。
- 用户明确选择的 `current-bilibili` / `linked-bilibili` / `direct-url` / `local-file`：加载失败时 fail closed，不偷换来源。
- 禁止使用上一视频、上一分P或最后一次字幕作为回退。
- SPA 换视频/换P时通过 generation 或 AbortController 废弃旧请求。

## 6. 原生合成流

```text
B站 video element
       │
       ├─ video frame
       ├─ danmaku engine state
       └─ subtitle active rows
               │
               ▼
      CompositeCanvasRenderer
      video → danmaku → subtitle
               │
               ▼
       canvas.captureStream()
               │
               ▼
      hidden HTMLVideoElement
               │
               ▼
  requestPictureInPicture()
```

- 原视频是播放、音频和时间轴唯一真实源。
- PiP 用 video 只承载合成画面并保持静音，避免双重音频。
- 尝试用 Media Session 桥接 play/pause/seek/position；必须在 Edge 真机确认 MediaStream 是否显示有限时长可拖拽进度。
- 原生进度不可用不影响字幕合成成功，但在 UI 中显示为“受 Edge 限制”而不伪装成完整可用。

## 7. Canvas 渲染约束

- 不再通过运行时 monkey patch `drawCanvas`，收敛为单一 `CompositeCanvasRenderer`。
- 每帧顺序固定为 video → danmaku → subtitle。
- 字幕使用 `SubtitleManager.activeRows`，并共享字号、颜色、透明度、背景和安全区配置。
- 流和 RAF 只创建一次；关闭后 stop 所有 tracks，撤销监听和定时器。
- 对 `drawImage` / `captureStream` 的跨源失败给出明确的增强小窗回退入口。

## 8. UI 设计约束

- 字体：`-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`。
- 风格：中性暗色表面、单一蓝色强调、8px 节奏、圆角克制、内容优先。
- 动效：160–220ms，使用 opacity/transform，支持 `prefers-reduced-motion`。
- 按钮使用一致 SVG 图标、可见 focus ring 和扩大命中区。
- Document PiP 中不使用 `backdrop-filter`，避免 macOS Edge 原生标题栏重绘闪烁。

## 9. 分段实施与验收

### A. 配置与架构

- `pipMode` 枚举、迁移与设置分段控件。
- 保留增强小窗默认行为。

### B. 字幕来源

- target CID 身份、SourceDescriptor、local repository。
- 当前官方、关联 B 视频、直接 URL、本地文件和关闭。
- 保留分P严格校验与 fail-closed。

### C. 原生合成

- CanvasSubtitleRenderer 和 CompositeCanvasRenderer。
- Media Session / 原视频播放状态桥接。
- Edge 原生 PiP 资源清理与失败回退。

### D. 增强小窗 UI

- 统一令牌、图标、字体、动效和信息层级。
- 保留现有功能矩阵和进度条交互。

### E. 静态验证

- 不新增模拟媒体行为的单元测试。
- 不删除与本功能无关的既有测试。
- 执行目标文件的 lint/format/type 检查和生产构建。
- 真实 Edge 中的播放、音频、seek、分P、字幕对齐和性能由用户验收。
