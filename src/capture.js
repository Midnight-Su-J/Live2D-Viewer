/**
 * capture.js
 * 拍摄 / 录制：截图、视频录制、悬浮控制栏
 *
 * 核心思路：
 *   - getCompositeCanvas() 将背景色/背景图 + Live2D 画布合成为离屏 canvas
 *   - 截图：离屏 canvas.toBlob() 直接导出图片
 *   - 录制：离屏 canvas.captureStream() + MediaRecorder 导出视频
 *   - drawLoop() 每帧重绘离屏 canvas，保证录制内容实时更新
 *
 * 与 spine 版唯一差异：人物画布取自 state.app.view（PixiJS canvas）
 */
export function setupCapture(state, dom) {
    // 获取人物画布（PixiJS 的 canvas）
    function getModelCanvas() {
        return state.app ? state.app.view : null;
    }

    // 判断拍摄时是否跳过背景层
    function skipBackgroundInCapture() {
        if (state.transparentCapture) return true;
        const bg = dom.container.style.background;
        return !bg || bg === 'transparent' || bg === '';
    }

    // 合成画布：把背景色/背景图 + Live2D 画布绘制到离屏画布
    function getCompositeCanvas() {
        const cw = dom.container.clientWidth || window.innerWidth;
        const ch = dom.container.clientHeight || window.innerHeight;
        const off = document.createElement('canvas');
        off.width = cw;
        off.height = ch;
        const ctx = off.getContext('2d');

        // 1. 纯色背景
        if (!skipBackgroundInCapture()) {
            ctx.fillStyle = dom.container.style.background || '#000';
            ctx.fillRect(0, 0, cw, ch);
        }

        // 2. 背景图片
        if (!state.transparentCapture && dom.bgImage.src && dom.bgImage.naturalWidth > 0) {
            const iw = dom.bgImage.naturalWidth;
            const ih = dom.bgImage.naturalHeight;
            const sw = iw * state.bgScale;
            const sh = ih * state.bgScale;
            const x = (cw - sw) / 2 + state.bgX;
            const y = (ch - sh) / 2 + state.bgY;
            ctx.drawImage(dom.bgImage, x, y, sw, sh);
        }

        // 3. Live2D 人物画布
        const modelCanvas = getModelCanvas();
        if (modelCanvas) {
            ctx.drawImage(modelCanvas, 0, 0, cw, ch);
        }

        return off;
    }

    // 下载文件
    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    // 截图
    function takeScreenshot() {
        const off = getCompositeCanvas();
        if (!off) { alert('无法截图'); return; }
        const format = dom.photoFormat.value;
        const ext = format === 'image/png' ? 'png' : format === 'image/jpeg' ? 'jpg' : 'webp';
        off.toBlob(blob => {
            if (blob) downloadBlob(blob, `live2d_${Date.now()}.${ext}`);
        }, format, 0.92);
    }

    // 格式化时间
    function formatTime(ms) {
        const totalSec = Math.floor(ms / 1000);
        const m = String(Math.floor(totalSec / 60)).padStart(2, '0');
        const s = String(totalSec % 60).padStart(2, '0');
        return `${m}:${s}`;
    }

    function getRecordedMs() {
        if (!state.isRecording) return state.recordedMs;
        return state.recordedMs + (Date.now() - state.segmentStart);
    }

    function updateRecordTime() {
        dom.captureFloatTime.textContent = formatTime(getRecordedMs());
    }

    function setFloatState(stateName) {
        dom.captureFloatShoot.style.display = 'none';
        dom.captureFloatPause.style.display = 'none';
        dom.captureFloatTime.style.display = 'none';
        if (stateName === 'photo') {
            dom.captureFloatShoot.style.display = '';
            dom.captureFloatShoot.textContent = '📷 拍摄';
            dom.captureFloatIndicator.textContent = '📷 截图模式';
        } else if (stateName === 'ready') {
            dom.captureFloatShoot.style.display = '';
            dom.captureFloatShoot.textContent = '● 录制';
            dom.captureFloatIndicator.textContent = '○ 待录制';
            dom.captureFloatTime.style.display = '';
            dom.captureFloatTime.textContent = '00:00';
        } else if (stateName === 'recording') {
            dom.captureFloatShoot.style.display = 'none';
            dom.captureFloatPause.style.display = '';
            dom.captureFloatPause.textContent = '⏸ 暂停';
            dom.captureFloatIndicator.textContent = '● 录制中';
            dom.captureFloatTime.style.display = '';
        } else if (stateName === 'paused') {
            dom.captureFloatShoot.style.display = 'none';
            dom.captureFloatPause.style.display = '';
            dom.captureFloatPause.textContent = '▶ 继续';
            dom.captureFloatIndicator.textContent = '⏸ 已暂停';
            dom.captureFloatTime.style.display = '';
        }
    }

    function showFloatToolbar(isVideo) {
        dom.captureFloat.classList.remove('hidden');
        setFloatState(isVideo ? 'ready' : 'photo');
    }

    function hideFloatToolbar() {
        dom.captureFloat.classList.add('hidden');
    }

    // 录制时每帧重绘离屏 canvas
    function drawLoop() {
        if (!state.recordCanvas) return;
        const ctx = state.recordCanvas.getContext('2d');
        const w = state.recordCanvas.width, h = state.recordCanvas.height;
        if (!skipBackgroundInCapture()) {
            ctx.fillStyle = dom.container.style.background || '#000';
            ctx.fillRect(0, 0, w, h);
        } else {
            ctx.clearRect(0, 0, w, h);
        }
        if (!state.transparentCapture && dom.bgImage.src && dom.bgImage.naturalWidth > 0) {
            const iw = dom.bgImage.naturalWidth, ih = dom.bgImage.naturalHeight;
            const sw = iw * state.bgScale, sh = ih * state.bgScale;
            ctx.drawImage(dom.bgImage, (w - sw) / 2 + state.bgX, (h - sh) / 2 + state.bgY, sw, sh);
        }
        const modelCanvas = getModelCanvas();
        if (modelCanvas) ctx.drawImage(modelCanvas, 0, 0, w, h);
        state.recordRafId = requestAnimationFrame(drawLoop);
    }

    // 开始视频录制
    function startRecording() {
        const off = getCompositeCanvas();
        if (!off) { alert('无法开始录制'); return; }
        state.recordCanvas = off;
        const stream = state.recordCanvas.captureStream(30);
        state.recordStream = stream;

        let mimeType = dom.videoFormat.value;
        if (mimeType === 'video/mp4' && !MediaRecorder.isTypeSupported('video/mp4')) {
            alert('当前浏览器不支持 MP4 录制，已自动切换为 WebM。');
            mimeType = 'video/webm';
            dom.videoFormat.value = 'video/webm';
        } else if (mimeType !== 'video/mp4' && !MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = 'video/webm';
        }
        const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';

        try {
            state.mediaRecorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8000000 });
        } catch (e) {
            state.mediaRecorder = new MediaRecorder(stream);
        }
        const chunks = [];
        state.mediaRecorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
        state.mediaRecorder.onstop = () => {
            const blob = new Blob(chunks, { type: mimeType });
            downloadBlob(blob, `live2d_${Date.now()}.${ext}`);
            cleanupRecording();
        };
        state.mediaRecorder.start();
        state.recordedMs = 0;
        state.segmentStart = Date.now();
        state.isRecording = true;
        state.isVideoPaused = false;
        drawLoop();
        setFloatState('recording');
        state.recordTimerId = setInterval(updateRecordTime, 200);
    }

    // 暂停/继续录像
    function togglePauseRecording() {
        if (!state.mediaRecorder) return;
        if (state.mediaRecorder.state === 'recording') {
            state.recordedMs += Date.now() - state.segmentStart;
            state.segmentStart = 0;
            state.mediaRecorder.pause();
            state.isRecording = false;
            state.isVideoPaused = true;
            setFloatState('paused');
        } else if (state.mediaRecorder.state === 'paused') {
            state.segmentStart = Date.now();
            state.mediaRecorder.resume();
            state.isRecording = true;
            state.isVideoPaused = false;
            setFloatState('recording');
        }
    }

    function stopRecording() {
        if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') {
            state.mediaRecorder.stop();
        } else {
            cleanupRecording();
        }
    }

    function cleanupRecording() {
        if (state.recordRafId) { cancelAnimationFrame(state.recordRafId); state.recordRafId = null; }
        if (state.recordStream) { state.recordStream.getTracks().forEach(t => t.stop()); state.recordStream = null; }
        if (state.recordTimerId) { clearInterval(state.recordTimerId); state.recordTimerId = null; }
        state.recordCanvas = null;
        state.mediaRecorder = null;
        state.recordedMs = 0;
        state.segmentStart = 0;
        state.isRecording = false;
        state.isVideoPaused = false;
        hideFloatToolbar();
    }

    // ===== 事件绑定 =====
    dom.captureBtn.onclick = () => {
        dom.capturePanel.classList.remove('hidden');
        dom.panelOverlay.classList.remove('hidden');
    };
    dom.closeCaptureBtn.onclick = () => {
        dom.capturePanel.classList.add('hidden');
        dom.panelOverlay.classList.add('hidden');
    };

    // 模式切换
    document.querySelectorAll('#capturePanel .mode-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('#capturePanel .mode-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.captureMode = btn.dataset.mode;
            if (state.captureMode === 'photo') {
                dom.photoSection.classList.remove('hidden');
                dom.videoSection.classList.add('hidden');
                dom.captureHint.textContent = '截图将只包含人物与背景，不含 UI 控件和鼠标光标。';
            } else {
                dom.photoSection.classList.add('hidden');
                dom.videoSection.classList.remove('hidden');
                dom.captureHint.textContent = '录制将只包含人物与背景，不含 UI 控件和鼠标光标。';
            }
        };
    });

    // 开始拍摄/录制
    dom.startCaptureBtn.onclick = () => {
        dom.capturePanel.classList.add('hidden');
        dom.panelOverlay.classList.add('hidden');
        if (state.captureMode === 'photo') {
            showFloatToolbar(false);
        } else {
            state.recordedMs = 0;
            state.segmentStart = 0;
            state.isRecording = false;
            state.isVideoPaused = false;
            showFloatToolbar(true);
        }
    };

    // 浮动控制栏按钮
    dom.captureFloatShoot.onclick = () => {
        if (state.captureMode === 'photo') {
            takeScreenshot();
        } else {
            startRecording();
        }
    };
    dom.captureFloatPause.onclick = togglePauseRecording;
    dom.captureFloatStop.onclick = () => {
        if (state.captureMode === 'photo') {
            hideFloatToolbar();
        } else {
            stopRecording();
        }
    };

    // 悬浮栏拖动
    const captureFloatInner = document.querySelector('.capture-float-inner');
    captureFloatInner.addEventListener('mousedown', (e) => {
        if (e.target.closest('button')) return;
        state.isFloatDragging = true;
        const rect = dom.captureFloat.getBoundingClientRect();
        state.floatDragOffsetX = e.clientX - rect.left;
        state.floatDragOffsetY = e.clientY - rect.top;
        dom.captureFloat.style.transform = 'none';
        dom.captureFloat.style.left = rect.left + 'px';
        dom.captureFloat.style.top = rect.top + 'px';
        dom.captureFloat.classList.add('dragging');
        e.preventDefault();
    });
    window.addEventListener('mousemove', (e) => {
        if (!state.isFloatDragging) return;
        let nx = e.clientX - state.floatDragOffsetX;
        let ny = e.clientY - state.floatDragOffsetY;
        const fw = dom.captureFloat.offsetWidth;
        const fh = dom.captureFloat.offsetHeight;
        nx = Math.max(0, Math.min(window.innerWidth - fw, nx));
        ny = Math.max(0, Math.min(window.innerHeight - fh, ny));
        dom.captureFloat.style.left = nx + 'px';
        dom.captureFloat.style.top = ny + 'px';
    });
    window.addEventListener('mouseup', () => {
        if (state.isFloatDragging) {
            state.isFloatDragging = false;
            dom.captureFloat.classList.remove('dragging');
        }
    });
}
