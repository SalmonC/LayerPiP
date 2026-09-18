# 增强小窗高能进度条与「已看」双色着色 — 开发实施文档

状态：2026-09-16 初稿，**2026-09-17 依独立审阅修订**（未实现）。本文不改源码、不改依赖、不递增版本。
交付边界见 `../PROJECT_IDENTITY.md`；当前交付版本见 `../progress.md`。

> ⚠️ **修订说明**：本文已按独立审阅（[审阅回应与补充验证](./review-response-2026-09-17.md)）修正若干**已验证的错误**，涉及：
> ① `parse()` 的响应解包（原 `res.data.modules` 对直连 `fetch` 是错的）；
> ② **已看区间采集**——原「照抄官方采样」方案有两处硬缺陷，已整体改为 `HTMLMediaElement.played`；
> ③ `last_play_time` 不再作为区间来源；
> ④ §6.1 进度条几何按 0.2.14 现状重写（原数值已过期）；
> ⑤ 新增 §6.6 观看记录持久化与资产库版本约束。
> 修订处均在正文内以「修正/修订（2026-09-17）」标注。

> **给实施者**：第 2–6 节是可直接照做的通路（接口契约、算法、渲染规格、接线点），第 7 节是坑清单，第 8 节是分期与验收。
> 第 9 节只保留「旧结论为什么说接口不可用」的原因，不需要细读。

---

## 1. 要做的两件事

| 编号 | 需求 | 依赖 |
| --- | --- | --- |
| **F1** | 进度条上「已看过的内容」用主题蓝、「未看过的」用灰白 | 只需已看区间数据，**与视频有没有热力条无关** |
| **F2** | 在进度条上方绘制高能进度条（弹幕密度曲线），已看区间内呈蓝色 | 需要官方曲线数据；无数据的视频不画 |

关键认知：**曲线和「已看」是两层。** 曲线是弹幕密度形状；「已看变蓝」是同一形状用主题色叠一层、裁剪到已看区间。
所以 F1 对所有视频成立，F2 只在官方有数据时成立——这正好对应「无论有没有原生热力条都生效」的要求。

术语：官方名「高能进度条」，内部代号 `pbp`，i18n key `highlightProgressBar`；与「高能时刻」`view_points` 是两回事（后者是离散标记点）。

---

## 2. 可直接使用的上游接口

### 2.1 请求

```bash
# 官方播放器就是这样调的（已实测：匿名可用，无需登录、无需 Cookie）
curl -G 'https://bvc.bilivideo.com/pbp/data' \
  --data-urlencode 'aid=80433022' \
  --data-urlencode 'cid=137649199' \
  --data-urlencode 'bvid=BV1GJ411x7h7' \
  --data-urlencode 'r=loader' \
  -H 'Referer: https://www.bilibili.com/video/BV1GJ411x7h7/'
```

| 项 | 值 |
| --- | --- |
| 方法 | `GET` |
| 必填参数 | `cid`；官方会同时带 `aid`、`bvid` |
| **必需参数** | **`r=loader`** —— 缺了它返回 404 HTML 错误页 |
| 凭证 | **不需要**。官方代码即 `withCredentials: false` |
| CORS | `access-control-allow-origin: *` → **内容脚本可直接 fetch**，不需要 MAIN world 注入 |
| 迁移注意 | `https://api.bilibili.com/pbp/data` 与不带 `r=loader` 的写法**都返回 404**，不要用 |

### 2.2 响应

```json
{"modules":[{
  "name":"pbp","version":"3.6.2",
  "script_src":"//i0.hdslb.com/bfs/static/pbp/pbp-3.6.2.min.js",
  "load_mode":"pbp",
  "params":{"data":{
    "events":{"default":[0,2172828,374224.5,194779, /* …共 95 个 */]},
    "tagstr":"version_&pbphide_0&group_eg&pbphide_0&client_&innersign_0&nocheck_0",
    "step_sec":9,
    "debug":"{\"event_count\":1064027,\"max_time\":850,\"total_dm\":1155,\"zero_points_ratio\":0}"
  }}
}]}
```

### 2.3 有效性判定（照抄官方 `parse()` 的规则，但注意解包差异）

> ⚠️ **最容易踩的坑**：官方 `parse()` 里写的是 `res.data.modules`，那是因为官方 HTTP 客户端会把响应包一层（axios 风格）。
> 用 `fetch(...).json()` 直接拿到的 JSON **顶层就是 `modules`，没有 `data` 包装**（已实测：`topKeys = ["modules"]`）。
> 照抄官方的 `.data.modules` 会得到 `undefined`，把**有数据**的视频误判成「无曲线」。

```ts
// body = await fetch(url, { credentials: 'omit' }).then(r => r.json())
type PbpResult = { points: number[]; stepSec: number; raw: unknown } | null

function parsePbp(body: any): PbpResult {
  const modules = body?.modules ?? []          // ← 顶层就是 modules
  for (const m of modules) {
    const d = m?.params?.data
    if (m?.load_mode !== 'pbp' || !d) continue
    const stepSec = Number(d.step_sec)
    const points = d.events?.default
    // 硬化校验：不要用 truthy 判断
    if (!Number.isFinite(stepSec) || stepSec <= 0) continue
    if (!Array.isArray(points) || points.length < 2) continue
    if (!points.every((n: unknown) => Number.isFinite(n) && (n as number) >= 0)) continue
    return { points: points as number[], stepSec, raw: d }   // raw 里的 tagstr/debug 仅作诊断
  }
  return null   // 该视频没有高能进度条
}
```

另外：
- **不要执行**返回体里的 `script_src`，它只是上游元信息。
- 必须把「**正常无数据**」与「**412 / 网络错误 / 非法响应**」区分成两种内部状态：两者都让用户继续看视频，但**只有前者可以负缓存**，后者要退避重试且不能每帧重试（Codex 在另一环境实测到 412 风控；我这边复测仍为 200，说明**可用性不能当成保证**）。


**实测三种情况**：

| 视频 | `step_sec` | 点数 | `debug` | 判定 |
| --- | --- | --- | --- | --- |
| `BV1GJ411x7h7`（14.9 万弹幕） | 9 | 95 | `total_dm:1155` | 有 |
| `BV1h54y1L7oe`（D2L AlexNet） | 22 | 97 | `total_dm:1473` | 有 |
| `BV15UREYsEN8` P1（D2L 2026 课程） | **0** | **0** | `{"err_id":3,"err_msg":"not enough dm:7"}` | **无** |

> ⚠️ **无数据时接口同样返回 HTTP 200**，只是 `step_sec=0`、点数组为空。**绝不能靠 HTTP 状态码判断**，必须解析体积走上面的判定。
> `tagstr` 里的 `pbphide_0/1` 当前实现并不读它，不要拿它当判据，只用来记日志。

---

## 3. 要复刻的算法（精确规格）

### 3.1 归一化

```ts
function calcPoints(data: number[], stepSec: number, duration: number) {
  const expected = Math.floor(duration / stepSec)
  // 尾部补零到预期长度
  if (expected > data.length) data = data.concat(new Array(expected - data.length).fill(0))

  const max = data.reduce((a, b) => (a > b ? a : b), 0) || 1   // max 为 0 时兜底 1

  return data.map((v, i) => ({
    value: v,
    ratioH: v / max,            // 高度比例，峰值 = 1
    ratioW: i / data.length,    // 横向比例，均匀铺满
  }))
}
```

### 3.2 曲线路径（viewBox `0 0 1000 100`）

官方常量：`svgW = 1000`、`svgH = 100`、`increasedHeightRatio = 0.2`。

```ts
function generateBezierCurvePath(points: {ratioH:number; ratioW:number}[]) {
  const W = 1000, H = 100
  const pad = 0.2 * H                       // = 20，底部留白
  const radius = points[1].ratioW * W / 2   // 水平控制点半径 → 圆肩平台
  const out = [`M 0 100 L 0 ${H - pad}`]

  let prevX = 0
  let prevY = H - pad
  const pts = points.concat([{ value: 0, ratioH: 0, ratioW: 1 }])   // 收尾补零点

  for (let i = 1; i < pts.length; i++) {
    const p = pts[i]
    const x = p.ratioW * W
    const y = H - (pad + (1 - 0.2) * p.ratioH * H)     // 等价 y = 80 - 80 * ratioH
    const cx = prevX + radius
    out.push(`C ${cx.toFixed(1)} ${prevY.toFixed(1)}, ${cx.toFixed(1)} ${y.toFixed(1)}, ${x.toFixed(1)} ${y.toFixed(1)}`)
    prevX = x
    prevY = y
  }
  out.push('L 1000 100 Z')      // 闭合到底边 → 填充面积（不是线）
  return out.join(' ')
}
```

要点：峰值 `ratioH=1 → y=0`；零值 `ratioH=0 → y=80`；底部 20 单位留白；用水平控制点的三次贝塞尔得到官方的平滑阶梯；路径闭合到 `y=100`，画出来是**面积**。

> `points[1]` 必须在调用前保证存在：点数 < 2 时直接判定为无数据（不要传进这个函数）。

### 3.3 已看区间路径

```ts
// area = [startRatio, endRatio]，比例 0–1
function generateZebraPath(areas: [number, number][]) {
  return areas
    .map(([a, b]) =>
      `M ${(1000 * a).toFixed(1)} 100 H ${(1000 * b).toFixed(1)} V 0 H ${(1000 * a).toFixed(1)} Z`)
    .join('')
}
```

每个已看区间是一个**全高矩形**。

### 3.4 当前播放段

用 `clipRect` 表示正在播的那一段（比例 → 百分比）：

```ts
clipRect.setAttribute('x', `${(100 * zebraStart).toFixed(2)}%`)
clipRect.setAttribute('width', `${(100 * (zebraEnd - zebraStart)).toFixed(2)}%`)
```

---

## 4. 已看区间（zebra）

### 4.1 采集规则：用 `HTMLMediaElement.played`，不要自己采样

> **本节已于 2026-09-17 修订。** 早期版本照抄了官方播放器的时间采样逻辑，存在两处会直接导致错误结果的缺陷（详见 [审阅回应与补充验证](./review-response-2026-09-17.md) §1.2）：
> ① 把「比例」和「秒」混成一个量纲比较，导致大跳转检测永远不触发；
> ② 在 `seeking` 时用 `currentTime`（此时已经是**目的时间**）作为段尾，会把整个跳过区间误记为已看。
>
> **不要复刻这两处。** 用下面的 `played` 方案，两个问题从根上消失。

`HTMLMediaElement.played` 是**标准 API**，语义就是「这个媒体资源实际被播放过的区间集合」，**跳过/拖动经过的区间不会被标记**。实测（B 站 MSE 播放，duration 213s）：

| 步骤 | `video.played` |
| --- | --- |
| 初始 | `[]` |
| 播放 0 → 6.96s | `[[0, 6.96]]` |
| **seek 到 120s（未播放）** | `[[0, 6.96]]` ← 跳过区间**没有**被记为已看 |
| 在 120s 播放 7s | `[[0, 6.96], [120, 126.96]]` |
| **seek 到 190s（未播放）** | `[[0, 6.96], [120, 126.96]]` ← 仍未污染 |
| 在 190s 播放 3s | 追加 `[190, 192.96]` |

```ts
/** 读取当前媒体实际播放过的区间（媒体秒） */
function snapshotPlayed(video: HTMLMediaElement): [number, number][] {
  const out: [number, number][] = []
  for (let i = 0; i < video.played.length; i++) {
    out.push([video.played.start(i), video.played.end(i)])
  }
  return out
}
```

**⚠️ `played` 会在换源时被重置（实测）**：同一次实验中把同一 `src` 重新赋值 + `load()` 后，
`[[0, 5.96]]` → `[[5.79, 7.37]]`，**原区间丢失**。所以 `played` **不持久化**，必须主动快照。

**快照时机表（缺一个就会丢数据）**：

| 时机 | 原因 |
| --- | --- |
| 周期性（墙钟节流，如 5–15s，且仅在区间发生变化时写） | `played` 不持久化 |
| `pause` / `ended` | 用户可能就此离开 |
| **换 P / 换源 / SPA 换视频之前** | **`played` 随资源重选被重置**（上表实测） |
| 取消小窗 / 关闭页面 | 只作补充，不能依赖异步 unload 写入必然完成 |
| 切换 `cid` 时 | 归属无法确认的样本一律丢弃 |

其它要点：
- **存储用媒体秒**（`startSec/endSec`），渲染时才除以有效 `duration`——避免量纲混淆。
- **合并由 background 在事务中完成**（以 `transaction.oncomplete` 为成功依据），避免两路/两标签写同一 `cid` 时后写覆盖先写。
- 观看记录**独立建库**，不要复用 `layerpip-assets-v1` 的版本 1（见 §6.6）。
- `played` 的语义是「**媒体实际播放过**」，不等于「用户看过」。静音 pane、非激活 pane、打开小窗前原网页已播放的部分是否计入，是**产品语义**，必须显式定义，不要暗中由 `isActive`/静音状态决定。

**区间合并**：自己实现正确的并集（排序后处理包含/相邻/跨越/完全重叠）。官方 `pbpZebraCache` 里有已知未合并的脏数据（实测样本同时存在 `[0,0.1411]` 与 `[0.0712,0.1411]`），不要照抄它的合并时机。

> 若因兼容性原因仍必须自建采样（当前不建议），至少要：区分媒体秒与单调时钟、跟踪 `playbackRate` 与 `seeking` 状态、暂停/缓冲不扩展区间、首帧只设起点、`seeked` 后重新设起点、用独立的墙钟节流保存，并**明确 1.5 秒阈值在倍速与后台稀疏事件下不成立**。


### 4.2 官方持久化结构（可选复用为「只读种子」）

| 项 | 值 |
| --- | --- |
| 库 | 页面源 IndexedDB，库名 **`pbp3`**（version 1） |
| 对象存储 | **`pbpZebraCache`**，`keyPath: "cid"` |
| 记录 | `{"cid":137649199,"data":[[0,0.1411],[0.0712,0.1411]],"expire":1792142168858}` |
| 过期 | **30 天**（`2592e6` ms） |
| 字段名 | 当前实现写 **`expire`**；历史独立库 `pbp-3.6.2` 写 **`expireTime`** → **读取时两者都兼容** |

复用建议：
- **只读**并入，作为历史已看区间的种子；**不要写入**（避免污染用户数据、与官方逻辑冲突）。
- 库不存在时**不要创建**：先 `indexedDB.databases()` 探测，再以无版本方式打开，且**不要**在 `onupgradeneeded` 里建表（直接 `open('pbp3')` 会创建空库）。

### 4.3 自建存储（主来源，推荐）

用户可能从没开过官方热力条、也可能只在小窗里看，因此**以自建区间库为主**：

- 放扩展侧（沿用现有 `layerpip-assets-v1` 模式，经 background 存取），按 `cid` 存。
- 已看区间只来自**两个**来源，做一次正确的并集：**自建库 ∪ 官方 `pbp3`（只读、可选）**。

> ⚠️ **不要把 `last_play_time` 当作区间来源。** `x/player/wbi/v2` 的 `last_play_time` 是**单个秒数**（「上次看到」的位置），不是区间；匿名时为 0。
> 早期文档把它列进「三路并集」是错的——那等价于把 `[0, last_play_time]` 整段当成已看，正是要避免的行为。它只能另作**位置标记**（例如「继续观看」入口）。

---

## 5. 渲染规格

### 5.1 SVG 结构（官方当前实现）

```html
<svg viewBox="0 0 1000 100" preserveAspectRatio="none" width="100%" height="100%">
  <defs>
    <clipPath id="…-curve-path" clipPathUnits="userSpaceOnUse">
      <path d="<3.2 的曲线路径>" />
    </clipPath>
    <clipPath id="…-played-path" clipPathUnits="userSpaceOnUse">
      <rect x="0" width="0" y="0" height="100%" />   <!-- clipRect：当前播放段 -->
      <path d="<3.3 的已看区间>" />                  <!-- zebraPath -->
    </clipPath>
  </defs>

  <g fill-opacity="0.2" clip-path="url(#…-curve-path)">
    <!-- ① 未看：白/灰曲线 -->
    <rect width="100%" height="100%" fill="rgba(255, 255, 255)" />
    <!-- ② 已看：主题色，被 played-path 裁剪 -->
    <rect width="100%" height="100%" fill="var(--bpx-primary-color, #00a1d6)"
          clip-path="url(#…-played-path)" />
    <!-- ③ 当前时间竖线 -->
    <line y1="0" y2="100%" style="stroke: rgba(255,255,255,0.2); stroke-width:1" />
  </g>
</svg>
```

**这就是「已看蓝、未看灰」的全部实现**：先铺一层白色（组 `fill-opacity=0.2`，在深色控制栏上呈灰白），再用同形状叠一层主题色，而裁剪路径 = 已看区间 + 当前播放段。

配色（两代实现都在线，供参考）：

| 项 | 当前实现（推荐照抄） | 历史库 pbp-3.6.2 |
| --- | --- | --- |
| 未看填充 | `rgba(255,255,255)` + 组 `fill-opacity=0.2` | `rgb(255,255,255)`，透明度 0.5/0.2/0.1 |
| 已看填充 | `var(--bpx-primary-color, #00a1d6)` | 主题表 `b: rgb(35,173,229)` / 粉 / 红 / 绿 |
| 时间竖线 | `rgba(255,255,255,0.2)`，1px | 同 |
| 容器高度 | 固定 28px | 16 / 28 / 32 |

### 5.2 容器与层级（官方 CSS 原文）

```css
.bpx-player-pbp{bottom:3px;box-sizing:border-box;cursor:pointer;height:28px;left:-12px;
  line-height:28px;opacity:0;padding:0 12px;position:absolute;width:calc(100% + 24px);z-index:-1}
.bpx-player-pbp.show{bottom:100%;left:0;opacity:1;width:100%}
.bpx-player-pbp.pin{opacity:1}
```

默认贴着进度条、`z-index:-1`（在进度条**之下**，不挡交互）、`opacity:0`；控制栏出现时加 `.show` → 抬到进度条正上方并显形。

---

## 6. 与本项目的接线点

### 6.1 渲染落点（关键优势）

进度条本身就在**被移入 PiP 的同一棵 DOM** 里，所以在 `PlayerProgressBar` 内部加覆盖层会**自动**出现在增强小窗，不需要为 PiP 单独布线。

**当前实际几何（0.2.14，本节已于 2026-09-17 按现状重写）**——早期文档引用的 `top:-8px` / `height:16px` / `--offset:38px` / `--progress-track-height` / `--load-color` **都已过期**：

```less
.played-progress-bar {
  --progress-scale: 1;
  position: absolute; top: -12px; left: 12px;
  width: calc(100% - 24px); height: 20px; z-index: 7; cursor: pointer;
  &:hover, &:has(.rc-slider-handle:focus-visible), &.is-seeking { --progress-scale: 1.5; }
}
.rc-slider-rail  { background: rgba(255,255,255,0.2); height: 4px; border-radius: 1.5px;
                   transform: translateY(-50%) scaleY(var(--progress-scale)); }
.rc-slider-track { background: var(--progress-color, #00a1d6) !important; }
.fc-progress-buffer span { background: rgba(255,255,255,0.3); }
.bottom-progress { position: fixed; inset: auto 0 0; height: 2px;
                   background: rgba(255,255,255,0.2);
                   span { background: var(--progress-color, #00a1d6); } }
```

| 文件 | 说明 |
| --- | --- |
| `src/components/VideoPlayerV2/index.tsx` | `{!isLive && <PlayerProgressBar />}` —— 覆盖层挂在它内部即可（**不要引用固定行号，源码在变动**） |
| `src/components/VideoPlayerV2/bottomPanel/PlayerProgressBar.tsx` | `.played-progress-bar` 容器、`.bottom-progress`、`.fc-progress-buffer` |
| `src/components/VideoPlayerV2/bottomPanel/PlayerProgressBar.less` | 上述几何与颜色变量 |
| `src/components/ProgressBar/index.tsx` | 基于 `@apad/rc-slider` 的滑块 |

对实现有影响的三个要点：

1. **命中区是稳定的 20px**，视觉轨道通过 `scaleY(var(--progress-scale))` 在 hover / seeking 时放大到 1.5 倍。**不要按「轨道自身变形」的思路做**，覆盖层也不得改变这个命中区。
2. 颜色变量是 **`--progress-color`**（默认 `#00a1d6`），不是旧文档里的 `--load-color` / `#0669ff`。
3. 存在一条独立的 `.bottom-progress` **常驻底部 2px 细线**（由 `playedPercent` 驱动），控制栏显隐时它会淡入淡出。接线时要一起考虑语义一致性。

> **语义边界（必须写死，否则实施者会误改主轨道）**：
> 主轨道（`.rc-slider-track` 与 `.bottom-progress`）= **本次播放位置前缀**，**保持现状不动**。
> 新增的蓝色只作用于**高能曲线层**，表示**历史已看区间**。
> B 站自身就是这个双层结构（实测：主轨道前缀 `rgb(0,174,236)`；高能条 `playedRect` 裁剪到已看区间），两者含义不同，**不要合并成一层**。

> 参考先例：`.fc-progress-buffer` 已经在用**真实 `webVideo.buffered` 区间**渲染多段缓冲，与 §4.1 用 `played` 表达已看区间是同一套 TimeRanges 思路，可复用其渲染方式。

需要注意的两个既有状态（实施前先做视觉核对，别先假定）：

1. 覆盖层要以 `.played-progress-bar` 的**内容宽度**为基准（`left:12px` + `width: calc(100% - 24px)`），不要相对整个控制栏。
2. 控制栏隐藏时 `.bottom-progress` 常驻细线会显示，`.played-progress-bar` 仍按上面的几何定位。覆盖层必须两种状态下都核对，否则错位。


### 6.2 建议的模块划分（不要把这些逻辑写进 React 组件）

| 模块 | 位置（建议） | 职责 |
| --- | --- | --- |
| `BilibiliPbpApi` | `src/api/bilibili/`（新增方法） | 拼 URL（含 `r=loader`）、fetch、`parse()` 成 `{points, stepSec}` 或 `null`；超时与错误归一化 |
| `HighEnergyBarAdapter` | `src/web-provider/bilibili/video/` | 绑定 `aid/cid`、代次守卫、缓存、切 P 重取；向渲染层暴露按媒体时间归一的曲线 |
| `WatchedRangeStore` | `src/core/`（新增） | 区间采集、并集合并、按 `cid` 持久化；只读并入官方 `pbp3` |
| `HeatBarOverlay` | `src/components/VideoPlayerV2/bottomPanel/` | 纯渲染：SVG 结构 + 路径生成 + 裁剪更新 |
| 纯函数 | `curvePath.ts` / `zebraPath.ts` | `calcPoints` / `generateBezierCurvePath` / `generateZebraPath` / `mergeRanges`，便于与官方算法对拍 |

### 6.3 取数路径参考

B 站取数现有两种写法，本功能照第一种（内容脚本直接 fetch）：

- `src/web-provider/bilibili/utils.ts`：`fetch('https://api.bilibili.com/x/player/wbi/v2?…', { credentials:'include' })` —— 直连 api.bilibili.com。
- `bvc.bilivideo.com/pbp/data` 同为 CORS `*`，且**连 Cookie 都不需要**，直接 fetch 即可。

### 6.4 代次守卫（必须照做）

沿用 `src/web-provider/bilibili/video/SubtitleManager.ts` 的模式：

```ts
const generation = this.getLifecycleGeneration()
const data = await api.fetch(...)
if (!this.isLifecycleCurrent(generation)) return   // 旧代次结果一律丢弃
```

### 6.5 新增配置与文案

- 配置：`src/store/config/index.tsx` 的 `config({ defaultValue, label, desc, relateBy })`；命名空间按 `PROJECT_IDENTITY.md` 用 `LAYERPIP_*_V1`；隐藏不变量集中在 `src/store/config/layerPip.ts`。
- 文案：`src/locales/zh_CN.json` 等 8 个语言文件的 `settingPanel` 段。
- **首版只保留两个概念**：「显示已看区间」与「显示高能曲线」。颜色跟随主题蓝、透明度与高度用已确认规格。
  颜色选择、本地近似曲线、多层总开关等**先不要加**（尚无必要，且会拖长首版）。

### 6.6 观看记录的持久化（不能「沿用」资产库）

**现状（源码核对）**：`src/background/subtitleAssets.ts` 使用库 `layerpip-assets-v1`、**`DATABASE_VERSION = 1`**，且只有 **`subtitle-assets` 一个 store**。

因此：
- **不能**在版本 1 上直接加一个 store——加 store 必须走版本升级。请**独立新建观看记录库**（对字幕资产零影响），或按项目的数据变更规则正式升级。
- 该文件里的 `runRequest` 在 **`request.onsuccess` 就 resolve**，不是 `transaction.oncomplete`，**不作为提交成功依据**。新功能的写入必须以**事务完成**为准，不要直接复制它当模板。
- 合并写入统一放 background 用事务完成，避免两路/两标签同时写同一 `cid` 时**后写覆盖先写**。
- 需要一并定义：记录寿命、清除入口、体积上限、相邻区间合并容差、重复上报幂等、`duration` 变化、过期回收。
- **布局记录与观看区间不要混成一种数据。**


---

## 7. 坑清单（症状 → 原因 → 处理）

| # | 症状 | 原因 | 处理 |
| --- | --- | --- | --- |
| 1 | 接口稳定返回 404 HTML | 少了 `r=loader`（或用了 `api.bilibili.com/pbp/data`） | 补上 `r=loader`；不要用旧文档里的 `cid=` 单参数写法 |
| 2 | 接口 200 但画不出曲线 | `step_sec=0`、点数组为空，是「该视频弹幕量不足」的**正常状态** | 按 §2.3 判定；无数据时只做 F1，不报错不提示 |
| 3 | 曲线形状与 B 站不一致 | 归一化/补零/贝塞尔公式抄错 | 用 §3 的精确公式，并对实测 fixture 做**逐字符串对拍** |
| 4 | 峰值位置偏移 | 用了数据长度而非 `floor(duration/stepSec)` 补零 | 严格按 §3.1 |
| 5 | 小窗里曲线挡住拖动/悬停预览 | 覆盖层吃掉了指针事件 | 覆盖层 `pointer-events: none`；**第一版不做点击 seek**（官方容器虽是 `cursor:pointer` + 点击跳转，但本项目要保护拖动、`pointerup` 兜底与焦点归还） |
| 6 | 小窗播放卡顿/掉帧 | 每个 `timeupdate` 重建整条路径字符串（100 点约 3–4KB） | 路径按 `(cid, points, stepSec)` **记忆化**；每帧只用 `ref.setAttribute` 改 `clipRect.x/width` 与 `line.x1/x2` |
| 7 | 切 P 后出现上一个视频的曲线 | 旧响应写回了新状态 | 代次守卫（§6.4）；`cid` 变了整条链路重置 |
| 8 | 与官方数据不一致（已看区间） | 官方 `pbpZebraCache` 里存在未合并的重叠区间 | 自己实现正确的区间并集；不要把官方数据当已排序已归并 |
| 9 | 读取 `pbp3` 后凭空多出一个空库 | `indexedDB.open('pbp3')` 在库不存在时会**创建**它 | 先 `indexedDB.databases()` 探测，只读打开，不注册建表 |
| 10 | 过期判断失效 | 字段名两代不一致：`expire` vs `expireTime` | 两者都读 |
| 11 | 窄窗口下曲线错位 | 只适配了常驻控制栏态，没处理贴底态 | 覆盖层跟随 `.played-progress-bar` 的几何，两种状态都核对 |
| 12 | 关闭功能后仍在发请求 | 没在总开关关闭时停止取数 | 总开关关闭 → 不再拉取；缓存按 cid 有界 |
| 13 | 曲线在纯色背景上几乎看不见 | 直接用官方的白 0.2（B 站是深色控制栏） | 默认跟随小窗主题色，提供「跟随 B 站配色」开关 |
| 14 | 长视频点数过多 | 未降采样 | 长数组按显示宽度降采样；拒绝 NaN/负值/异常大小 |

---

## 8. 分期实施与验收

### P0 — 纯函数与接口（无 UI 变更）

- 实现 `BilibiliPbpApi`（含 `r=loader`、`parse()`、超时与错误归一化）。
- 实现纯函数：`calcPoints` / `generateBezierCurvePath` / `generateZebraPath` / `mergeRanges`。
- 用实测 fixture（`BV1GJ411x7h7`、`BV1h54y1L7oe` 的数据）与官方算法**逐字符串对拍**。
- 出口：契约测试 + 对拍测试通过，未接 UI。

### P1 — F1 双色已看（所有视频生效）

- `WatchedRangeStore`：采集（跳跃 >1.5s 分段）、并集、按 cid 持久化；只读并入官方 `pbp3`。
- 覆盖层先做「纯色带」形态：没有曲线数据时也能把已看区间着成主题色。
- 出口：任意视频（含无热力条的 D2L 课程）都能看到双色；切 P 不串数据；小窗关闭重开保持。

### P2 — F2 官方曲线

- 接曲线绘制；`show/hide` 跟随控制栏与总开关；320/480/800 px 与贴底模式视觉核对。
- 出口：与 B 站同一视频的曲线形态、峰值位置、已看着色位置一致；拖动/快捷键回归通过。

### P3（可选）— 本地弹幕密度近似

- 默认关闭。开启时用项目已下载的弹幕做密度曲线，UI 必须明确标注「本地近似，非官方数据」。
- 出口：给出与官方数据的偏差说明，不宣传为复刻。

### 代码侧测试清单

| 项 | 覆盖 |
| --- | --- |
| 接口契约 | 有数据 / `step_sec=0` / `err_id:3` / 404 / 超时 / 非法 JSON / `modules` 为空 |
| 路径对拍 | 与官方算法逐字符串一致（补齐、峰值、全零、单点、长度不匹配） |
| 区间合并 | 相邻、包含、跨越、完全重叠、乱序、单点、脏数据（用 §4.2 的实测样本） |
| 代次与生命周期 | 连续切 P 只保留最后一次；旧响应不写入；SPA 换 cid 后旧曲线消失 |
| 存储 | 官方 `pbp3` 不存在时不被创建；`expire`/`expireTime` 双兼容；过期记录忽略 |
| 配置 | 总开关关闭后不再请求；非法配置归一化 |

### 用户实机验收（不可替代）

1. 有热力条的视频（如 `BV1GJ411x7h7`）：小窗曲线形态、峰值位置、已看蓝色位置与 B 站网页一致。
2. 无热力条的视频（如 `BV15UREYsEN8`）：无曲线，但双色正常。
3. 拖动、跳转、倍速、暂停后继续：已看区间正确累积，不出现大面积误着色。
4. 切 P、换视频、关闭再打开小窗：无串数据、无残留曲线。
5. 关闭总开关：不再请求，界面无残留。
6. 窄窗口 320/480/800 px 与控制栏贴底模式：不遮挡时间文字、悬停预览与滑块。

---

## 9. 背景：旧结论为什么说「接口不可用」（不必细读）

`player-ui-and-ai-continuity-plan.md` 第 3 节记录「`bvc.bilivideo.com/pbp/data` 与 `api.bilibili.com/pbp/data` 均 404，不能确认接口可用」。

**原因是请求写法缺失，不是接口下线**：官方取数必须带查询参数 `r=loader`，补齐后匿名即可取得完整曲线。旧结论据此作废，实施方案以本文为准。

同时修正一条定义：热力条**不是**「重复观看次数」「AI 精彩度」的简单代理，而是**单位时间弹幕密度**（独立实现「前方高能」README 亦称其为弹幕密度，并明确因官方推出该功能而停更）。

---

## 10. 未验证事项（不要对外宣称）

- 未在**登录态**、**真实 macOS Edge**、**真实 Document PiP 小窗**中验证（本轮为匿名无头 Chromium 的接口与 DOM 取证）。
- 未验证「只在增强小窗里观看时，官方 `pbp3` 是否也会被写入」——方案已用「自建库为主」规避该不确定性。
- 未验证番剧 / 互动视频 / 付费内容 / 直播下的接口行为。
- 未验证官方对超长视频的点数上限与降采样策略。

---

## 11. 证据索引

### 接口与算法来源（运行时抓取，2026-09-16）

| 对象 | 位置 |
| --- | --- |
| 取数 | 播放器 chunk `npd.911.<hash>.js` → `HttpPbp`（`url='//bvc.bilivideo.com/pbp/data'`，`params` 追加 `r:'loader'`，`withCredentials:false`） |
| 曲线类与算法 | 同一 chunk：`svgW=1000, svgH=100, increasedHeightRatio=0.2`；`calcPoints` / `generateBezierCurvePath` / `generateZebraPath` / `refresh` / `updateZebraAreas` / `executeZebraCached` |
| 持久化 | 同一 chunk：`{dbNamde:'pbp3', storeName:'pbpZebraCache', keyPath:'cid'}`，`expire = Date.now() + 2592e6` |
| 容器 CSS | chunk `a131590b6a…`：`.bpx-player-pbp{…}` / `.bpx-player-pbp.show{…}` |
| 用户开关 | chunk `2cbbaa0c04…`：i18n `highlightProgressBar:"高能进度条"`，绑定 `progressStore.state.pbpstate` |
| 历史独立库 | `https://i0.hdslb.com/bfs/static/pbp/pbp-3.6.2.min.js`（同算法；配色 `b/p/r/g`、透明度 `0.5/0.2/0.1`、高度 `16/28/32`） |

### 实测记录

- `curl 'https://bvc.bilivideo.com/pbp/data?aid=80433022&cid=137649199&bvid=BV1GJ411x7h7&r=loader'` → 200，`step_sec=9`、95 点、`tagstr` 含 `pbphide_0`、`debug.total_dm:1155`；响应头 `access-control-allow-origin: *`。
- 去 `r=loader` 或换 `api.bilibili.com` → 404 HTML 错误页。
- Playwright + Chromium 匿名会话在 `BV1GJ411x7h7`：`pbp/data` 触发 1 次 200；IndexedDB `pbp3@1` 存在，`pbpZebraCache` 记录 `{"cid":137649199,"data":[[0,0.1411],[0.0712,0.1411]],"expire":1792142168858}`。

### 外部参考

- [bilibili-API-collect · 高能进度条（pbp）](https://github.com/pskdje/bilibili-API-collect/blob/main/docs/video/pbp.md) —— 字段说明；其 `cid=` 单参数示例**已失效**。
- [peterwang1996/QianFangGaoNeng](https://github.com/peterwang1996/QianFangGaoNeng) —— 独立弹幕密度实现，README 说明因官方推出「高能进度条」而停更。
- B 站工程师演讲《高能进度条：视频交互体验优化》<https://static.ucloud.cn/9e53521b2b86413180ce786add891e29.pdf> —— 产品背景，不代表当前接口。

### 本项目内部参考

- `src/components/VideoPlayerV2/index.tsx:475`、`src/components/VideoPlayerV2/bottomPanel/PlayerProgressBar.tsx`、`.less`、`src/components/ProgressBar/index.tsx`
- `src/store/config/index.tsx`、`src/store/config/layerPip.ts`、`src/locales/zh_CN.json`
- `src/web-provider/bilibili/utils.ts`、`src/web-provider/bilibili/video/SubtitleManager.ts`（代次守卫范式）、`src/background/subtitleAssets.ts`（`layerpip-assets-v1`）
- `docs/system-architecture.md` 第 4 节（增强小窗数据与控制流）
