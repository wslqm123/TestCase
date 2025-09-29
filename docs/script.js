document.addEventListener('DOMContentLoaded', () => {
    // 1. 全局变量和初始化
    const { Transformer, Markmap } = window.markmap;

    // Create instances of the Transformer and Markmap
    const transformer = new Transformer();
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
    let currentStates = {}; // 存储当前加载的测试结果 { caseId: status }

    // 2. 核心函数
    /**
     * 根据当前选择的版本和用户加载和渲染所有数据
     */
    async function loadAndRender() {
        try {
            // 从 GitHub Pages 加载合并后的 Markdown 文件
            const response = await fetch(`cases/${currentVersion}/_index.md?cache_bust=${new Date().getTime()}`);
            if (!response.ok) throw new Error(`Could not find test cases for version ${currentVersion}. Check if the file exists.`);
            
            const markdownText = await response.text();
            const { root } = transformer.transform(markdownText);
            
            markmapInstance.setData(root);
            await markmapInstance.fit(); // 调整视图以适应内容

            // 加载对应用户的测试结果
            await loadUserStates();
            
            // 将测试结果应用到UI上
            applyStatesToUI();

        } catch (error) {
            console.error("Load failed:", error);
            const { root } = transformer.transform(`# Loading Failed\n\n- ${error.message}`);
            markmapInstance.setData(root);
            await markmapInstance.fit();
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
            const response = await fetch(`results/${currentVersion}/${currentUser}.json?cache_bust=${new Date().getTime()}`);
            if (response.ok) {
                currentStates = await response.json();
            } else {
                currentStates = {}; // 如果文件不存在或加载失败，则重置
            }
        } catch (error) {
            console.warn(`Could not load state for ${currentUser}:`, error);
            currentStates = {};
        }
    }

    /**
     * 将 currentStates 中的状态更新到思维导图的UI上
     */
    function applyStatesToUI() {
        const isEditMode = editModeToggle.checked;
        const d3 = window.d3; // Access d3 from the global scope

        markmapInstance.svg.selectAll('g.markmap-node').each(function(node) {
            const element = d3.select(this);
            const textElement = element.select('text');
            const originalText = node.data.content;

            const match = originalText.match(/\[([A-Z0-9-]+)\]/);
            if (!match) return; // 如果节点没有ID，则不处理

            const caseId = match[1];
            const currentStatus = currentStates[caseId] || STATUS.UNTESTED;

            // 更新文本显示
            textElement.text(`${currentStatus} ${originalText}`);

            // 根据是否在编辑模式，绑定或解绑点击事件
            if (isEditMode && currentUser !== 'default') {
                element.classed('editable', true);
                element.on('click', (event) => {
                    event.stopPropagation();
                    const oldStatus = currentStates[caseId] || STATUS.UNTESTED;
                    const currentIndex = STATUS_CYCLE.indexOf(oldStatus);
                    const newStatus = STATUS_CYCLE[(currentIndex + 1) % STATUS_CYCLE.length];
                    currentStates[caseId] = newStatus; // 更新内存中的状态
                    textElement.text(`${newStatus} ${originalText}`); // 立即更新UI
                });
            } else {
                element.classed('editable', false);
                element.on('click', null);
            }
        });
    }

    /**
     * 将当前状态发送给飞书小程序进行保存
     */
    function saveStatesToGitHub() {
        if (currentUser === 'default') {
            if (window.tt) {
                tt.showToast({ title: '请先选择一个测试员', icon: 'fail' });
            } else {
                alert('请先选择一个测试员');
            }
            return;
        }

        saveButton.disabled = true;
        saveButton.textContent = '保存中...';
        
        const messagePayload = {
            action: 'saveData',
            payload: {
                version: currentVersion,
                user: currentUser,
                content: currentStates,
                message: `[Test] ${currentUser} updated results for ${currentVersion}`
            }
        };

        // 通过飞书JSSDK的postMessage与小程序通信
        if (window.tt && window.tt.miniProgram && window.tt.miniProgram.postMessage) {
            window.tt.miniProgram.postMessage({ data: messagePayload });
            
            // 简单模拟成功提示
            setTimeout(() => {
                tt.showToast({ title: '保存指令已发送', icon: 'success' });
                saveButton.disabled = false;
                saveButton.textContent = '保存更改';
            }, 1500);
        } else {
            console.log("Not in Feishu Mini Program environment. Mocking save call.");
            console.log("Data to be sent:", messagePayload);
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
    loadAndRender();
});