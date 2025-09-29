// 使用IIFE确保代码在DOM加载后执行
(function() {
    // 确保所有外部脚本都已加载
    window.addEventListener('load', () => {

        // 1. 全局变量和初始化
        // 从全局的 window.markmap 对象中获取构造函数和工具
        const Transformer = window.markmap.Transformer;
        const Markmap = window.markmap.Markmap;
        const { el } = window.markmap.Toolbar; // 如果未来要添加工具栏，可以这样获取

        // 实例化 Transformer 和 Markmap
        const transformer = new Transformer();
        const markmapInstance = Markmap.create('#markmap', null);
        
        // DOM元素获取
        const userSelector = document.getElementById('userSelector');
        const versionSelector = document.getElementById('versionSelector');
        const editModeToggle = document.getElementById('editModeToggle');
        const saveButton = document.getElementById('saveButton');

        // 测试状态定义
        const STATUS = { UNTESTED: '⚪️', PASS: '✅', FAIL: '❌', BLOCKED: '🟡' };
        const STATUS_CYCLE = [STATUS.UNTESTED, STATUS.PASS, STATUS.FAIL, STATUS.BLOCKED];

        // 当前状态
        let currentUser = userSelector.value;
        let currentVersion = versionSelector.value;
        let currentStates = {};

        // 2. 核心函数
        function getBaseUrl() {
            const pathParts = window.location.pathname.split('/');
            const repoName = pathParts[1] || '';
            return window.location.hostname.includes('github.io') ? `/${repoName}` : '';
        }

        async function loadAndRender() {
            try {
                const baseUrl = getBaseUrl();
                const markdownUrl = `${baseUrl}/cases/${currentVersion}/_index.md?cache_bust=${new Date().getTime()}`;
                console.log(`Fetching markdown from: ${markdownUrl}`);

                const response = await fetch(markdownUrl);
                if (!response.ok) throw new Error(`Failed to fetch ${markdownUrl}. Status: ${response.status}`);

                const markdownText = await response.text();
                if (!markdownText.trim()) throw new Error(`Markdown file for version ${currentVersion} is empty.`);

                const { root } = transformer.transform(markdownText);
                markmapInstance.setData(root);
                await markmapInstance.fit();

                await loadUserStates();
                applyStatesToUI();

            } catch (error) {
                console.error("Load failed:", error);
                const { root } = transformer.transform(`# Loading Failed\n\n- ${error.message}`);
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
                const baseUrl = getBaseUrl();
                const resultsUrl = `${baseUrl}/results/${currentVersion}/${currentUser}.json?cache_bust=${new Date().getTime()}`;
                console.log(`Fetching results from: ${resultsUrl}`);
                
                const response = await fetch(resultsUrl);
                currentStates = response.ok ? await response.json() : {};
            } catch (error) {
                console.warn(`Could not load state for ${currentUser}:`, error);
                currentStates = {};
            }
        }

        function applyStatesToUI() {
            const isEditMode = editModeToggle.checked;
            const d3 = window.d3;
            if (!markmapInstance.svg) return;

            markmapInstance.svg.selectAll('g.markmap-node').each(function(node) {
                const element = d3.select(this);
                const textElement = element.select('text');
                const originalText = node.data.content;
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
                    tt.showToast({ title: '保存指令已发送', icon: 'success', duration: 2000 });
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
        loadAndRender();
    });
})();