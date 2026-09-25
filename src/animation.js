/**
 * animation.js
 * 动画控制：动作 / 表情 / 说话切换、播放/暂停、循环、速度、重置视图
 *
 * 与 Spine 的三轨道不同，Live2D 的 motionManager 同时只播放一个动作，
 * 因此三个下拉框（动作 b_ / 表情 e_ / 说话 t_）选择后都会立即播放该动作；
 * 模型原生表情（.exp3.json）则通过 model.expression() 持续生效。
 *
 * 播放/暂停通过控制 PixiJS ticker 实现；速度通过 ticker.speed 调节。
 */
export function setupAnimation(state, dom) {
    // 根据下拉框选中的索引，从 state 对应条目列表中取出条目并播放
    function playFromSelect(selectEl, items) {
        const idx = parseInt(selectEl.value, 10);
        if (isNaN(idx) || idx < 0 || idx >= items.length) return;
        const item = items[idx];
        if (state.playItem) state.playItem(item);
    }

    // 动作（b_ 前缀）
    dom.actionSelect.onchange = () => playFromSelect(dom.actionSelect, state.actionItems);
    // 表情（e_ 前缀 + 原生表情）
    dom.expressionSelect.onchange = () => playFromSelect(dom.expressionSelect, state.expressionItems);
    // 说话（t_ 前缀）
    dom.speechSelect.onchange = () => playFromSelect(dom.speechSelect, state.speechItems);

    // 播放 / 暂停：通过 ticker 启停控制
    dom.playBtn.onclick = () => {
        if (!state.app) return;
        if (state.playing) {
            state.app.ticker.stop();
            state.playing = false;
            dom.playBtn.textContent = '播放';
        } else {
            state.app.ticker.start();
            state.playing = true;
            dom.playBtn.textContent = '暂停';
        }
    };

    // 循环播放开关：动作播放完毕后自动重播
    dom.loopBtn.onclick = () => {
        state.isLoop = !state.isLoop;
        dom.loopBtn.classList.toggle('active', state.isLoop);
        dom.loopBtn.textContent = state.isLoop ? '循环：开' : '循环';
    };

    // 重置视图：调用 main.js 中统一的 fitModelToScreen
    function resetView() {
        if (state.fitModelToScreen) state.fitModelToScreen();
    }
    dom.resetViewBtn.onclick = resetView;
    dom.container.addEventListener('dblclick', resetView);

    // 速度调节：通过 ticker.speed 控制动画快慢
    dom.speedSlider.oninput = () => {
        const val = parseFloat(dom.speedSlider.value);
        if (state.app) state.app.ticker.speed = val;
        dom.speedText.textContent = val.toFixed(2) + 'x';
    };
}
