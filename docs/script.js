window.addEventListener('load', () => {
    // 确保库已加载
    if (!window.markmap || !window.markmap.Markmap) {
        console.error('Markmap is not loaded!');
        return;
    }

    // 1. 初始化
    const { Markmap, Transformer, Toolbar } = window.markmap;
    const transformer = new Transformer();
    const mm = Markmap.create('#markmap');
    const toolbar = Toolbar.create(mm, document.querySelector('#markmap'));
    const userSelector = document.getElementById('userSelector');
    const versionSelector = document.getElementById('versionSelector');
    const editModeToggle = document.getElementById('editModeToggle');
    const saveButton = document.getElementById('saveButton');
    
    const STATUS = { UNTESTED: '⚪️', PASS: '✅', FAIL: '❌', BLOCKED: '🟡' };
    const STATUS_CYCLE = [STATUS.UNTESTED, STATUS.PASS, STATUS.FAIL, STATUS.BLOCKED];
    let currentStates = {};

    function getBaseUrl() {
        const pathParts = window.location.pathname.split('/');
        const repoName = pathParts[1] === 'TestCase' ? '/TestCase' : '';
        return window.location.hostname.includes('github.io') ? repoName : '';
    }

    // 2. 核心函数
    async function updateView() {
        const version = versionSelector.value;
        const user = userSelector.value;

        // 获取数据
        const baseUrl = getBaseUrl();
        const mdRes = await fetch(`${baseUrl}/cases/${version}/_index.md?ts=${Date.now()}`, { cache: 'no-cache' });
        const markdown = await mdRes.text();
        
        if (user !== 'default') {
            const stateRes = await fetch(`${baseUrl}/results/${version}/${user}.json?ts=${Date.now()}`, { cache: 'no-cache' });
            currentStates = stateRes.ok ? await stateRes.json() : {};
        } else {
            currentStates = {};
        }

        // 转换并渲染
        const { root } = transformer.transform(markdown);
        mm.setData(root);
        await mm.fit(); // 等待渲染完成
        updateInteractions(); // 渲染完成后添加交互
    }
    
    function updateInteractions() {
        const isEdit = editModeToggle.checked;
        const user = userSelector.value;
        const d3 = window.d3;
        
        d3.select('#markmap').selectAll('g.markmap-node').each(function(nodeData) {
            const element = d3.select(this);
            const textEl = element.select('text');
            if (textEl.empty()) return;

            const originalContent = nodeData.content;
            const match = originalContent.match(/\[([A-Z0-9-]+)\]/);
            if (!match) return;
            const caseId = match[1];

            const status = currentStates[caseId] || STATUS.UNTESTED;
            textEl.text(`${status} ${originalContent}`);

            element.on('click', null).style('cursor', 'default');

            if (isEdit && user !== 'default') {
                element.style('cursor', 'pointer').on('click', event => {
                    event.stopPropagation();
                    const oldStatus = currentStates[caseId] || STATUS.UNTESTED;
                    const newIndex = (STATUS_CYCLE.indexOf(oldStatus) + 1) % STATUS_CYCLE.length;
                    const newStatus = STATUS_CYCLE[newIndex];
                    currentStates[caseId] = newStatus;
                    textEl.text(`${newStatus} ${originalContent}`);
                });
            }
        });
    }

    function handleUIChange() {
        const isEdit = editModeToggle.checked;
        const user = userSelector.value;
        saveButton.classList.toggle('hidden', !isEdit || user === 'default');
        updateInteractions();
    }
    
    // 3. 事件绑定
    versionSelector.addEventListener('change', updateView);
    userSelector.addEventListener('change', updateView);
    editModeToggle.addEventListener('change', handleUIChange);
    saveButton.addEventListener('click', () => {
        // 保存逻辑...
        console.log("Saving states:", currentStates);
        alert("保存逻辑已触发，请查看控制台。");
    });
    
    // 4. 初始加载
    const params = new URLSearchParams(window.location.search);
    versionSelector.value = params.get('version') || 'v1.0.0';
    userSelector.value = params.get('user') || 'default';
    editModeToggle.checked = params.get('edit') === 'true';

    updateView(); // 首次加载
});