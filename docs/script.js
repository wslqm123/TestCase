// docs/script.js

document.addEventListener('DOMContentLoaded', () => {

    // --- 1. 初始化和获取参数 ---
    const urlParams = new URLSearchParams(window.location.search);
    const currentVersion = urlParams.get('version') || 'v1.0.0';
    const currentUser = urlParams.get('user') || 'default';
    const isEditMode = urlParams.get('edit') === 'true';

    // --- DOM 元素引用 ---
    const userSelector = document.getElementById('userSelector');
    const versionSelector = document.getElementById('versionSelector');
    const editModeToggle = document.getElementById('editModeToggle');
    const saveButton = document.getElementById('saveButton');
    const markmapContainer = document.getElementById('markmap-container');

    // --- 状态定义 ---
    const STATUS = { UNTESTED: '⚪️', PASS: '✅', FAIL: '❌', BLOCKED: '🟡' };
    const STATUS_CYCLE = [STATUS.UNTESTED, STATUS.PASS, STATUS.FAIL, STATUS.BLOCKED];
    let currentStates = {}; // 内存中保存当前用户的状态

    // --- 更新UI的显示状态 ---
    userSelector.value = currentUser;
    versionSelector.value = currentVersion;
    editModeToggle.checked = isEditMode;
    saveButton.classList.toggle('hidden', !isEditMode || currentUser === 'default');

    // --- 核心加载和渲染逻辑 ---
    async function main() {
        try {
            const baseUrl = getBaseUrl();
            const markdownUrl = `${baseUrl}/cases/${currentVersion}/_index.md`;
            const resultsUrl = `${baseUrl}/results/${currentVersion}/${currentUser}.json`;
            
            // 使用 no-cache 策略强制浏览器不使用缓存
            const fetchOptions = { cache: 'no-cache' };

            const [mdResponse, stateResponse] = await Promise.all([
                fetch(markdownUrl, fetchOptions),
                currentUser !== 'default' ? fetch(resultsUrl, fetchOptions) : Promise.resolve(null)
            ]);

            if (!mdResponse.ok) throw new Error(`无法加载用例文件: ${mdResponse.statusText}`);
            const originalMarkdown = await mdResponse.text();

            if (stateResponse && stateResponse.ok) {
                currentStates = await stateResponse.json();
            } else {
                currentStates = {};
            }

            const processedMarkdown = preprocessMarkdown(originalMarkdown, currentStates);
            
            // 将处理后的Markdown注入页面，autoloader会自动渲染
            markmapContainer.innerHTML = `<script type="text/template">${processedMarkdown}<\/script>`;
            
            // 关键：autoloader 在渲染完成后会派发一个 'markmap' 事件
            // 我们监听这个事件来确保在渲染完成后再执行我们的交互代码
            
            const handleRender = (event) => {
                console.log('Markmap rendered!', event.detail);
                // event.detail.mm 是当前渲染的 Markmap 实例
                attachClickHandlers(event.detail.mm);
                // 移除监听器，避免重复绑定
                window.removeEventListener('markmap', handleRender);
            };
            
            window.addEventListener('markmap', handleRender);

        } catch (error) {
            console.error("加载失败:", error);
            markmapContainer.innerHTML = `<script type="text/template">---
markmap:
  toolbar: true
---
# 加载失败
- ${error.message}
</script>`;
        }
    }

    // --- 辅助函数 ---
    function getBaseUrl() {
        const pathParts = window.location.pathname.split('/').filter(p => p);
        const repoName = pathParts.length > 0 ? pathParts[0] : '';
        return (window.location.hostname.includes('github.io') && repoName && repoName !== 'favicon.ico') ? `/${repoName}` : '';
    }

    function preprocessMarkdown(markdown, states) {
        if (!markdown) return '';
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

    function attachClickHandlers(markmapInstance) {
        if (!isEditMode || currentUser === 'default' || !markmapInstance || !markmapInstance.svg || !window.d3) return;

        console.log("Attaching click handlers...");
        const d3 = window.d3;
        
        d3.select(markmapInstance.svg.node()).selectAll('g.markmap-node').each(function(nodeData) {
            const element = d3.select(this);
            const textElement = element.select('text');
            const originalText = nodeData.content;
            
            const match = originalText.match(/\[([A-Z0-9-]+)\]/);
            if (!match) return;

            element.style('cursor', 'pointer');
            element.on('click', function(event) {
                event.stopPropagation();
                const caseId = match[1];
                
                const currentStatusEmoji = textElement.text().trim().split(' ')[0];
                const currentIndex = STATUS_CYCLE.indexOf(currentStatusEmoji);
                const nextIndex = (currentIndex >= 0 && currentIndex < STATUS_CYCLE.length - 1) ? currentIndex + 1 : 0;
                const newStatus = STATUS_CYCLE[nextIndex];
                
                currentStates[caseId] = newStatus;
                textElement.text(textElement.text().replace(currentStatusEmoji, newStatus));
            });
        });
    }

    function saveStatesToGitHub() {
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

    // --- 事件监听与页面导航 ---
    function navigate() {
        const params = new URLSearchParams();
        params.set('version', versionSelector.value);
        params.set('user', userSelector.value);
        if (editModeToggle.checked) {
            params.set('edit', 'true');
        }
        // 跳转到新的 URL，这将导致页面重新加载
        window.location.search = params.toString();
    }

    userSelector.addEventListener('change', navigate);
    versionSelector.addEventListener('change', navigate);
    editModeToggle.addEventListener('change', navigate);
    saveButton.addEventListener('click', saveStatesToGitHub);

    // --- 启动应用 ---
    main();
});