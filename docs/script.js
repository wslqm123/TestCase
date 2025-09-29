// docs/script.js

window.onload = () => {
    // 1. 全局变量和初始化
    const { Markmap, Transformer, Toolbar } = window.markmap;

    const svgEl = document.querySelector('#markmap');
    // 在 Markmap 选项中启用所有内置插件
    const markmapInstance = Markmap.create(svgEl, {
        embed: true, // 允许嵌入HTML
    });
    Toolbar.create(markmapInstance, svgEl);

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
        const isEditMode = editModeToggle.checked;

        try {
            const baseUrl = getBaseUrl();
            const markdownUrl = `${baseUrl}/cases/${version}/_index.md?cache_bust=${Date.now()}`;
            const resultsUrl = `${baseUrl}/results/${version}/${user}.json?cache_bust=${Date.now()}`;
            const fetchOptions = { cache: 'no-cache' };

            const [mdResponse, stateResponse] = await Promise.all([
                fetch(markdownUrl, fetchOptions),
                user !== 'default' ? fetch(resultsUrl, fetchOptions) : Promise.resolve(null),
            ]);

            if (!mdResponse.ok) throw new Error(`无法加载用例文件: ${mdResponse.statusText}`);
            let markdownText = await mdResponse.text();

            if (!markdownText.trim()) {
                markdownText = "# (空)\n- 此版本没有测试用例。";
            }
            
            currentStates = (stateResponse && stateResponse.ok) ? await stateResponse.json() : {};

            // *** 核心修改：使用 Transformer 插件 ***
            const transformer = new Transformer();
            const { root, features } = transformer.transform(markdownText);
            
            // 遍历转换后的节点树，在数据层面注入状态和交互
            walkTree(root, (node) => {
                const match = node.content.match(/\[([A-Z0-9-]+)\]/);
                if (match) {
                    const caseId = match[1];
                    const status = currentStates[caseId] || STATUS.UNTESTED;
                    node.content = `${status} ${node.content}`;

                    // 如果在编辑模式，直接在节点数据中添加 HTML class 和 onclick 事件
                    if (isEditMode && user !== 'default') {
                        node.payload = {
                            ...node.payload,
                            class: 'editable-node',
                            // 将点击事件信息存储在数据属性中
                            attrs: {
                                'data-case-id': caseId,
                                'data-current-status': status
                            },
                        };
                    }
                }
            });

            markmapInstance.setData(root, { ...features });
            await markmapInstance.fit();
            
            // 渲染完成后，再为带有特定 class 的元素绑定事件
            attachClickHandlers();

        } catch (error) {
            console.error("加载或渲染失败:", error);
            const transformer = new Transformer();
            const { root } = transformer.transform(`# 加载失败\n\n- ${error.message}`);
            markmapInstance.setData(root);
            await markmapInstance.fit();
        }
    }

    // 遍历树的辅助函数
    function walkTree(node, callback) {
        callback(node);
        if (node.children) {
            node.children.forEach(child => walkTree(child, callback));
        }
    }

    // 事件绑定函数，现在变得更简单
    function attachClickHandlers() {
        const isEditMode = editModeToggle.checked;
        const currentUser = userSelector.value;
        
        if (!isEditMode || currentUser === 'default' || !markmapInstance || !markmapInstance.svg) return;

        console.log("Attaching click handlers...");
        const d3 = window.d3;
        
        // 我们只选择那些被插件标记过的节点
        markmapInstance.svg.selectAll('g.editable-node').each(function() {
            const element = d3.select(this);
            const textElement = element.select('text');
            const caseId = element.attr('data-case-id');
            
            element.style('cursor', 'pointer');
            element.on('click', function(event) {
                event.stopPropagation();
                
                const oldStatus = currentStates[caseId] || STATUS.UNTESTED;
                const currentIndex = STATUS_CYCLE.indexOf(oldStatus);
                const newStatus = STATUS_CYCLE[(currentIndex + 1) % STATUS_CYCLE.length];
                
                currentStates[caseId] = newStatus;
                
                // 更新文本内容
                const originalText = textElement.text();
                textElement.text(originalText.replace(oldStatus, newStatus));
            });
        });
    }

    function saveStatesToGitHub() {
        // ... (此函数无需修改)
    }

    // --- 事件监听器 ---
    async function handleSelectionChange() {
        await loadDataAndRender();
        saveButton.classList.toggle('hidden', !(editModeToggle.checked && userSelector.value !== 'default'));
    }

    userSelector.addEventListener('change', handleSelectionChange);
    versionSelector.addEventListener('change', handleSelectionChange);
    editModeToggle.addEventListener('change', handleSelectionChange); // 切换编辑模式也需要重绘来添加/删除 class 和事件
    saveButton.addEventListener('click', saveStatesToGitHub);

    // --- 启动应用 ---
    const urlParams = new URLSearchParams(window.location.search);
    const version = urlParams.get('version');
    const user = urlParams.get('user');
    const edit = urlParams.get('edit');
    if (version) versionSelector.value = version;
    if (user) userSelector.value = user;
    if (edit === 'true') editModeToggle.checked = true;

    handleSelectionChange(); // 初始加载
};