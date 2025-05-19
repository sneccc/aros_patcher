// ==UserScript==
// @name         🧠 Aros Patcher (Modular)
// @namespace    http://tampermonkey.net/
// @version      6.0
// @description  Enhanced Aros video generation tool with prompt queueing and image management (Modular)
// @author       ArosPatcher
// @match        *://sora.com/*
// @match        *://www.sora.com/*
// @match        *://www.sora.*.com/*
// @match        *://sora.*.com/*
// @match        https://sora.chatgpt.com/*
// @grant        none
// @require      https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js
// @require      https://raw.githubusercontent.com/snecc/aros_patcher/refs/heads/main/wildcards.js
// @require      https://raw.githubusercontent.com/snecc/aros_patcher/refs/heads/main/src/constants.js
// @require      https://raw.githubusercontent.com/snecc/aros_patcher/refs/heads/main/src/utils.js
// @require      https://raw.githubusercontent.com/snecc/aros_patcher/refs/heads/main/src/dom_utils.js
// @require      https://raw.githubusercontent.com/snecc/aros_patcher/refs/heads/main/src/ui.js
// @require      https://raw.githubusercontent.com/snecc/aros_patcher/refs/heads/main/src/image_processing.js
// @require      https://raw.githubusercontent.com/snecc/aros_patcher/refs/heads/main/src/image_management.js
// @require      https://raw.githubusercontent.com/snecc/aros_patcher/refs/heads/main/src/image_persistence.js
// @require      https://raw.githubusercontent.com/snecc/aros_patcher/refs/heads/main/src/sora_interaction.js
// @require      https://raw.githubusercontent.com/snecc/aros_patcher/refs/heads/main/src/observers.js
// @require      https://raw.githubusercontent.com/snecc/aros_patcher/refs/heads/main/src/find_similar.js
// @require      https://raw.githubusercontent.com/snecc/aros_patcher/refs/heads/main/src/wildcard_integration.js
// @require      https://raw.githubusercontent.com/snecc/aros_patcher/refs/heads/main/src/core_logic.js
// ==/UserScript==

(function () {
    'use strict';

    // --- Global State Variables ---
    let promptQueue = [];
    let originalPromptList = [];
    let totalPromptCount = 0;
    let totalPromptsSentLoop = 0;
    let isRunning = false;
    let isLooping = false;
    let isGenerating = false;
    let cooldownTime = 130; // Default manual cooldown, used by ui.js for initial display
    let autoSubmitTimeoutId = null;
    let generationTimeoutId = null;
    let manualTimerTimeoutId = null;
    let visualCountdownInterval = null;
    let selectedImageUrls = new Set();
    let isDownloading = false;
    let downloadErrors = 0;
    let isFindSimilarModeActive = false;
    
    // Observer-related state flags (used by observers.js, managed here or in core_logic.js)
    let _generationIndicatorRemoved = false;
    let _newImagesAppeared = false;

    // Wildcard feature state
    let isWildcardMode = false; // Used by ui.js for initial placeholder
    let wildcardTemplate = "";
    let generatedPromptCount = 10; // Used by ui.js for initial display

    // Image Persistence state
    let persistedImages = [];
    let isImagePersistenceEnabled = false;
    let currentPersistentImageIndex = 0;
    let isPastingSequence = false;
    let sequentialPasteTimeoutId = null;

    // --- Button Handler Functions ---
    function handleLoopToggle(event) {
        log(`Loop checkbox toggled to: ${event.target.checked}.`);
        isLooping = event.target.checked; // Update global state
        updateStartButtonPromptCount(); // from ui.js
    }

    function handlePersistImagesToggle(event) {
        isImagePersistenceEnabled = event.target.checked;
        log(`Image persistence toggled to: ${isImagePersistenceEnabled}`);
        updatePersistedImageCountUI(); // from ui.js
    }

    function handleStart() {
        log("Start button clicked.");
        currentPersistentImageIndex = 0;

        const input = document.getElementById('sora-input').value;
        const prompts = input.split(PROMPT_DELIMITER).map(x => x.trim()).filter(Boolean);
        const isAuto = document.getElementById('sora-auto-submit-checkbox')?.checked ?? false;
        // isLooping is already set by its handler

        totalPromptsSentLoop = 0;
        let currentCooldown = cooldownTime; // Use the global cooldownTime

        if (prompts.length === 0) {
            return alert(`❗ Please enter at least 1 prompt. Use ${PROMPT_DELIMITER} to separate.`);
        }
        if (isRunning) return;

        if (!isAuto) {
            const cooldownInputVal = parseInt(document.getElementById('sora-cooldown-time').value);
            currentCooldown = isNaN(cooldownInputVal) ? cooldownTime : Math.max(1, cooldownInputVal);
            cooldownTime = currentCooldown; // Update global cooldownTime if changed
        }

        log(`Starting process with ${prompts.length} prompts. Mode: ${isAuto ? 'Auto' : 'Manual'}. Loop: ${isLooping}.`);
        promptQueue = [...prompts];
        if (isLooping) {
            originalPromptList = [...prompts];
        } else {
            originalPromptList = [];
        }
        totalPromptCount = prompts.length;
        isRunning = true;
        isGenerating = false;

        showOverlay(); // from ui.js

        const mainUI = document.getElementById('sora-auto-ui');
        if (mainUI) {
            mainUI.style.opacity = '0';
            mainUI.style.transform = 'scale(0.95)';
            setTimeout(() => { mainUI.style.display = 'none'; }, 300);
        }
        const miniBtn = document.getElementById('sora-minibtn');
        if (miniBtn) miniBtn.style.display = 'none';

        const auxContainer = document.getElementById('sora-aux-controls-container');
        const progressEl = document.getElementById('sora-progress');
        const cooldownEl = document.getElementById('sora-cooldown');
        const stopBtnUI = document.getElementById('sora-stop-button'); // Renamed to avoid conflict
        if (auxContainer) auxContainer.style.display = 'flex';
        if (progressEl) progressEl.style.display = 'inline-block';
        if (cooldownEl) cooldownEl.style.display = isAuto ? 'none' : 'inline-block';
        if (stopBtnUI) stopBtnUI.style.display = 'inline-block';
        
        updateProgress(); // from core_logic.js

        if (isAuto) {
            startAutoLoop(); // from core_logic.js
        } else {
            startManualTimerLoop(currentCooldown); // from core_logic.js
        }
    }

    function handleClear() {
        log("Clear button clicked.");
        document.getElementById('sora-input').value = '';
        updateStartButtonPromptCount(); // from ui.js
        
        stopSequentialPaste(); // from image_persistence.js

        persistedImages = [];
        currentPersistentImageIndex = 0;
        updatePersistedImageCountUI(); // from ui.js
        log("Persisted images cleared.");
    }

    function handleClose() {
        log("Close button clicked.");
        const wrapper = document.getElementById('sora-auto-ui');
        if (!wrapper) return;
        wrapper.style.opacity = '0';
        wrapper.style.transform = 'scale(0.95)';
        setTimeout(() => {
            wrapper.style.display = 'none';
            if (!isRunning) {
                const miniBtn = document.getElementById('sora-minibtn');
                if (miniBtn) miniBtn.style.display = 'block';
            }
        }, 300);
    }

    function handleMiniButtonClick() {
        log("Mini button clicked.");
        if (!isRunning) {
            const wrapper = document.getElementById('sora-auto-ui');
            const miniBtn = document.getElementById('sora-minibtn');
            if (wrapper) {
                wrapper.style.display = 'block';
                void wrapper.offsetWidth;
                wrapper.style.opacity = '1';
                wrapper.style.transform = 'scale(1)';
            }
            if (miniBtn) miniBtn.style.display = 'none';
            const auxContainer = document.getElementById('sora-aux-controls-container');
            if (auxContainer) auxContainer.style.display = 'none';
            hideOverlay(); // from ui.js
        }
    }

    function handleStop() {
        log("Stop button clicked.");
        currentPersistentImageIndex = 0;
        if (!isRunning) return;

        isRunning = false;
        isGenerating = false;
        isLooping = false;
        _generationIndicatorRemoved = false;
        _newImagesAppeared = false;
        
        stopSequentialPaste(); // from image_persistence.js

        completionObserver?.disconnect(); // completionObserver from observers.js (global scope)

        if (autoSubmitTimeoutId) { clearTimeout(autoSubmitTimeoutId); autoSubmitTimeoutId = null; }
        if (generationTimeoutId) { clearTimeout(generationTimeoutId); generationTimeoutId = null; }
        if (manualTimerTimeoutId) { clearTimeout(manualTimerTimeoutId); manualTimerTimeoutId = null; }
        if (visualCountdownInterval) { clearInterval(visualCountdownInterval); visualCountdownInterval = null; }

        hideOverlay(); // from ui.js
        const cooldownBtn = document.getElementById('sora-cooldown');
        if (cooldownBtn) {
            cooldownBtn.textContent = '⏱ Cooldown: --s';
            cooldownBtn.style.display = 'none';
        }
        
        updateProgress(); // from core_logic.js - will update text to "Stopped"

        if (promptQueue.length > 0) {
            saveRemainingPromptsToFile(); // from core_logic.js
        }
        promptQueue = [];
        originalPromptList = [];
        totalPromptCount = 0;
        totalPromptsSentLoop = 0;

        setTimeout(() => {
            if (!isRunning) {
                const auxContainer = document.getElementById('sora-aux-controls-container');
                if (auxContainer) auxContainer.style.display = 'none';
                const miniBtn = document.getElementById('sora-minibtn');
                const mainUI = document.getElementById('sora-auto-ui');
                if (miniBtn && (!mainUI || mainUI.style.display === 'none')) {
                    miniBtn.style.display = 'block';
                }
                updateStartButtonPromptCount(); // from ui.js
            }
        }, 4000); // Delay matches original logic for progress message visibility
    }

    // --- Initialization ---
    function waitForElement(selector, callback, timeout = 20000) {
        log(`Waiting for element: "${selector}" (timeout: ${timeout/1000}s)`);
        let checkCount = 0;
        const intervalTime = 500;
        const maxChecks = timeout / intervalTime;
        const interval = setInterval(() => {
            checkCount++;
            const el = document.querySelector(selector);
            if (el) {
                clearInterval(interval);
                log(`Element found: "${selector}". Initializing script...`);
                try {
                    callback(el);
                } catch (e) {
                    log("FATAL ERROR during initialization callback:"); console.error(e);
                    alert("Fatal error during Aros Patcher script initialization. Check Console.");
                }
            } else if (checkCount >= maxChecks) {
                clearInterval(interval);
                log(`ERROR: Element "${selector}" not found. Script cannot initialize UI.`);
                alert(`Aros Patcher: Important element "${selector}" not found.`);
            }
        }, intervalTime);
    }

    log("Aros Patcher (Modular) script starting...");
    if (typeof JSZip === 'undefined') {
        log("FATAL ERROR: JSZip library not loaded.");
        alert("Critical Error: JSZip library not loaded for Aros Patcher.");
        return;
    }
    if (typeof wildcardUtils === 'undefined') {
        // This check might be too early if wildcards.js is loaded via @require and hasn't executed yet.
        // However, functions from it are called later.
        log("INFO: wildcardUtils might not be loaded yet, will be checked upon use.");
    }


    waitForElement('main, div[role="dialog"]', (commonElement) => {
        try {
            log("Core element found. Initializing Aros Patcher modules...");

            // Initial DOM modifications
            removeNativeCheckboxes(); // from dom_utils.js
            removeNativeSelectionIndicators(); // from dom_utils.js

            // Create UI
            // Globals like cooldownTime, generatedPromptCount, isWildcardMode are used by createUI
            createUI(); // from ui.js (also creates auxiliary UI and overlay placeholder via createAuxiliaryUI)
            hideOverlay(); // from ui.js - ensure it's hidden initially
            
            // Attach Event Listeners to UI elements
            document.getElementById('sora-start').addEventListener('click', handleStart);
            document.getElementById('sora-clear').addEventListener('click', handleClear);
            document.getElementById('sora-close').addEventListener('click', handleClose);
            document.getElementById('sora-download-images').addEventListener('click', handleDownload); // from image_management.js
            document.getElementById('sora-find-similar-button').addEventListener('click', toggleFindSimilarMode); // from find_similar.js
            
            document.getElementById('sora-select-horizontal').addEventListener('change', updateImageSelection); // from ui.js
            document.getElementById('sora-select-vertical').addEventListener('change', updateImageSelection);   // from ui.js
            document.getElementById('sora-select-square').addEventListener('change', updateImageSelection);     // from ui.js
            
            document.getElementById('sora-auto-submit-checkbox').addEventListener('input', toggleCooldownInputState); // from ui.js
            document.getElementById('sora-loop-checkbox').addEventListener('change', handleLoopToggle);
            document.getElementById('sora-input').addEventListener('input', updateStartButtonPromptCount); // from ui.js

            // Wildcard UI listeners
            document.getElementById('sora-mode-normal').addEventListener('click', () => toggleInputMode(false)); // from ui.js
            document.getElementById('sora-mode-wildcard').addEventListener('click', () => toggleInputMode(true)); // from ui.js
            document.getElementById('sora-generate-prompts').addEventListener('click', handleGeneratePrompts); // from wildcard_integration.js
            document.getElementById('sora-load-example').addEventListener('click', handleLoadExample);       // from wildcard_integration.js

            // Image Persistence UI listeners
            document.getElementById('sora-persist-images-checkbox').addEventListener('change', handlePersistImagesToggle);
            document.getElementById('sora-paste-all-images').addEventListener('click', handlePasteAllImages); // from image_persistence.js
            
            // Attach listener for simulated image paste to script's textarea
            const scriptInputTextarea = document.getElementById('sora-input');
            if (scriptInputTextarea) {
                scriptInputTextarea.addEventListener('paste', handleSimulatedImagePaste); // from image_persistence.js
            }
            
            // Aux UI listeners
            document.getElementById('sora-stop-button').onclick = handleStop;
            document.getElementById('sora-minibtn').onclick = handleMiniButtonClick;

            makeUIDraggable(); // from ui.js - make the panel draggable

            // Initial state updates
            toggleCooldownInputState(); // from ui.js
            updateStartButtonPromptCount(); // from ui.js
            updatePersistedImageCountUI(); // from ui.js
            
            log("Performing initial image scan...");
            document.querySelectorAll('div[data-index] a > img, div[style*="top:"][style*="left:"] img, .group\\/tile img').forEach(img => {
                insertCheckbox(img); // from image_management.js
            });
            updateSelectedCount(); // from ui.js

            // Initialize and Start Observers
            initializeImageObserver();    // from observers.js
            initializeCompletionObserver(); // from observers.js

            const observerTarget = document.querySelector('[data-testid="virtuoso-scroller"] > div, main div[class*="grid"], div[role="dialog"] div.flex.h-full.flex-col') ?? document.body;
            if (imageObserver && observerTarget) {
                imageObserver.observe(observerTarget, { childList: true, subtree: true });
                log(`Image Observer started on ${observerTarget.tagName}.`);
            } else {
                log("WARNING: Could not find specific image grid container for ImageObserver.");
            }
            if(completionObserver) {
                 log("Completion Observer initialized (for Auto Mode).");
            }


            // Global click listener for "Find Similar"
            document.addEventListener('click', handleDocumentClickForSimilar, true); // from find_similar.js

            log("Aros Patcher (Modular) initialization complete.");

        } catch (e) {
            log("FATAL ERROR during Aros Patcher (Modular) main initialization:");
            console.error(e);
            alert("A critical error occurred during Aros Patcher initialization. Check Console (F12).");
        }
    });

})(); 