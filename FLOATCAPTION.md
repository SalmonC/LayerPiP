# 浮幕 FloatCaption

FloatCaption 是基于 `apades/dmMiniPlayer v0.6.60` 的非商业自用分支，专注于 macOS Edge 中的学习视频小窗。

## 核心范围

- Bilibili 普通视频、分 P、番剧页面与直播
- 通用 HTML5 视频后备支持
- Document Picture-in-Picture，固定使用原版 `replaceVideoEl` 行为
- Bilibili 原生弹幕、显示开关与时间偏移
- 原生字幕、本地 SRT/ASS，以及 Bilibili 视频链接或直接字幕链接
- 来源链接含 `p` 时严格匹配该分 P；不含 `p` 时必须手动选择
- 播放、快进快退、音量、倍速、上一/下一 P、字幕与弹幕快捷键

## 与旧版共存

旧版网络字幕构建保留在原工作树和 Git 标签 `custom-v0.6.60-network-subtitle.3`。FloatCaption 使用独立目录、扩展名称、0.7.0 版本及新图标；从本目录的 `dist` 加载时可与旧目录的未打包扩展并存。

## 安装

1. 在本目录运行 `pnpm install --frozen-lockfile` 和 `pnpm build`。
2. Edge 打开 `edge://extensions`，启用“开发人员模式”。
3. 选择“加载解压缩的扩展”，在文件选择器中按 `Command + Shift + G`。
4. 输入本项目 `dist` 的完整路径并确认。
5. 保留旧扩展时，请确认两个扩展显示不同的名称和图标；同一网页不要同时打开两个小窗。

## 已主动精简

- 移除自定义弹幕发送、本地/网络弹幕导入入口
- 移除网页替换播放器入口、更新日志气泡、快速隐藏等非核心命令
- YouTube、Netflix、Twitch 等不再使用专属适配，统一走通用 HTML5 后备路径
- 设置面板只显示播放、字幕、弹幕和快捷键相关项目
- 隐藏配置会自动归一到安全值，尤其是 Document PiP、`replaceVideoEl` 和核心控制按钮

## 许可与署名

保留上游署名并按仓库根目录的 CC BY-NC 4.0 许可处理，仅用于非商业用途。上游项目：<https://github.com/apades/dmMiniPlayer>。
