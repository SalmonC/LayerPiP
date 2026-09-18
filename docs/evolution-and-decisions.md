# LayerPiP 复用、重写与架构决策

## 1. 项目演进原则

LayerPiP 不是对旧插件安装副本的就地升级，而是以旧项目成熟的媒体控制和 B站弹幕能力为基线，建立独立身份的新项目。判断代码是否沿用的标准不是“改动最少”，而是：

1. 该模块的抽象是否仍符合新产品的不变量；
2. 它是否已有真实使用积累且边界可被隔离；
3. 为兼容它而增加的桥接成本，是否高于重写一个窄模块；
4. 出错时是否会影响源 video、字幕身份或旧插件回退；
5. 它是否能被两种 PiP 后端共享，而不是把领域逻辑绑死在某个窗口里。

旧插件保持独立可用是硬约束。LayerPiP 有自己的名称、图标、Manifest key、扩展 ID、存储键、IndexedDB 和产物目录。

## 2. 当前复用矩阵

| 能力 | 当前决策 | 原因 | 审阅关注点 |
| --- | --- | --- | --- |
| B站弹幕获取、调度、发送 | 沿用并接 SiteAdapter | 真实站点适配复杂、已有积累 | 生命周期与 SPA 串数据 |
| Document PiP 打开、移动、缩放 | 沿用主流程 | 已有真实环境行为基础 | background 窗口识别、双屏 DPR |
| React 播放器与控制栏 | 沿用后重做视觉/局部交互 | 控制功能多，整套重写风险高 | 全局事件、DOM 跨 document |
| SRT/ASS 解析器 | 沿用 | 输入输出窄，和 PiP 无关 | 极端文件与 HTML 内容安全 |
| B站字幕 API 探测 | 沿用基础请求，重写身份层 | API 获取可复用，但原逻辑不足以保证跨分P绑定 | CID、防重复 p、登录态 |
| Canvas 弹幕引擎 | 沿用并扩展合成视频/字幕 | 已能按时间绘制弹幕 | 首帧、暂停重画、性能 |
| configStore/MobX | 沿用并增加归一化层 | 大量 UI 已依赖 | 隐藏配置与可见设置漂移 |
| background 消息与窗口 API | 沿用 | 浏览器权限边界稳定 | 消息超时与部分失败 |
| 通用网站/多种捕获渲染模式 | 暂时保留 | 降低一次性重构范围 | 核心不可达分支形成维护债 |

## 3. 新增或实质重写的模块

| 模块 | 设计变化 | 为什么不继续补丁旧思路 |
| --- | --- | --- |
| `SiteAdapter` 与 provider 工厂 | 用显式组合连接 B站能力与窗口后端 | 动态修改原型会模糊所有权和清理顺序 |
| `SubtitleSourceDescriptor` | 把来源建模为判别联合 | “当前选中字幕 URL”无法表达自动、CID绑定、本地资产与关闭 |
| 每目标 binding repository | 从聚合对象改为 aid+cid 单条记录 | 降低并发覆盖，明确分P边界 |
| 本地字幕资产仓库 | 正文进 IndexedDB，binding 存哈希引用 | 大文本不适合 sync storage，且需完整性检查 |
| `SubtitleTimeline` | 纯时间查询，输出 current/history | 事件式“之前显示过什么”在 seek 后不确定且难测 |
| DOM/Canvas 共享呈现选择 | `subtitleParagraphs()` 统一历史选择 | 两套模式分别实现会产生语义漂移 |
| 原生 Canvas 合成后端 | 视频、弹幕、字幕先合成，再请求传统 PiP | 原生 PiP 不包含网页覆盖层 |
| MAIN-world Media Session bridge | 系统动作通过会话 channel 桥回源 video | content script 隔离 world 的 handler 不是可靠系统控制目标 |
| LayerPiP 设置/popup/品牌 | B站优先的信息架构和独立视觉身份 | 旧 UI 暴露大量无关设置且易与旧插件混淆 |
| 配置归一化 | 固定核心路径、native 显式 opt-in | 遗留配置不能决定实验后端或重新打开废弃功能 |

## 4. 关键架构决策记录

### ADR-001：源 video 是唯一媒体真源

**决定**：播放、暂停、时间、时长、音量和倍速均以 B站原始 `HTMLVideoElement` 为准。

**后果**：两种 PiP 都是视图/控制代理。原生合成 video 不拥有独立时间轴；所有系统操作必须桥回源 video。

**拒绝方案**：让 captureStream video 自己 seek 或维护镜像进度。这会产生不可消除的状态分叉。

### ADR-002：目标和来源都以 CID 固定内容

**决定**：目标 binding key 使用 aid+cid，linked source 保存 sourceCid；P序只做交互展示。

**后果**：来源 P序变化不会抓到同序号的另一段；CID 消失时选择安全失败。

**边界澄清（2026-09-09）**：当前页面 URL 未带 `p` 按 P1 解释是用户认可的规则，本身不作为缺陷。异步请求在换页后迟到、设置保存时目标已改变属于独立生命周期问题；不得混同 URL 解析策略。来源链接无 p 的手动选择交互范围见产品需求。

### ADR-003：字幕历史是纯函数派生状态

**决定**：从完整 rows 和任意 currentTime 计算 current/history。

**后果**：快进、拖动和回退语义一致；不需要维护播放事件日志。代价是每次时间更新要做查询和有限反向扫描。

### ADR-004：Document PiP 与 native composite 是两个 provider

**决定**：工厂在会话创建前选择后端，不在打开过程中切换。

**后果**：每个 provider 自己拥有窗口资源和清理；字幕/弹幕/站点数据在更高层共享。切换设置下一次打开生效。

### ADR-005：原生 PiP 采用 Canvas 合成

**决定**：把视频、弹幕、字幕绘制到一个 Canvas，captureStream 后交给传统 PiP。

**后果**：系统窗能显示覆盖内容，但画面、声音和控制形成三条需要同步的链；性能、首帧和原生控件是主要风险。

### ADR-006：原生 Media Session handler 在 MAIN world 注册

**决定**：隔离 world 仅做业务逻辑，MAIN world 负责浏览器实际使用的 handler，双方用唯一 CustomEvent channel 通信。

**后果**：能应对 B站覆盖 handler；关闭时必须避免破坏页面自己的媒体会话。Web API 无法读取旧 handler，使“恢复原 handler”成为未完全解决的边界。

### ADR-007：原生模式保持显式 opt-in

**决定**：默认 Document PiP；仅 `pipMode=native-composite` 且 `nativeCompositeOptIn=true` 时启用原生合成。

**后果**：未完成实机验收的复杂路径不会因旧配置自动成为默认。

### ADR-008：Document PiP 复用旧稳定打开时序（部分已被后续候选取代）

**状态更正（2026-09-09）**：下文自然提交时序是历史方案，不能作为当前修复依据。`review-and-boundaries.md` 与 `progress.md` 的 0.2.6 记录称已在 DOM 迁移后显式刷新输入窗口，并处理 React handle 迟到；本轮仅核对记录冲突，未重新核验代码或实机行为。后续保留“不重挂载同一 video”的原则，核验显式重绑协议。

**决定**：播放器首次 React 提交在视频 DOM 迁移后的自然时序中确定 owner window；不额外对同一 video 做破坏性刷新。`beforeStartPIP` 保持在 `miniPlayer.init()` 前。

**后果**：减少黑屏与键盘窗口错绑回归；同时使代码依赖异步提交时序，仍应被审阅是否能通过更明确而不破坏节点的协议表达。

## 5. 当前技术债与建议边界

### 5.1 值得优先审阅、暂不直接删除

- `HtmlVideoPlayer` 中多种 capture/display/tab/WebRTC 分支：当前核心配置不可达或少用，但删除前必须确认没有 popup/菜单/迁移配置能强制进入。
- 通用网站和 iframe 代理：产品验收聚焦 B站，但它们与主入口共用代码；收窄 Manifest 和删除通用分支必须一起设计。
- `visibilitychange` 事件干预：可能是旧站点兼容补丁，也可能与 macOS 台前调度、休眠行为相互影响。
- 全局 `KeyBinding` 和共享 eventBus：复用方便，但所有权不如 per-session 对象明确。

### 5.2 应保持窄接口的区域

- 字幕来源仓库不应知道 UI 或 PiP 模式。
- `SubtitleTimeline` 不应读取 configStore、DOM 或网络。
- SiteAdapter 不应选择 provider 类型。
- Canvas renderer 不应修改源 video 时间或音量。
- MAIN-world bridge 不应持久化配置或长期接管页面 Media Session。
- popup 只发意图消息，不自行复制页面识别与播放器状态机。

### 5.3 不应为“复用”而接受的耦合

- 让 B站字幕 manager 直接操作设置 UI；
- 在 provider 之间复制字幕缓存；
- 为原生模式复用 Document DOM 控件而在 Canvas 上做不可交互截图；
- 把来源 P序作为持久内容身份；
- 为修键盘而同时在原页和 PiP window 注册无所有权的全局旁路；
- 为自动恢复而刷新整页或修改旧插件。

## 6. 后续改动的判定模板

每项拟议改动先回答：

1. 它修复的是产品不变量、已复现故障，还是纯视觉偏好？
2. 触达源 video、CID binding、扩展身份或 installed copy 吗？
3. 能否在一个窄模块完成，还是会跨两种 provider 复制逻辑？
4. 失败时 cleanup 是否仍闭环？
5. 需要静态检查、构建、单一目标验证，还是只能交给真实 Edge？
6. 若候选失败，旧插件回退是否仍不受影响？

如果答案要求用多个兼容旁路维持一个旧抽象，优先考虑重写该窄抽象，而不是继续叠加条件分支。
