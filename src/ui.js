/**
 * ui.js
 * UI 面板管理：文件夹选择面板、背景面板的开关，文件输入显示，全屏，错误提示
 *
 * 返回 { showError, openFilePanel, closeFilePanel }，供 main.js 调用
 */
export function setupUI(state, dom) {
    // ===== 文件夹选择面板 =====
    function openFilePanel() {
        dom.filePanel.classList.remove('hidden');
        dom.panelOverlay.classList.remove('hidden');
    }
    function closeFilePanel() {
        dom.filePanel.classList.add('hidden');
        dom.panelOverlay.classList.add('hidden');
    }
    dom.openFileBtn.onclick = openFilePanel;
    dom.cancelFileBtn.onclick = closeFilePanel;
    dom.panelOverlay.onclick = closeFilePanel;

    // 文件夹选择后显示文件夹名
    dom.folderInput.onchange = () => {
        const files = dom.folderInput.files;
        if (files && files.length > 0) {
            // webkitRelativePath 的第一段即为所选文件夹名
            const first = files[0].webkitRelativePath || files[0].name;
            const folderName = first.split('/')[0];
            dom.folderName.textContent = `已选择：${folderName}（共 ${files.length} 个文件）`;
        } else {
            dom.folderName.textContent = '';
        }
    };

    // ===== 背景设置面板 =====
    function openBgPanel() {
        dom.bgPanel.classList.remove('hidden');
        dom.panelOverlay.classList.remove('hidden');
    }
    function closeBgPanel() {
        dom.bgPanel.classList.add('hidden');
        dom.panelOverlay.classList.add('hidden');
    }
    dom.bgBtn.onclick = openBgPanel;
    dom.closeBgPanelBtn.onclick = closeBgPanel;

    // ===== 全屏切换 =====
    dom.fsBtn.onclick = () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => {});
        } else {
            document.exitFullscreen();
        }
    };

    // ===== 错误提示：显示错误信息并自动重新打开文件夹面板 =====
    function showError(msg) {
        dom.loading.classList.add('hidden');
        dom.errorTip.textContent = msg;
        dom.errorTip.classList.add('show');
        openFilePanel();
    }

    return { showError, openFilePanel, closeFilePanel };
}
