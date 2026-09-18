# 背景：为什么不能同时开多个小窗

状态：2026-09-16。**背景资料，不需要细读**——开发方向请直接看 [小窗内多视频同时播放：开发实施文档](./multi-video-single-window-plan.md)。

本文只回答一个问题：**为什么「多个置顶小窗」这条路不走**，以及由此对现有代码的影响。

---

## 1. 结论

**同一个浏览器进程内，只能有一个画中画窗口。** 这是 Chromium 的平台限制，与本项目代码无关。

四个必须知道的点：

1. 第二个小窗打开时，**浏览器会强制关闭第一个**。
2. **增强小窗（Document PiP）与原生小窗（视频 PiP）共用同一个槽位**，并且互相顶掉——「一个开增强、一个开原生」也拿不到两个窗口。
3. 同一个浏览器进程内的多标签页、多浏览器窗口、多存储分区（context）**共享这一个槽位**。
4. 只有**不同浏览器实例**（不同 `--user-data-dir`，或 Edge 与 Chrome 分别启动）才各自拥有独立槽位，可以同时各开一个小窗。

因此「多视频」应当做成**一个窗口内的多画面**，见 `./multi-video-single-window-plan.md`。

---

## 2. 原因（规范 + 实现）

**规范**：[WICG Document Picture-in-Picture §6.5](https://wicg.github.io/document-picture-in-picture/) 强制「每个 top-level traversable 最多一个小窗」，并明确跨 traversable 是否允许并存**由实现决定**：

> Any top-level traversable must have at most one document picture-in-picture window open at a time. … whether only one window is allowed in Picture-in-Picture mode across all top-level traversables is left to the implementation and the platform.

`requestWindow()` 第 9 步即 *Optionally, the user agent can close any existing picture-in-picture windows* —— **Chromium 选择了关闭**。

**实现**：`DocumentPictureInPictureWindowControllerImpl` 是 `WebContentsUserData`（每个标签页一份），且每份只持有**一个** `window_`：

```cpp
class DocumentPictureInPictureWindowControllerImpl
    : public WebContentsUserData<DocumentPictureInPictureWindowControllerImpl> {
  static DocumentPictureInPictureWindowControllerImpl* GetOrCreateForWebContents(WebContents*);
  std::unique_ptr<OverlayWindow> window_;        // 只持有一个
  std::unique_ptr<WebContents> child_contents_;
};
```

Chromium 另有专门的功能请求，说明该能力当前不存在：[issue 410878537](https://issues.chromium.org/issues/410878537)。

---

## 3. 实测矩阵（真实 Chromium，headed）

> ⚠️ **方法学**：**无头（headless）Chromium 不能用于验证 PiP 并发**——同样的用例在无头下会错误地显示「多个小窗可以同时存在」。此类验证必须用 headed 真实浏览器。

| 场景 | 结果 |
| --- | --- |
| tab1 开小窗 → 切到 tab2（不开小窗） | tab1 小窗**存活**（排除「切标签页导致关闭」） |
| tab1 开增强小窗 → tab2 也开增强小窗 | **tab1 被强制关闭**，tab2 存活 |
| tab1 开增强小窗 → tab2 开原生小窗 | **tab1 增强小窗被关闭**（共享槽位） |
| tab1 开原生小窗 → tab2 开原生小窗 | **tab1 原生小窗退出** |
| 同进程两个 context（≈两个存储分区） | 仍然只有**一个** |
| **两个独立浏览器实例** | **各自存活** |

---

## 4. 对现有代码的影响（开发关注点）

### 4.1 现有单例假设不用改

| 位置 | 现状 | 结论 |
| --- | --- | --- |
| `src/background/docPIP.ts` + `src/utils/mv3.ts` | 模块级单变量 `docPIPTabId`，只存一个 id | 与平台「一个小窗」**一致**，无需改造 |
| `src/shared/storeKey.ts` | `LAYERPIP_WINDOW_CONFIG_V1` 只存一份窗口几何 | 同上 |
| `src/core/WebProvider/DocPIPWebProvider.ts` | 每个 provider 持有自己的 `pipWindow`；`pagehide` → `emit(close)` + `closePIP` | 能感知被外部关闭 |
| `src/core/WebProvider/CanvasPIPWebProvider.ts` | 监听 `leavepictureinpicture` | 能感知被顶掉 |

**做多画面时应复用已打开的 `pipWindow`，不要再次 `requestWindow`**——重复请求会关掉当前窗口。

### 4.2 一个建议单独修的既有竞态缺陷

当 tab A 已开小窗、用户又在 tab B 开小窗时，浏览器先关闭 A。A 的 `pagehide` 随后执行：

```ts
// src/background/docPIP.ts
onMessage(WebextEvent.closePIP, () => {
  setDocPIPTabId(null)          // ← 无条件清空
})
```

若 A 的 `closePIP` 晚于 B 的 `afterStartPIP → setDocPIPTabId(B)` 到达，就会**把 B 的 id 清掉**。之后 B 的移动/缩放只能退化到 `mv3GetDocPIPTab` 里「按宽度猜」的分支，宽度接近时会**定位到错误的窗口**。

建议改为**带 tabId 的条件清除**（只清除自己那个）。另 `beforeStartPIP` 用「无 favIconUrl 的 tab」做前后差集识别小窗，跨标签页并发时同样脆弱（代码里已有 `有多个tab，但找不到docTab` 的兜底抛错）。

---

## 5. 如果确实需要第二个置顶窗口

唯一现实路径是**第二个浏览器实例**（不同 `--user-data-dir`，或另一个浏览器）。代价：两个实例状态不共享（已看进度、字幕来源、弹幕设置、AI 开关各存一份），实践上限通常 2 个。

其余方案（`chrome.windows.create` 多窗口、页内悬浮窗）**都不能置顶**——扩展 API 没有 always-on-top，旧的 `panel` / `detached_panel` 窗口类型已被 Chromium 移除（[w3c/webextensions#443](https://github.com/w3c/webextensions/issues/443) 仍是未实现的提案）。它们只能满足「并排对照着看」，不满足「浮在所有窗口之上」。

---

## 6. 证据索引

- 规范：[WICG Document Picture-in-Picture §6.5](https://wicg.github.io/document-picture-in-picture/)
- 实现：[document_picture_in_picture_window_controller_impl.h](https://chromium.googlesource.com/chromium/src/+/e8810229f40c21350384dc2b80d87b4f26059aca/content/browser/picture_in_picture/document_picture_in_picture_window_controller_impl.h)
- 功能请求：[Chromium issue 410878537](https://issues.chromium.org/issues/410878537)
- 同类产品描述：[DualPiP FAQ](https://www.rabbitpair.com/en/products/dualpip/faqs/document-pip-browser-limits)
- 扩展侧置顶窗口提案：[w3c/webextensions#443](https://github.com/w3c/webextensions/issues/443)
- 本项目源码：`src/background/docPIP.ts`、`src/utils/mv3.ts`、`src/core/WebProvider/DocPIPWebProvider.ts`、`src/core/WebProvider/CanvasPIPWebProvider.ts`
- 开发方向：[小窗内多视频同时播放：开发实施文档](./multi-video-single-window-plan.md)
