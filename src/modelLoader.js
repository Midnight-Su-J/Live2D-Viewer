/**
 * modelLoader.js
 * Live2D 模型加载封装：
 *   - 文件夹读取、模型 JSON 定位、引用资源路径收集与重写
 *   - PixiJS Application 创建 / 销毁、Live2DModel 加载、资源清理
 *
 * 核心思路：
 *   Live2D 模型由一个模型定义 JSON（.model.json / .model3.json）描述，
 *   其中引用了 moc、贴图、物理、姿态、表情、动作等多个文件。
 *   由于浏览器无法通过 blob URL 解析相对路径，加载前需把模型 JSON 中
 *   所有引用路径替换为对应文件的 blob URL，再把改写后的 JSON 作为
 *   blob URL 交给 pixi-live2d-display 加载。
 *
 * 注意：PixiJS 的 url.resolve 会破坏 blob URL（丢失冒号），
 *       因此在 main.js 中对 PIXI.utils.url.resolve 做了兼容补丁。
 */

// ===== 文件读取工具 =====
export function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsText(file);
    });
}

// ===== 从文件夹文件列表中定位模型定义 JSON =====
// 规则：优先匹配 *.model3.json（Cubism 4），其次 *.model.json（Cubism 2）
export function findModelJsonFile(files) {
    let cubism4 = null;
    let cubism2 = null;
    for (const f of files) {
        const name = f.name.toLowerCase();
        if (name.endsWith('.model3.json')) cubism4 = f;
        else if (name.endsWith('.model.json')) cubism2 = f;
    }
    return cubism4 || cubism2 || null;
}

// ===== 收集模型 JSON 中所有引用的资源文件路径 =====
// 返回数组，每个元素是相对模型 JSON 所在目录的资源路径（统一用 / 分隔）
export function collectReferencedPaths(modelJson) {
    const paths = [];
    const push = (p) => { if (typeof p === 'string' && p) paths.push(p.replace(/\\/g, '/')); };

    // Cubism 4：FileReferences
    if (modelJson.FileReferences) {
        const fr = modelJson.FileReferences;
        push(fr.Moc);
        (fr.Textures || []).forEach(push);
        push(fr.Physics);
        push(fr.Pose);
        push(fr.DisplayInfo);
        (fr.Expressions || []).forEach(e => push(e.File));
        if (fr.Motions) {
            Object.values(fr.Motions).forEach(group => {
                (group || []).forEach(m => {
                    push(m.File);
                    push(m.Sound);
                });
            });
        }
    }

    // Cubism 2：扁平结构
    push(modelJson.model);
    (modelJson.textures || []).forEach(push);
    push(modelJson.physics);
    push(modelJson.pose);
    (modelJson.expressions || []).forEach(e => push(e.file));
    if (modelJson.motions) {
        Object.values(modelJson.motions).forEach(group => {
            (group || []).forEach(m => {
                push(m.file);
                push(m.sound);
            });
        });
    }

    return [...new Set(paths)];
}

// ===== 把模型 JSON 中的资源路径替换为 blob URL =====
export function rewritePaths(modelJson, urlMap) {
    const map = (p) => (typeof p === 'string' && urlMap[p.replace(/\\/g, '/')]) || p;

    if (modelJson.FileReferences) {
        const fr = modelJson.FileReferences;
        if (fr.Moc) fr.Moc = map(fr.Moc);
        if (fr.Textures) fr.Textures = fr.Textures.map(map);
        if (fr.Physics) fr.Physics = map(fr.Physics);
        if (fr.Pose) fr.Pose = map(fr.Pose);
        if (fr.DisplayInfo) fr.DisplayInfo = map(fr.DisplayInfo);
        if (fr.Expressions) fr.Expressions = fr.Expressions.map(e => ({ ...e, File: map(e.File) }));
        if (fr.Motions) {
            Object.keys(fr.Motions).forEach(key => {
                fr.Motions[key] = (fr.Motions[key] || []).map(m => ({
                    ...m,
                    File: map(m.File),
                    Sound: m.Sound ? map(m.Sound) : m.Sound
                }));
            });
        }
    }

    if (modelJson.model) modelJson.model = map(modelJson.model);
    if (modelJson.textures) modelJson.textures = modelJson.textures.map(map);
    if (modelJson.physics) modelJson.physics = map(modelJson.physics);
    if (modelJson.pose) modelJson.pose = map(modelJson.pose);
    if (modelJson.expressions) {
        modelJson.expressions = modelJson.expressions.map(e => ({ ...e, file: map(e.file) }));
    }
    if (modelJson.motions) {
        Object.keys(modelJson.motions).forEach(key => {
            modelJson.motions[key] = (modelJson.motions[key] || []).map(m => ({
                ...m,
                file: map(m.file),
                sound: m.sound ? map(m.sound) : m.sound
            }));
        });
    }

    return modelJson;
}

// ===== 构建「模型目录内相对路径 -> File」的查找表 =====
export function buildFileMap(files) {
    const map = {};
    for (const f of files) {
        const rel = f.webkitRelativePath || f.name;
        const firstSlash = rel.indexOf('/');
        const inner = firstSlash >= 0 ? rel.substring(firstSlash + 1) : rel;
        map[inner.replace(/\\/g, '/')] = f;
    }
    return map;
}

// ===== 计算模型 JSON 所在目录（相对所选文件夹） =====
export function getModelDir(modelFile) {
    const rel = modelFile.webkitRelativePath || modelFile.name;
    const firstSlash = rel.indexOf('/');
    const inner = firstSlash >= 0 ? rel.substring(firstSlash + 1) : rel;
    const lastSlash = inner.lastIndexOf('/');
    return lastSlash >= 0 ? inner.substring(0, lastSlash) : '';
}

// ===== 销毁 PixiJS 应用并释放资源 =====
export function disposeApp(app) {
    if (!app) return;
    try {
        app.stage.children.slice().forEach(child => {
            try {
                if (typeof child.destroy === 'function') child.destroy({ children: true, texture: true, baseTexture: true });
            } catch (e) {}
        });
        app.destroy(true, { children: true, texture: true, baseTexture: true });
    } catch (e) {}
}

// ===== 清除容器内残留的 canvas =====
export function cleanContainer(containerEl) {
    if (!containerEl) return;
    const canvases = containerEl.querySelectorAll('canvas');
    canvases.forEach(c => c.remove());
}

// ===== 回收 blob URL =====
export function revokeBlobUrls(urls) {
    urls.forEach(url => {
        try { URL.revokeObjectURL(url); } catch (e) {}
    });
}

// ===== 创建 PixiJS Application =====
export function createPixiApp(containerEl) {
    const PIXI = window.PIXI;
    const app = new PIXI.Application({
        width: containerEl.clientWidth || window.innerWidth,
        height: containerEl.clientHeight || window.innerHeight,
        backgroundAlpha: 0,
        preserveDrawingBuffer: true,
        antialias: true,
        autoDensity: true,
        resolution: window.devicePixelRatio || 1,
        autoStart: false,
    });
    containerEl.appendChild(app.view);
    app.view.style.width = '100%';
    app.view.style.height = '100%';
    app.view.style.display = 'block';
    app.view.style.position = 'relative';
    app.view.style.zIndex = '1';
    return app;
}

// ===== 加载 Live2D 模型 =====
// modelJsonUrl 为改写后的模型 JSON blob URL
// autoUpdate: false — 禁止模型自动注册到 Ticker.shared（其会自动启动），
//   改为由 app.ticker 统一控制 update/stop，确保暂停时动画真正停止。
// autoInteract: false — 禁止模型自动跟踪鼠标做眼球/头部转动。
export async function loadLive2DModel(modelJsonUrl) {
    const Live2DModel = window.PIXI?.live2d?.Live2DModel;
    if (!Live2DModel) throw new Error('Live2DModel 未加载，请检查 lib/pixi-live2d-display.cubism4.min.js 是否正确引入');
    return await Live2DModel.from(modelJsonUrl, { autoUpdate: false, autoInteract: false });
}
