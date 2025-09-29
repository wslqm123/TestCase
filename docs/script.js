document.addEventListener('DOMContentLoaded', () => {
    // 1. 全局变量和 DOM 元素
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
    let markmapInstance; // 将 Markmap 实例保存在这里

    // 2. 核心函数
    function getBaseUrl() {
        const pathParts = window.location.pathname.split('/');
        const repoName = pathParts.length > 1 ? pathParts[1] : '';
        return window.location.hostname.includes('github.io') ? `/${repoName}` : '';
    }

    async function loadAndRender() {
        try {
            const baseUrl = getBaseUrl();
            const markdownUrl = `${baseUrl}/cases/${currentVersion}/_index.md?cache_bust=${new Date().getTime()}`;
            console.log(`[loadAndRender] Fetching markdown from: ${markdownUrl}`);

            const response = await fetch(markdownUrl);
            if (!response.ok) throw new Error(`Failed to fetch ${markdownUrl}. Status: ${response.status}`);

            const markdownText = await response.text();
            if (!markdownText.trim()) throw new Error(`Markdown file for version ${currentVersion} is empty.`);
            
            // **核心变化在这里**
            // 1. 清空容器
            markmapContainer.innerHTML = '';
            // 2. 创建新的 script 标签并注入 Markdown 内容
            const scriptEl = document.createElement('script');
            scriptEl.type = 'text/template';
            scriptEl.innerHTML = markdownText;
            markmapContainer.appendChild(scriptEl);
            
            // 3. 触发 autoloader 重新渲染
            // renderAll() 返回一个包含所有 markmap 实例的数组
            const markmaps = await window.markmap.autoLoader.renderAll();
            markmapInstance = markmaps[0]; // 获取我们刚刚创建的实例

            // 4. 加载并应用状态
            await loadUserStates();
            applyStatesToUI();

        } catch (error) {
            console.error("[loadAndRender] Failed:", error);
            markmapContainer.innerHTML = `<script type="text/template"># 加载失败\n\n- ${error.message}</script>`;
            await window.markmap.autoLoader.renderAll();
        }
    }

    async function loadUserStates() {
        // ... (这个函数保持不变)
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
        // ... (这个函数稍微修改一下，因为现在无法直接访问 node.data)
        if (!markmapInstance || !markmapInstance.svg) return;

        const isEditMode = editModeToggle.checked;
        const d3 = window.d3;
        
        markmapInstance.svg.selectAll('g.markmap-node').each(function(nodeData) {
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
        // ... (这个函数保持不变)
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
    // autoloader 已经自动执行了一次，现在我们手动触发一次数据加载
    loadAndRender();
});