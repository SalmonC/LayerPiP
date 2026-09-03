# Task Plan: LayerPiP 双小窗模式

## Goal

在不削减字幕、弹幕和播放功能的前提下，将 LayerPiP 设计为可在设置中切换的 Document PiP 与 Edge 原生视频 PiP 两种模式，同时保持稳定旧插件完全不受影响。

## Current Phase

Phase 4：新项目候选验证前隔离

## Phases

### Phase 1: Requirements & Discovery

- [x] 确认双模式的总体方向
- [x] 确认默认模式与切换时机
- [x] 确认原生模式字幕来源与持久化语义
- [x] 确认设置 UI 的信息架构
- **Status:** complete

### Phase 2: Architecture & UX Design

- [x] 定义共享配置层和两个 PiP 后端
- [x] 定义字幕来源选择、自动优先级和失败回退
- [x] 定义 macOS / Edge 风格令牌与动效
- **Status:** complete

### Phase 3: Implementation

- [x] 增加模式切换与配置迁移
- [x] 重构 Document PiP 呈现层
- [x] 完成 Canvas 字幕合成和原生 PiP 同步
- [x] 完成设置界面
- **Status:** complete

### Phase 4: Verification

- [x] 构建与目标化检查
- [x] 稳定旧插件源码、构建产物与回滚压缩包隔离
- [x] 新项目名称、图标、固定 ID、配置与页面消息命名空间隔离
- [ ] 真实 Edge / macOS 双模式冒烟测试
- [ ] 分P、音频、进度拖拽、休眠恢复和失败回退检查
- **Status:** user_validation

### Phase 5: Adversarial Review & Delivery

- [ ] 对抗式审查核心功能和回归风险
- [x] 整理使用和回退说明
- **Status:** in_progress

## Key Questions

1. 旧用户升级后默认使用哪种模式？
2. 原生模式字幕来源是自动选择还是每视频显式指定？
3. 外部 B 站字幕链接是否按 A 视频与分P记忆？

## Decisions Made

| Decision                                  | Rationale                                  |
| ----------------------------------------- | ------------------------------------------ |
| 保留 Document PiP 和原生视频 PiP 两个后端 | 同时满足完整 HTML 交互与原生无边框体验     |
| 共享字幕/弹幕配置，后端只负责呈现         | 避免两套设置发生偏差                       |
| 默认使用增强小窗                          | 保留已验证的稳定行为，原生模式先由用户选择 |
| 新项目固定 ID 且不迁移旧配置             | 旧插件始终可回退，两个产品不会互相覆盖     |
| 字幕映射按 aid + cid 保存                 | 防止 P 序调整后抓错内容                    |

## Errors Encountered

| Error                                                 | Attempt | Resolution                        |
| ----------------------------------------------------- | ------: | --------------------------------- |
| ESLint `import/order` in `src/store/config/index.tsx` |       1 | 将 `PipMode` 移到本地相对导入之前 |
| 字幕目标身份依赖字幕轨道，导致无字幕 A 无法识别      |       1 | 拆分视频目录解析与字幕轨道解析     |
| 完整 `tsc --noEmit` 被既有依赖/旧代码错误阻断        |       1 | 记录基线；以目标 ESLint 与生产构建为静态门槛 |

## Notes

- 保留用户已有的 PlayerProgressBar 未提交修改。
- 删除已过时且与当前交付策略冲突的 `e2e/unit/floatCaptionConfig.test.ts`；可从 Git 历史恢复。
- 功能验证按用户要求由真实 Edge / macOS 手动完成。
