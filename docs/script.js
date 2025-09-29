// docs/script.js

document.addEventListener('DOMContentLoaded', () => {

    // --- 1. 初始化和获取参数 ---
    const urlParams = new URLSearchParams(window.location.search);
    const currentVersion = urlParams.get('version') || 'v1.0.0';
    const currentUser = urlParams.get('user') || 'default';
    const isEditMode = urlParams.get('edit') === 'true';

    const userSelector = document.getElementById('userSelector');
    const versionSelector = document.getElementById('versionSelector');
    const editModeToggle = document.getElementById('editModeToggle');
    const saveButton = document.getElementById('saveButton');
    const markmapContainer = document.getElementById('markmap-container');

    const STATUS = { UNTESTED: '⚪️', PASS: '✅', FAIL: '❌', BLOCKED: '🟡' };
    const STATUS_CYCLE = [STATUS.UNTESTED, STATUS.PASS, STATUS.FAIL, STATUS.BLOCKED];
    let currentStates = {}; // 内存中保存当前用户的状态，用于点击修改

    // --- 2. 更新UI的显示状态 ---
    userSelector.value = currentUser;
    versionSelector.value = currentVersion;
    editModeToggle.checked = isEditMode;
    saveButton.classList.toggle('hidden', !isEditMode || currentUser === 'default');

    // --- 3. 核心加载和渲染逻辑 ---
    async function main() {
        try {
            const baseUrl = getBaseUrl();
            const markdownUrl = `${baseUrl}/cases/${currentVersion}/_index.md?cache_bust=${Date.now()}`;
            const resultsUrl = `${baseUrl}/results/${currentVersion}/${currentUser}.json?cache_bust=${Date.now()}`;

            const [mdResponse, stateResponse] = await Promise.all([
                fetch(markdownUrl),
                currentUser !== 'default' ? fetch(resultsUrl) : Promise.resolve(null)
            ]);

            if (!mdResponse.ok) throw new Error(`无法加载用例文件: ${mdResponse.statusText}`);
            const originalMarkdown = await mdResponse.text();

            if (stateResponse && stateResponse.ok) {
                currentStates = await stateResponse.json();
            }

            const processedMarkdown = preprocessMarkdown(originalMarkdown, currentStates);
            
            // 将处理好的Markdown注入页面，autoloader会自动渲染
            markmapContainer.innerHTML = `<script type="text/template">${processedMarkdown}<\/script>`;
            
            // Autoloader 是异步的，我们需要等待它渲染完成再添加事件监听
            setTimeout(attachClickHandlers, 500); // 延迟执行，确保SVG已生成

        } catch (error) {
            console.error("加载失败:", error);
            markmapContainer.innerHTML = `<script type="text/template">---
markmap:
  initialExpandLevel: 2
---
# 加载失败
- ${error.message}
</script>`;
        }
    }

    // --- 4. 辅助函数 ---
    function getBaseUrl() {
        const pathParts = window.location.pathname.split('/').filter(p => p);
        const repoName = pathParts.length > 0 ? pathParts[0] : '';
        return (window.location.hostname.includes('github.io') && repoName) ? `/${repoName}` : '';
    }

    function preprocessMarkdown(markdown, states) {
        if (!markdown) return '';
        // 添加 frontmatter 以启用工具栏
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

    function attachClickHandlers() {
        if (!isEditMode || currentUser === 'default') return;

        const svg = markmapContainer.querySelector('svg');
        if (!svg || !window.d3) return;

        window.d3.select(svg).selectAll('g.markmap-node').each(function(nodeData) {
            const element = d3.select(this);
            const textElement = element.select('text');
            
            // 从原始数据中获取 caseId，避免因 emoji 污染
            const originalText = nodeData.content;
            const match = originalText.match(/\[([A-Z0-9-]+)\]/);
            if (!match) return;

            element.style('cursor', 'pointer'); // 明确设置鼠标手势
            element.on('click', function(event) {
                event.stopPropagation();
                const caseId = match[1];
                
                const oldStatus = currentStates[caseId] || STATUS.UNTESTED;
                const currentIndex = STATUS_CYCLE.indexOf(oldStatus);
                const newStatus = STATUS_CYCLE[(currentIndex + 1) % STATUS_CYCLE.length];
                
                currentStates[caseId] = newStatus;
                textElement.text(textElement.text().replace(oldStatus, newStatus)); // 只替换 emoji
            });
        });
    }

    function saveStatesToGitHub() {
        // ... (此函数无需修改)
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
            alert('保存功能仅在飞书小程序中可用。');
            saveButton.disabled = false;
            saveButton.textContent = '保存更改';
        }
    }

    // --- 5. 事件监听与页面导航 ---
    function navigate() {
        const params = new URLSearchParams();
        params.set('version', versionSelector.value);
        params.set('user', userSelector.value);
        if (editModeToggle.checked) {
            params.set('edit', 'true');
        }
        window.location.search = params.toString();
    }

    userSelector.addEventListener('change', navigate);
    versionSelector.addEventListener('change', navigate);
    editModeToggle.addEventListener('change', navigate);
    saveButton.addEventListener('click', saveStatesToGitHub);

    // --- 6. 启动应用 ---
    main();
});