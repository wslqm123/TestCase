// 使用一个立即执行函数表达式 (IIFE) 来创建独立的作用域，防止变量污染
(function() {
    // 确保在DOM加载完成后执行
    document.addEventListener('DOMContentLoaded', () => {

        // 检查 Markmap 库是否已加载
        if (!window.markmap || !window.markmap.Markmap || !window.markmap.transform) {
            console.error('Markmap library is not loaded correctly!');
            document.getElementById('markmap').innerHTML = '<h2>Error: Markmap library failed to load.</h2>';
            return;
        }

        // 1. 全局变量和初始化
        const { Markmap, transform } = window.markmap;
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

        /**
         * 动态计算基础URL，以适应GitHub Pages的子目录结构
         */
        function getBaseUrl() {
            const repoName = window.location.pathname.split('/')[1];
            // 只有在 github.io 域名下才添加仓库名前缀
            if (window.location.hostname.includes('github.io') && repoName) {
                return `/${repoName}`;
            }
            return '';
        }

        /**
         * 根据当前选择的版本和用户加载和渲染所有数据
         */
        async function loadAndRender() {
            try {
                // 再次从 window.markmap 获取 transform 函数，确保其可用性
                const localTransform = window.markmap.transform;
                if (typeof localTransform !== 'function') {
                     throw new Error('transform function is not available on window.markmap');
                }

                const baseUrl = getBaseUrl();
                const markdownUrl = `${baseUrl}/cases/${currentVersion}/_index.md?cache_bust=${new Date().getTime()}`;
                console.log(`[loadAndRender] Fetching markdown from: ${markdownUrl}`);

                const response = await fetch(markdownUrl);
                if (!response.ok) throw new Error(`Failed to fetch ${markdownUrl}. Status: ${response.status}`);
                
                const markdownText = await response.text();
                if (!markdownText.trim()) throw new Error(`Markdown file for version ${currentVersion} is empty.`);

                const { root } = localTransform(markdownText);
                markmapInstance.setData(root);
                await markmapInstance.fit();

                await loadUserStates();
                applyStatesToUI();

            } catch (error) {
                console.error("[loadAndRender] Failed:", error);
                 // 确保 transform 存在才调用
                const localTransform = window.markmap.transform;
                if (typeof localTransform === 'function') {
                    const { root } = localTransform(`# Loading Failed\n\n- ${error.message}`);
                    markmapInstance.setData(root);
                    await markmapInstance.fit();
                } else {
                    document.getElementById('markmap').innerHTML = `<h2>Loading Failed</h2><p>${error.message}</p>`;
                }
            }
        }

        /**
         * 从 GitHub Pages 加载指定用户的测试结果 JSON 文件
         */
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

        /**
         * 将 currentStates 中的状态更新到思维导图的UI上
         */
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

        /**
         * 将当前状态发送给飞书小程序进行保存
         */
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
                console.log("Not in Feishu Mini Program. Mocking save call:", messagePayload);
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
        // 确保飞书JSSDK加载完成后再执行
        if (window.h5sdk) {
            h5sdk.ready(() => loadAndRender());
        } else {
            document.addEventListener('h5sdkReady', () => loadAndRender());
        }
        
        // 作为备用，如果不是在飞书环境，也直接执行
        if (!window.h5sdk && !navigator.userAgent.includes('Lark')) {
             loadAndRender();
        }

    });
})();