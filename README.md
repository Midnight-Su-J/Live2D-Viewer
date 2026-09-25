# Live2D 动画查看器

一个基于 [PixiJS](https://pixijs.com/) + [pixi-live2d-display](https://github.com/guansss/pixi-live2d-display) 的网页 Live2D 模型查看器。全屏无边距显示，支持**本地模型文件夹加载**、动作/表情/说话三轨道切换、背景自定义（纯色 HSL / 图片 / 透明拍摄）、截图与视频录制、人物拖拽平移、滚轮缩放、播放速度调节、循环播放等。

项目采用工程化目录结构，CSS 和 JS 按业务模块拆分，无需构建工具，通过原生 ES Module 组织代码。所有依赖库均为本地文件，**完全离线可用**。

支持 **Cubism 2**（`.moc`）与 **Cubism 4**（`.moc3`）模型。

---

## 功能特性

### 核心播放

| 功能 | 说明 |
|------|------|
| 全屏显示 | 画布铺满整个视口，无 padding / margin / border / 滚动条 |
| 文件夹加载 | 选择包含 `.model.json` / `.model3.json` 的整个文件夹，自动解析所有引用资源 |
| 三轨道切换 | 按名称前缀自动分类：`b_` 动作、`e_` 表情、`t_` 说话，三个下拉框独立切换 |
| 拖拽平移 | 鼠标左键拖拽移动人物（支持触屏单指拖拽） |
| 缩放 | 鼠标滚轮以光标为中心缩放（支持触屏双指捏合） |
| 重置视图 | 双击画布或点击「重置视图」按钮，恢复模型默认适配视口 |
| 播放控制 | 播放 / 暂停、循环开关、速度调节（0–3x） |
| 默认不自动播放 | 载入模型后停在首帧，需手动点击播放 |
| 动作即时切换 | 动作播放中选择另一个动作会立即切换（FORCE 优先级） |
| 循环播放 | 开启后动作播放完毕自动重播当前动作 |

### 背景设置

| 功能 | 说明 |
|------|------|
| 纯色背景 | HSL 三色滑块实时调色，点击颜色预览块应用为纯色背景 |
| 透明背景（仅人物） | 开启后拍摄/录制时只输出人物，不绘制背景 |
| 背景图片 | 上传图片作为背景，长按 `B` 键 + 鼠标拖拽移动背景图，滚轮缩放背景图 |
| 使用上次背景 | 自动记住上次使用的背景图（localStorage），一键恢复 |

### 拍摄与录制

| 功能 | 说明 |
|------|------|
| 截图 | 导出 PNG / JPEG / WebP，画面仅含人物与背景，不含 UI 控件和鼠标光标 |
| 视频录制 | 导出 MP4 / WebM，点击「开始」后显示悬浮控制栏，需再点「录制」才真正开始 |
| 悬浮控制栏 | 显示录制状态、计时、暂停/继续、停止按钮；可用鼠标拖动到任意位置 |
| 暂停不重置时间 | 暂停录制后计时保持连贯，继续时从暂停处累加 |
| 透明拍摄 | 开启透明背景后，截图/视频输出带透明通道的纯人物画面 |

### 其他

| 功能 | 说明 |
|------|------|
| 全屏 | 一键进入 / 退出浏览器全屏 |
| 控件显隐 | 按 `H` 键显示 / 隐藏所有浮层控件，纯享画面 |
| 加载容错 | 模型加载失败时显示错误提示，不会卡死在 loading 界面 |

---

## 技术栈

- **HTML5 + CSS3**：页面结构与浮层 UI
- **原生 JavaScript（ES Module）**：交互逻辑、手动平移缩放、动作切换、拍摄录制
- **PixiJS v7.3.2**（本地 `lib/pixi.min.js`）：2D 渲染引擎，承载 Live2D 模型
- **Live2D Cubism Core**（本地 `lib/live2dcubismcore.min.js`）：Cubism 4 核心解析库
- **pixi-live2d-display v0.4.0（cubism4 构建）**（本地 `lib/pixi-live2d-display.cubism4.min.js`）：将 Live2D 模型封装为 PixiJS DisplayObject
- **WebGL**：底层渲染（由 PixiJS 封装）
- **Canvas 2D + MediaRecorder + captureStream**：截图合成与视频录制

---

## 文件结构

```
Live 2D viewer/
├── index.html              # 页面结构 + 外部 CSS/JS 引用（无内联样式和脚本）
├── css/                    # 样式表（按 UI 模块拆分）
│   ├── base.css            # 全屏布局、容器、canvas、loading、error、遮罩
│   ├── controls.css        # 底部控制栏、左上角提示、右上角按钮
│   ├── panels.css          # 文件/背景/拍摄面板、HSL 滑块
│   ├── capture.css         # 拍摄悬浮控制栏
│   └── background.css      # B 键背景模式指示器
├── src/                    # 业务逻辑（按职责拆分，ES Module）
│   ├── main.js             # 入口：全局状态、DOM 引用、模块协调、模型加载流程
│   ├── modelLoader.js      # 模型资源加载：文件夹解析、路径改写、PixiJS 应用创建/销毁
│   ├── animation.js        # 动画控制：动作/表情/说话切换、播放/暂停、循环、速度、重置视图
│   ├── background.js       # 背景：HSL 纯色、背景图、透明拍摄
│   ├── capture.js          # 拍摄/录制：截图、视频录制、悬浮栏
│   ├── interaction.js      # 交互：平移/缩放、触屏、B/H 快捷键
│   └── ui.js               # UI 面板：面板开关、文件输入、全屏、错误提示
├── lib/                    # 第三方库（本地文件，离线可用）
│   ├── pixi.min.js                         # PixiJS v7.3.2
│   ├── live2dcubismcore.min.js             # Live2D Cubism 4 Core
│   └── pixi-live2d-display.cubism4.min.js  # pixi-live2d-display cubism4 构建
├── README.md               # 本文件
└── 改进过程.md             # 开发改进历程记录
```

### 模块架构

所有 JS 模块通过 `setupXxx(state, dom)` 接收共享上下文：

- **`state` 对象**：集中管理所有可变状态（app、model、动作条目、背景参数、录制状态等），模块间通过它通信，避免循环依赖
- **`dom` 对象**：集中保存所有 DOM 元素引用
- **`main.js`**：唯一入口，负责创建 state/dom、初始化各模块、处理模型加载的 UI 回调

---

## 快速开始

模型资源通过本地文件夹选择加载，无需放到项目目录。但 `index.html` 本身需要通过 HTTP 访问（浏览器 `file://` 协议对 ES Module 和部分 API 有限制）。

### 启动本地服务器

```bash
# Python 3
python -m http.server 8000
```

启动后浏览器访问 `http://localhost:8000/`。

### 加载 Live2D 模型

1. 点击右上角「打开文件夹」
2. 选择包含 `.model.json`（Cubism 2）或 `.model3.json`（Cubism 4）的模型文件夹
3. 点击「加载」即可

> **注意**：必须选择**整个模型文件夹**，程序会自动解析模型 JSON 中引用的所有资源（moc、贴图、动作、表情等）并建立映射。

---

## 操作说明

### 人物操控

| 操作 | 效果 |
|------|------|
| 左键拖拽画布 | 平移人物 |
| 滚轮 | 以光标为中心缩放 |
| 双击画布 | 重置视图（适配当前视口） |
| `H` 键 | 显示 / 隐藏所有浮层控件 |

### 背景图操控

| 操作 | 效果 |
|------|------|
| 长按 `B` + 左键拖拽 | 移动背景图 |
| 长按 `B` + 滚轮 | 缩放背景图 |

### 动画控制

| 控件 | 效果 |
|------|------|
| 动作 / 表情 / 说话下拉框 | 切换对应轨道的动画 |
| 播放 / 暂停按钮 | 控制动画播放 |
| 循环按钮 | 切换是否循环播放当前动作 |
| 重置视图按钮 | 恢复模型默认视口 |
| 速度滑块 | 调整播放速度 0–3x |

### 拍摄与录制

| 操作 | 效果 |
|------|------|
| 「拍摄」按钮 → 选「截图」→「开始」 | 直接截图下载 |
| 「拍摄」按钮 → 选「录制」→「开始」 | 显示悬浮栏，再点「录制」开始录像 |
| 悬浮栏「⏸ 暂停」/「▶ 继续」 | 暂停/继续录制，时间保持连贯 |
| 悬浮栏「⏹ 停止」 | 停止并保存视频 |
| 悬浮栏标题栏拖拽 | 移动悬浮栏位置 |

触屏设备：单指拖拽平移，双指捏合缩放。

---

## 关键实现说明

### 本地文件夹加载与路径改写

Live2D 模型 JSON 中引用的资源路径（moc、贴图、动作等）是相对路径。选择文件夹后：

1. 遍历文件夹中所有文件，建立 `webkitRelativePath → File` 的映射表
2. 读取模型 JSON，收集其中所有引用的资源路径
3. 将每个引用路径与文件夹中的实际文件匹配
4. 为每个文件创建 blob URL，改写 JSON 中的路径为 blob URL
5. 将改写后的 JSON 转为 blob URL，传给 `Live2DModel.from()`

这种方式绕过了 `pixi-live2d-display` 的 File[] 上传模式（该模式存在多个 bug），直接用 blob URL 让库按正常网络请求流程加载资源。

### PixiJS url.resolve 补丁

PixiJS 的 `url.resolve` 在 base 为 blob URL 时会破坏第二个 URL（丢失冒号，如 `blob:http://` 变成 `blobhttp://`）。通过 `Object.defineProperty` 覆盖 `PIXI.utils.url.resolve`：若 url 已是绝对 URL（`blob:` / `data:` / `http:` 等）则直接返回。

### Live2D 模型定位

`pixi-live2d-display` 将 Live2D 画布底部中心（角色脚底）映射到 PixiJS bounds 的垂直中心，角色占据 bounds 上半部分，下半部分为空。因此：

- 使用中心锚点 `anchor.set(0.5, 0.5)`
- `x = screenW / 2`
- `y = screenH * 0.9`（画布中心放在屏幕 90% 高度，使角色整体居中且头顶不被遮挡）

### 缩放计算

**必须使用 `model.internalModel.width / height`**（未缩放的原始画布尺寸），因为 `model.width = internalModel.width * scale.x`。若用 `model.width` 计算新缩放会产生反馈循环，导致重置视图时第一次算出过大的缩放（放大到脚部）。

### 播放/暂停控制

pixi-live2d-display 默认 `autoUpdate: true`，模型会注册到自动启动的 `Ticker.shared`，导致暂停时动画仍在后台更新。

解决方案：加载时传 `autoUpdate: false`，手动将 `model.update(dt)` 注册到 `app.ticker`。通过 `app.ticker.start() / stop()` 统一控制播放与暂停，暂停时动画真正停止。

### 动作切换与循环

`model.motion(group, index, priority)` 默认使用 `NORMAL` 优先级，已有同优先级动作时 `reserve()` 会拒绝。切换和重播统一传入 `MotionPriority.FORCE`（值为 `3`），始终覆盖当前动作。

循环播放通过监听 `motionManager` 的 `motionFinish` 事件实现。注意该事件在 `state.complete()` **之前**触发，此时 `currentGroup` 尚未清空，立即调用 `motion()` 会被拒绝。需用 `setTimeout(playItem, 0)` 推迟到当前 update 循环结束后执行。

### 暂停状态下的渲染

暂停时 ticker 停止，模型的平移/缩放变化不会自动渲染。在拖拽和滚轮事件处理中，若 `!state.playing` 则手动调用 `app.render()`，使操作效果立即可见。

### 拍摄/录制合成

拍摄画面在离屏 Canvas 上合成，确保 UI 控件和光标不进入画面：

1. 填充纯色背景（透明拍摄模式跳过）
2. 绘制背景图（透明拍摄模式跳过）
3. 绘制 PixiJS 渲染画布

视频录制使用 `canvas.captureStream(30)` + `MediaRecorder`，支持暂停/继续。

### 资源清理与重载

每次加载新模型前，彻底清理旧实例：

1. `app.destroy(true)` 销毁 PixiJS 应用
2. 回收旧 blob URL（`URL.revokeObjectURL`）
3. 移除容器内所有残留 canvas

---

## 常见问题

**Q：加载后模型位置/大小不对？**
A：`fitModelToScreen()` 中已针对 Live2D 坐标系做了适配。如需微调，修改 `src/main.js` 中的 `screenH * 0.9`（垂直位置）和缩放系数 `1.14`。

**Q：动作不循环播放？**
A：确保点击了「循环」按钮（显示「循环：开」）。循环通过 `motionFinish` 事件实现，动作自然结束后自动重播。

**Q：切换动作不立即生效？**
A：已使用 `FORCE` 优先级确保即时切换。若仍有问题，检查控制台是否有报错。

**Q：暂停时滚轮/拖拽没反应？**
A：暂停状态下操作后会手动渲染一帧，效果应立即可见。若无效，检查控制台是否有报错。

**Q：支持 Cubism 2 模型吗？**
A：代码中预留了 Cubism 2 支持（`.model.json` + `.moc`），但当前仅内置了 Cubism 4 Core。如需支持 Cubism 2，需额外引入 Cubism 2 Core 并使用包含双版本的 pixi-live2d-display 构建。
