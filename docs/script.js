// 确保在DOM加载完成后执行
document.addEventListener('DOMContentLoaded', () => {

    // 1. DOM元素获取
    const userSelector = document.getElementById('userSelector');
    const versionSelector = document.getElementById('versionSelector');
    const editModeToggle = document.getElementById('editModeToggle');
    const saveButton = document.getElementById('saveButton');
    const markmapContainer = document.getElementById('markmap-container');

    // 测试状态定义
    const STATUS = { UNTESTED: '⚪️', PASS: '✅', FAIL: '❌', BLOCKED: '🟡' };
    const STATUS_CYCLE = [STATUS.UNTESTED, STATUS.PASS, STATUS.FAIL, STATUS.BLOCKED];

    // 当前状态
    let currentUser = userSelector.value;
    let currentVersion = versionSelector.value;
    let currentStates = {};
    let markmapInstance; // 全局变量，用于存储当前markmap实例

    // 2. 核心函数
    function getBaseUrl() {
        const pathParts = window.location.pathname.split('/');
        const repoName = pathParts[1] || '';
        if (window.location.hostname.includes('github.io') && repoName) {
            return `/${repoName}`;
        }
        return '';
    }

    async function loadAndRender() {
        // 清空容器，准备重新渲染
        markmapContainer.innerHTML = ''; 

        try {
            const baseUrl = getBaseUrl();
            const markdownUrl = `${baseUrl}/cases/${currentVersion}/_index.md?cache_bust=${new Date().getTime()}`;
            console.log(`[loadAndRender] Fetching markdown from: ${markdownUrl}`);

            const response = await fetch(markdownUrl);
            if (!response.ok) throw new Error(`Failed to fetch ${markdownUrl}. Status: ${response.status}`);

            const markdownText = await response.text();
            if (!markdownText.trim()) throw new Error(`Markdown file for version ${currentVersion} is empty.`);
            
            // **核心逻辑：让 autoloader 处理一切**
            // 1. 创建 script 标签并注入 markdown
            const scriptEl = document.createElement('script');
            scriptEl.type = 'text/template';
            scriptEl.textContent = markdownText; // 使用 textContent 以避免 HTML 注入
            markmapContainer.appendChild(scriptEl);
            
            // 2. autoloader 会自动发现并渲染 .markmap > script 元素。
            // 渲染是异步的，我们需要找到渲染后的实例。
            // window.markmap.autoLoader.renderAll() 确实可以做到这一点。
            const markmaps = await window.markmap.autoLoader.renderAll();
            
            if (markmaps && markmaps.length > 0) {
                markmapInstance = markmaps.find(m => m.el.parentElement === markmapContainer);
                if (markmapInstance) {
                    await loadUserStates();
                    applyStatesToUI();
                } else {
                     throw new Error('Markmap instance not found after render.');
                }
            } else {
                 throw new Error('markmap.autoLoader.renderAll() did not return any instances.');
            }

        } catch (error) {
            console.error("[loadAndRender] Failed:", error);
            markmapContainer.innerHTML = `<script type="text/template"># 加载失败\n\n- ${error.message}</script>`;
            await window.markmap.autoLoader.renderAll();
        }
    }

    async function loadUserStates() {
        if (currentUser === 'default') {
            currentStates = {};
            return;
        }
        try {
            const baseUrl = getBaseUrl();
            const resultsUrl = `${baseUrl}/results/${currentVersion}/${currentUser}.json?cache_bust=${new Date().getTime()}`;
            console.log(`[loadUserStates] Fetching results from: ${resultsUrl}`);
            
            const response = await fetch(resultsUrl);
            currentStates = response.ok ? await response.json() : {};
        } catch (error) {
            console.warn(`[loadUserStates] Could not load state for ${currentUser}:`, error);
            currentStates = {};
        }
    }

    function applyStatesToUI() {
        if (!markmapInstance || !markmapInstance.svg) return;

        const isEditMode = editModeToggle.checked;
        const d3 = window.d3;
        
        // 使用 d3 选择器来操作 SVG 元素
        d3.select(markmapInstance.svg.node()).selectAll('g.markmap-node').each(function(nodeData) {
            const element = d3.select(this);
            const textElement = element.select('text');
            const originalText = nodeData.content;
            
            const match = originalText.match(/\[([A-Z0-9-]+)\]/);
            if (!match) return;

            const caseId = match[1];
            const currentStatus = currentStates[caseId] || STATUS.UNTESTED;
            textElement.text(`${currentStatus} ${originalText}`);

            element.classed('editable', isEditMode && currentUser !== 'default');
            element.on('click', isEditMode && currentUser !== 'default' ? function(event) {
                event.stopPropagation();
                const oldStatus = currentStates[caseId] || STATUS.UNTESTED;
                const currentIndex = STATUS_CYCLE.indexOf(oldStatus);
                const newStatus = STATUS_CYCLE[(currentIndex + 1) % STATUS_CYCLE.length];
                currentStates[caseId] = newStatus;
                textElement.text(`${newStatus} ${originalText}`);
            } : null);
        });
    }
    
    function saveStatesToGitHub() {
        if (currentUser === 'default') {
            const msg = '请先选择一个测试员';
            (window.tt && tt.showToast) ? tt.showToast({ title: msg, icon: 'fail', duration: 2000 }) : alert(msg);
            return;
        }

        saveButton.disabled = true;
        saveButton.textContent = '保存中...';
        
        const messagePayload = {
            action: 'saveData',
            payload: { version: currentVersion, user: currentUser, content: currentStates, message: `[Test] ${currentUser} updated results for ${currentVersion}` }
        };

        if (window.tt && window.tt.miniProgram && window.tt.miniProgram.postMessage) {
            window.tt.miniProgram.postMessage({ data: messagePayload });
            setTimeout(() => {
                if(window.tt.showToast) tt.showToast({ title: '保存指令已发送', icon: 'success', duration: 2000 });
                saveButton.disabled = false;
                saveButton.textContent = '保存更改';
            }, 1500);
        } else {
            console.log("Not in Feishu Mini Program environment. Mocking save call:", messagePayload);
            alert('保存功能仅在飞书小程序中可用。数据已打印到控制台。');
            saveButton.disabled = false;
            saveButton.textContent = '保存更改';
        }
    }

    // 3. 事件监听器
    userSelector.addEventListener('change', (e) => {
        currentUser = e.target.value;
        editModeToggle.checked = false;
        editModeToggle.dispatchEvent(new Event('change'));
        loadAndRender();
    });

    versionSelector.addEventListener('change', (e) => {
        currentVersion = e.target.value;
        loadAndRender();
    });

    editModeToggle.addEventListener('change', () => {
        saveButton.classList.toggle('hidden', !(editModeToggle.checked && currentUser !== 'default'));
        applyStatesToUI();
    });

    saveButton.addEventListener('click', saveStatesToGitHub);

    // 4. 初始化页面
    // autoloader 会在 DOM 加载后自动运行一次，所以我们在这里调用 loadAndRender 来加载我们的动态数据
    loadAndRender();
});