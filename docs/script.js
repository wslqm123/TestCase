// docs/script.js

// 确保在 DOM 加载完成后执行
document.addEventListener('DOMContentLoaded', () => {

    // 1. 全局变量和初始化
    // 等待 markmap 对象加载完成
    const checkMarkmapReady = setInterval(() => {
        if (window.markmap && window.markmap.Markmap && window.markmap.Transformer && window.markmap.Toolbar) {
            clearInterval(checkMarkmapReady);
            initializeApp();
        }
    }, 100);

    function initializeApp() {
        const { Markmap, Transformer, Toolbar } = window.markmap;
        
        // 实例化
        const transformer = new Transformer();
        const svgEl = document.querySelector('#markmap');
        const markmapInstance = Markmap.create(svgEl, null);
        Toolbar.create(markmapInstance, svgEl);

        // DOM元素获取
        const userSelector = document.getElementById('userSelector');
        const versionSelector = document.getElementById('versionSelector');
        const editModeToggle = document.getElementById('editModeToggle');
        const saveButton = document.getElementById('saveButton');

        // 状态定义
        const STATUS = { UNTESTED: '⚪️', PASS: '✅', FAIL: '❌', BLOCKED: '🟡' };
        const STATUS_CYCLE = [STATUS.UNTESTED, STATUS.PASS, STATUS.FAIL, STATUS.BLOCKED];
        let currentStates = {};

        // 2. 核心函数
        function getBaseUrl() {
            const pathParts = window.location.pathname.split('/');
            const repoName = pathParts[1] === 'TestCase' ? '/TestCase' : '';
            return window.location.hostname.includes('github.io') ? repoName : '';
        }

        async function loadDataAndRender() {
            const version = versionSelector.value;
            const user = userSelector.value;
            
            try {
                const baseUrl = getBaseUrl();
                const markdownUrl = `${baseUrl}/cases/${version}/_index.md?cache_bust=${Date.now()}`;
                const resultsUrl = `${baseUrl}/results/${version}/${user}.json?cache_bust=${Date.now()}`;
                const fetchOptions = { cache: 'no-cache' };

                const [mdResponse, stateResponse] = await Promise.all([
                    fetch(markdownUrl, fetchOptions),
                    user !== 'default' ? fetch(resultsUrl, fetchOptions) : Promise.resolve(null)
                ]);

                if (!mdResponse.ok) throw new Error(`无法加载用例文件: ${mdResponse.statusText}`);
                let markdownText = await mdResponse.text();
                
                if (!markdownText.trim()) {
                    markdownText = "# (空)\n- 此版本没有测试用例。";
                }
                
                currentStates = (stateResponse && stateResponse.ok) ? await stateResponse.json() : {};
                
                const processedMarkdown = preprocessMarkdown(markdownText, currentStates);
                const { root } = transformer.transform(processedMarkdown);
                
                markmapInstance.setData(root);
                await markmapInstance.fit();
                applyStatesToUI();

            } catch (error) {
                console.error("加载或渲染失败:", error);
                const { root } = transformer.transform(`# 加载失败\n\n- ${error.message}`);
                markmapInstance.setData(root);
                await markmapInstance.fit();
            }
        }
        
        function preprocessMarkdown(markdown, states) {
            return markdown.split('\n').map(line => {
                const match = line.match(/(\s*-\s*)(\[([A-Z0-9-]+)\])/);
                if (match) {
                    const caseId = match[3];
                    const status = states[caseId] || STATUS.UNTESTED;
                    return line.replace(match[2], `${status} ${match[2]}`);
                }
                return line;
            }).join('\n');
        }

        function applyStatesToUI() {
            const isEditMode = editModeToggle.checked;
            const currentUser = userSelector.value;
            const d3 = window.d3;
            
            if (!markmapInstance || !markmapInstance.svg) return;

            markmapInstance.svg.selectAll('g.markmap-node').each(function(nodeData) {
                const element = d3.select(this);
                const textElement = element.select('text');
                const originalTextWithStatus = textElement.text();
                const originalText = nodeData.content.replace(/^[⚪️✅❌🟡]\s*/, '');

                const match = originalText.match(/\[([A-Z0-9-]+)\]/);
                if (!match) return;
                const caseId = match[1];

                element.on('click', null).style('cursor', 'default');
                
                if (isEditMode && currentUser !== 'default') {
                    element.style('cursor', 'pointer');
                    element.on('click', function(event) {
                        event.stopPropagation();
                        
                        const oldStatus = currentStates[caseId] || STATUS.UNTESTED;
                        const currentIndex = STATUS_CYCLE.indexOf(oldStatus);
                        const newStatus = STATUS_CYCLE[(currentIndex + 1) % STATUS_CYCLE.length];
                        
                        currentStates[caseId] = newStatus;
                        textElement.text(originalTextWithStatus.replace(oldStatus, newStatus));
                    });
                }
            });
        }

        function saveStatesToGitHub() {
            const currentUser = userSelector.value;
            const currentVersion = versionSelector.value;

            if (currentUser === 'default') {
                const msg = '请先选择一个测试员';
                (window.tt && window.tt.showToast) ? tt.showToast({ title: msg, icon: 'fail' }) : alert(msg);
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
                    if(window.tt.showToast) tt.showToast({ title: '保存指令已发送', icon: 'success' });
                    saveButton.disabled = false;
                    saveButton.textContent = '保存更改';
                }, 1500);
            } else {
                console.log("Mocking save call:", messagePayload);
                alert('保存功能可在飞书小程序外模拟，数据已打印到控制台，但不会真实保存。');
                saveButton.disabled = false;
                saveButton.textContent = '保存更改';
            }
        }

        // --- 事件监听器 ---
        async function handleSelectionChange() {
            await loadDataAndRender();
            saveButton.classList.toggle('hidden', !(editModeToggle.checked && userSelector.value !== 'default'));
        }

        userSelector.addEventListener('change', handleSelectionChange);
        versionSelector.addEventListener('change', handleSelectionChange);
        
        editModeToggle.addEventListener('change', () => {
            saveButton.classList.toggle('hidden', !(editModeToggle.checked && userSelector.value !== 'default'));
            applyStatesToUI();
        });

        saveButton.addEventListener('click', saveStatesToGitHub);

        // --- 启动应用 ---
        const urlParams = new URLSearchParams(window.location.search);
        const version = urlParams.get('version');
        const user = urlParams.get('user');
        const edit = urlParams.get('edit');
        if (version) versionSelector.value = version;
        if (user) userSelector.value = user;
        if (edit === 'true') editModeToggle.checked = true;

        handleSelectionChange();
    }
});