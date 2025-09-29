// docs/script.js

// 使用 window.onload 确保所有外部资源（JS库）都已加载完毕
window.onload = () => {
    // 1. 全局变量和初始化
    const { Markmap, Transformer, Toolbar } = window.markmap;
    const transformer = new Transformer();
    
    const svgEl = document.querySelector('#markmap');
    const markmapInstance = Markmap.create(svgEl, null);
    Toolbar.create(markmapInstance, svgEl);

    // DOM元素获取
    const userSelector = document.getElementById('userSelector');
    const versionSelector = document.getElementById('versionSelector');
    const editModeToggle = document.getElementById('editModeToggle');
    const saveButton = document.getElementById('saveButton');

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
            // 在获取数据前，确保 SVG 容器有具体的尺寸
            // 这是解决 "SVGLength" 错误的关键
            const contentDiv = document.querySelector('.content');
            if (contentDiv.clientHeight === 0) {
                 // 如果容器高度为0，稍等一下再重试
                 await new Promise(resolve => setTimeout(resolve, 100));
            }

            const baseUrl = getBaseUrl();
            const markdownUrl = `${baseUrl}/cases/${version}/_index.md?cache_bust=${Date.now()}`;
            const resultsUrl = `${baseUrl}/results/${version}/${user}.json?cache_bust=${Date.now()}`;
            
            const fetchOptions = { cache: 'no-cache' };

            const [mdResponse, stateResponse] = await Promise.all([
                fetch(markdownUrl, fetchOptions),
                user !== 'default' ? fetch(resultsUrl, fetchOptions) : Promise.resolve(null)
            ]);

            if (!mdResponse.ok) throw new Error(`无法加载用例文件: ${mdResponse.statusText}`);
            const markdownText = await mdResponse.text();
            
            currentStates = (stateResponse && stateResponse.ok) ? await stateResponse.json() : {};

            const { root } = transformer.transform(markdownText);
            markmapInstance.setData(root);
            // Toolbar 会自动处理 fit，但首次加载手动调用一次更保险
            await markmapInstance.fit(); 

            // 渲染完成，应用交互
            applyStatesToUI();

        } catch (error) {
            console.error("加载或渲染失败:", error);
            const { root } = transformer.transform(`# 加载失败\n\n- ${error.message}`);
            markmapInstance.setData(root);
            await markmapInstance.fit();
        }
    }
    
    function applyStatesToUI() {
        const isEditMode = editModeToggle.checked;
        const currentUser = userSelector.value;
        const d3 = window.d3;
        
        if (!markmapInstance || !markmapInstance.svg) return;
        
        markmapInstance.svg.selectAll('g.markmap-node').each(function(nodeData) {
            const element = d3.select(this);
            const textElement = element.select('text');
            const originalText = nodeData.content;
            
            const match = originalText.match(/\[([A-Z0-9-]+)\]/);
            if (!match) return;

            const caseId = match[1];
            // 从原始MD文本中移除可能残留的旧状态图标
            const cleanOriginalText = originalText.replace(/^[⚪️✅❌🟡]\s*/, '');
            const currentStatus = currentStates[caseId] || STATUS.UNTESTED;
            
            textElement.text(`${currentStatus} ${cleanOriginalText}`);

            // 移除旧的点击事件，防止重复绑定
            element.on('click', null);
            element.style('cursor', 'default');
            
            if (isEditMode && currentUser !== 'default') {
                element.style('cursor', 'pointer');
                element.on('click', function(event) {
                    event.stopPropagation();
                    
                    const oldStatus = currentStates[caseId] || STATUS.UNTESTED;
                    const currentIndex = STATUS_CYCLE.indexOf(oldStatus);
                    const newStatus = STATUS_CYCLE[(currentIndex + 1) % STATUS_CYCLE.length];
                    
                    currentStates[caseId] = newStatus;
                    textElement.text(`${newStatus} ${cleanOriginalText}`);
                });
            }
        });
    }

    function saveStatesToGitHub() {
        const currentUser = userSelector.value;
        const currentVersion = versionSelector.value;

        if (currentUser === 'default') {
            const msg = '请先选择一个测试员';
            (window.tt && tt.showToast) ? tt.showToast({ title: msg, icon: 'fail' }) : alert(msg);
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

    // 3. 事件监听器
    userSelector.addEventListener('change', loadDataAndRender);
    versionSelector.addEventListener('change', loadDataAndRender);
    
    editModeToggle.addEventListener('change', () => {
        saveButton.classList.toggle('hidden', !(editModeToggle.checked && userSelector.value !== 'default'));
        // 只更新UI交互，不重新加载数据
        applyStatesToUI();
    });

    saveButton.addEventListener('click', saveStatesToGitHub);

    // 4. 启动应用
    // URL参数只在初始加载时使用一次
    const urlParams = new URLSearchParams(window.location.search);
    const version = urlParams.get('version');
    const user = urlParams.get('user');
    const edit = urlParams.get('edit');
    if (version) versionSelector.value = version;
    if (user) userSelector.value = user;
    if (edit === 'true') editModeToggle.checked = true;
    
    // 手动触发一次初始加载
    loadDataAndRender();
};