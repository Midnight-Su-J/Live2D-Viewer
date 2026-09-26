/**
 * params.js
 * 模型参数调节面板：
 *   - 从 moc 中提取所有参数（ID / 最小值 / 最大值 / 默认值）
 *   - 为每个参数生成滑块，支持手动拖拽调节
 *   - 动画播放时，滑块实时跟随模型当前参数值同步显示
 *   - 支持搜索过滤、单个重置、全部重置
 *
 * 与动画的协调（关键）：
 *   Cubism 4 的动作对参数采用插值：value = current + (motion - current) * weight。
 *   因此用户覆盖值必须在 model.update() 之「后」写入，否则会被动作当作 current 值
 *   参与插值，导致动作被"拉偏"且松开后无法恢复原轨迹。
 *
 *   每帧顺序（见 main.js ticker）：
 *     1. model.update(deltaMS)        动作/物理/表情，内部 saveParameters→update→loadParameters
 *     2. params.applyOverrides()      把用户拖拽值写入 coreModel（覆盖动作结果）
 *     3. coreModel.update()           将覆盖值应用到网格（立即可见）
 *     4. coreModel.loadParameters()   恢复到动作保存的状态，保证下一帧动作连续性
 *     5. params.syncSliders()         回读参数值刷新滑块 UI
 *
 *   松开拖动时：把该参数从 state.paramOverrides 移除，并把当前值"烘焙"进 coreModel。
 *     - 若该参数受当前动作控制：下一帧动作会从烘焙值插值回动作目标值 → 恢复原轨迹。
 *     - 若该参数不受动作控制：烘焙值被 saveParameters 持久化 → 保留用户设置。
 */

// ===== 标准 Live2D 参数 ID → 中文名映射 =====
// moc3 文件本身只记录参数 ID（如 ParamAngleX），不包含中文名，
// 这里提供 Cubism 标准参数的中文对照，未命中的 ID 直接显示原名。
const PARAM_NAME_CN = {
    // 头部 / 身体角度
    'ParamAngleX': '头部旋转 X',
    'ParamAngleY': '头部旋转 Y',
    'ParamAngleZ': '头部旋转 Z',
    'ParamBodyAngleX': '身体旋转 X',
    'ParamBodyAngleY': '身体旋转 Y',
    'ParamBodyAngleZ': '身体旋转 Z',
    'ParamBreath': '呼吸',
    'ParamNeckAngleX': '颈部旋转 X',
    'ParamNeckAngleY': '颈部旋转 Y',
    'ParamNeckAngleZ': '颈部旋转 Z',

    // 眼球
    'ParamEyeBallX': '眼球 X',
    'ParamEyeBallY': '眼球 Y',

    // 眼睛开合 / 表情
    'ParamEyeLOpen': '左眼睁开',
    'ParamEyeROpen': '右眼睁开',
    'ParamEyeLSmile': '左眼笑',
    'ParamEyeRSmile': '右眼笑',
    'ParamEyeLO': '左眼 O 形',
    'ParamEyeRO': '右眼 O 形',
    'ParamEyeLU': '左眼 U 形',
    'ParamEyeRU': '右眼 U 形',
    'ParamEyeLI': '左眼 I 形',
    'ParamEyeRI': '右眼 I 形',
    'ParamEyeLT': '左眼 T 形',
    'ParamEyeRT': '右眼 T 形',
    'ParamEyeLAngle': '左眼角度',
    'ParamEyeRAngle': '右眼角度',
    'ParamEyeLOffsetX': '左眼偏移 X',
    'ParamEyeROffsetX': '右眼偏移 X',
    'ParamEyeLOffsetY': '左眼偏移 Y',
    'ParamEyeROffsetY': '右眼偏移 Y',

    // 眉毛
    'ParamBrowLY': '左眉 Y',
    'ParamBrowRY': '右眉 Y',
    'ParamBrowLForm': '左眉形',
    'ParamBrowRForm': '右眉形',
    'ParamBrowLAngle': '左眉角度',
    'ParamBrowRAngle': '右眉角度',
    'ParamBrowLOffsetX': '左眉偏移 X',
    'ParamBrowROffsetX': '右眉偏移 X',
    'ParamBrowLOffsetY': '左眉偏移 Y',
    'ParamBrowROffsetY': '右眉偏移 Y',

    // 嘴巴
    'ParamMouthOpenY': '嘴巴张开 Y',
    'ParamMouthForm': '嘴型',
    'ParamMouthSmile': '嘴巴笑',
    'ParamMouthU': '嘴 U 形',
    'ParamMouthA': '嘴 A 形',
    'ParamMouthI': '嘴 I 形',
    'ParamMouthO': '嘴 O 形',
    'ParamMouthE': '嘴 E 形',
    'ParamMouthLowerLipY': '下唇 Y',
    'ParamMouthUpperLipY': '上唇 Y',
    'ParamMouthLowerLipForm': '下唇形',
    'ParamMouthUpperLipForm': '上唇形',
    'ParamMouthOffsetX': '嘴巴偏移 X',
    'ParamMouthOffsetY': '嘴巴偏移 Y',

    // 头发
    'ParamHairFront': '前发',
    'ParamHairSide': '侧发',
    'ParamHairBack': '后发',
    'ParamHairFluffy': '头发蓬松',

    // 其它常见
    'ParamCheek': '脸颊',
    'ParamTear': '眼泪',
    'ParamNose': '鼻子',
    'ParamNippleL': '左胸',
    'ParamNippleR': '右胸',
    'ParamShoulderY': '肩膀 Y',
    'ParamArmUp': '手臂上举',
    'ParamHandL': '左手',
    'ParamHandR': '右手'
};

// 获取参数的中文显示名
// 优先级（从高到低）：
//   1. .cdi3.json（DisplayInfo）中 Parameters[].Name（模型作者定义的中文显示名）
//   2. model3.json 的 Parameters 数组中记录的 Name（部分模型扩展字段）
//   3. 内置标准参数 ID → 中文名映射
//   4. moc3 中记录的原始参数 ID（若模型直接用中文命名 ID，则原样显示）
function paramDisplayName(id, cdiNameMap, jsonNameMap) {
    if (cdiNameMap && cdiNameMap[id]) return cdiNameMap[id];
    if (jsonNameMap && jsonNameMap[id]) return jsonNameMap[id];
    return PARAM_NAME_CN[id] || id;
}

// 从 model3.json 构建参数 ID → 名称 的映射
// Cubism 4 model3.json 的 Parameters 数组标准字段为 {Id, Group}，
// 部分模型/工具会扩展 Name 字段存储中文显示名。
function buildJsonNameMap(modelJson) {
    const map = {};
    if (!modelJson) return map;
    const arr = modelJson.Parameters;
    if (Array.isArray(arr)) {
        arr.forEach(p => {
            if (p && p.Id && p.Name) map[p.Id] = p.Name;
        });
    }
    return map;
}

// 从 coreModel 提取全部参数描述
// 注意：pixi-live2d-display 的 coreModel（CubismModel 包装类）未公开 getParameterIds()，
// 参数 ID 存储在私有属性 _parameterIds 中，这里直接读取。
function extractParameters(coreModel) {
    const count = coreModel.getParameterCount();
    let ids = null;
    if (typeof coreModel.getParameterIds === 'function') {
        ids = coreModel.getParameterIds();
    } else if (Array.isArray(coreModel._parameterIds)) {
        ids = coreModel._parameterIds;
    }
    const list = [];
    if (!ids) return list;
    for (let i = 0; i < count; i++) {
        const id = ids[i];
        if (id == null) continue;
        list.push({
            id,
            index: i,
            min: coreModel.getParameterMinimumValue(i),
            max: coreModel.getParameterMaximumValue(i),
            def: coreModel.getParameterDefaultValue(i)
        });
    }
    return list;
}

export function setupParams(state, dom) {
    let paramList = [];
    const paramEls = {};
    let draggingId = null;
    // 同步节流：拖动时降低滑块同步频率，减少 DOM 操作
    let syncFrameCounter = 0;
    // 暂停时刷新节流：确保每帧最多刷新一次
    let refreshScheduled = false;

    const listEl = dom.paramsList;
    const searchEl = dom.paramsSearch;

    // 把一个值"烘焙"进 coreModel（不经过 state.paramOverrides，用于松开后持久化非动画参数）
    function bakeValue(id, value) {
        const model = state.model;
        if (!model || !model.internalModel) return;
        const cm = model.internalModel.coreModel;
        if (!cm) return;
        try { cm.setParameterValueById(id, value, 1); } catch (e) {}
    }

    // ===== 构建参数面板 =====
    function buildParams() {
        listEl.innerHTML = '';
        paramList = [];
        Object.keys(paramEls).forEach(k => delete paramEls[k]);

        const model = state.model;
        if (!model || !model.internalModel || !model.internalModel.coreModel) {
            const empty = document.createElement('div');
            empty.className = 'params-empty';
            empty.textContent = '暂无模型参数';
            listEl.appendChild(empty);
            return;
        }
        const coreModel = model.internalModel.coreModel;
        paramList = extractParameters(coreModel);
        // 从 model3.json 构建参数中文名映射
        const jsonNameMap = buildJsonNameMap(state.modelJson);
        // 从 .cdi3.json 提取的中文名映射（优先级最高）
        const cdiNameMap = state.cdiNameMap || {};

        // 排序：有中文名（包含中文字符）的参数排在前面，
        // 名字为纯 ID 格式（如 Paramxxx）或分隔符（如 ======）的排到最下面
        const hasChineseName = (id) => {
            const name = cdiNameMap[id] || jsonNameMap[id] || PARAM_NAME_CN[id] || '';
            return /[\u4e00-\u9fa5]/.test(name);
        };
        paramList.sort((a, b) => {
            const aa = hasChineseName(a.id) ? 0 : 1;
            const bb = hasChineseName(b.id) ? 0 : 1;
            return aa - bb; // 有中文名的在前
        });

        if (paramList.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'params-empty';
            empty.textContent = '该模型未定义参数';
            listEl.appendChild(empty);
            return;
        }

        const frag = document.createDocumentFragment();
        paramList.forEach(p => {
            const range = p.max - p.min;
            const step = range > 0 ? Math.max(range / 1000, 0.001) : 1;

            const row = document.createElement('div');
            row.className = 'param-row';
            row.dataset.id = p.id;

            const header = document.createElement('div');
            header.className = 'param-row-header';

            const name = document.createElement('span');
            name.className = 'param-name';
            name.title = p.id;
            const cn = document.createElement('span');
            cn.textContent = paramDisplayName(p.id, cdiNameMap, jsonNameMap);
            const idSpan = document.createElement('span');
            idSpan.className = 'param-id';
            idSpan.textContent = `  ${p.id}`;
            name.appendChild(cn);
            name.appendChild(idSpan);

            const valSpan = document.createElement('span');
            valSpan.className = 'param-val';
            valSpan.textContent = p.def.toFixed(3);

            header.appendChild(name);
            header.appendChild(valSpan);

            const sliderRow = document.createElement('div');
            sliderRow.className = 'param-slider-row';

            const slider = document.createElement('input');
            slider.type = 'range';
            slider.min = String(p.min);
            slider.max = String(p.max);
            slider.step = String(step);
            slider.value = String(p.def);

            const resetBtn = document.createElement('button');
            resetBtn.className = 'param-reset-one';
            resetBtn.type = 'button';
            resetBtn.title = '恢复默认值';
            resetBtn.textContent = '↺';

            sliderRow.appendChild(slider);
            sliderRow.appendChild(resetBtn);

            row.appendChild(header);
            row.appendChild(sliderRow);
            frag.appendChild(row);

            paramEls[p.id] = { row, slider, valSpan, def: p.def, min: p.min, max: p.max, lastValue: undefined };
            const el = paramEls[p.id];

            // 开始拖拽
            slider.addEventListener('pointerdown', () => { draggingId = p.id; });

            // 结束拖拽：移除临时覆盖，将值存入持久参数集合
            // - 非动画参数：每帧重新应用，保持用户设置
            // - 动画参数：ticker 中检测到动作改变该值后自动移除，恢复动作轨迹
            const endDrag = () => {
                if (draggingId !== p.id) return;
                draggingId = null;
                const v = parseFloat(slider.value);
                delete state.paramOverrides[p.id];
                state.persistentParams[p.id] = v;
                bakeValue(p.id, v);
                valSpan.textContent = v.toFixed(3);
                el.lastValue = v;
            };
            slider.addEventListener('pointerup', endDrag);
            slider.addEventListener('pointercancel', endDrag);
            // 兜底：失去焦点也视作结束
            slider.addEventListener('blur', endDrag);

            // 滑动中：写入覆盖值，立即刷新显示
            slider.addEventListener('input', () => {
                const v = parseFloat(slider.value);
                state.paramOverrides[p.id] = v;
                // 拖动中的值优先于持久值
                delete state.persistentParams[p.id];
                valSpan.textContent = v.toFixed(3);
                el.lastValue = v;
                // 暂停时手动推进一帧（用 rAF 节流，每帧最多一次，避免 input 高频触发卡顿）
                if (!state.playing && !refreshScheduled) {
                    refreshScheduled = true;
                    requestAnimationFrame(() => {
                        refreshOnce();
                        refreshScheduled = false;
                    });
                }
            });

            // 单个重置：移除覆盖和持久值，恢复默认值
            resetBtn.addEventListener('click', () => {
                delete state.paramOverrides[p.id];
                delete state.persistentParams[p.id];
                bakeValue(p.id, p.def);
                slider.value = String(p.def);
                valSpan.textContent = p.def.toFixed(3);
                el.lastValue = p.def;
                if (!state.playing) refreshOnce();
            });
        });
        listEl.appendChild(frag);
    }

    // ===== 暂停时手动刷新一帧（用于滑块输入/重置的即时反馈） =====
    function refreshOnce() {
        const model = state.model;
        if (!model || !model.internalModel) return;
        try {
            const im = model.internalModel;
            const cm = im.coreModel;
            const dt = 0;
            const tSec = 0;
            const eSec = model.elapsedTime / 1000;

            // focusController 插值
            try { im.focusController && im.focusController.update(dt); } catch (e) {}
            // 动作更新
            im.emit('beforeMotionUpdate');
            const motionUpdated = im.motionManager.update(cm, eSec);
            im.emit('afterMotionUpdate');
            // 在 saveParameters 之前应用覆盖（含持久值）
            applyOverrides();
            cm.saveParameters();
            // 表情 / 眨眼 / 眼球 / 呼吸 / 物理 / 姿势
            try { im.motionManager.expressionManager && im.motionManager.expressionManager.update(cm, eSec); } catch (e) {}
            try { !motionUpdated && im.eyeBlink && im.eyeBlink.updateParameters(cm, tSec); } catch (e) {}
            try { im.updateFocus(); } catch (e) {}
            try { im.updateNaturalMovements(dt, model.elapsedTime); } catch (e) {}
            try { im.physics && im.physics.evaluate(cm, tSec); } catch (e) {}
            try { im.pose && im.pose.updateParameters(cm, tSec); } catch (e) {}
            // 应用到网格
            im.emit('beforeModelUpdate');
            cm.update();
            cm.loadParameters();
            model.deltaTime = 0;

            if (state.app) state.app.render();
        } catch (e) {}
    }

    // 缓存：动作 curves 数据引用 → 动画参数 ID 集合
    // 避免每帧重新遍历所有曲线的点数据
    let _animCacheKey = null;
    let _animCacheSet = null;

    // ===== 获取当前动作中"值真正随时间变化"的参数 ID 集合 =====
    // 仅把曲线关键帧值有变化的参数视为动画参数；
    // 曲线值恒定（如只有一个关键帧、或所有关键帧值相同）的参数视为静态参数，
    // 用户拖动后应保持设置值。
    function getAnimatedParamIds() {
        const model = state.model;
        if (!model || !model.internalModel) return new Set();
        try {
            const mm = model.internalModel.motionManager;
            const motions = mm && mm.queueManager && mm.queueManager._motions;
            if (!Array.isArray(motions) || motions.length === 0) return new Set();

            // 以所有动作曲线数据的引用组合作为缓存键
            const key = motions.map(e => e && e._motion && e._motion._motionData).join('|');
            if (_animCacheKey === key && _animCacheSet) return _animCacheSet;

            const set = new Set();
            motions.forEach(entry => {
                const m = entry && entry._motion;
                const md = m && m._motionData;
                const curves = md && md.curves;
                const segments = md && md.segments;
                const points = md && md.points;
                if (!Array.isArray(curves) || !Array.isArray(segments) || !Array.isArray(points)) return;
                for (const c of curves) {
                    if (!c || !c.id) continue;
                    const start = c.baseSegmentIndex | 0;
                    const count = c.segmentCount | 0;
                    if (count <= 1) continue; // 只有一个关键帧，必为静态
                    // 收集所有关键帧的值
                    let firstVal = null;
                    let varies = false;
                    for (let i = 0; i < count; i++) {
                        const seg = segments[start + i];
                        if (!seg) continue;
                        const pt = points[seg.basePointIndex | 0];
                        if (!pt) continue;
                        const v = pt.value;
                        if (firstVal === null) { firstVal = v; continue; }
                        if (Math.abs(v - firstVal) > 1e-6) { varies = true; break; }
                    }
                    if (varies) set.add(c.id);
                }
            });
            _animCacheKey = key;
            _animCacheSet = set;
            return set;
        } catch (e) {
            return new Set();
        }
    }

    // ===== 把用户覆盖值写入 coreModel（在 motionManager.update 之后、saveParameters 之前调用） =====
    // 应用两部分：
    //   1. paramOverrides：正在拖动的参数（临时覆盖，优先级最高）
    //   2. persistentParams：松开后需要保持的静态参数（持久覆盖）
    //      若该参数受当前动作控制，则跳过持久覆盖，让动作恢复轨迹
    function applyOverrides() {
        const model = state.model;
        if (!model || !model.internalModel) return;
        const coreModel = model.internalModel.coreModel;
        if (!coreModel) return;
        const overrides = state.paramOverrides || {};
        for (const id in overrides) {
            try { coreModel.setParameterValueById(id, overrides[id], 1); } catch (e) {}
        }
        const persistent = state.persistentParams || {};
        if (Object.keys(persistent).length > 0) {
            const animated = getAnimatedParamIds();
            for (const id in persistent) {
                if (id in overrides) continue; // 拖动中的值优先
                if (animated.has(id)) {
                    // 受动作控制的参数：移除持久化，恢复动作轨迹
                    delete persistent[id];
                    continue;
                }
                try { coreModel.setParameterValueById(id, persistent[id], 1); } catch (e) {}
            }
        }
    }

    // ===== 读取模型当前参数值，同步刷新滑块（每帧 update 后调用） =====
    function syncSliders() {
        if (dom.paramsPanel.classList.contains('hidden')) return;
        const model = state.model;
        if (!model || !model.internalModel) return;
        const coreModel = model.internalModel.coreModel;
        if (!coreModel) return;
        // 拖动时每 3 帧同步一次，减少高频 DOM 操作
        if (draggingId) {
            syncFrameCounter = (syncFrameCounter + 1) % 3;
            if (syncFrameCounter !== 0) return;
        }
        for (const id in paramEls) {
            if (draggingId === id) continue;
            const el = paramEls[id];
            if (!el || !el.row.isConnected) continue;
            try {
                const v = coreModel.getParameterValueById(id);
                // 只在值变化时更新 DOM，避免无意义的重排
                if (el.lastValue !== v) {
                    el.lastValue = v;
                    el.slider.value = String(v);
                    el.valSpan.textContent = (Number.isFinite(v) ? v : 0).toFixed(3);
                }
            } catch (e) { /* 忽略 */ }
        }
    }

    // ===== 搜索过滤 =====
    function applyFilter() {
        const q = (searchEl.value || '').trim().toLowerCase();
        const jsonNameMap = buildJsonNameMap(state.modelJson);
        const cdiNameMap = state.cdiNameMap || {};
        paramList.forEach(p => {
            const el = paramEls[p.id];
            if (!el) return;
            const cn = paramDisplayName(p.id, cdiNameMap, jsonNameMap).toLowerCase();
            if (!q || p.id.toLowerCase().includes(q) || cn.includes(q)) {
                el.row.style.display = '';
            } else {
                el.row.style.display = 'none';
            }
        });
    }
    searchEl.addEventListener('input', applyFilter);

    // ===== 全部重置 =====
    function resetAll() {
        state.paramOverrides = {};
        state.persistentParams = {};
        paramList.forEach(p => {
            const el = paramEls[p.id];
            if (!el) return;
            bakeValue(p.id, p.def);
            el.slider.value = String(p.def);
            el.valSpan.textContent = p.def.toFixed(3);
            el.lastValue = p.def;
        });
        if (!state.playing) refreshOnce();
    }
    dom.paramsResetAllBtn.addEventListener('click', resetAll);

    // ===== 面板开关 =====
    function openPanel() {
        dom.paramsPanel.classList.remove('hidden');
        if (paramList.length === 0 && state.model) buildParams();
    }
    function closePanel() {
        dom.paramsPanel.classList.add('hidden');
    }
    function togglePanel() {
        if (dom.paramsPanel.classList.contains('hidden')) openPanel();
        else closePanel();
    }
    dom.paramsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        togglePanel();
    });
    document.addEventListener('click', (e) => {
        if (dom.paramsPanel.classList.contains('hidden')) return;
        if (!dom.paramsPanel.contains(e.target) && e.target !== dom.paramsBtn) {
            closePanel();
        }
    });

    return { buildParams, applyOverrides, syncSliders, resetAll, openPanel, closePanel };
}
