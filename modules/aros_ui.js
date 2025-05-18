/**
 * Aros Patcher - UI Module
 * Handles UI creation, styling, and interactions
 */

console.log('[aros_ui.js] Script start (top level).');
window.Aros = window.Aros || {};
console.log('[aros_ui.js] Aros namespace ensured (top level). Current Aros keys:', window.Aros ? Object.keys(window.Aros).join(', ') : 'Aros undefined');

console.log('[aros_ui.js] Attempting to define Aros.UI...');
Aros.UI = (function() {
    'use strict';
    console.log('[aros_ui.js] IIFE for Aros.UI executing.');
    
    // --- Private Variables ---
    let stylesInjected = false;
    let pageOverlayElement = null;
    let selectedImageUrls = new Set(); // Keep this if it's still used for image selection logic within UI
    let uiPanel = null; // Main UI panel
    let miniButton = null; // Button to re-open UI
    let progressElement = null;
    let cooldownTimerElement = null;
    let stopButtonElement = null; // Separate stop button for ongoing processes
    let logContainer = null; // Container for logs within the UI
    let isWildcardModeInternal = false; // Internal state for wildcard mode UI
    
    // Variables for drag functionality
    let isDragging = false;
    let offsetX, offsetY;

    // --- Constants (placeholders, to be managed by Aros.Core ideally) ---
    const SCRIPT_NAME = 'Aros Patcher'; // Example
    // const SCRIPT_VERSION = Aros.Core.SCRIPT_VERSION; // This should come from Aros.Core

    // --- Style Injection ---
    function injectOverlayStyles() {
        if (stylesInjected) return;
        Aros.Core.log("Injecting CSS...");
        const css = `
            #aros-ui-panel {
                position: fixed;
                top: 50px;
                left: 50px;
                width: 450px; /* Adjusted width */
                max-height: 90vh; /* Max height to prevent overflow */
                background-color: #2c2c2c;
                border: 1px solid #444;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.2);
                z-index: 10001; /* Above overlay */
                color: #eee;
                font-family: Arial, sans-serif;
                display: flex;
                flex-direction: column;
            }
            #aros-ui-header {
                padding: 10px 15px;
                background-color: #333;
                cursor: move;
                border-bottom: 1px solid #444;
                border-radius: 8px 8px 0 0;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            #aros-ui-header h2 {
                margin: 0;
                font-size: 16px;
                color: #fff;
            }
            #aros-ui-close-button {
                background: none;
                border: none;
                color: #aaa;
                font-size: 20px;
                cursor: pointer;
            }
            #aros-ui-close-button:hover {
                color: #fff;
            }
            #aros-ui-content {
                padding: 15px;
                overflow-y: auto; /* Scrollable content */
                flex-grow: 1;
            }
            .aros-section {
                margin-bottom: 20px;
                padding-bottom: 15px;
                border-bottom: 1px solid #3a3a3a;
            }
            .aros-section:last-child {
                border-bottom: none;
                margin-bottom: 0;
            }
            .aros-section h3 {
                margin-top: 0;
                margin-bottom: 10px;
                font-size: 14px;
                color: #00aaff; /* Accent color */
            }
            .aros-button, .aros-input, .aros-textarea, .aros-select {
                width: calc(100% - 22px); /* Full width with padding */
                padding: 10px;
                margin-bottom: 10px;
                background-color: #3f3f3f;
                border: 1px solid #555;
                border-radius: 4px;
                color: #eee;
                font-size: 13px;
            }
            .aros-textarea {
                min-height: 80px;
                resize: vertical;
            }
            .aros-button {
                background-color: #007bff;
                color: white;
                cursor: pointer;
                transition: background-color 0.3s ease;
            }
            .aros-button:hover {
                background-color: #0056b3;
            }
            .aros-button-secondary {
                background-color: #555;
            }
            .aros-button-secondary:hover {
                background-color: #444;
            }
            .aros-button-danger {
                background-color: #dc3545;
            }
            .aros-button-danger:hover {
                background-color: #c82333;
            }
            .aros-checkbox-label {
                display: flex;
                align-items: center;
                margin-bottom: 10px;
                font-size: 13px;
            }
            .aros-checkbox-label input[type="checkbox"] {
                margin-right: 8px;
            }
            #aros-page-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background-color: rgba(0,0,0,0.7);
                z-index: 10000;
                display: none; /* Hidden by default */
                justify-content: center;
                align-items: center;
                color: white;
                font-size: 20px;
            }
            #aros-page-overlay-content {
                text-align: center;
                padding: 20px;
                background: #2c2c2c;
                border-radius: 8px;
            }
            #aros-mini-button {
                position: fixed;
                bottom: 20px;
                right: 20px;
                width: 50px;
                height: 50px;
                background-color: #007bff;
                color: white;
                border: none;
                border-radius: 50%;
                cursor: pointer;
                box-shadow: 0 2px 5px rgba(0,0,0,0.2);
                z-index: 9999; /* Below overlay but above most content */
                display: none; /* Initially hidden */
                font-size: 24px;
                line-height: 50px;
                text-align: center;
            }
            #aros-mini-button:hover {
                background-color: #0056b3;
            }
            #aros-progress-bar-container {
                width: 100%;
                background-color: #333;
                border-radius: 4px;
                margin-bottom: 10px;
                height: 20px;
                overflow: hidden; /* Ensures inner bar stays contained */
            }
            #aros-progress-bar {
                width: 0%;
                height: 100%;
                background-color: #007bff;
                text-align: center;
                line-height: 20px; /* Vertically center text */
                color: white;
                font-size: 12px;
                transition: width 0.3s ease;
            }
            #aros-cooldown-timer, #aros-selected-count, #aros-persisted-count {
                margin-bottom: 10px;
                font-size: 13px;
            }
            #aros-stop-button {
                /* Styles for stop button if it's part of auxiliary UI */
            }
            .aros-ui-input-group {
                display: flex;
                align-items: center;
                margin-bottom: 10px;
            }
            .aros-ui-input-group label {
                margin-right: 10px;
                min-width: 80px; /* Align input fields */
            }
            .aros-ui-input-group .aros-input {
                flex-grow: 1;
                margin-bottom: 0; /* Remove default margin */
            }
            #aros-log-container {
                background-color: #1e1e1e;
                border: 1px solid #333;
                border-radius: 4px;
                height: 100px;
                overflow-y: auto;
                padding: 8px;
                font-family: monospace;
                font-size: 12px;
                margin-top: 10px;
                color: #ccc;
            }
            #aros-log-container div {
                padding-bottom: 3px;
                border-bottom: 1px solid #2a2a2a;
            }
            #aros-log-container div:last-child {
                border-bottom: none;
            }
        `;
        const styleElement = document.createElement('style');
        styleElement.textContent = css;
        document.head.appendChild(styleElement);
        stylesInjected = true;
        Aros.Core.log("CSS injected.");
    }
    
    // --- UI Creation ---
    function createMainPanel() {
        Aros.Core.log("Creating main UI panel...");
        if (uiPanel) { // If panel already exists, just show it
            uiPanel.style.display = 'flex';
            return;
        }

        injectOverlayStyles();

        uiPanel = document.createElement('div');
        uiPanel.id = 'aros-ui-panel';
        uiPanel.innerHTML = `
            <div id="aros-ui-header">
                <h2>${SCRIPT_NAME} (v${Aros.Core.SCRIPT_VERSION || 'N/A'})</h2>
                <button id="aros-ui-close-button" title="Minimize UI">&times;</button>
            </div>
            <div id="aros-ui-content">
                <!-- Prompt Input Section -->
                <div class="aros-section">
                    <h3>Prompt Input</h3>
                    <button id="aros-toggle-input-mode-button" class="aros-button aros-button-secondary">Switch to Wildcard Mode</button>
                    <div id="aros-normal-input-area">
                        <textarea id="aros-prompt-input" class="aros-textarea" placeholder="Enter prompts, one per line..."></textarea>
                    </div>
                    <div id="aros-wildcard-input-area" style="display:none;">
                        <input type="text" id="aros-wildcard-tag-input" class="aros-input" placeholder="Enter wildcard tag (e.g., __color__)">
                        <textarea id="aros-wildcard-values-input" class="aros-textarea" placeholder="Enter wildcard values, one per line..."></textarea>
                    </div>
                    <div id="aros-selected-count">Selected: 0 images</div>
                </div>

                <!-- Controls Section -->
                <div class="aros-section">
                    <h3>Controls</h3>
                    <button id="aros-start-button" class="aros-button">Start (0 Prompts)</button>
                    <button id="aros-clear-button" class="aros-button aros-button-secondary">Clear Prompts & Selections</button>
                    <div class="aros-ui-input-group">
                        <label for="aros-cooldown-input">Cooldown (ms):</label>
                        <input type="number" id="aros-cooldown-input" class="aros-input" value="${Aros.Core.getCooldownTime ? Aros.Core.getCooldownTime() : 1000}">
                    </div>
                    <label class="aros-checkbox-label">
                        <input type="checkbox" id="aros-loop-checkbox" ${Aros.Core.isLooping ? (Aros.Core.isLooping() ? 'checked' : '') : ''}> Loop Prompts
                    </label>
                </div>
                
                <!-- Image & Download Options -->
                <div class="aros-section">
                    <h3>Image & Download Options</h3>
                     <label class="aros-checkbox-label">
                        <input type="checkbox" id="aros-persist-images-checkbox" ${Aros.Core.shouldPersistImages ? (Aros.Core.shouldPersistImages() ? 'checked' : '') : ''}> Persist Image Selections
                    </label>
                    <div id="aros-persisted-count">Persisted: ${Aros.Core.getPersistedImagesCount ? Aros.Core.getPersistedImagesCount() : 0} images</div>
                    <button id="aros-download-button" class="aros-button aros-button-secondary">Download Selected Images</button>
                    <button id="aros-clear-persisted-button" class="aros-button aros-button-secondary">Clear Persisted Images</button>
                </div>

                <!-- Progress & Status -->
                <div class="aros-section">
                    <h3>Progress & Status</h3>
                    <div id="aros-progress-bar-container">
                        <div id="aros-progress-bar">0%</div>
                    </div>
                    <div id="aros-cooldown-timer">Cooldown: Idle</div>
                    <button id="aros-main-stop-button" class="aros-button aros-button-danger" style="display:none;">Stop Processing</button>
                </div>

                 <!-- Log Display -->
                <div class="aros-section">
                    <h3>Log</h3>
                    <div id="aros-log-container"></div>
                </div>
            </div>
        `;
        document.body.appendChild(uiPanel);

        // Assign elements after creation
        progressElement = document.getElementById('aros-progress-bar');
        cooldownTimerElement = document.getElementById('aros-cooldown-timer');
        // stopButtonElement = document.getElementById('aros-main-stop-button'); // Already assigned here
        logContainer = document.getElementById('aros-log-container');


        // Setup event listeners for the main panel
        setupMainPanelEventListeners();
        makeDraggable(uiPanel, document.getElementById('aros-ui-header'));
        
        // Initial UI updates
        updateStartButtonPromptCount();
        updateSelectedCount();
        updatePersistedImageCountUI();
        toggleCooldownInputState(!(Aros.Core.isRunning ? Aros.Core.isRunning() : false));
        
        Aros.Core.log("Main UI panel created.");
    }
    
    function createAuxiliaryUI() {
        Aros.Core.log("Creating auxiliary UI (mini-button, stop button)...");
        
        // Mini Button (to reopen UI)
        if (!miniButton) {
            miniButton = document.createElement('button');
            miniButton.id = 'aros-mini-button';
            miniButton.innerHTML = 'A'; // Placeholder icon/text
            miniButton.title = 'Open Aros Patcher UI';
            miniButton.style.display = 'none'; // Initially hidden, shown when main panel is closed
            document.body.appendChild(miniButton);
            miniButton.addEventListener('click', handleMiniButtonClick);
        }

        // Global Stop Button (if needed outside main panel, e.g. on overlay)
        // This example assumes stop button is primarily in main panel.
        // If a global stop button is needed on the overlay:
        // if (!stopButtonElement && pageOverlayElement) {
        //     stopButtonElement = document.createElement('button');
        //     stopButtonElement.id = 'aros-overlay-stop-button';
        //     stopButtonElement.className = 'aros-button aros-button-danger';
        //     stopButtonElement.textContent = 'STOP';
        //     // Add to overlay content, setup listener
        // }
        Aros.Core.log("Auxiliary UI created.");
    }

    function makeDraggable(element, handle) {
        handle.onmousedown = function(e) {
            e.preventDefault();
            isDragging = true;
            offsetX = e.clientX - element.offsetLeft;
            offsetY = e.clientY - element.offsetTop;
            
            document.onmousemove = function(e) {
                if (!isDragging) return;
                element.style.left = (e.clientX - offsetX) + 'px';
                element.style.top = (e.clientY - offsetY) + 'px';
            };
            
            document.onmouseup = function() {
                isDragging = false;
                document.onmousemove = null;
                document.onmouseup = null;
            };
        };
    }
    
    // --- Overlay Functions ---
    function createOverlay() {
        if (pageOverlayElement) return;
        injectOverlayStyles(); // Ensure styles are present
        Aros.Core.log("Creating page lock overlay element...");
        pageOverlayElement = document.createElement('div');
        pageOverlayElement.id = 'aros-page-overlay';
        
        const overlayContent = document.createElement('div');
        overlayContent.id = 'aros-page-overlay-content';
        overlayContent.innerHTML = `
            <p>Processing... Please wait.</p>
            <div id="aros-overlay-progress-bar-container" style="width: 200px; background: #555; border-radius: 4px; margin: 10px auto;">
                 <div id="aros-overlay-progress-bar" style="width: 0%; height: 20px; background: #007bff; border-radius: 4px; text-align:center; line-height:20px; color:white;">0%</div>
            </div>
            <button id="aros-overlay-stop-button" class="aros-button aros-button-danger">Stop Processing</button>
        `;
        pageOverlayElement.appendChild(overlayContent);
        document.body.appendChild(pageOverlayElement);

        // Assign stop button from overlay
        const overlayStopButton = document.getElementById('aros-overlay-stop-button');
        if (overlayStopButton) {
            overlayStopButton.addEventListener('click', handleStop);
        }
        Aros.Core.log("Page lock overlay element created.");
    }
    
    function showOverlay(message = "Processing...") {
        if (!pageOverlayElement) createOverlay();
        
        const p = pageOverlayElement.querySelector('p');
        if(p) p.textContent = message;
        
        pageOverlayElement.style.display = 'flex';
        Aros.Core.log("Overlay shown.");
    }
    
    function hideOverlay() {
        if (pageOverlayElement) {
            pageOverlayElement.style.display = 'none';
            Aros.Core.log("Overlay hidden.");
        }
    }
    
    // --- UI Update Functions ---
    function updateImageSelection(imageUrls) { // Expects a Set or Array of URLs
        selectedImageUrls = new Set(imageUrls); // Update internal set
        if (Aros.Core && Aros.Core.setSelectedImageUrls) {
            Aros.Core.setSelectedImageUrls(selectedImageUrls);
        }
        updateSelectedCount();
        Aros.Core.log(`Image selection updated. Count: ${selectedImageUrls.size}`);
        // Add logic to visually indicate selected images on the page if needed
    }
    
    function toggleCooldownInputState(enable) {
        const cooldownInput = document.getElementById('aros-cooldown-input');
        if (cooldownInput) {
            cooldownInput.disabled = !enable;
            Aros.Core.log(`Cooldown input ${enable ? 'enabled' : 'disabled'}.`);
        }
    }
    
    function updateStartButtonPromptCount() {
        const startButton = document.getElementById('aros-start-button');
        if (startButton && Aros.Core && Aros.Core.getPromptQueueSize) {
            const count = Aros.Core.getPromptQueueSize();
            startButton.textContent = `Start (${count} Prompt${count === 1 ? '' : 's'})`;
        }
    }
    
    function updateSelectedCount() {
        const selectedCountEl = document.getElementById('aros-selected-count');
        if (selectedCountEl && Aros.Core && Aros.Core.getSelectedImageUrls) {
            const count = Aros.Core.getSelectedImageUrls().size;
            selectedCountEl.textContent = `Selected: ${count} image${count === 1 ? '' : 's'}`;
        }
    }
    
    function updatePersistedImageCountUI() {
        const persistedCountEl = document.getElementById('aros-persisted-count');
        if (persistedCountEl && Aros.Core && Aros.Core.getPersistedImagesCount) {
            const count = Aros.Core.getPersistedImagesCount();
            persistedCountEl.textContent = `Persisted: ${count} image${count === 1 ? '' : 's'}`;
        }
    }
    
    function updateProgress(current, total) {
        const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
        if (progressElement) {
            progressElement.style.width = percentage + '%';
            progressElement.textContent = percentage + '%';
        }
        // Update overlay progress bar as well
        const overlayProgress = document.getElementById('aros-overlay-progress-bar');
        if (overlayProgress) {
            overlayProgress.style.width = percentage + '%';
            overlayProgress.textContent = percentage + '%';
        }

        if (cooldownTimerElement && Aros.Core && Aros.Core.getCooldownTime) {
            if (Aros.Core.isRunning && Aros.Core.isRunning()) {
                // This part is tricky, as the timer itself runs in Core.
                // We might just display the set cooldown or a generic "Cooling down..." message.
                // For a live timer, Core would need to call an update function here periodically.
                // cooldownTimerElement.textContent = `Cooldown: ${Aros.Core.getCooldownTime()}ms`;
            } else if (total > 0 && current >= total) {
                 cooldownTimerElement.textContent = "Finished.";
            }
        }
    }

    function updateCooldownTimerDisplay(remainingTime) {
        if (cooldownTimerElement) {
            if (remainingTime > 0) {
                cooldownTimerElement.textContent = `Cooldown: ${(remainingTime / 1000).toFixed(1)}s`;
            } else if (Aros.Core.isRunning && Aros.Core.isRunning()) {
                cooldownTimerElement.textContent = "Processing...";
            } else {
                cooldownTimerElement.textContent = "Cooldown: Idle";
            }
        }
    }
    
    function logToUIPanel(message, type = 'info') {
        if (!logContainer) {
            Aros.Core.log("Log container not found in UI for message: " + message, 'warn');
            return;
        }
        const logEntry = document.createElement('div');
        logEntry.textContent = `[${new Date().toLocaleTimeString()}] [${type.toUpperCase()}] ${message}`;
        // Simple coloring based on type
        if (type === 'error') logEntry.style.color = '#ff6b6b';
        else if (type === 'warn') logEntry.style.color = '#ffa500';
        else if (type === 'success') logEntry.style.color = '#50fa7b';

        logContainer.appendChild(logEntry);
        logContainer.scrollTop = logContainer.scrollHeight; // Auto-scroll to bottom
    }

    // --- Event Handlers ---
    function handleStart() {
        Aros.Core.log("UI: Start button clicked.");
        const promptInput = document.getElementById('aros-prompt-input');
        const wildcardTagInput = document.getElementById('aros-wildcard-tag-input');
        const wildcardValuesInput = document.getElementById('aros-wildcard-values-input');
        
        let prompts = [];
        if (isWildcardModeInternal) {
            if (Aros.Prompt && Aros.Prompt.generateWildcardPrompts) {
                prompts = Aros.Prompt.generateWildcardPrompts(
                    wildcardTagInput.value, 
                    wildcardValuesInput.value.split('\n').map(v => v.trim()).filter(v => v)
                );
            } else {
                logToUIPanel("Wildcard prompt generation function not available.", "error");
                Aros.Core.log("Wildcard prompt generation function not available.", "error");
                return;
            }
        } else {
            prompts = promptInput.value.split('\n').map(p => p.trim()).filter(p => p);
        }

        if (prompts.length === 0) {
            logToUIPanel("No prompts entered.", "warn");
            Aros.Core.log("No prompts to start.", "warn");
            return;
        }

        if (Aros.Core && Aros.Core.startProcessing) {
            Aros.Core.startProcessing(prompts);
            toggleCooldownInputState(false); // Disable cooldown input during run
            const stopBtn = document.getElementById('aros-main-stop-button');
            if(stopBtn) stopBtn.style.display = 'block';
        } else {
            logToUIPanel("Core startProcessing function not available.", "error");
            Aros.Core.log("Core startProcessing function not available.", "error");
        }
    }
    
    function handleClear() {
        Aros.Core.log("UI: Clear button clicked.");
        const promptInput = document.getElementById('aros-prompt-input');
        const wildcardTagInput = document.getElementById('aros-wildcard-tag-input');
        const wildcardValuesInput = document.getElementById('aros-wildcard-values-input');

        if (promptInput) promptInput.value = '';
        if (wildcardTagInput) wildcardTagInput.value = '';
        if (wildcardValuesInput) wildcardValuesInput.value = '';
        
        if (Aros.Core && Aros.Core.clearPromptQueue) Aros.Core.clearPromptQueue();
        if (Aros.Core && Aros.Core.clearSelectedImages) Aros.Core.clearSelectedImages(); // Assumes Core has this
        updateStartButtonPromptCount();
        updateSelectedCount();
        logToUIPanel("Prompts and selections cleared.");
    }
    
    function handleClose() { // This now minimizes the UI
        Aros.Core.log("UI: Close/Minimize button clicked.");
        if (uiPanel) uiPanel.style.display = 'none';
        if (miniButton) miniButton.style.display = 'block'; // Show mini button
    }
    
    function handleMiniButtonClick() {
        Aros.Core.log("UI: Mini button clicked.");
        if (uiPanel) uiPanel.style.display = 'flex'; // Show main panel
        if (miniButton) miniButton.style.display = 'none'; // Hide mini button
    }
    
    function handleStop() {
        Aros.Core.log("UI: Stop button clicked.");
        if (Aros.Core && Aros.Core.stopProcessing) {
            Aros.Core.stopProcessing();
            toggleCooldownInputState(true); // Re-enable cooldown input
            const stopBtn = document.getElementById('aros-main-stop-button');
            if(stopBtn) stopBtn.style.display = 'none';
            const overlayStopBtn = document.getElementById('aros-overlay-stop-button'); //
            if(overlayStopBtn && pageOverlayElement && pageOverlayElement.style.display === 'flex'){
                 // If overlay is visible, its stop button was clicked, so hide overlay too
                 hideOverlay();
            }
            logToUIPanel("Processing stopped by user.");
        }
    }
    
    function handleLoopToggle(event) {
        Aros.Core.log(`UI: Loop toggle changed to ${event.target.checked}`);
        if (Aros.Core && Aros.Core.setLooping) {
            Aros.Core.setLooping(event.target.checked);
        }
    }
    
    function handlePersistImagesToggle(event) {
        Aros.Core.log(`UI: Persist images toggle changed to ${event.target.checked}`);
        if (Aros.Core && Aros.Core.setPersistImages) {
            Aros.Core.setPersistImages(event.target.checked);
        }
    }

    function handleDownload() {
        Aros.Core.log("UI: Download button clicked.");
        if (Aros.Image && Aros.Image.handleDownload) {
            Aros.Image.handleDownload();
        } else {
            logToUIPanel("Image download function not available.", "error");
            Aros.Core.log("Image download function (Aros.Image.handleDownload) not available.", "error");
        }
    }

    function handleClearPersisted() {
        Aros.Core.log("UI: Clear persisted images clicked.");
        if (Aros.Core && Aros.Core.clearPersistedImages) {
            Aros.Core.clearPersistedImages();
            updatePersistedImageCountUI();
            logToUIPanel("Persisted images cleared.");
        }
    }
    
    function toggleInputMode() {
        isWildcardModeInternal = !isWildcardModeInternal;
        Aros.Core.log(`UI: Toggled input mode. Wildcard active: ${isWildcardModeInternal}`);
        const normalInputArea = document.getElementById('aros-normal-input-area');
        const wildcardInputArea = document.getElementById('aros-wildcard-input-area');
        const toggleButton = document.getElementById('aros-toggle-input-mode-button');

        if (isWildcardModeInternal) {
            if (normalInputArea) normalInputArea.style.display = 'none';
            if (wildcardInputArea) wildcardInputArea.style.display = 'block';
            if (toggleButton) toggleButton.textContent = 'Switch to Normal Mode';
        } else {
            if (normalInputArea) normalInputArea.style.display = 'block';
            if (wildcardInputArea) wildcardInputArea.style.display = 'none';
            if (toggleButton) toggleButton.textContent = 'Switch to Wildcard Mode';
        }
        // If Aros.Core needs to know about this mode for other reasons:
        if (Aros.Core && Aros.Core.setWildcardMode) {
             Aros.Core.setWildcardMode(isWildcardModeInternal);
        }
    }
    
    function setupMainPanelEventListeners() {
        Aros.Core.log("Setting up Main Panel event listeners...");
        document.getElementById('aros-ui-close-button')?.addEventListener('click', handleClose);
        document.getElementById('aros-start-button')?.addEventListener('click', handleStart);
        document.getElementById('aros-clear-button')?.addEventListener('click', handleClear);
        document.getElementById('aros-main-stop-button')?.addEventListener('click', handleStop);
        
        document.getElementById('aros-loop-checkbox')?.addEventListener('change', handleLoopToggle);
        document.getElementById('aros-persist-images-checkbox')?.addEventListener('change', handlePersistImagesToggle);
        document.getElementById('aros-download-button')?.addEventListener('click', handleDownload);
        document.getElementById('aros-clear-persisted-button')?.addEventListener('click', handleClearPersisted);


        document.getElementById('aros-toggle-input-mode-button')?.addEventListener('click', toggleInputMode);

        const cooldownInput = document.getElementById('aros-cooldown-input');
        if (cooldownInput) {
            cooldownInput.addEventListener('change', (event) => {
                if (Aros.Core && Aros.Core.setCooldownTime) {
                    const newTime = parseInt(event.target.value, 10);
                    if (!isNaN(newTime) && newTime >= 0) {
                        Aros.Core.setCooldownTime(newTime);
                        Aros.Core.log(`UI: Cooldown time changed to ${newTime}ms`);
                        logToUIPanel(`Cooldown set to ${newTime}ms`);
                    } else {
                        event.target.value = Aros.Core.getCooldownTime(); // Revert to old value
                        logToUIPanel("Invalid cooldown value entered.", "warn");
                    }
                }
            });
        }
        Aros.Core.log("Main Panel event listeners set up.");
    }
    
    // --- Module Initialization ---
    function init() {
        // Aros.Core.log should be available if Core init runs first
        const logFn = (Aros.Core && Aros.Core.log) ? Aros.Core.log : console.log;
        const errorFn = (Aros.Core && Aros.Core.error) ? Aros.Core.error : console.error;

        logFn("Initializing Aros.UI Module...");
        
        // Ensure DOM is ready
        if (document.readyState === 'complete' || document.readyState === 'interactive') {
            createMainPanel(); // Creates panel, injects styles, sets up listeners
            createAuxiliaryUI(); // Creates mini-button etc.
            logFn("Aros.UI: Main panel and auxiliary UI creation attempted.");
        } else {
            document.addEventListener('DOMContentLoaded', () => {
                logFn("Aros.UI: DOMContentLoaded, creating UI...");
                createMainPanel();
                createAuxiliaryUI();
                logFn("Aros.UI: Main panel and auxiliary UI creation attempted post DOMContentLoaded.");
            });
        }
        
        // Register this UI logger with Core if possible
        if (Aros.Core && Aros.Core.registerModuleLogger) {
            Aros.Core.registerModuleLogger('UI', logToUIPanel);
            logFn("Aros.UI: Registered logToUIPanel with Aros.Core.");
        } else {
            logFn("Aros.UI: Aros.Core.registerModuleLogger not available. UI logs will be local.", "warn");
        }

        logFn("Aros.UI Module Initialized.");
    }
    
    // --- Public API ---
    console.log('[aros_ui.js] IIFE for Aros.UI executed, returning object.');
    return {
        createUI: createMainPanel, // createMainPanel is the primary UI setup
        showOverlay,
        hideOverlay,
        updateImageSelection,
        toggleCooldownInputState,
        updateStartButtonPromptCount,
        updateSelectedCount,
        updatePersistedImageCountUI,
        updateProgress,
        updateCooldownTimerDisplay, // New method for Core to call
        // Event handlers are mostly internal, called by UI elements.
        // Expose specific handlers if they need to be triggered externally.
        // handleStart, 
        // handleClear,
        // handleClose, // This is now minimize
        // handleStop, 
        // handleLoopToggle, 
        // handlePersistImagesToggle,
        // toggleInputMode, // Renamed from toggleWildcardMode
        logToUIPanel, // Expose for external logging to UI
        init
    };
})();
console.log('[aros_ui.js] Script end (top level). Aros.UI type:', typeof Aros.UI, '; Aros.UI defined:', Aros.UI ? 'Yes' : 'No');
if (window.Aros && Aros.UI) {
    console.log('[aros_ui.js] Aros.UI defined. Keys:', Object.keys(Aros.UI).join(', '));
} else {
    console.error('[aros_ui.js] Aros.UI is NOT defined after execution.');
} 