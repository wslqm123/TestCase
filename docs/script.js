// docs/script.js

// Use window.onload to ensure all external resources (JS libraries, images, etc.) are fully loaded.
window.onload = () => {
    // 1. SETUP: Check for libraries and initialize core components
    const { Markmap, Transformer, Toolbar } = window.markmap;
    
    if (!Markmap || !Transformer || !Toolbar || !window.d3) {
        console.error('Markmap libraries did not load correctly. Check the script tags in your HTML.');
        document.body.innerHTML = '<h1>Error: Markmap or D3 library failed to load. Please check network and script tags.</h1>';
        return;
    }
    
    const transformer = new Transformer();
    const svgEl = document.querySelector('#markmap');
    const markmapInstance = Markmap.create(svgEl, null);
    Toolbar.create(markmapInstance, svgEl);

    // --- DOM Elements ---
    const userSelector = document.getElementById('userSelector');
    const versionSelector = document.getElementById('versionSelector');
    const editModeToggle = document.getElementById('editModeToggle');
    const saveButton = document.getElementById('saveButton');

    // --- State & Constants ---
    const STATUS = { UNTESTED: '⚪️', PASS: '✅', FAIL: '❌', BLOCKED: '🟡' };
    const STATUS_CYCLE = [STATUS.UNTESTED, STATUS.PASS, STATUS.FAIL, STATUS.BLOCKED];
    let currentStates = {};

    // 2. CORE FUNCTIONS
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

            if (!mdResponse.ok) throw new Error(`Cannot load test case file: ${mdResponse.statusText}`);
            let markdownText = await mdResponse.text();
            
            if (!markdownText.trim()) {
                markdownText = "# (Empty)\n- No test cases found for this version.";
            }
            
            currentStates = (stateResponse && stateResponse.ok) ? await stateResponse.json() : {};
            
            const { root, features } = transformer.transform(markdownText);
            
            markmapInstance.setData(root, { ...features });
            await markmapInstance.fit(); // This promise resolves when rendering/animation is complete
            
            // Now that we are sure rendering is done, we can apply interactivity
            applyStatesAndInteractivity();

        } catch (error) {
            console.error("Failed to load or render:", error);
            const { root } = transformer.transform(`# Load Failed\n\n- ${error.message}`);
            markmapInstance.setData(root);
            await markmapInstance.fit();
        }
    }
    
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
            
            // Set the text content with the status emoji
            textElement.text(`${currentStatus} ${originalText}`);

            // Clear any previous click handlers and reset styles
            element.on('click', null).style('cursor', 'default');
            
            // If in edit mode, add the click handler and pointer cursor
            if (isEditMode && currentUser !== 'default') {
                element.style('cursor', 'pointer');
                
                element.on('click', function(event) {
                    event.stopPropagation();
                    
                    const oldStatus = currentStates[caseId] || STATUS.UNTESTED;
                    const currentIndex = STATUS_CYCLE.indexOf(oldStatus);
                    const newStatus = STATUS_CYCLE[(currentIndex + 1) % STATUS_CYCLE.length];
                    
                    currentStates[caseId] = newStatus; // Update state in memory
                    
                    // Update the text on the screen immediately
                    textElement.text(`${newStatus} ${originalText}`);
                });
            }
        });
    }

    function saveStatesToGitHub() {
        const currentUser = userSelector.value;
        const currentVersion = versionSelector.value;

        if (currentUser === 'default') {
            const msg = 'Please select a tester to save progress.';
            (window.tt && window.tt.showToast) ? tt.showToast({ title: msg, icon: 'fail' }) : alert(msg);
            return;
        }

        saveButton.disabled = true;
        saveButton.textContent = 'Saving...';
        
        const messagePayload = {
            action: 'saveData',
            payload: { version: currentVersion, user: currentUser, content: currentStates, message: `[Test] ${currentUser} updated results for ${currentVersion}` }
        };

        if (window.tt && window.tt.miniProgram && window.tt.miniProgram.postMessage) {
            window.tt.miniProgram.postMessage({ data: messagePayload });
            setTimeout(() => {
                if(window.tt.showToast) tt.showToast({ title: 'Save command sent', icon: 'success' });
                saveButton.disabled = false;
                saveButton.textContent = 'Save Changes';
            }, 1500);
        } else {
            console.log("Mocking save call:", messagePayload);
            alert('Save function is only available in the Feishu app. Data printed to console.');
            saveButton.disabled = false;
            saveButton.textContent = 'Save Changes';
        }
    }

    // --- 3. Event Listeners ---
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

    // --- 4. Initial Load ---
    const urlParams = new URLSearchParams(window.location.search);
    const version = urlParams.get('version');
    const user = urlParams.get('user');
    const edit = urlParams.get('edit');
    if (version) versionSelector.value = version;
    if (user) userSelector.value = user;
    if (edit === 'true') editModeToggle.checked = true;
    
    loadDataAndRender();
    
    // --- 5. Expose for Debugging ---
    // This makes the function available in the browser console.
    window.debug = {
        applyStatesAndInteractivity,
        loadDataAndRender,
        getState: () => currentStates,
        getInstance: () => markmapInstance
    };
    console.log("Debug functions available under `window.debug` object.");
};