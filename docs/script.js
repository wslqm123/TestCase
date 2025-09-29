document.addEventListener('DOMContentLoaded', () => {

    // --- 1. 全局变量和 DOM 元素 ---
    const { markmap: markmapGlobal } = window;
    const userSelector = document.getElementById('userSelector');
    const versionSelector = document.getElementById('versionSelector');
    const editModeToggle = document.getElementById('editModeToggle');
    const saveButton = document.getElementById('saveButton');
    const markmapContainer = document.getElementById('markmap-container');

    const STATUS = { UNTESTED: '⚪️', PASS: '✅', FAIL: '❌', BLOCKED: '🟡' };
    const STATUS_CYCLE = [STATUS.UNTESTED, STATUS.PASS, STATUS.FAIL, STATUS.BLOCKED];

    let currentStates = {};
    let markmapInstance;
    let originalMarkdown = '';

    // --- 2. 核心函数 ---

    function getBaseUrl() {
        const pathParts = window.location.pathname.split('/').filter(p => p);
        const repoName = pathParts.length > 0 ? pathParts[0] : '';
        return (window.location.hostname.includes('github.io') && repoName && repoName !== 'favicon.ico') ? `/${repoName}` : '';
    }
    
    // **核心渲染函数**
    async function loadAndRender() {
        const version = versionSelector.value;
        const user = userSelector.value;

        // 显示加载状态
        markmapContainer.innerHTML = `<script type="text/template"># 正在加载 ${version} 的测试用例...</script>`;
        await markmapGlobal.autoLoader.renderAll();

        try {
            const baseUrl = getBaseUrl();
            const markdownUrl = `${baseUrl}/cases/${version}/_index.md`;
            const resultsUrl = `${baseUrl}/results/${version}/${user}.json`;
            const fetchOptions = { cache: 'no-cache' };

            // 并行获取数据
            const [mdResponse, stateResponse] = await Promise.all([
                fetch(markdownUrl, fetchOptions),
                user !== 'default' ? fetch(resultsUrl, fetchOptions) : Promise.resolve(null)
            ]);

            if (!mdResponse.ok) throw new Error(`无法加载用例文件: ${mdResponse.statusText}`);
            originalMarkdown = await mdResponse.text();
            if (!originalMarkdown.trim()) throw new Error(`Markdown 文件为空: ${version}`);

            currentStates = (stateResponse && stateResponse.ok) ? await stateResponse.json() : {};
            
            // 准备最终要渲染的 Markdown
            const processedMarkdown = preprocessMarkdown(originalMarkdown, currentStates);
            
            // 清空并重新注入内容
            markmapContainer.innerHTML = `<script type="text/template">${processedMarkdown}<\/script>`;

            // **最可靠的渲染完成监听方式**
            const renderPromise = new Promise(resolve => {
                const observer = new MutationObserver((mutations, obs) => {
                    const svg = markmapContainer.querySelector('svg');
                    if (svg) {
                        // 确保 SVG 有实际尺寸后再继续
                        if (svg.getBBox && svg.getBBox().width > 0) {
                            resolve(svg.__markmap__);
                            obs.disconnect(); // 停止观察
                        }
                    }
                });
                observer.observe(markmapContainer, { childList: true, subtree: true });
            });

            // 触发 autoloader
            markmapGlobal.autoLoader.renderAll();
            
            // 等待渲染完成并返回实例
            markmapInstance = await renderPromise;
            
            // 渲染完成后，应用交互
            updateInteractiveLayer();

        } catch (error) {
            console.error("加载或渲染失败:", error);
            markmapContainer.innerHTML = `<script type="text/template">---
markmap: {toolbar: true}
---
# 加载失败
- ${error.message}
</script>`;
            markmapGlobal.autoLoader.renderAll();
        }
    }

    // **只更新交互层，不重新渲染整个图**
    function updateInteractiveLayer() {
        if (!markmapInstance || !markmapInstance.svg) return;

        const isEditMode = editModeToggle.checked;
        const currentUser = userSelector.value;
        const d3 = window.d3;
        
        console.log(`Updating interactive layer. Edit mode: ${isEditMode}, User: ${currentUser}`);

        d3.select(markmapInstance.svg.node()).selectAll('g.markmap-node').each(function(nodeData) {
            const element = d3.select(this);
            const textElement = element.select('text');
            const originalText = nodeData.content;
            
            const match = originalText.match(/\[([A-Z0-9-]+)\]/);
            if (!match) return;

            // 移除旧的点击事件，防止重复绑定
            element.on('click', null);

            // 根据编辑模式和用户，决定是否添加新的点击事件
            if (isEditMode && currentUser !== 'default') {
                element.style('cursor', 'pointer');
                element.on('click', function(event) {
                    event.stopPropagation();
                    const caseId = match[1];
                    
                    const currentStatusEmoji = textElement.text().trim().split(' ')[0];
                    const currentIndex = STATUS_CYCLE.indexOf(currentStatusEmoji);
                    const nextIndex = (currentIndex + 1) % STATUS_CYCLE.length;
                    const newStatus = STATUS_CYCLE[nextIndex];
                    
                    currentStates[caseId] = newStatus;
                    textElement.text(originalText.replace(`[${caseId}]`, `${newStatus} [${caseId}]`));
                });
            } else {
                element.style('cursor', 'default');
            }
        });
    }

    function preprocessMarkdown(markdown, states) {
        const toolbarConfig = `---
markmap:
  toolbar: true
---

`;
        const content = markdown.split('\n').map(line => {
            const match = line.match(/(\s*-\s*)(\[([A-Z0-9-]+)\])/);
            if (match) {
                const caseId = match[3];
                const status = states[caseId] || STATUS.UNTESTED;
                return line.replace(match[2], `${status} ${match[2]}`);
            }
            return line;
        }).join('\n');
        return toolbarConfig + content;
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

    // --- 3. 事件监听器 ---
    userSelector.addEventListener('change', loadAndRender);
    versionSelector.addEventListener('change', loadAndRender);
    
    editModeToggle.addEventListener('change', () => {
        saveButton.classList.toggle('hidden', !(editModeToggle.checked && userSelector.value !== 'default'));
        // 切换编辑模式时，只需要更新交互层，不需要重新加载数据
        updateInteractiveLayer();
    });

    saveButton.addEventListener('click', saveStatesToGitHub);

    // --- 4. 启动应用 ---
    loadAndRender();
});