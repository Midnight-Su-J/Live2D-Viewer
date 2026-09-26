/**
 * main.js
 * 入口：全局状态、DOM 引用、模块初始化、模型加载协调
 *
 * 加载流程：
 *   选择文件夹 → 定位 .model3.json → 收集引用资源路径 → 改写为 blob URL →
 *   创建 PixiJS 应用 → Live2DModel.from 加载 → 填充动作/表情/说话下拉框
 *
 * 注意：PixiJS 的 url.resolve 会破坏 blob URL，已在文件顶部打补丁修复。
 */
import {
    readFileAsText,
    findModelJsonFile,
    collectReferencedPaths,
    rewritePaths,
    buildFileMap,
    getModelDir,
    disposeApp,
    cleanContainer,
    revokeBlobUrls,
    createPixiApp,
    loadLive2DModel
} from './modelLoader.js';
import { setupAnimation } from './animation.js';
import { setupBackground } from './background.js';
import { setupCapture } from './capture.js';
import { setupInteraction, setupTouch } from './interaction.js';
import { setupUI } from './ui.js';
import { setupParams } from './params.js';

// ===== 修复 PixiJS url.resolve 对 blob URL 的破坏 =====
// PixiJS 的 url.resolve 在 base 为 blob URL 时会破坏第二个 URL（丢失冒号），
// 导致模型引用的 blob 资源加载失败。这里打补丁：若 url 已是绝对 URL 则直接返回。
// 注意：PIXI.utils.url.resolve 是只读 getter，需用 Object.defineProperty 覆盖。
(function patchUrlResolve() {
    const PIXI = window.PIXI;
    if (!PIXI || !PIXI.utils || !PIXI.utils.url) return;
    const originalResolve = PIXI.utils.url.resolve;
    if (typeof originalResolve !== 'function') return;
    const ABSOLUTE_RE = /^(blob:|data:|https?:|file:|\/)/;
    const patched = function (base, url) {
        if (url && ABSOLUTE_RE.test(url)) return url;
        return originalResolve(base, url);
    };
    try {
        Object.defineProperty(PIXI.utils.url, 'resolve', {
            value: patched,
            writable: true,
            configurable: true,
            enumerable: true
        });
    } catch (e) {
        console.warn('[Live2D] url.resolve 补丁失败：', e.message);
    }
})();

// ===== DOM 元素引用 =====
const dom = {
    // 通用状态提示
    loading: document.getElementById('loading'),
    errorTip: document.getElementById('errorTip'),
    controls: document.getElementById('controls'),
    hint: document.getElementById('hint'),
    // 动画控制栏
    actionSelect: document.getElementById('actionSelect'),
    expressionSelect: document.getElementById('expressionSelect'),
    speechSelect: document.getElementById('speechSelect'),
    playBtn: document.getElementById('playBtn'),
    loopBtn: document.getElementById('loopBtn'),
    resetViewBtn: document.getElementById('resetViewBtn'),
    speedSlider: document.getElementById('speedSlider'),
    speedText: document.getElementById('speedText'),
    bgBtn: document.getElementById('bgBtn'),
    fsBtn: document.getElementById('fsBtn'),
    container: document.getElementById('container'),
    bgImage: document.getElementById('bgImage'),
    bgModeIndicator: document.getElementById('bgModeIndicator'),
    // 拍摄/录制
    captureBtn: document.getElementById('captureBtn'),
    capturePanel: document.getElementById('capturePanel'),
    photoSection: document.getElementById('photoSection'),
    videoSection: document.getElementById('videoSection'),
    photoFormat: document.getElementById('photoFormat'),
    videoFormat: document.getElementById('videoFormat'),
    closeCaptureBtn: document.getElementById('closeCaptureBtn'),
    startCaptureBtn: document.getElementById('startCaptureBtn'),
    captureHint: document.getElementById('captureHint'),
    transparentBgBtn: document.getElementById('transparentBgBtn'),
    captureFloat: document.getElementById('captureFloat'),
    captureFloatIndicator: document.getElementById('captureFloatIndicator'),
    captureFloatTime: document.getElementById('captureFloatTime'),
    captureFloatShoot: document.getElementById('captureFloatShoot'),
    captureFloatPause: document.getElementById('captureFloatPause'),
    captureFloatStop: document.getElementById('captureFloatStop'),
    // 文件选择（文件夹）
    openFileBtn: document.getElementById('openFileBtn'),
    filePanel: document.getElementById('filePanel'),
    panelOverlay: document.getElementById('panelOverlay'),
    folderInput: document.getElementById('folderInput'),
    folderName: document.getElementById('folderName'),
    loadFileBtn: document.getElementById('loadFileBtn'),
    cancelFileBtn: document.getElementById('cancelFileBtn'),
    clearFolderBtn: document.getElementById('clearFolderBtn'),
    // 背景设置
    bgPanel: document.getElementById('bgPanel'),
    hueSlider: document.getElementById('hueSlider'),
    satSlider: document.getElementById('satSlider'),
    lightSlider: document.getElementById('lightSlider'),
    hueVal: document.getElementById('hueVal'),
    satVal: document.getElementById('satVal'),
    lightVal: document.getElementById('lightVal'),
    hslPreview: document.getElementById('hslPreview'),
    hslHex: document.getElementById('hslHex'),
    bgImageInput: document.getElementById('bgImageInput'),
    clearBgImage: document.getElementById('clearBgImage'),
    closeBgPanelBtn: document.getElementById('closeBgPanelBtn'),
    useLastBgBtn: document.getElementById('useLastBgBtn'),
    // 参数调节面板
    paramsBtn: document.getElementById('paramsBtn'),
    paramsPanel: document.getElementById('paramsPanel'),
    paramsList: document.getElementById('paramsList'),
    paramsSearch: document.getElementById('paramsSearch'),
    paramsResetAllBtn: document.getElementById('paramsResetAllBtn'),
    // 眼球跟随指示器
    eyeFollowIndicator: document.getElementById('eyeFollowIndicator')
};

// ===== 全局共享状态 =====
const state = {
    // --- Live2D 播放相关 ---
    app: null,                     // PixiJS Application 实例
    model: null,                   // Live2DModel 实例
    loaded: false,                 // 模型是否加载完成
    playing: false,                // ticker 是否在运行（播放中）
    isLoop: false,                 // 是否循环播放
    currentMotion: '',             // 当前动作组名
    currentItem: null,             // 当前播放的条目（用于循环重播）
    _motionStarted: false,         // 标记动作已启动（循环检测用）
    // 三个轨道的可选条目：{ type:'motion'|'expression', group?, index?, name }
    actionItems: [],
    expressionItems: [],
    speechItems: [],
    // --- 背景图操控 ---
    bKeyHeld: false,
    bgScale: 1,
    bgX: 0, bgY: 0,
    isBgPanning: false,
    bgPanLastX: 0, bgPanLastY: 0,
    // --- 角色平移 ---
    isPanning: false,
    lastX: 0, lastY: 0,
    // --- 拍摄 ---
    transparentCapture: false,
    captureMode: 'photo',
    mediaRecorder: null,
    recordStream: null,
    recordRafId: null,
    recordCanvas: null,
    recordedMs: 0,
    segmentStart: 0,
    recordTimerId: null,
    isRecording: false,
    isVideoPaused: false,
    // --- 悬浮栏拖动 ---
    isFloatDragging: false,
    floatDragOffsetX: 0, floatDragOffsetY: 0,
    // --- 眼球跟随光标 ---
    eyeFollow: false,
    eyeMouseX: 0, eyeMouseY: 0,
    // --- 参数面板覆盖值（paramId -> value），拖动中生效 ---
    paramOverrides: {},
    // --- 持久参数值（paramId -> value），松开后保持，每帧重新应用 ---
    //     若参数被当前动作控制，会在 ticker 中自动检测并移除，恢复动作轨迹
    persistentParams: {},
    // --- 资源管理 ---
    lastBlobUrls: []
};
// 暴露到 window 便于调试
window._state = state;

// ===== 初始化各业务模块 =====
const ui = setupUI(state, dom);
state.bgUpdate = setupBackground(state, dom);
setupAnimation(state, dom);
setupCapture(state, dom);
setupInteraction(state, dom);
const params = setupParams(state, dom);
// 模型原始 JSON（用于参数中文名查找等），在 createPlayer 中赋值
state.modelJson = null;
// 从 .cdi3.json 提取的参数 ID → 中文名 映射，在 createPlayer 中赋值
state.cdiNameMap = {};

// ===== 从模型 JSON 中提取可播放条目（按文件名前缀分类） =====
// 规则：b_ → 动作，e_ → 表情，t_ → 说话；无前缀默认归入动作
// 同时把模型原生表情（.exp3.json）归入表情，通过 model.expression() 设置
function extractSelectableItems(modelJson) {
    const items = { action: [], expression: [], speech: [] };
    const push = (category, item) => items[category].push(item);

    // 1. 动作文件（motions）按文件名前缀分类
    const motionsObj = (modelJson.FileReferences && modelJson.FileReferences.Motions) || modelJson.motions || {};
    for (const [groupName, groupList] of Object.entries(motionsObj)) {
        (groupList || []).forEach((entry, index) => {
            const file = entry.File || entry.file || '';
            const fileName = file.split('/').pop();
            const displayName = fileName.replace(/\.(motion3\.json|mtn)$/i, '');
            const lower = displayName.toLowerCase();
            let category = 'action';
            if (lower.startsWith('b_')) category = 'action';
            else if (lower.startsWith('e_')) category = 'expression';
            else if (lower.startsWith('t_')) category = 'speech';
            push(category, {
                type: 'motion',
                group: groupName,
                index,
                name: displayName
            });
        });
    }

    // 2. 模型原生表情（expressions/.exp3.json）归入表情
    const expressions = (modelJson.FileReferences && modelJson.FileReferences.Expressions) || modelJson.expressions || [];
    expressions.forEach((expr, index) => {
        const name = expr.Name || expr.name || `表情${index + 1}`;
        push('expression', {
            type: 'expression',
            name,
            index
        });
    });

    return items;
}

// ===== 用条目列表填充下拉框 =====
function fillSelect(selectEl, items, placeholder) {
    selectEl.innerHTML = '';
    if (items.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = placeholder;
        selectEl.appendChild(opt);
        return;
    }
    items.forEach((it, i) => {
        const opt = document.createElement('option');
        opt.value = String(i);
        opt.textContent = it.name;
        selectEl.appendChild(opt);
    });
}

// ===== 创建 PixiJS 应用并加载 Live2D 模型 =====
// modelJsonUrl：改写后的模型 JSON blob URL
// originalJson：原始模型 JSON，用于提取动作/表情列表
// cdiNameMap：从 .cdi3.json 提取的参数 ID → 中文名 映射
function createPlayer(modelJsonUrl, originalJson, cdiNameMap) {
    // 1. 销毁旧应用并释放资源
    disposeApp(state.app);
    state.app = null;
    state.model = null;

    // 2. 清理容器内残留 canvas
    cleanContainer(dom.container);

    // 3. 重置 UI
    state.loaded = false;
    state.playing = false;
    state.currentMotion = '';
    state.currentItem = null;
    state._motionStarted = false;
    state.actionItems = [];
    state.expressionItems = [];
    state.speechItems = [];
    state.paramOverrides = {};
    state.eyeFollow = false;
    dom.eyeFollowIndicator.classList.remove('show');
    dom.actionSelect.innerHTML = '';
    dom.expressionSelect.innerHTML = '';
    dom.speechSelect.innerHTML = '';
    dom.playBtn.textContent = '播放';
    dom.loading.classList.remove('hidden');
    dom.errorTip.classList.remove('show');

    // 4. 创建 PixiJS 应用
    let app;
    try {
        app = createPixiApp(dom.container);
    } catch (e) {
        ui.showError('创建渲染器失败：' + e.message);
        return;
    }
    state.app = app;

    // 绑定 pointer 拖拽事件（setupInteraction 在 app 创建前调用，此处延迟绑定）
    if (state._bindPointerListeners) state._bindPointerListeners();

    // 5. 加载模型
    loadLive2DModel(modelJsonUrl).then(model => {
        state.model = model;
        state.loaded = true;
        app.stage.addChild(model);

        // 禁用模型指针事件，确保鼠标拖拽由容器统一处理
        model.eventMode = 'none';

        // autoUpdate 已禁用，需手动将模型 update 注册到 app.ticker，
        // 由 ticker 的 start/stop 统一控制动画播放与暂停
        const motionManager = model.internalModel.motionManager;

        // 循环播放：监听 motionFinish 事件。
        // 必须用事件而非轮询——轮询在 update() 前检测，此时 currentGroup 尚未被
        // complete() 清空，reserve() 会认为"动作还在播放"而返回 false。
        // 事件在 complete() 之后触发，currentGroup 已清空，重播能成功。
        motionManager.on('motionFinish', () => {
            if (state.isLoop && state.currentItem && state.currentItem.type === 'motion') {
                // 关键：motionFinish 事件在 state.complete() 之前触发，
                // 此时 currentGroup 尚未清空，立即调用 motion() 会因
                // "动作正在播放"被 reserve() 拒绝。用 setTimeout 推迟到
                // 当前 update 循环结束后，complete() 已清空 currentGroup。
                setTimeout(() => playItem(state.currentItem), 0);
            }
        });

        app.ticker.add(() => {
            if (!state.model) return;
            const im = state.model.internalModel;
            if (!im) return;
            const cm = im.coreModel;
            if (!cm) return;

            // 1. 眼球跟随光标：设置 focusController 目标
            //    屏幕 y 向下为正，模型 ParamEyeBallY/ParamAngleY 正值代表向上看，故 Y 轴取反
            if (state.eyeFollow && Number.isFinite(state.eyeMouseX)) {
                try {
                    const sw = state.app.screen.width;
                    const sh = state.app.screen.height;
                    const nx = Math.max(-1, Math.min(1, (state.eyeMouseX - sw / 2) / (sw / 2)));
                    const ny = Math.max(-1, Math.min(1, (state.eyeMouseY - sh / 2) / (sh / 2)));
                    if (im.focusController) im.focusController.focus(nx, -ny);
                } catch (e) { /* 忽略 */ }
            }

            // 2. 手动编排模型更新流程
            //    internalModel.update 内部顺序：
            //      motion.update → saveParameters → expression/blink/focus/breath/physics/pose
            //      → coreModel.update → loadParameters
            //    问题：loadParameters 会清除 focus/physics 等临时累加值。
            //    若在 update 之后再 applyOverrides + coreModel.update，眼球偏移和物理都会丢失。
            //    解决：在 motion.update 之后、saveParameters 之前插入 applyOverrides，
            //    让覆盖值被 saveParameters 保存，loadParameters 时不被清除。
            //    - 动画参数：动作从拖动值插值回目标，实现"恢复轨迹"
            //    - 静止参数：覆盖值被保存持久化
            const dt = app.ticker.deltaMS;
            state.model.elapsedTime += dt;
            const tSec = dt / 1000;
            const eSec = state.model.elapsedTime / 1000;

            // 2a. focusController 平滑插值（对应 pe.update）
            try { im.focusController && im.focusController.update(dt); } catch (e) {}

            // 2b. 动作更新
            im.emit('beforeMotionUpdate');
            const motionUpdated = im.motionManager.update(cm, eSec);
            im.emit('afterMotionUpdate');

            // 2c. 【关键】在 saveParameters 之前应用用户覆盖，使覆盖值被保存
            //     motionManager.update 内部 loadParameters 会恢复到动作起始状态，
            //     重置非动作参数，因此必须在此之后重新应用持久值
            params.applyOverrides();

            // 2d. 保存当前参数（含覆盖值），供 loadParameters 恢复
            cm.saveParameters();

            // 2e. 表情 / 眨眼 / 眼球跟随 / 呼吸 / 物理 / 姿势
            try { im.motionManager.expressionManager && im.motionManager.expressionManager.update(cm, eSec); } catch (e) {}
            try { !motionUpdated && im.eyeBlink && im.eyeBlink.updateParameters(cm, tSec); } catch (e) {}
            try { im.updateFocus(); } catch (e) {}
            try { im.updateNaturalMovements(dt, state.model.elapsedTime); } catch (e) {}
            try { im.physics && im.physics.evaluate(cm, tSec); } catch (e) {}
            try { im.pose && im.pose.updateParameters(cm, tSec); } catch (e) {}

            // 2f. 应用到网格
            im.emit('beforeModelUpdate');
            cm.update();
            cm.loadParameters();

            // 防止 _render 再次调用 internalModel.update
            state.model.deltaTime = 0;

            // 3. 同步滑块 UI
            params.syncSliders();
        });

        // 初始适配视口（含锚点、缩放、定位）
        fitModelToScreen();

        // 解析模型 JSON 中的动作/表情条目并填充下拉框
        // 直接使用传入的原始模型 JSON，不依赖库内部 settings 结构
        const items = extractSelectableItems(originalJson || {});
        state.modelJson = originalJson || {};
        state.cdiNameMap = cdiNameMap || {};
        state.actionItems = items.action;
        state.expressionItems = items.expression;
        state.speechItems = items.speech;

        fillSelect(dom.actionSelect, items.action, '无动作');
        fillSelect(dom.expressionSelect, items.expression, '无表情');
        fillSelect(dom.speechSelect, items.speech, '无说话');

        // 构建模型参数调节面板（失败不影响模型正常加载）
        try {
            params.buildParams();
        } catch (e) {
            console.warn('[Live2D] 参数面板构建失败：', e);
        }

        // 默认播放 idle 动作（若存在），并停在首帧
        const idleItem = items.action.find(it => /idle/i.test(it.name));
        if (idleItem) {
            dom.actionSelect.value = String(items.action.indexOf(idleItem));
            playItem(idleItem);
        }

        dom.loading.classList.add('hidden');

        // 启动 ticker 后立即暂停，使载入后停在首帧
        app.ticker.start();
        state.playing = true;
        setTimeout(() => {
            app.ticker.stop();
            state.playing = false;
            dom.playBtn.textContent = '播放';
        }, 0);

        setupTouch(state, dom);
    }).catch(err => {
        console.error('[Live2D] 加载失败详细错误：', err);
        console.error('[Live2D] 错误栈：', err && err.stack);
        ui.showError('Live2D 模型加载失败：' + (err && err.message ? err.message : err));
        disposeApp(state.app);
        state.app = null;
        cleanContainer(dom.container);
    });
}

// ===== 播放指定条目（动作或表情） =====
function playItem(item) {
    if (!state.model || !item) return;
    if (item.type === 'motion') {
        state.currentMotion = item.group;
        state.currentItem = item;
        state._motionStarted = false;
        // 使用 MotionPriority.FORCE(3)：始终覆盖当前动作（包括 idle），
        //   否则 NORMAL 优先级在已有动作时会被 reserve() 拒绝，无法切换/重播
        state.model.motion(item.group, item.index, 3).then(started => {
            if (started) state._motionStarted = true;
        }).catch(() => {});
    } else if (item.type === 'expression') {
        state.model.expression(item.name);
    }
    // 暂停状态下手动渲染一帧（autoUpdate 已禁用，render 不会推进动画）
    if (state.app && !state.playing) {
        try { state.app.render(); } catch (e) {}
    }
}

// ===== 适配模型到视口 =====
// 重要：必须使用 internalModel.width/height（未缩放的原始画布尺寸），
//   因为 model.width = internalModel.width * scale.x，若用 model.width 计算
//   新缩放会产生反馈循环，导致第一次重置算出过大的缩放（放大到脚部）。
// 定位：Live2D 角色通常占据画布上半部分，中心锚点 (0.5,0.5) 对应画布中心，
//   将 y 设在屏幕中下部可让角色大致居中显示。
function fitModelToScreen() {
    if (!state.model || !state.app) return;
    const screenW = state.app.screen.width;
    const screenH = state.app.screen.height;
    const internalModel = state.model.internalModel;
    const modelW = internalModel.width;
    const modelH = internalModel.height;
    if (!modelW || !modelH) return;
    const scale = Math.min(screenW / modelW, screenH / modelH) * 1.14; // 在 0.95 基础上放大 20%
    state.model.anchor.set(0.5, 0.5);
    state.model.scale.set(scale);
    state.model.x = screenW / 2;
    state.model.y = screenH * 0.9; // 画布中心放在屏幕 90% 高度
    if (!state.playing) {
        try { state.app.render(); } catch (e) {}
    }
}
// 暴露给 animation.js 的 resetView 调用
state.fitModelToScreen = fitModelToScreen;

// ===== 加载本地 Live2D 文件夹 =====
async function loadLocalFiles() {
    const files = Array.from(dom.folderInput.files || []);
    if (files.length === 0) {
        alert('请选择 Live2D 模型文件夹');
        return;
    }

    try {
        dom.loading.classList.remove('hidden');
        dom.filePanel.classList.add('hidden');
        dom.panelOverlay.classList.add('hidden');

        // 0. 先回收上一次加载创建的 blob URL（在创建新的之前）
        revokeBlobUrls(state.lastBlobUrls);
        state.lastBlobUrls = [];

        // 1. 定位模型定义 JSON
        const modelFile = findModelJsonFile(files);
        if (!modelFile) {
            throw new Error('未找到模型定义文件（.model.json 或 .model3.json），请确认选择了正确的模型文件夹');
        }

        // 2. 读取并解析模型 JSON
        const modelJsonText = await readFileAsText(modelFile);
        let modelJson;
        try {
            modelJson = JSON.parse(modelJsonText);
        } catch (e) {
            throw new Error('模型 JSON 解析失败：' + e.message);
        }

        // 3. 收集所有引用的资源路径
        const refPaths = collectReferencedPaths(modelJson);

        // 4. 构建文件查找表
        const fileMap = buildFileMap(files);
        const modelDir = getModelDir(modelFile);

        // 5. 为每个引用路径创建 blob URL
        const urlMap = {};
        const createdUrls = [];
        for (const refPath of refPaths) {
            const fullRel = modelDir ? (modelDir + '/' + refPath).replace(/\\/g, '/') : refPath.replace(/\\/g, '/');
            const file = fileMap[fullRel];
            if (!file) {
                console.warn('[Live2D] 未找到引用文件：', fullRel);
                continue;
            }
            const blobUrl = URL.createObjectURL(file);
            urlMap[refPath.replace(/\\/g, '/')] = blobUrl;
            createdUrls.push(blobUrl);
        }

        // 6. 深拷贝原始 JSON 供提取动作列表，然后改写路径为 blob URL
        const originalJson = JSON.parse(JSON.stringify(modelJson));
        rewritePaths(modelJson, urlMap);

        // 6.5 加载 display info (.cdi3.json) 中的参数中文名
        // 优先用 model3.json FileReferences.DisplayInfo 引用的路径；
        // 若未引用，则按命名约定（<模型基名>.cdi3.json）在文件夹中查找。
        let cdiNameMap = {};
        try {
            let cdiBlobUrl = null;
            const displayInfoPath = modelJson.FileReferences && modelJson.FileReferences.DisplayInfo;
            if (displayInfoPath) {
                cdiBlobUrl = urlMap[displayInfoPath.replace(/\\/g, '/')];
            }
            if (!cdiBlobUrl) {
                const baseName = modelFile.name.replace(/\.model3?\.json$/i, '');
                const cdiFile = files.find(f =>
                    f.name.toLowerCase() === (baseName + '.cdi3.json').toLowerCase()
                );
                if (cdiFile) cdiBlobUrl = URL.createObjectURL(cdiFile);
            }
            if (cdiBlobUrl) {
                const cdiText = await fetch(cdiBlobUrl).then(r => r.text());
                const cdiJson = JSON.parse(cdiText);
                if (Array.isArray(cdiJson.Parameters)) {
                    cdiJson.Parameters.forEach(p => {
                        if (p && p.Id && p.Name) cdiNameMap[p.Id] = p.Name;
                    });
                }
            }
        } catch (e) {
            console.warn('[Live2D] 加载参数显示信息(.cdi3.json)失败：', e);
        }

        // 7. 把改写后的模型 JSON 生成为 blob URL
        const rewrittenJsonBlob = new Blob([JSON.stringify(modelJson)], { type: 'application/json' });
        const modelJsonUrl = URL.createObjectURL(rewrittenJsonBlob);
        createdUrls.push(modelJsonUrl);
        state.lastBlobUrls = createdUrls;

        // 8. 加载模型
        createPlayer(modelJsonUrl, originalJson, cdiNameMap);

    } catch (e) {
        ui.showError('加载本地文件夹失败：' + (e.message || e));
    }
}
dom.loadFileBtn.onclick = loadLocalFiles;

// ===== 清除文件夹按钮 =====
function disposeCurrentModel() {
    disposeApp(state.app);
    state.app = null;
    state.model = null;
    revokeBlobUrls(state.lastBlobUrls);
    state.lastBlobUrls = [];
    cleanContainer(dom.container);
    state.loaded = false;
    state.playing = false;
    state.currentMotion = '';
    state.currentItem = null;
    state._motionStarted = false;
    state.actionItems = [];
    state.expressionItems = [];
    state.speechItems = [];
    state.paramOverrides = {};
    state.eyeFollow = false;
    dom.eyeFollowIndicator.classList.remove('show');
    dom.actionSelect.innerHTML = '';
    dom.expressionSelect.innerHTML = '';
    dom.speechSelect.innerHTML = '';
    dom.playBtn.textContent = '播放';
}
dom.clearFolderBtn.onclick = () => {
    dom.folderInput.value = '';
    dom.folderName.textContent = '';
    disposeCurrentModel();
};

// ===== 初始化 =====
dom.loading.classList.add('hidden');
ui.openFilePanel();

// 暴露 playItem 给 animation 模块使用
state.playItem = playItem;
