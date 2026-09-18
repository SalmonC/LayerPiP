# LayerPiP 当前状态、边界与对抗式审阅清单

> 下表保留此前验收记录；2026-09-10 的候选修改与检查以 [文档与架构审查第7节](./architecture-review.md#7-2026-09-10-代码与架构续作) 为准。强制需求见 [产品需求](./product-requirements.md)。原生完整能力仍不能据此表认定达标。

## 1. 当前快照

- 源码版本：`0.2.6`。
- 项目身份：固定扩展 ID `jnonlboihmjeahenhlbkjdijicakfnjj`；与旧插件隔离。
- 默认模式：增强小窗（Document PiP）。原生合成模式要求显式 opt-in。
- 最新候选：在播放器 DOM 被 Document PiP 接管后，只刷新键盘输入窗口，不重新挂载或更新 video。
- 证据边界：架构与调用链经过源码静态核对；以下多项候选修复尚未收到用户在真实 Edge 上的确认。

## 2. 用户已报告过的真实现象

这些是历史实机报告，不代表当前源码一定仍能复现：

1. 原生小窗的播放/暂停、静音、前进后退、拖动进度条曾全部无效。
2. 原生小窗增强后的 Space 和方向键曾无效；需要注意传统 PiP 本身不一定把普通键盘事件交给页面。
3. 增强小窗曾出现视频黑屏但弹幕可见；根因定位到对同一 video 调用更新时删除了节点。
4. 增强小窗 Space、方向键曾在修复后仍无效；后续 0.2.5 恢复了更接近旧稳定插件的打开时序，但尚待用户复验。
5. 进度条曾不加粗、圆点下半部被遮挡；之后又出现离开后不变细、控制栏不自动隐藏。
6. 调整弹幕字号后原生合成画面曾不重绘。
7. 无字幕时点击历史开关曾导致小窗闪退并刷新页面。
8. popup 设置按钮曾因“挂载即自动打开小窗”的并发竞争表现为无效。
9. 休眠唤醒后原版与修改版都可能卡住；用户后来明确要求回退该修复，不把休眠恢复作为当前交付目标。
10. 双屏 + 台前调度时，方向键交互可能触发 macOS 的画中画/窗口焦点图标与前台分组变化；这是系统窗口焦点与快捷键路由的交叉问题。

## 3. 当前候选修复状态

| 项目 | 源码侧状态 | 实机状态 |
| --- | --- | --- |
| 多行历史字幕的纯时间计算 | 已实现、静态确认 | 需要继续日常使用验证 |
| 无字幕时历史开关稳定 | 有空状态防御、静态确认 | 尚未明确复验 |
| 多分P/CID 防串轨 | 已实现、静态确认 | 核心场景需复验 |
| 增强小窗同一 video 更新黑屏 | 已定位并有候选修复记录 | 尚未确认黑屏完全消失 |
| 增强小窗 Space/方向键 | 0.2.6 显式重绑 PiP 输入窗口，含 React handle 迟到保护 | 尚未确认 |
| 增强小窗 R 自适配 | 快捷键、事件和 background 前置通知均存在 | 尚未确认 |
| 进度条 hover/seeking 加粗与 handle 居中 | CSS/组件存在 | 尚未确认离开/失焦全路径 |
| 控制栏闲置隐藏 | debounce 与交互状态存在 | 尚未确认所有焦点路径 |
| 原生播放/暂停/seek | video bridge + MAIN-world Media Session 已实现 | 尚未确认 Edge 系统控件全部生效 |
| 原生静音/音量 | pip/source 双向 volumechange 已实现 | 尚未确认系统控件是否触发预期事件 |
| 原生字幕/弹幕字号暂停态刷新 | autorun + redraw/force rerender 已实现 | 尚未确认 |
| popup 设置入口 | 已移除自动打开竞争 | 尚未确认 |

审阅者应避免只因为函数存在就把一项升级为“已验收”。

## 4. 边界条件矩阵

### 4.1 页面和媒体

| 条件 | 期望行为 | 重点检查 |
| --- | --- | --- |
| 页面无 video | 给出明确错误，不留下 opening 状态 | `openPlayer()` finally/cleanup |
| 多个 video/iframe | 选择主要可见尺寸 video；跨源 iframe 明确不支持 | `getVideoEl()` 的启发式是否足够 |
| B站 SPA 更换视频 | 旧弹幕/字幕结果不回写；必要时关闭原生 PiP | generation、route listener |
| video 元素被站点替换 | Document 模式更新/恢复；native 主动关闭 | 两个 provider 行为不同是否合理 |
| metadata 尚未加载 | 使用安全尺寸；native 等待 metadata 有超时 | 0×0、Infinity、NaN |
| 直播 | 无 seek、无历史时长假设 | Media Session actions、进度 UI |
| 播放被 autoplay policy 拒绝 | 提示回页面点击，不死锁 | play promise rejection |
| 页面关闭/刷新 | 所有流、timer、handler、DOM 状态释放 | pagehide、unload 幂等 |

### 4.2 字幕来源

| 条件 | 期望行为 | 重点检查 |
| --- | --- | --- |
| 来源链接含合法唯一 `p` | 直接使用对应 P | URL 解析与 selectedCid |
| 不含 `p` | 默认 P1，可手动改选；2026-09-10 已修正旧的强制选择规则 | P1 为空时仍可改选，未读取新轨道不能保存 |
| 重复/非法/越界 `p` | 明确拒绝 | 错误是否被吞掉 |
| 目标或来源目录 P序变化 | 依 CID 继续或安全失败 | target/source identity |
| 来源 CID 消失 | 要求重新选择，不切到同序号内容 | `resolveBilibiliTrackByCid()` |
| 语言轨道消失 | 安全失败，不换第一轨 | `selectTrack()` |
| 需登录字幕 | 提示登录 | background fetch credentials |
| 无官方字幕 + auto | 安静无字幕 | 不应 toast 循环或关闭小窗 |
| 无字幕 + 历史开关 | 保持空 snapshot | DOM/Canvas 不访问空数组假设 |
| 本地资产缺失/被篡改 | 哈希失败并要求重选 | IndexedDB/绑定一致性 |
| 超大、空或未知格式直链 | 在解析前/时拒绝 | 10 MiB 限制是否在 fetch 后才生效 |
| 设置打开期间切换分P | 保存前目标复核失败 | identity race |
| 快速连续 probe | 只接受最后请求 | requestId 只能忽略 UI 结果，未取消网络 |

### 4.3 历史字幕

| 条件 | 期望行为 | 重点检查 |
| --- | --- | --- |
| 重叠字幕 | 所有当前行都显示，历史在其上 | 高度计算与排序 |
| 长句/手工换行 | 自动换行且当前优先 | DOM 与 Canvas 一致性 |
| seek 到开头前/结尾后 | 空或最近历史，不越界 | 二分边界 |
| 一次跨很多段 | 只显示最近 N 段 | 与产品含义一致 |
| 小窗极小 | 从最旧历史裁剪，不遮满画面 | 35% 上限 |
| 暂停时切换开关/字号 | 立即单帧更新 | Canvas redraw |

### 4.4 增强小窗

| 条件 | 期望行为 | 重点检查 |
| --- | --- | --- |
| 首次打开/再次打开 | 视频、键盘、控制均在 PiP document | React commit 与 DOM move 时序 |
| 同一 video 重新绑定上下文 | 不删除节点 | updateVideo 幂等分支 |
| 键盘焦点在控件 | 不误触播放器快捷键 | composedPath interactive filter |
| 点击控制后焦点残留 | 闲置仍能隐藏控制栏 | `:focus-within` 和 blur 清理 |
| pointerup 在窗口外 | seeking 状态释放 | ownerDocument/defaultView listener |
| R 调整 | background 能定位当前 PiP 窗口 | before/afterStartPIP 顺序 |
| 双屏不同 DPR | 保存/恢复尺寸合理 | DPR 补偿与系统最大尺寸 |
| pagehide 多次/部分打开失败 | cleanup 幂等 | closing flag、监听撤销 |

### 4.5 原生合成小窗

| 条件 | 期望行为 | 重点检查 |
| --- | --- | --- |
| Canvas ready 但源帧未 ready | 不永久黑屏，之后能重画 | readyState 分支是否持续调度 |
| 源暂停后打开 | 保持暂停但有静态帧 | 首帧 redraw/先 play 再 pause |
| 源播放/暂停 | pip video 同步且无反馈环 | `ignoreNextPipPlay` 的所有拒绝路径 |
| 系统按钮播放/暂停 | MAIN handler 控制源 video | B站覆盖、隔离 world |
| 系统 seek | clamp 到 0..duration | duration Infinity/NaN |
| 系统静音/音量 | 影响源 video | MediaStream video muted 语义与系统实现差异 |
| PiP resize | Canvas 立刻按新尺寸重画 | resize event、DPR |
| 字号/历史开关在暂停态变化 | 单帧重画 | MobX autorun 生命周期 |
| 源 video 被替换 | 关闭并提示重开 | 避免控制旧 video |
| 打开超时/用户立即关闭 | promise 迟到也不遗留 PiP | Abort + request resolution race |
| Media Session stop 后 | 不破坏页面后来注册的 handler | 当前 cleanup 会 setActionHandler(null)，需审阅所有权边界 |

## 5. 对抗式架构审阅问题

### P0/P1：可能导致不可用、错字幕或破坏页面

1. `SubtitleTimeline.at()` 反向扫描的提前停止条件是否对任意重叠区间都正确？请构造跨越很长时间的字幕行验证。
2. linked B站来源的语言标识是否真的稳定？`lan` 与 `lan_doc` 的优先顺序是否可能导致保存后找不到轨道？
3. 无 p 按 P1 是用户认可规则；单独核验换页后迟到结果与设置保存目标变化是否被拒绝，不把 URL 默认值本身列为缺陷。
4. 原生 Canvas 首帧在 `readyState < 2` 且 force redraw 时直接返回、不继续调度；若此时源 video 暂停，后续哪个事件保证再次 redraw？
5. 当前候选在绑定事件前即同步源 video 的 muted/volume；合成流无音轨时 Edge 的原生静音按钮是否会触发 `volumechange`？若不会，产品要求需要不同桥接策略。
6. Media Session stop 把 action handlers 设为 null，是否会抹掉 B站原有 handler 而无法恢复？当前实现没有保存旧 handler 的公开 API。
7. Document 模式把真实 video 跨 document 移动时，B站播放器框架、DRM/MSE、字幕和 Media Session 是否可能重建节点？关闭还原是否覆盖异常父节点情况？
8. 部分打开失败时 `miniPlayer`/SiteAdapter 初始化到不同阶段，统一 cleanup 是否对所有未赋值字段安全且只执行一次？

### P2：明显交互退化或维护风险

9. `HtmlVideoPlayer` 中非核心 capture/display/tab/WebRTC 分支是否仍可达？如果配置归一化已使其不可达，删除能否减少回归面；如果能达，谁负责验收？
10. Manifest `<all_urls>` 和通用 content scripts 是否超过 B站主用产品所需；网络直链字幕是否能改成受控 background fetch 而不要求所有页面注入？
11. 共享的全局 `KeyBinding` 和 eventBus 在快速关闭/重开、多个 frame 或 React 严格模式下是否会重复监听？
12. 进度条的 `:has()`、pointer capture、owner window 监听在 Edge 当前版本是否一致；组件卸载前失焦是否遗留 `is-seeking`？
13. 设置 local-file 时先创建新资产、再保存 binding、再删除旧资产；任一步失败的孤儿资产和旧绑定如何处理？
14. storage change listener 只监听新单条 binding；旧聚合 binding 被其他实例修改时是否需要响应，还是迁移后明确不支持？
15. 字幕 DOM 和 Canvas 对历史基线、空当前字幕、字体 weight 的处理是否视觉一致？
16. B站视频适配器对 visibilitychange 的劫持是否仍有必要，是否可能影响台前调度、休眠或页面自身生命周期？

## 6. 建议审阅方法

1. 先从 `product-requirements.md` 提取不可变需求和非目标。
2. 沿 `system-architecture.md` 的两条模式数据流逐节点核对源码。
3. 对每条结论标注：源码确定、推断、需实机复现。
4. 优先查错字幕、资源泄漏、源 video 被破坏和控制状态分叉，不先做视觉微调。
5. 只建议能对应具体风险的验证；不要用大而泛的测试套代替状态机推理。
6. 输出建议格式：严重度、触发条件、根因路径、用户影响、最小修复、需要的验证、是否影响旧插件回退。

## 7. 最小真实设备验收顺序

这些不是本次文档工作的执行结果，而是给后续 reviewer/用户的建议：

1. 固定示例 A/B/P57 验证字幕身份和历史。
2. 增强小窗：打开、Space、←/→、R、拖动进度、控制栏收起、关闭还原、再次打开。
3. 原生小窗：播放态与暂停态各打开一次，验证画面、声音、系统播放/暂停、静音、seek、resize。
4. 原生暂停时修改字幕/弹幕字号和历史开关，观察单帧刷新。
5. B站站内切换分P和 SPA 换视频，确认旧字幕/弹幕不串入。
6. 双屏不同 DPR 与台前调度仅在核心单屏路径通过后再测，避免系统行为掩盖基础故障。

## 8. 交付边界

另一个 agent 可以基于这组文档做只读审阅并给出问题清单。若要修改源码，应另开明确任务，并在动手前先检查当前 dirty worktree，区分已有用户改动和拟议修复；不要修改旧的回退插件、安装副本、扩展 ID、签名、存储或发布状态，除非用户另行明确授权。
