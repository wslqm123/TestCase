// docs/script.js

// 1. 获取URL参数
const urlParams = new URLSearchParams(window.location.search);
const currentVersion = urlParams.get('version') || 'v1.0.0'; // 默认版本
const currentUser = urlParams.get('user') || 'default';     // 默认用户
const isEditMode = urlParams.get('edit') === 'true';

// 2. DOM元素引用
const userSelector = document.getElementById('userSelector');
const versionSelector = document.getElementById('versionSelector');
const editModeToggle = document.getElementById('editModeToggle');
const saveButton = document.getElementById('saveButton');
const markmapContainer = document.getElementById('markmap-container');

// 3. 状态定义
const STATUS = { UNTESTED: '⚪️', PASS: '✅', FAIL: '❌', BLOCKED: '🟡' };
const STATUS_CYCLE = [STATUS.UNTESTED, STATUS.PASS, STATUS.FAIL, STATUS.BLOCKED];
let currentStates = {};
let originalMarkdown = '';

// 4. 初始化UI状态
userSelector.value = currentUser;
versionSelector.value = currentVersion;
editModeToggle.checked = isEditMode;
saveButton.classList.toggle('hidden', !isEditMode || currentUser === 'default');

// 5. 核心函数：数据获取和渲染
async function main() {
    try {
        // 动态计算基础URL
        const pathParts = window.location.pathname.split('/').filter(p => p);
        const repoName = pathParts[0] === 'TestCase' ? '/TestCase' : '';

        // 并行获取Markdown和用户状态
        const [mdResponse, stateResponse] = await Promise.all([
            fetch(`${repoName}/cases/${currentVersion}/_index.md?cache_bust=${Date.now()}`),
            currentUser !== 'default' ? fetch(`${repoName}/results/${currentVersion}/${currentUser}.json?cache_bust=${Date.now()}`) : Promise.resolve(null)
        ]);

        if (!mdResponse.ok) throw new Error(`无法加载用例文件: ${mdResponse.statusText}`);
        originalMarkdown = await mdResponse.text();

        if (stateResponse && stateResponse.ok) {
            currentStates = await stateResponse.json();
        }

        // 预处理Markdown，插入状态图标
        const processedMarkdown = preprocessMarkdown(originalMarkdown, currentStates);

        // 将处理后的Markdown放入模板，让autoloader渲染
        markmapContainer.innerHTML = `<script type="text/template">${processedMarkdown}<\/script>`;
        
        // Autoloader 会自动运行，我们不需要再手动调用 renderAll

        // 渲染完成后，为可编辑节点添加点击事件
        // autoloader是异步的，需要稍作延迟
        setTimeout(attachClickHandlers, 500);

    } catch (error) {
        console.error("初始化失败:", error);
        markmapContainer.innerHTML = `<script type="text/template"># 加载失败\n\n- ${error.message}<\/script>`;
    }
}

// 6. 辅助函数
function preprocessMarkdown(markdown, states) {
    if (!markdown) return '';
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

function attachClickHandlers() {
    if (!isEditMode || currentUser === 'default') return;

    const svg = markmapContainer.querySelector('svg');
    if (!svg) return;

    // d3由autoloader加载，此时应该可用
    const d3 = window.d3;
    d3.select(svg).selectAll('g.markmap-node').each(function(nodeData) {
        const element = d3.select(this);
        const textElement = element.select('text');
        const originalText = textElement.text();
        
        const match = originalText.match(/\[([A-Z0-9-]+)\]/);
        if (!match) return;

        element.classed('editable', true);
        element.on('click', function(event) {
            event.stopPropagation();
            const caseId = match[1];
            
            // 直接从文本中提取当前状态
            const currentStatusEmoji = originalText.split(' ')[0];
            const currentIndex = STATUS_CYCLE.indexOf(currentStatusEmoji);
            const nextIndex = (currentIndex + 1) % STATUS_CYCLE.length;
            const newStatus = STATUS_CYCLE[nextIndex];
            
            // 更新内存中的状态
            currentStates[caseId] = newStatus;
            
            // 更新UI
            const newText = originalText.replace(currentStatusEmoji, newStatus);
            textElement.text(newText);
        });
    });
}

function saveStatesToGitHub() {
    saveButton.disabled = true;
    saveButton.textContent = '保存中...';
    
    const messagePayload = {
        action: 'saveData',
        payload: { version: currentVersion, user: currentUser, content: currentStates, message: `[Test] ${currentUser} updated results for ${currentVersion}` }
    };

    if (window.tt && window.tt.miniProgram && window.tt.miniProgram.postMessage) {
        window.tt.miniProgram.postMessage({ data: messagePayload });
        setTimeout(() => {
            if(window.tt.showToast) tt.showToast({ title: '保存指令已发送', icon: 'success', duration: 2000 });
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

function navigate() {
    const newVersion = versionSelector.value;
    const newUser = userSelector.value;
    const newEditMode = editModeToggle.checked;
    
    const params = new URLSearchParams();
    params.set('version', newVersion);
    params.set('user', newUser);
    if (newEditMode) {
        params.set('edit', 'true');
    }
    window.location.search = params.toString();
}

// 7. 事件监听器
userSelector.addEventListener('change', navigate);
versionSelector.addEventListener('change', navigate);
editModeToggle.addEventListener('change', navigate);
saveButton.addEventListener('click', saveStatesToGitHub);

// 8. 启动应用
main();