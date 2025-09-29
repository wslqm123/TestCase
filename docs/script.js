document.addEventListener('DOMContentLoaded', () => {
    // 1. 全局变量和初始化
    const { Markmap, transform } = window.markmap;
    const markmapInstance = Markmap.create('#markmap', null);
    
    // 动态获取仓库名称作为基础路径
    const repoName = window.location.pathname.split('/')[1];
    const baseUrl = window.location.hostname.includes('github.io') ? `/${repoName}` : '';

    // DOM元素获取
    const userSelector = document.getElementById('userSelector');
    const versionSelector = document.getElementById('versionSelector');
    const editModeToggle = document.getElementById('editModeToggle');
    const saveButton = document.getElementById('saveButton');

    const STATUS = { UNTESTED: '⚪️', PASS: '✅', FAIL: '❌', BLOCKED: '🟡' };
    const STATUS_CYCLE = [STATUS.UNTESTED, STATUS.PASS, STATUS.FAIL, STATUS.BLOCKED];

    let currentUser = userSelector.value;
    let currentVersion = versionSelector.value;
    let currentStates = {};

    async function loadAndRender() {
        try {
            // 使用构建好的绝对路径来请求文件
            const markdownUrl = `${baseUrl}/cases/${currentVersion}/_index.md?cache_bust=${new Date().getTime()}`;
            console.log('Fetching markdown from:', markdownUrl); // 添加日志，方便调试
            const response = await fetch(markdownUrl);
            
            if (!response.ok) {
                throw new Error(`Failed to fetch ${markdownUrl}. Status: ${response.status}`);
            }
            
            const markdownText = await response.text();
            if (!markdownText.trim()) {
                throw new Error(`Markdown file for version ${currentVersion} is empty.`);
            }

            const { root } = transform(markdownText);
            markmapInstance.setData(root);
            await markmapInstance.fit();

            await loadUserStates();
            applyStatesToUI();

        } catch (error) {
            console.error("Load failed:", error);
            const { root } = transform(`# Loading Failed\n\n- ${error.message}`);
            markmapInstance.setData(root);
            await markmapInstance.fit();
        }
    }

    async function loadUserStates() {
        if (currentUser === 'default') {
            currentStates = {};
            return;
        }
        try {
            const resultsUrl = `${baseUrl}/results/${currentVersion}/${currentUser}.json?cache_bust=${new Date().getTime()}`;
            console.log('Fetching results from:', resultsUrl); // 添加日志
            const response = await fetch(resultsUrl);
            if (response.ok) {
                currentStates = await response.json();
            } else {
                currentStates = {};
            }
        } catch (error) {
            console.warn(`Could not load state for ${currentUser}:`, error);
            currentStates = {};
        }
    }

    function applyStatesToUI() {
        const isEditMode = editModeToggle.checked;
        const d3 = window.d3;
        if (!markmapInstance.svg) return; // 确保svg已创建

        markmapInstance.svg.selectAll('g.markmap-node').each(function(node) {
            const element = d3.select(this);
            const textElement = element.select('text');
            const originalText = node.data.content;
            const match = originalText.match(/\[([A-Z0-9-]+)\]/);
            if (!match) return;

            const caseId = match[1];
            const currentStatus = currentStates[caseId] || STATUS.UNTESTED;
            textElement.text(`${currentStatus} ${originalText}`);

            if (isEditMode && currentUser !== 'default') {
                element.classed('editable', true);
                element.on('click', (event) => {
                    event.stopPropagation();
                    const oldStatus = currentStates[caseId] || STATUS.UNTESTED;
                    const currentIndex = STATUS_CYCLE.indexOf(oldStatus);
                    const newStatus = STATUS_CYCLE[(currentIndex + 1) % STATUS_CYCLE.length];
                    currentStates[caseId] = newStatus;
                    textElement.text(`${newStatus} ${originalText}`);
                });
            } else {
                element.classed('editable', false);
                element.on('click', null);
            }
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
            payload: {
                version: currentVersion,
                user: currentUser,
                content: currentStates,
                message: `[Test] ${currentUser} updated results for ${currentVersion}`
            }
        };

        if (window.tt && window.tt.miniProgram && window.tt.miniProgram.postMessage) {
            window.tt.miniProgram.postMessage({ data: messagePayload });
            setTimeout(() => {
                tt.showToast({ title: '保存指令已发送', icon: 'success', duration: 2000 });
                saveButton.disabled = false;
                saveButton.textContent = '保存更改';
            }, 1500);
        } else {
            console.log("Not in Feishu Mini Program environment. Mocking save call.");
            console.log("Data to be sent:", messagePayload);
            alert('保存功能仅在飞书小程序中可用。数据已打印到控制台。');
            saveButton.disabled = false;
            saveButton.textContent = '保存更改';
        }
    }

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

    // 等待飞书 JSSDK 加载完成
    if (window.h5sdk) {
        h5sdk.ready(() => loadAndRender());
    } else {
        document.addEventListener('h5sdkReady', () => loadAndRender());
    }
});