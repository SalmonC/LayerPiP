# Findings & Decisions

## Requirements

- 设置内提供两种小窗模式切换。
- Document PiP 保留现有功能，UI、图标、字体和动效向 macOS / Edge 原生体验靠拢。
- 原生视频 PiP 显示视频、弹幕与字幕的合成流，复杂设置放在插件设置内。
- 不削减插件的核心功能。
- 原生模式的字幕来源选择需要单独设计和子 agent 审查。
- 功能性验证由用户在真实 Edge / macOS 环境完成；代码侧不新增模拟媒体单测。

## Research Findings

- Edge Document PiP 的系统来源栏不能由扩展 CSS 隐藏。
- 项目已有 CanvasPIPWebProvider，可作为原生视频 PiP 后端基础。
- Canvas 实时流需要额外同步 Media Session 和原视频时间轴。
- 现有字幕菜单支持站点自带字幕、本地 SRT/ASS 和网络字幕；网络字幕已支持 B 站分P与轨道选择。
- SubtitleManager 当前的本地/网络字幕只存在于运行期内存缓存，`reset()` 会清空；原生模式要支持设置页选择，必须新增持久化的来源描述和解析后数据。
- 现有字幕渲染已以 `row-enter` / `row-leave` 和 `activeRows` 跟踪时间，可作为 Canvas 绘制的共享输入。
- UI 设计检索的通用“鲜艳块状”推荐与用户的 macOS / Edge 原生目标冲突，不采用；选择系统字体、中性色、单一强调色、分段控件和渐进披露。
- 原生标题栏闪烁的旧问题要求 Document PiP 内避免 `backdrop-filter` 和持续复合动画，即使视觉上靠近 macOS 也不使用重度毛玻璃。
- 内部再造一条标题栏无法回收 Edge 系统栏高度，只会遮挡视频；对抗审查后不采用。
- B 站网络字幕解析已对重复/非法 `p` 参数、无效/重复 CID、不存在的分P和需登录字幕做显式拒绝，这些防错必须保留。
- 现有 `FLOAT_CAPTION_CORE_CONFIG` 将 `useDocPIP: true` 固化为隐藏不变式，双模式改造需先将其替换为可见枚举，否则保存配置时会被强制改回 Document PiP。
- WebProvider 已根据 `useDocPIP` 在 DocPIPWebProvider 与 CanvasPIPWebProvider 之间分流，选择框架已存在，但 Canvas 模式会切换到 CanvasDanmakuEngine。
- 当前自定义设置面板只有“播放/字幕/弹幕/快捷键”四页，适合在“播放”页顶部加模式分段控件，并在“字幕”页使用条件区域显示原生模式的来源管理。

## Technical Decisions

| Decision                                            | Rationale                                   |
| --------------------------------------------------- | ------------------------------------------- |
| 模式切换存在于设置层                                | 启动 PiP 前可稳定选择后端，避免运行中换窗   |
| 字幕来源应与渲染后端解耦                            | 同一来源策略可同时服务两种模式              |
| 字幕映射的目标键使用 `bilibili:${aid}:${cid}`       | CID 表示实际分P内容，不受 P 序变动影响      |
| 关联 B 视频保存 bvid/aid + sourceCid + 稳定语言标识 | 字幕下载 URL 可过期，运行时应重新 probe     |
| 自动来源不使用上一视频或最后一次字幕                | 防止 SPA 切换和分P变更后字幕串片            |
| 字幕映射与本地文件存 `storage.local` / IndexedDB    | 大体积数据和每视频映射不适合 `storage.sync` |
| 视频目录解析与字幕轨道解析分离                    | 无字幕目标 A 也必须能稳定获得 aid + cid      |
| Document PiP 不增加重复内部标题栏                 | 系统栏不可删，重复栏会遮挡并增加闪烁风险     |

## Issues Encountered

| Issue                                                            | Resolution                                             |
| ---------------------------------------------------------------- | ------------------------------------------------------ |
| 原生 PiP 的 MediaStream 可被识别为直播                           | 设计 Media Session 时间轴桥接并以真实 Edge 验证        |
| 现有 CanvasPIP 无音频轨、完整 seek/play/pause 桥接与有限时长保证 | 将字幕合成与原生媒体控制分阶段验收，原生模式暂不设默认 |

## Resources

- `src/core/WebProvider/CanvasPIPWebProvider.ts`
- `src/core/WebProvider/DocPIPWebProvider.ts`
- `src/core/SubtitleManager/`
- `src/components/FloatCaptionSettings.tsx`

## Visual/Browser Findings

- 目标风格：macOS / Edge 原生小窗，内容优先、控件按需浮现、使用系统字体和克制动效。
