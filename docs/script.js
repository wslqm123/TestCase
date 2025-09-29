// docs/script.js

// 使用 window.onload 确保所有外部资源（JS库）都已加载完毕
window.onload = () => {
    // 1. 全局变量和初始化
    const { Markmap, Transformer, Toolbar } = window.markmap;
    
    // 检查库是否正确加载
    if (!Markmap || !Transformer || !Toolbar || !window.d3) {
        console.error('Markmap libraries did not load correctly.');
        document.body.innerHTML = '<h1>Error: Markmap or D3 library failed to load. Please check network and script tags.</h1>';
        return;
    }
    
    const transformer = new Transformer();
    const svgEl = document.querySelector('#markmap');
    const markmapInstance = Markmap.create(svgEl, null);
    Toolbar.create(markmapInstance, svgEl);

    // DOM元素
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
            
            // 渲染的是原始Markdown，状态在applyStatesAndInteractivity中添加
            const { root, features } = transformer.transform(markdownText);
            
            markmapInstance.setData(root, { ...features });
            await markmapInstance.fit();
            
            applyStatesAndInteractivity();

        } catch (error) {
            console.error("加载或渲染失败:", error);
            const { root } = transformer.transform(`# 加载失败\n\n- ${error.message}`);
            markmapInstance.setData(root);
            await markmapInstance.fit();
        }
    }
    
    // 新函数：合并了状态显示和事件绑定的所有逻辑
    function applyStatesAndInteractivity() {
        const isEditMode = editModeToggle.checked;
        const currentUser = userSelector.value;
        const d3 = window.d3;
        
        if (!markmapInstance || !markmapInstance.svg) return;
        
        console.log(`Applying states and interactivity. Edit mode: ${isEditMode}, User: ${currentUser}`);

        markmapInstance.svg.selectAll('g.markmap-node').each(function(nodeData) {
            const element = d3.select(this);
            const textElement = element.select('text');

            if (textElement.empty()) return;

            const originalText = nodeData.content;
            const match = originalText.match(/\[([A-Z0-9-]+)\]/);
            if (!match) return; 

            const caseId = match[1];
            const currentStatus = currentStates[caseId] || STATUS.UNTESTED;
            
            textElement.text(`${currentStatus} ${originalText}`);

            element.on('click', null).style('cursor', 'default');
            
            if (isEditMode && currentUser !== 'default') {
                element.style('cursor', 'pointer');
                
                element.on('click', function(event) {
                    event.stopPropagation();
                    
                    const oldStatus = currentStates[caseId] || STATUS.UNTESTED;
                    const currentIndex = STATUS_CYCLE.indexOf(oldStatus);
                    const newStatus = STATUS_CYCLE[(currentIndex + 1) % STATUS_CYCLE.length];
                    
                    currentStates[caseId] = newStatus;
                    
                    textElement.text(`${newStatus} ${originalText}`);
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
    async function handleDataChange() {
        await loadDataAndRender();
        updateUIState();
    }

    function handleInteractionChange() {
        updateUIState();
        applyStatesAndInteractivity();
    }
    
    function updateUIState(){
        saveButton.classList.toggle('hidden', !(editModeToggle.checked && userSelector.value !== 'default'));
    }

    userSelector.addEventListener('change', handleDataChange);
    versionSelector.addEventListener('change', handleDataChange);
    editModeToggle.addEventListener('change', handleInteractionChange);
    saveButton.addEventListener('click', saveStatesToGitHub);

    // --- 启动应用 ---
    const urlParams = new URLSearchParams(window.location.search);
    const version = urlParams.get('version');
    // ** 这里的 urlP 已经修正为 urlParams **
    const user = urlParams.get('user'); 
    const edit = urlParams.get('edit');
    if (version) versionSelector.value = version;
    if (user) userSelector.value = user;
    if (edit === 'true') editModeToggle.checked = true;
    
    handleDataChange(); // 初始加载
};