# Findings & Decisions

## 2026-09-16 单窗口多视频可行，关键路径是 iframe 而非自行拉流

目标确认为「多个视频在同一个增强小窗里同时播放」（而非多个小窗）。实测在一个 Document PiP 窗口内嵌两个真实 B 站视频页 iframe，两路同时播放成功（6 秒内分别推进到 16.70 / 16.62 秒）。三个关键性质：PiP 文档继承 opener 源，与 `www.bilibili.com` iframe **同源**，可直接操作其 `video`；project manifest 的三个主内容脚本本就是 `all_frames: true`，pane 天然被注入；B 站视频页与 `player.bilibili.com` 均无框架限制头。

**决定性陷阱**：Document PiP 窗口发出的媒体请求 **不带 Referer**（实测 PiP 内 `Referer=None`，同页主文档为正常 Referer），而 B 站 CDN 强制校验 Referer（`*.bilibili.com` → 206，缺失或错误 → 403）。因此「用项目已有 playurl 能力自行拉流、在小窗里直接建 video」这条路会被 CDN 挡住，除非用 declarativeNetRequest 注入 Referer。**结论：走 iframe 分屏**——它天然继承 B 站源、登录态与原生播放器能力，工程量也小得多。

另一约束：默认自动播放策略下多路只能**静音并播**；解除静音需该文档有用户激活（实测两路同时取消静音会被暂停）。故默认策略应为「全部静音 + 单路独奏」。详见 `docs/multi-video-single-window-plan.md`。

## 2026-09-16 画中画槽位是进程级单例（多小窗的硬限制）

平台层面：一个浏览器进程只有**一个**画中画槽位。规范 §6.5 强制「每个 top-level traversable 最多一个小窗」，并明确跨 traversable 是否允许并存由实现决定；Chromium 选择关闭已有窗口，其 `DocumentPictureInPictureWindowControllerImpl` 还是 per-WebContents 的 `WebContentsUserData` 且只持有单个 `window_`。真实 Chromium 对照实测确认：同进程第二个标签页开小窗会关闭第一个；Document PiP 与视频 PiP 互相顶掉；同进程多 context 仍只有一个；只有**不同浏览器实例**才各自独立。

由此，现有 background 的单例 `docPIPTabId` 与 `LAYERPIP_WINDOW_CONFIG_V1` 不需要为多窗口改造——它们本就对应唯一槽位。但 `closePIP` 无条件清空 tabId 在跨标签页开窗时存在竞态缺陷（会把后开窗者的 id 清掉，移动/缩放退化为按宽度猜测）。

另一条可复用的平台能力：Document PiP 窗口可容纳多个 `video` 元素与 iframe（已实测），这是「单窗口多画面」方案的基础。完整取证、替代方案与分期见 `docs/multi-window-feasibility-plan.md`。

**方法学陷阱（重要）**：无头 Chromium 无法用于验证 PiP 并发/生命周期——同样的用例在无头下会错误显示「多个小窗可同时存在」。此类验证必须用 headed 真实浏览器。

## 2026-09-16 高能进度条数据链路纠偏

`player-ui-and-ai-continuity-plan.md` 第 3 节记录的「`bvc.bilivideo.com/pbp/data` 与 `api.bilibili.com/pbp/data` 均返回 404，不能确认接口可用」是**请求写法缺失**导致，不是接口下线：官方取数必须带查询参数 `r=loader`，且 `withCredentials:false`。补齐后匿名即可取得完整曲线（实测 `BV1GJ411x7h7`：`step_sec=9`、95 个点）。

同时确认热力条的定义与结构：曲线 = 单位时间弹幕密度（官方接口字段 + 独立实现「前方高能」佐证），「已看变蓝」是同一形状用主题色叠加裁剪到已看区间，已看区间为本地 IndexedDB `pbp3` / `pbpZebraCache`（按 cid、比例区间、30 天过期）。因此「双色已看」与「曲线」是两层，前者不依赖曲线数据。完整取证与方案见 `docs/high-energy-progress-bar-plan.md`。

## 默认P规则纠偏

此前把“来源链接无 p”作为未明确例外是不必要的保留，现按用户明确要求统一默认 P1。保留 CID 绑定和生命周期防护，其目的与 URL 默认值独立。新证据见 docs/architecture-review.md 第8节。

## 2026-09-10 代码证据更新

媒体控制归还采用早期页面注册观察及会话借用；基础合成由 provider 独立拥有。相关路径已做隔离验证，不能据此宣称原生全部能力达标。另确认字幕来源保存存在资产与绑定失败语义不一致，下一步用临时存储复现和修复。权威状态见 docs/architecture-review.md 第7节。

## 19:30 代码证据更新

SubtitleManager.init 已捕获加载错误，应纠正文档阶段对其向上抛错的怀疑；实际已确认问题为历史结束排序、Canvas 附加异常阻断绘制、运行弹幕清理及异常关闭暂停偏好。详细证据与尚未解决项以 docs/architecture-review.md 第6节为准。

## 2026-09-09 用户反馈后的文档审查

需求以 docs/product-requirements.md 为唯一意图源；结论和上游固定提交链接见 docs/architecture-review.md。保留历史字幕，不将无 p 默认 P1 当作缺陷；原生全部能力、附加功能隔离和页面控制恢复是硬要求。旧历史中的原生能力让步、粉色播放器选中态及自然 React 提交时序不能继续充当现行依据。本轮未验证本项目源码缺陷。

## 2026-09-09 审阅资料包策略

- 现有 `docs/learning-player-architecture.md` 是此前阶段的设计决策，但部分表述已落后于 0.2.5 实现；`docs/dual-pip-architecture.md` 已自称历史，`docs/boundary-and-visual-design.md` 是边界专项记录。不能让审阅者把三份都当成同等权威来源。
- 新资料包需要以源码为事实源，使用一个入口索引明确“当前权威文档 / 历史设计 / 运行日志”的层级；关键结论必须引用仓库相对路径和实际符号名。
- 文档应明确区分：已实现、静态检查通过、已由用户实机观察、尚未实机验证、已知仍有问题。生产构建成功不能写成运行时功能已确认。
- 身份与交付事实沿用 `PROJECT_IDENTITY.md`：独立固定扩展 ID、独立存储命名空间和旧插件回滚包；文档不能触碰或迁移旧 FloatCaption。
- 审阅资料按“需求 → 架构 → 实现 → 边界/验证 → 审阅任务”组织，避免让后续 agent 从聊天记录重建上下文。

## 2026-09-09 保存刷新根因

历史快捷开关保存全量配置；onSave 对存在 language 的快照无条件 reload。并非空字幕渲染导致崩溃。已移除保存导航行为，存储失败提示但不中断播放器。具体边界、已处理与残余风险见 `docs/boundary-and-visual-design.md`。视觉以 B 站/BewlyCat 的排版层次为参考，保留独立名称和扩展 key。

## 当前结论（2026-09-08）

权威设计见 `docs/learning-player-architecture.md`。以下旧研究中的“按事件累积字幕”“按后端显示来源设置”和动态窗口装配已被本轮设计取代。当前字幕显示按任意播放时间查询完整轨道，不依赖是否实际播放过；来源设置对两种后端一致。保留解析器、弹幕算法和核心控件，重写状态与装配边界。共享事件总线仍为兼容设施，订阅清理由各实例负责。

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
| 视频目录解析与字幕轨道解析分离                      | 无字幕目标 A 也必须能稳定获得 aid + cid     |
| Document PiP 不增加重复内部标题栏                   | 系统栏不可删，重复栏会遮挡并增加闪烁风险    |

## Issues Encountered

| Issue                                                            | Resolution                                             |
| ---------------------------------------------------------------- | ------------------------------------------------------ |
| 原生 PiP 的 MediaStream 可被识别为直播                           | 设计 Media Session 时间轴桥接并以真实 Edge 验证        |
| 现有 CanvasPIP 无音频轨、完整 seek/play/pause 桥接与有限时长保证 | 将字幕合成与原生媒体控制分阶段验收，原生模式暂不设默认 |

## Resources

- `src/core/WebProvider/CanvasPIPWebProvider.ts`
- `src/core/WebProvider/DocPIPWebProvider.ts`
- `src/core/SubtitleManager/`
- `src/components/LayerPipSettings.tsx`

## Visual/Browser Findings

- 目标风格：macOS / Edge 原生小窗，内容优先、控件按需浮现、使用系统字体和克制动效。

# 2026-09-09 小窗交互回归

- 原生 PiP 的 `MediaSession` action handler 当前由 content script 注册；Edge 原生小窗操作由页面主环境的媒体会话承接，隔离环境注册不可靠且可能被 B 站覆盖。需要在 MAIN world 建立只在小窗存续期间启用的事件桥。
- 原生合成视频固定 `muted=true`，而音频实际仍由网页源视频播放，因此原生静音按钮没有同步对象。需要在 PiP 打开后双向同步合成视频与源视频的 `muted/volume`。
- 增强小窗在 React 播放器初始化后才把播放器 DOM 移入 Document PiP，键盘监听窗口仍指向原网页；迁移后必须重新运行视频上下文绑定。
- 控制栏使用 `:focus-within` 保持显示，鼠标点击后焦点残留会让它永不收起；进度条 `.is-seeking` 只依赖组件回调清除，窗口级 `pointerup/pointercancel/blur` 缺失。
- 弹幕字号 getter 是动态的，但 Canvas 画面在暂停或既有弹幕实例存续时缺少显式重建，配置变化需要触发一次 Canvas 弹幕重渲染。
- popup 打开即自动发起小窗请求，并同时允许点击设置；两个动作竞争导致设置入口表现为无效。改为用户显式点击打开，并删除 popup/footer 与设置页中的无意义声明。
- `HtmlVideoPlayer` 的 React handle 仅保存在 `renderReactVideoPlayer()` 局部变量中，外部 provider 无法在 DOM 跨 document 后要求其重新计算 `ownerWindow(video)`；应提升为类字段并提供窄接口 `refreshInputWindow()`。
- Canvas 重绘设施已经支持暂停态单帧重画；弹幕外观变更只需观察实际影响布局/绘制的配置，重置当前弹幕实例并调用 `redraw()`，无需增加测试框架或重写渲染循环。
- 弹窗 `useAction(..., true)` 与挂载即 `startPIP()` 使初始状态永久表现为“正在打开”，并让设置请求与小窗请求并发；去掉自动执行后设置按钮可走独立消息通道。
- `PlayerProgressBar` 自身也随播放器 DOM 一起跨 document；窗口级释放监听必须以当前 `ownerDocument` 为依赖重新绑定，不能只在初次挂载时绑定原网页。
- 产物中的 MAIN-world 媒体桥函数已回读，打包后只引用函数参数和 Web API，没有引用 content bundle 闭包；扩展清单仍使用固定 key，生成版本为 0.2.3。

## 2026-09-09 增强小窗黑屏

- `DocPIPWebProvider` 将播放器 DOM 移入小窗后调用 `refreshInputWindow()`；该方法复用了播放器 handle 的 `updateVideo(同一 video)`。
- `VideoPlayerV2.updateVideo()` 在 `videoRef.current` 已位于播放器中时会先删除旧节点，但未判断新旧参数是否为同一个对象。传入同一对象时，节点被删除后仅更新引用，不会触发依赖身份变化，因此视频层永久缺失；弹幕层独立存在，所以仍可见。
- 最小且通用的修复是在 `updateVideo()` 增加同一对象幂等分支：直接执行上下文刷新并返回。真实换源仍沿用先移除旧节点的原逻辑。

## 2026-09-09 与稳定旧项目的键盘链对比

- 稳定提交 `f7efb70` 的 `DocPIPWebProvider` 在播放器 DOM 迁入后不会再次调用播放器 handle；`HtmlVideoPlayer` 也没有 `refreshInputWindow()`。
- 原实现依靠 `createRoot.render()` 的首次 React 提交在 Document PiP DOM 迁移后完成，`updateVideoRef()` 首次计算 `ownerWindow(video)` 时直接得到小窗窗口。新加的二次刷新改变了这条已经实机验证的时序。
- R 自适应并非缺失：默认配置已有 `shortcut_autoResize = R`，`KeyBinding` 会发出 `command_autoResize`，`ResizeButton` 已订阅并按视频宽高比调用窗口 resize。需要修的是共同的键盘入口，并在精简设置中显示该快捷键。
- 新项目还删除了稳定旧项目在 `miniPlayer.init()` 前发送的 `beforeStartPIP`。后台依赖它比较打开前后的无 favicon 窗口并记录 Document PiP tab；缺少此步骤时，R/自适应按钮发出的 resize 请求无法稳定定位目标窗口。必须按原位置恢复。

# 2026-09-09 审阅资料包策略

- 现有文档同时包含早期双模式方案、后续边界专项和当前架构说明，部分实现名、默认值与 0.2.5 源码不一致；新建 `docs/README.md` 作为唯一审阅入口，并明确历史文档不代表当前状态。
- 当前实现事实以源码、`package.json`、Manifest 和构建脚本为准；用户实机现象与候选修复必须分开记录，不能把“代码已改”写成“功能已验证”。
- 身份事实由 `PROJECT_IDENTITY.md` 负责：固定扩展 ID、独立存储命名空间、独立 IndexedDB 和独立产物目录；审阅资料只引用，不重复设备专属绝对路径。
- 审阅资料按产品需求、系统架构、实现索引、边界与审阅清单组织；历史设计稿保留用于追溯，但标记为非权威。

## 字幕链路的源码事实

- 目标视频按 `aid + cid` 识别；绑定键为 `bilibili:${aid}:${cid}`，因此不同分P不会共享同一条绑定。
- B站来源链接若带唯一合法 `p` 参数就直接选该分P；不带 `p` 时只返回目录并要求显式选择；重复、非法或不存在的 `p` 会停止加载。
- 跨视频绑定保存来源 `sourceCid`，重新加载时先从最新目录按 CID 反查分P，再校验解析结果仍是同一 CID，避免来源分P重排后串轨。
- 支持 `auto`、当前视频官方字幕、另一B站视频、HTTP(S)字幕直链、本地 SRT/ASS、关闭六类来源；本地正文进入扩展 IndexedDB，绑定只保存资产元数据和哈希。
- 直链/本地解析接受 SRT、ASS、B站字幕 JSON；网络正文上限 10 MiB；时间偏移采用 `显示时间 = 来源时间 - offset`。
- `SubtitleTimeline` 由当前 `video.currentTime` 纯计算当前字幕和最近历史，因此 seek 不依赖先前播放事件；历史段数归一化为 0–5，呈现层配置为 1–5。
- 文档模式和 Canvas 合成模式共享 `subtitleParagraphs`；两者都把历史区域限制在播放器高度约 35%，优先保留当前字幕并从较旧历史开始裁掉。
- 字幕管理器用 lifecycle generation / track generation 丢弃页面切换或轨道切换后的迟到异步结果；空字幕保持隐藏，不应成为小窗生命周期异常。

## 双小窗与输入链路的源码事实

- 增强小窗使用 Document Picture-in-Picture：初始化 React 播放器、记录打开前窗口集合、请求小窗、把播放器根节点迁入新 document，并在 `pagehide` 统一关闭、保存尺寸与位置、还原页面标题。
- 增强小窗生产默认直接迁移原 `HTMLVideoElement`，字幕和 HTML 弹幕是同一播放器中的独立覆盖层；键盘监听窗口由 `ownerWindow(video)` 决定。DOM 迁移与 React 首次提交的时序是当前高风险点。
- 原生小窗使用 Canvas 合成链：源 video + Canvas 弹幕 + Canvas 字幕 → `canvas.captureStream()` → 隐藏 `pipVideoEl` → `requestPictureInPicture()`。合成流本身静音，实际音频仍来自源 video。
- 原生模式用两个桥接层控制源视频：`pipVideoEl` 的 play/pause/volume 事件桥，以及注入页面 MAIN world 的 `navigator.mediaSession` action handler；每 750ms 同步播放状态和位置，并重注册 handler 以抵抗 B站覆盖。
- Canvas 合成在播放时持续绘制，在暂停、seek、resize 或呈现设置变化时显式单帧重绘；弹幕样式变化会重建当前弹幕状态。
- `WebProvider.openPlayer()` 在第一个 await 前注册统一 cleanup；局部打开失败、窗口关闭和显式关闭应走同一释放路径。原生打开另有 AbortController 和 10 秒超时。
- 增强模式的空格/方向键/R依赖 `KeyBinding → PlayerEvent → React hooks/ResizeButton`；R还依赖后台通过 `beforeStartPIP`/`afterStartPIP` 定位 Document PiP 窗口。原生系统按钮依赖 Media Session，不复用增强小窗的 React 快捷键链。
- 用户尚未对 0.2.5 的键盘、R、原生控制和进度条候选修复完成实机复验，文档不得把这些写为已验收。

## 2026-09-11 键盘回归源码核验

- Document PiP 先挂载 React 播放器、再把根节点迁入新 document；迁移不会重新执行 ref 或依赖 `videoRef.current` 的 React effect，因此首次 `updateVideoRef()` 可能把 `keydownWindow` 留在源页面。刷新输入窗口必须只更新 `ownerWindow(video)`，不能复用会移除同一 video 的 `updateVideo()`。
- 播放器快捷键在暂停态会先调用 `video.play()`；如果 Promise 被浏览器以 `NotAllowedError`/`AbortError` 拒绝，旧实现会留下 `can-pause="false"`，随后 Space 无法暂停且方向键会重复失败。播放请求必须在 `finally` 恢复该闸门，并把失败变成已处理的 false 结果。
- 快捷键配置由浏览器同步存储回读，运行时不能假设每个值都是 `Key[]`。失效值应回退默认数组，同时保留合法空数组作为用户主动禁用；设置 UI 的数组访问也必须在规范化之后进行。
- B 站当前只需要屏蔽 `document.visibilitychange`；对 window/HTMLElement 原型的全局事件重写会改变站点和原生控件的监听语义，应保持这些对象的原生方法。
- `KeyBinding.reset()` 需要清除按键/长按状态，避免窗口关闭时未收到 keyup 导致下一次打开继承旧状态；交互元素判断要覆盖 composed path，保障播放器按钮、输入框、select 和 contenteditable 的原生行为。
# 2026-09-11 扩展报错与提前识别

只读访问用户 Edge 的 LayerPiP 错误页，看到 8 条：三条 `matches` TypeError、两条 Canvas readback 提示、一条 MobX `join` TypeError、一条未处理 Promise undefined、一条播放 DOMException。第一类的明确堆栈指向 entry-inject-top.js 的 addEventListener 包装；其他条目的完整栈未能从当前 UI 展开，不能把所有错误断言为同一原因。

源码证据：eventHacker 在 B 站改写了不必要的 window / HTMLElement 原型，并对可能 undefined 的 this 使用 matches；KeyBinding 对未验证配置调用 join；播放 UI 捕获失败后再次抛出，且失败路径不恢复 can-pause 标记。定向隔离回归验证事件原生语义、可见性处理器归还、配置异常回退、失败请求结算与重试。Canvas 高频读回场景改为创建上下文时声明 willReadFrequently。

提前识别可行，但需要获取音轨字节并独立解码；buffered 只有时间范围，当前 captureStream 不能读未来内容。方案和限制见 docs/local-ai-subtitles.md 的“待实现”节。预取不等于提高模型吞吐，模型持续慢于播放时仍会耗尽字幕余量。
