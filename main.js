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

    window.Aros = window.Aros || {};
    Aros.Utils = Aros.Utils || {}; // Assume utils.js will populate this
    Aros.Constants = Aros.Constants || {}; // Assume constants.js will populate this
    Aros.UI = Aros.UI || {};
    Aros.CoreLogic = Aros.CoreLogic || {};
    Aros.ImagePersistence = Aros.ImagePersistence || {};
    Aros.DOMUtils = Aros.DOMUtils || {};
    Aros.ImageManagement = Aros.ImageManagement || {};
    Aros.FindSimilar = Aros.FindSimilar || {};
    Aros.WildcardIntegration = Aros.WildcardIntegration || {};
    Aros.Observers = Aros.Observers || {};
    Aros.WildcardUtils = Aros.WildcardUtils || {};


    // --- Global State Variables ---
    Aros.state = {
        promptQueue: [],
        originalPromptList: [],
        totalPromptCount: 0,
        totalPromptsSentLoop: 0,
        isRunning: false,
        isLooping: false,
        isGenerating: false,
        cooldownTime: 130, // Default manual cooldown, used by ui.js for initial display
        autoSubmitTimeoutId: null,
        generationTimeoutId: null,
        manualTimerTimeoutId: null,
        visualCountdownInterval: null,
        selectedImageUrls: new Set(),
        isDownloading: false,
        downloadErrors: 0,
        isFindSimilarModeActive: false,
        _generationIndicatorRemoved: false,
        _newImagesAppeared: false,
        isWildcardMode: false, // Used by ui.js for initial placeholder
        wildcardTemplate: "",
        generatedPromptCount: 10, // Used by ui.js for initial display
        persistedImages: [],
        isImagePersistenceEnabled: false,
        currentPersistentImageIndex: 0,
        isPastingSequence: false,
        sequentialPasteTimeoutId: null
    };

    Aros.methods = {};

    // --- Button Handler Functions ---
    Aros.methods.handleLoopToggle = function (event) {
        Aros.Utils.log(`Loop checkbox toggled to: ${event.target.checked}.`);
        Aros.state.isLooping = event.target.checked; // Update global state
        Aros.UI.updateStartButtonPromptCount();
    }

    Aros.methods.handlePersistImagesToggle = function (event) {
        Aros.state.isImagePersistenceEnabled = event.target.checked;
        Aros.Utils.log(`Image persistence toggled to: ${Aros.state.isImagePersistenceEnabled}`);
        Aros.UI.updatePersistedImageCountUI();
    }

    Aros.methods.handleStart = function () {
        Aros.Utils.log("Start button clicked.");
        Aros.state.currentPersistentImageIndex = 0;

        const input = document.getElementById('sora-input').value;
        const prompts = input.split(Aros.Constants.PROMPT_DELIMITER).map(x => x.trim()).filter(Boolean);
        const isAuto = document.getElementById('sora-auto-submit-checkbox')?.checked ?? false;
        // Aros.state.isLooping is already set by its handler

        Aros.state.totalPromptsSentLoop = 0;
        let currentCooldown = Aros.state.cooldownTime;

        if (prompts.length === 0) {
            return alert(`❗ Please enter at least 1 prompt. Use ${Aros.Constants.PROMPT_DELIMITER} to separate.`);
        }
        if (Aros.state.isRunning) return;

        if (!isAuto) {
            const cooldownInputVal = parseInt(document.getElementById('sora-cooldown-time').value);
            currentCooldown = isNaN(cooldownInputVal) ? Aros.state.cooldownTime : Math.max(1, cooldownInputVal);
            Aros.state.cooldownTime = currentCooldown;
        }

        Aros.Utils.log(`Starting process with ${prompts.length} prompts. Mode: ${isAuto ? 'Auto' : 'Manual'}. Loop: ${Aros.state.isLooping}.`);
        Aros.state.promptQueue = [...prompts];
        if (Aros.state.isLooping) {
            Aros.state.originalPromptList = [...prompts];
        } else {
            Aros.state.originalPromptList = [];
        }
        Aros.state.totalPromptCount = prompts.length;
        Aros.state.isRunning = true;
        Aros.state.isGenerating = false;

        Aros.UI.showOverlay();

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
        const stopBtnUI = document.getElementById('sora-stop-button');
        if (auxContainer) auxContainer.style.display = 'flex';
        if (progressEl) progressEl.style.display = 'inline-block';
        if (cooldownEl) cooldownEl.style.display = isAuto ? 'none' : 'inline-block';
        if (stopBtnUI) stopBtnUI.style.display = 'inline-block';
        
        Aros.CoreLogic.updateProgress();

        if (isAuto) {
            Aros.CoreLogic.startAutoLoop();
        } else {
            Aros.CoreLogic.startManualTimerLoop(currentCooldown);
        }
    }

    Aros.methods.handleClear = function () {
        Aros.Utils.log("Clear button clicked.");
        document.getElementById('sora-input').value = '';
        Aros.UI.updateStartButtonPromptCount();
        
        Aros.ImagePersistence.stopSequentialPaste();

        Aros.state.persistedImages = [];
        Aros.state.currentPersistentImageIndex = 0;
        Aros.UI.updatePersistedImageCountUI();
        Aros.Utils.log("Persisted images cleared.");
    }

    Aros.methods.handleClose = function () {
        Aros.Utils.log("Close button clicked.");
        const wrapper = document.getElementById('sora-auto-ui');
        if (!wrapper) return;
        wrapper.style.opacity = '0';
        wrapper.style.transform = 'scale(0.95)';
        setTimeout(() => {
            wrapper.style.display = 'none';
            if (!Aros.state.isRunning) {
                const miniBtn = document.getElementById('sora-minibtn');
                if (miniBtn) miniBtn.style.display = 'block';
            }
        }, 300);
    }

    Aros.methods.handleMiniButtonClick = function () {
        Aros.Utils.log("Mini button clicked.");
        if (!Aros.state.isRunning) {
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
            Aros.UI.hideOverlay();
        }
    }

    Aros.methods.handleStop = function () {
        Aros.Utils.log("Stop button clicked.");
        Aros.state.currentPersistentImageIndex = 0;
        if (!Aros.state.isRunning) return;

        Aros.state.isRunning = false;
        Aros.state.isGenerating = false;
        Aros.state.isLooping = false;
        Aros.state._generationIndicatorRemoved = false;
        Aros.state._newImagesAppeared = false;
        
        Aros.ImagePersistence.stopSequentialPaste();

        Aros.Observers.completionObserver?.disconnect();

        if (Aros.state.autoSubmitTimeoutId) { clearTimeout(Aros.state.autoSubmitTimeoutId); Aros.state.autoSubmitTimeoutId = null; }
        if (Aros.state.generationTimeoutId) { clearTimeout(Aros.state.generationTimeoutId); Aros.state.generationTimeoutId = null; }
        if (Aros.state.manualTimerTimeoutId) { clearTimeout(Aros.state.manualTimerTimeoutId); Aros.state.manualTimerTimeoutId = null; }
        if (Aros.state.visualCountdownInterval) { clearInterval(Aros.state.visualCountdownInterval); Aros.state.visualCountdownInterval = null; }

        Aros.UI.hideOverlay();
        const cooldownBtn = document.getElementById('sora-cooldown');
        if (cooldownBtn) {
            cooldownBtn.textContent = '⏱ Cooldown: --s';
            cooldownBtn.style.display = 'none';
        }
        
        Aros.CoreLogic.updateProgress();

        if (Aros.state.promptQueue.length > 0) {
            Aros.CoreLogic.saveRemainingPromptsToFile();
        }
        Aros.state.promptQueue = [];
        Aros.state.originalPromptList = [];
        Aros.state.totalPromptCount = 0;
        Aros.state.totalPromptsSentLoop = 0;

        setTimeout(() => {
            if (!Aros.state.isRunning) {
                const auxContainer = document.getElementById('sora-aux-controls-container');
                if (auxContainer) auxContainer.style.display = 'none';
                const miniBtn = document.getElementById('sora-minibtn');
                const mainUI = document.getElementById('sora-auto-ui');
                if (miniBtn && (!mainUI || mainUI.style.display === 'none')) {
                    miniBtn.style.display = 'block';
                }
                Aros.UI.updateStartButtonPromptCount();
            }
        }, 4000);
    }

    // --- Initialization ---
    Aros.methods.waitForElement = function (selector, callback, timeout = 20000) {
        Aros.Utils.log(`Waiting for element: "${selector}" (timeout: ${timeout/1000}s)`);
        let checkCount = 0;
        const intervalTime = 500;
        const maxChecks = timeout / intervalTime;
        const interval = setInterval(() => {
            checkCount++;
            const el = document.querySelector(selector);
            if (el) {
                clearInterval(interval);
                Aros.Utils.log(`Element found: "${selector}". Initializing script...`);
                try {
                    callback(el);
                } catch (e) {
                    Aros.Utils.log("FATAL ERROR during initialization callback:"); console.error(e);
                    alert("Fatal error during Aros Patcher script initialization. Check Console.");
                }
            } else if (checkCount >= maxChecks) {
                clearInterval(interval);
                Aros.Utils.log(`ERROR: Element "${selector}" not found. Script cannot initialize UI.`);
                alert(`Aros Patcher: Important element "${selector}" not found.`);
            }
        }, intervalTime);
    }

    // Ensure Aros.Utils.log is available or provide a fallback if utils.js hasn't loaded/defined it yet
    // This is a temporary safeguard. Ideally, utils.js (and other @require) sets up its namespace parts correctly.
    if (typeof Aros.Utils.log !== 'function') {
        Aros.Utils.log = console.log; // Fallback
        console.log("Aros.Utils.log was not defined, using console.log as fallback for early logs.");
    }
    
    Aros.Utils.log("Aros Patcher (Modular) script starting...");
    if (typeof JSZip === 'undefined') {
        Aros.Utils.log("FATAL ERROR: JSZip library not loaded.");
        alert("Critical Error: JSZip library not loaded for Aros Patcher.");
        return;
    }
    // Assuming wildcardUtils will be on Aros.WildcardUtils after wildcards.js is loaded
    if (typeof Aros.WildcardUtils === 'undefined' || typeof Aros.WildcardUtils.generatePromptsWithWildcards !== 'function') {
        Aros.Utils.log("INFO: Aros.WildcardUtils might not be loaded yet or fully initialized, will be checked upon use.");
    }


    Aros.methods.waitForElement('main, div[role="dialog"]', (commonElement) => {
        try {
            Aros.Utils.log("Core element found. Initializing Aros Patcher modules...");

            // Initial DOM modifications
            Aros.DOMUtils.removeNativeCheckboxes();
            Aros.DOMUtils.removeNativeSelectionIndicators();

            // Create UI
            // Globals like Aros.state.cooldownTime, Aros.state.generatedPromptCount, Aros.state.isWildcardMode are used by createUI
            Aros.UI.createUI(); 
            Aros.UI.hideOverlay();
            
            // Attach Event Listeners to UI elements
            document.getElementById('sora-start').addEventListener('click', Aros.methods.handleStart);
            document.getElementById('sora-clear').addEventListener('click', Aros.methods.handleClear);
            document.getElementById('sora-close').addEventListener('click', Aros.methods.handleClose);
            document.getElementById('sora-download-images').addEventListener('click', Aros.ImageManagement.handleDownload);
            document.getElementById('sora-find-similar-button').addEventListener('click', Aros.FindSimilar.toggleFindSimilarMode);
            
            document.getElementById('sora-select-horizontal').addEventListener('change', Aros.UI.updateImageSelection);
            document.getElementById('sora-select-vertical').addEventListener('change', Aros.UI.updateImageSelection);
            document.getElementById('sora-select-square').addEventListener('change', Aros.UI.updateImageSelection);
            
            document.getElementById('sora-auto-submit-checkbox').addEventListener('input', Aros.UI.toggleCooldownInputState);
            document.getElementById('sora-loop-checkbox').addEventListener('change', Aros.methods.handleLoopToggle);
            document.getElementById('sora-input').addEventListener('input', Aros.UI.updateStartButtonPromptCount);

            // Wildcard UI listeners
            document.getElementById('sora-mode-normal').addEventListener('click', () => Aros.UI.toggleInputMode(false));
            document.getElementById('sora-mode-wildcard').addEventListener('click', () => Aros.UI.toggleInputMode(true));
            document.getElementById('sora-generate-prompts').addEventListener('click', Aros.WildcardIntegration.handleGeneratePrompts);
            document.getElementById('sora-load-example').addEventListener('click', Aros.WildcardIntegration.handleLoadExample);

            // Image Persistence UI listeners
            document.getElementById('sora-persist-images-checkbox').addEventListener('change', Aros.methods.handlePersistImagesToggle);
            document.getElementById('sora-paste-all-images').addEventListener('click', Aros.ImagePersistence.handlePasteAllImages);
            
            const scriptInputTextarea = document.getElementById('sora-input');
            if (scriptInputTextarea) {
                scriptInputTextarea.addEventListener('paste', Aros.ImagePersistence.handleSimulatedImagePaste);
            }
            
            // Aux UI listeners
            document.getElementById('sora-stop-button').onclick = Aros.methods.handleStop;
            document.getElementById('sora-minibtn').onclick = Aros.methods.handleMiniButtonClick;

            Aros.UI.makeUIDraggable();

            // Initial state updates
            Aros.UI.toggleCooldownInputState();
            Aros.UI.updateStartButtonPromptCount();
            Aros.UI.updatePersistedImageCountUI();
            
            Aros.Utils.log("Performing initial image scan...");
            document.querySelectorAll('div[data-index] a > img, div[style*="top:"][style*="left:"] img, .group\/tile img').forEach(img => {
                Aros.ImageManagement.insertCheckbox(img);
            });
            Aros.UI.updateSelectedCount();

            // Initialize and Start Observers
            Aros.Observers.initializeImageObserver();    
            Aros.Observers.initializeCompletionObserver();

            const observerTarget = document.querySelector('[data-testid="virtuoso-scroller"] > div, main div[class*="grid"], div[role="dialog"] div.flex.h-full.flex-col') ?? document.body;
            if (Aros.Observers.imageObserver && observerTarget) { // Assumes imageObserver is exposed on Aros.Observers
                Aros.Observers.imageObserver.observe(observerTarget, { childList: true, subtree: true });
                Aros.Utils.log(`Image Observer started on ${observerTarget.tagName}.`);
            } else {
                Aros.Utils.log("WARNING: Could not find specific image grid container for ImageObserver.");
            }
            if(Aros.Observers.completionObserver) { // Assumes completionObserver is exposed on Aros.Observers
                 Aros.Utils.log("Completion Observer initialized (for Auto Mode).");
            }

            // Global click listener for "Find Similar"
            document.addEventListener('click', Aros.FindSimilar.handleDocumentClickForSimilar, true);

            Aros.Utils.log("Aros Patcher (Modular) initialization complete.");

        } catch (e) {
            Aros.Utils.log("FATAL ERROR during Aros Patcher (Modular) main initialization:");
            console.error(e);
            alert("A critical error occurred during Aros Patcher initialization. Check Console (F12).");
        }
    });

})(); 