/**
 * background.js
 * 背景设置：HSL 纯色、背景图、透明拍摄
 *
 * 返回 { updateBgTransform, fitBgImage }，供 interaction 模块拖拽背景时调用
 */
export function setupBackground(state, dom) {
    // 根据 state.bgScale/bgX/bgY 更新背景图的 CSS transform
    function updateBgTransform() {
        dom.bgImage.style.transform = `translate(calc(-50% + ${state.bgX}px), calc(-50% + ${state.bgY}px)) scale(${state.bgScale})`;
    }

    // 初始化背景图（居中并 cover 适配）
    function fitBgImage() {
        if (!dom.bgImage.src || dom.bgImage.naturalWidth === 0) return;
        const cw = dom.container.clientWidth;
        const ch = dom.container.clientHeight;
        const iw = dom.bgImage.naturalWidth;
        const ih = dom.bgImage.naturalHeight;
        state.bgScale = Math.max(cw / iw, ch / ih);
        state.bgX = 0;
        state.bgY = 0;
        updateBgTransform();
    }

    // HSL 转 HEX
    function hslToHex(h, s, l) {
        s /= 100;
        l /= 100;
        const k = n => (n + h / 30) % 12;
        const a = s * Math.min(l, 1 - l);
        const f = n => {
            const color = l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
            return Math.round(255 * color).toString(16).padStart(2, '0');
        };
        return `#${f(0)}${f(8)}${f(4)}`;
    }

    // 应用纯色背景
    function applySolidColor(hex) {
        dom.container.style.background = hex;
        dom.bgImage.src = '';
    }

    // HSL 滑块联动：实时更新预览并应用背景
    function updateColorFromHsl() {
        const h = parseInt(dom.hueSlider.value);
        const s = parseInt(dom.satSlider.value);
        const l = parseInt(dom.lightSlider.value);
        const hex = hslToHex(h, s, l);
        dom.hueVal.textContent = h + '°';
        dom.satVal.textContent = s + '%';
        dom.lightVal.textContent = l + '%';
        dom.hslPreview.style.background = hex;
        dom.hslHex.textContent = hex;
        applySolidColor(hex);
    }

    dom.hueSlider.oninput = updateColorFromHsl;
    dom.satSlider.oninput = updateColorFromHsl;
    dom.lightSlider.oninput = updateColorFromHsl;

    // 点击颜色预览块：切换为纯色背景（清除背景图）
    dom.hslPreview.style.cursor = 'pointer';
    dom.hslPreview.title = '点击应用此纯色背景';
    dom.hslPreview.addEventListener('click', () => {
        updateColorFromHsl();
    });

    // 色相滑块轨道：彩虹渐变
    dom.hueSlider.style.background = 'linear-gradient(to right, hsl(0,100%,50%), hsl(60,100%,50%), hsl(120,100%,50%), hsl(180,100%,50%), hsl(240,100%,50%), hsl(300,100%,50%), hsl(360,100%,50%))';

    // 饱和度、明度滑块轨道根据当前值动态更新
    function updateSliderTracks() {
        const h = dom.hueSlider.value, s = dom.satSlider.value, l = dom.lightSlider.value;
        dom.satSlider.style.background = `linear-gradient(to right, hsl(${h},0%,${l}%), hsl(${h},100%,${l}%))`;
        dom.lightSlider.style.background = `linear-gradient(to right, hsl(${h},${s}%,0%), hsl(${h},${s}%,50%), hsl(${h},${s}%,100%))`;
    }
    dom.hueSlider.addEventListener('input', updateSliderTracks);
    dom.satSlider.addEventListener('input', updateSliderTracks);
    dom.lightSlider.addEventListener('input', updateSliderTracks);
    updateSliderTracks();
    updateColorFromHsl();

    // 背景图片选择
    dom.bgImageInput.onchange = () => {
        const file = dom.bgImageInput.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            const dataUrl = reader.result;
            dom.bgImage.src = dataUrl;
            dom.bgImage.onload = () => { fitBgImage(); };
            try {
                localStorage.setItem('live2d_lastBgImage', dataUrl);
            } catch (e) {}
        };
        reader.readAsDataURL(file);
    };

    dom.clearBgImage.onclick = () => {
        dom.bgImage.src = '';
        dom.bgImageInput.value = '';
        state.bgScale = 1;
        state.bgX = 0;
        state.bgY = 0;
    };

    // 使用上次背景
    dom.useLastBgBtn.onclick = () => {
        const lastBg = localStorage.getItem('live2d_lastBgImage');
        if (!lastBg) {
            alert('没有记录上次使用的背景图');
            return;
        }
        dom.bgImage.src = lastBg;
        dom.bgImage.onload = () => { fitBgImage(); };
    };

    // 透明背景（仅拍摄时不包含背景，不影响实际显示）
    dom.transparentBgBtn.onclick = () => {
        state.transparentCapture = !state.transparentCapture;
        dom.transparentBgBtn.classList.toggle('active', state.transparentCapture);
        dom.transparentBgBtn.textContent = state.transparentCapture ? '✓ 透明背景（仅人物）' : '透明背景（仅人物）';
    };

    // 窗口大小变化时重新适配背景图
    window.addEventListener('resize', () => {
        if (dom.bgImage.src) fitBgImage();
    });

    return { updateBgTransform, fitBgImage };
}
