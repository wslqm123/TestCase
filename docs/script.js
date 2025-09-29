document.addEventListener('DOMContentLoaded', () => {
    // 1. 全局变量和 DOM 元素
    const userSelector = document.getElementById('userselector');
    const versionSelector = document.getElementById('versionSelector');
    const editModeToggle = document.getElementById('editModeToggle');
    const saveButton = document.getElementById('saveButton');
    const markmapContainer = document.getElementById('markmap-container');
    
    const STATUS = { UNTESTED: '⚪️', PASS: '✅', FAIL: '❌', BLOCKED: '🟡' };
    const STATUS_CYCLE = [STATUS.UNTESTED, STATUS.PASS, STATUS.FAIL, STATUS.BLOCKED];

    let currentUser = userSelector.value;
    let currentVersion = versionSelector.value;
    let currentStates = {};

    function getBaseUrl() {
        const pathParts = window.location.pathname.split('/');
        const repoName = pathParts[1] || '';
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
            // 2. 动态创建 SVG 元素，而不是依赖 autoloader 自动创建
            const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svgEl.style.width = '100%';
            svgEl.style.height = '100%';
            markmapContainer.appendChild(svgEl);

            // 3. 直接使用 Markmap API 创建和渲染
            const { root } = window.markmap.transform(markdownText);
            const mm = window.markmap.Markmap.create(svgEl, null, root);
            
            // 4. 加载并应用状态
            await loadUserStates();
            applyStatesToUI(mm); // 将实例传递下去

        } catch (error) {
            console.error("[loadAndRender] Failed:", error);
            markmapContainer.innerHTML = `<h2>Loading Failed</h2><p>${error.message}</p>`;
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

    function applyStatesToUI(markmapInstance) {
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
                d3.select(this).select('text').text(`${newStatus} ${originalText}`);
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

    // 事件监听器
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
        const isEditOn = editModeToggle.checked && currentUser !== 'default';
        saveButton.classList.toggle('hidden', !isEditOn);
        
        // 重新获取 markmap 实例并应用UI，因为每次 loadAndRender 都会重新创建
        const svgEl = document.querySelector('#markmap-container svg.markmap');
        if (svgEl && svgEl.__markmap__) {
            applyStatesToUI(svgEl.__markmap__);
        }
    });

    saveButton.addEventListener('click', saveStatesToGitHub);

    // 初始化页面
    // 确保所有库加载完毕
    const checkLibs = setInterval(() => {
        if (window.markmap && window.markmap.transform && window.markmap.Markmap) {
            clearInterval(checkLibs);
            loadAndRender();
        }
    }, 100);
});