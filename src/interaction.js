/**
 * interaction.js
 * 交互：角色平移/缩放、触屏手势、键盘快捷键
 *
 * 与 Spine 不同，Live2D 模型直接挂在 PixiJS 舞台上，
 * 平移/缩放通过修改 model.x / model.y / model.scale 实现，
 * 无需操作相机视口。
 */

// 触屏手势支持（单指拖拽、双指捏合缩放），需在模型加载成功后调用
export function setupTouch(state, dom) {
    if (!state.app || !state.model) return;
    const canvas = state.app.view;
    let touchStartX = 0, touchStartY = 0, pinchDist = 0;

    canvas.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
            state.isPanning = true;
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
        } else if (e.touches.length === 2) {
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            pinchDist = Math.sqrt(dx * dx + dy * dy);
        }
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        if (e.touches.length === 1 && state.isPanning && state.model) {
            const dx = e.touches[0].clientX - touchStartX;
            const dy = e.touches[0].clientY - touchStartY;
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
            state.model.x += dx;
            state.model.y += dy;
        } else if (e.touches.length === 2 && state.model) {
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (pinchDist > 0) {
                const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
                const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
                const rect = canvas.getBoundingClientRect();
                zoomAt(dist / pinchDist, cx - rect.left, cy - rect.top);
            }
            pinchDist = dist;
        }
    }, { passive: false });

    canvas.addEventListener('touchend', () => {
        state.isPanning = false;
        pinchDist = 0;
    });

    canvas.style.cursor = 'grab';
}

export function setupInteraction(state, dom) {
    // 以鼠标位置为中心缩放模型
    function zoomAt(factor, mouseX, mouseY) {
        if (!state.model) return;
        const oldScale = state.model.scale.x;
        const newScale = Math.max(0.05, Math.min(20, oldScale * factor));
        // 缩放前后保持鼠标指向的模型局部点不变
        state.model.x = mouseX - (mouseX - state.model.x) * (newScale / oldScale);
        state.model.y = mouseY - (mouseY - state.model.y) * (newScale / oldScale);
        state.model.scale.set(newScale);
    }

    const target = dom.container;
    // 懒加载 canvas 引用（setupInteraction 在 app 创建前调用）
    const getCanvas = () => state.app ? state.app.view : null;

    // 滚轮缩放
    target.addEventListener('wheel', (e) => {
        e.preventDefault();
        // 长按 B 时缩放背景图
        if (state.bKeyHeld) {
            const rect = target.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;
            const factor = e.deltaY < 0 ? 1.1 : 0.9;
            const newScale = Math.max(0.1, Math.min(10, state.bgScale * factor));
            const cw = dom.container.clientWidth;
            const ch = dom.container.clientHeight;
            state.bgX = mx - cw / 2 - (mx - cw / 2 - state.bgX) * (newScale / state.bgScale);
            state.bgY = my - ch / 2 - (my - ch / 2 - state.bgY) * (newScale / state.bgScale);
            state.bgScale = newScale;
            if (state.bgUpdate) state.bgUpdate.updateBgTransform();
            return;
        }
        // 否则缩放角色
        if (!state.model) return;
        const canvas = getCanvas();
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const factor = e.deltaY < 0 ? 1.1 : 0.9;
        zoomAt(factor, mx, my);
        // 暂停状态下手动渲染，使缩放立即可见
        if (!state.playing) {
            try { state.app.render(); } catch (err) {}
        }
    }, { passive: false });

    // ===== 拖拽：使用 pointerdown + pointercapture，绑定到 canvas，避免事件被拦截 =====
    function onPointerDown(e) {
        // 右键：切换眼球跟随光标模式
        if (e.button === 2) {
            state.eyeFollow = !state.eyeFollow;
            dom.eyeFollowIndicator.classList.toggle('show', state.eyeFollow);
            // 关闭跟随时把注视点复位到中心（直接清零 focusController，
            // 避免 model.focus 在中心点 atan2(0,0) 角度未定义导致无法复位）
            if (!state.eyeFollow && state.model) {
                try {
                    const fc = state.model.internalModel.focusController;
                    if (fc) {
                        fc.focus(0, 0, true);
                        fc.x = 0; fc.y = 0;
                        fc.targetX = 0; fc.targetY = 0;
                        fc.vx = 0; fc.vy = 0;
                    }
                } catch (err) {}
            }
            return;
        }
        if (e.button !== 0) return;
        const canvas = getCanvas();
        // 长按 B 时拖拽背景图
        if (state.bKeyHeld) {
            state.isBgPanning = true;
            state.bgPanLastX = e.clientX;
            state.bgPanLastY = e.clientY;
            if (canvas) canvas.style.cursor = 'grabbing';
            return;
        }
        // 否则拖拽角色
        if (!state.model) return;
        state.isPanning = true;
        state.lastX = e.clientX;
        state.lastY = e.clientY;
        if (canvas) {
            canvas.style.cursor = 'grabbing';
            try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
        }
    }

    function onPointerMove(e) {
        // 始终记录鼠标位置，供眼球跟随使用（canvas 铺满视口，clientX/Y 即画布坐标）
        state.eyeMouseX = e.clientX;
        state.eyeMouseY = e.clientY;

        // 暂停状态下眼球跟随：设置注视点并手动推进一帧（屏幕 y 向下，模型 y 向上，故 Y 轴取反）
        if (state.eyeFollow && !state.playing && state.model && state.model.internalModel) {
            try {
                const sw = state.app.screen.width;
                const sh = state.app.screen.height;
                const nx = Math.max(-1, Math.min(1, (e.clientX - sw / 2) / (sw / 2)));
                const ny = Math.max(-1, Math.min(1, (e.clientY - sh / 2) / (sh / 2)));
                const fc = state.model.internalModel.focusController;
                if (fc) fc.focus(nx, -ny, true);

                const im = state.model.internalModel;
                const cm = im.coreModel;
                const dt = 0, tSec = 0, eSec = state.model.elapsedTime / 1000;
                try { im.focusController && im.focusController.update(dt); } catch (err) {}
                im.emit('beforeMotionUpdate');
                const motionUpdated = im.motionManager.update(cm, eSec);
                im.emit('afterMotionUpdate');
                cm.saveParameters();
                try { im.motionManager.expressionManager && im.motionManager.expressionManager.update(cm, eSec); } catch (err) {}
                try { !motionUpdated && im.eyeBlink && im.eyeBlink.updateParameters(cm, tSec); } catch (err) {}
                try { im.updateFocus(); } catch (err) {}
                try { im.updateNaturalMovements(dt, state.model.elapsedTime); } catch (err) {}
                try { im.physics && im.physics.evaluate(cm, tSec); } catch (err) {}
                try { im.pose && im.pose.updateParameters(cm, tSec); } catch (err) {}
                im.emit('beforeModelUpdate');
                cm.update();
                cm.loadParameters();
                state.model.deltaTime = 0;
                state.app && state.app.render();
            } catch (err) {}
        }

        if (state.isBgPanning) {
            const dx = e.clientX - state.bgPanLastX;
            const dy = e.clientY - state.bgPanLastY;
            state.bgPanLastX = e.clientX;
            state.bgPanLastY = e.clientY;
            state.bgX += dx;
            state.bgY += dy;
            if (state.bgUpdate) state.bgUpdate.updateBgTransform();
            return;
        }
        if (!state.isPanning || !state.model) return;
        const dx = e.clientX - state.lastX;
        const dy = e.clientY - state.lastY;
        state.lastX = e.clientX;
        state.lastY = e.clientY;
        state.model.x += dx;
        state.model.y += dy;
        if (!state.playing) {
            try { state.app.render(); } catch (err) {}
        }
    }

    function onPointerUp(e) {
        state.isPanning = false;
        state.isBgPanning = false;
        const canvas = getCanvas();
        if (canvas) {
            canvas.style.cursor = 'grab';
            try { canvas.releasePointerCapture(e.pointerId); } catch (err) {}
        }
    }

    // 将 pointer 事件绑定到容器，事件冒泡到 canvas 时触发；
    // 若 canvas 已存在则直接绑定，否则绑定到容器由冒泡触发
    function bindPointerListeners() {
        const canvas = getCanvas();
        const el = canvas || target;
        el.addEventListener('pointerdown', onPointerDown);
        el.addEventListener('pointermove', onPointerMove);
        el.addEventListener('pointerup', onPointerUp);
        el.addEventListener('pointercancel', onPointerUp);
        // 阻止右键默认菜单，让右键用于切换眼球跟随
        el.addEventListener('contextmenu', (e) => e.preventDefault());
        if (canvas) {
            canvas.style.touchAction = 'none';
            canvas.style.cursor = 'grab';
        }
    }
    // 若 app 已创建则立即绑定，否则在模型加载后由 setupTouch 中调用
    if (state.app) {
        bindPointerListeners();
    } else {
        state._bindPointerListeners = bindPointerListeners;
    }

    // ===== B 键长按：切换背景操控模式 =====
    document.addEventListener('keydown', (e) => {
        if (e.repeat) return;
        if (e.key === 'b' || e.key === 'B') {
            state.bKeyHeld = true;
            dom.bgModeIndicator.classList.add('show');
            if (state.app && state.app.view) state.app.view.style.cursor = 'grab';
        }
        // H 键切换控件显示
        if (e.key === 'h' || e.key === 'H') {
            dom.controls.classList.toggle('hidden');
            dom.hint.style.opacity = dom.hint.style.opacity === '0' ? '1' : '0';
        }
    });
    document.addEventListener('keyup', (e) => {
        if (e.key === 'b' || e.key === 'B') {
            state.bKeyHeld = false;
            dom.bgModeIndicator.classList.remove('show');
            state.isBgPanning = false;
            if (state.app && state.app.view) state.app.view.style.cursor = 'grab';
        }
    });
    window.addEventListener('blur', () => {
        state.bKeyHeld = false;
        dom.bgModeIndicator.classList.remove('show');
        state.isBgPanning = false;
    });

    // 窗口大小变化时重新适配模型到视口
    window.addEventListener('resize', () => {
        if (state.app) {
            state.app.renderer.resize(window.innerWidth, window.innerHeight);
        }
    });
}
