/**
 * Aros Patcher - Core Module
 * Contains essential variables, logging, and utility functions
 */

// Initialize the global Aros namespace if it doesn't exist
console.log('[aros_core.js] Script start (top level).');
window.Aros = window.Aros || {};
console.log('[aros_core.js] Aros namespace ensured (top level). Current Aros keys:', window.Aros ? Object.keys(window.Aros).join(', ') : 'Aros undefined');

// Create the Core module within the Aros namespace
console.log('[aros_core.js] Attempting to define Aros.Core...');
Aros.Core = (function() {
    'use strict';
    console.log('[aros_core.js] IIFE for Aros.Core executing.');
    
    // --- Constants ---
    const SCRIPT_VERSION = "6.0";
    const SCRIPT_CHECKBOX_MARKER = 'data-auto-aros-cb';
    const NATIVE_INDICATOR_SELECTOR = 'div.absolute.left-2.top-2';
    const PROMPT_DELIMITER = '@@@@@';
    const GENERATION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
    const IMAGE_PASTE_DELAY_MS = 8000; // Delay for pasting multiple persisted images
    
    // --- State Variables ---
    let promptQueue = [];
    let originalPromptList = [];
    let totalPromptCount = 0;
    let totalPromptsSentLoop = 0;
    let isRunning = false;
    let isLooping = false;
    let isGenerating = false;
    let cooldownTime = 130; // Default manual cooldown
    let autoSubmitTimeoutId = null;
    let generationTimeoutId = null;
    let manualTimerTimeoutId = null;
    let visualCountdownInterval = null;
    let isDownloading = false;
    let downloadErrors = 0;
    let isFindSimilarModeActive = false;
    
    // Observers - imageObserver will likely be in Aros.Image
    let completionObserver = null; 
    let _generationIndicatorRemoved = false;
    let _newImagesAppeared = false;

    // --- Selected Images State ---
    let selectedImageUrls = new Set();

    // --- Module Loggers ---
    let moduleLoggers = {};

    // UI Related state that Core might need to manage or be aware of (e.g. for scroll lock)
    // let pageOverlayElement = null; // This will be managed by Aros.UI
    // let originalBodyOverflow = ''; // Managed by Aros.UI
    // let originalHtmlOverflow = ''; // Managed by Aros.UI
    // let stylesInjected = false; // Managed by Aros.UI

    // --- Wildcard Variables (state related to wildcards) ---
    let isWildcardMode = false;
    let wildcardTemplate = "";
    let generatedPromptCount = 10;

    // --- Image Persistence Variables (state related to image persistence) ---
    let persistedImages = [];
    let isImagePersistenceEnabled = false;
    let isPastingSequence = false;
    let sequentialPasteTimeoutId = null;
    let currentPersistentImageIndex = 0;
    
    // --- Logging Function ---
    function log(msg, level = 'info', source = 'Core') {
        const now = new Date();
        const timestamp = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(3, '0')}.${now.getMilliseconds().toString().padStart(3, '0')}`;
        const logMessage = `[Aros Patcher v${SCRIPT_VERSION} ${source} ${timestamp}] ${msg}`;
        
        if (level === 'error') {
            console.error(logMessage);
        } else if (level === 'warn') {
            console.warn(logMessage);
        } else {
            console.log(logMessage);
        }

        // Call registered module loggers
        if (moduleLoggers.UI && source !== 'UI_INTERNAL') { // Avoid re-logging UI messages meant for console
            // Prevent direct UI logs from Core causing a loop if UI also logs to Core
            // UI should call Core.log with a special source if it doesn't want it back in its panel
            try {
                moduleLoggers.UI(msg, level); // Send to UI panel logger
            } catch (e) {
                console.error("[Aros Core] Error calling UI logger:", e);
            }
        }
        // Add other module loggers here if needed
    }

    function error(msg, source = 'Core') {
        log(msg, 'error', source);
    }

    function registerModuleLogger(moduleName, loggerFn) {
        if (typeof loggerFn === 'function') {
            moduleLoggers[moduleName] = loggerFn;
            log(`Registered logger for module: ${moduleName}`, 'info', 'Core');
        } else {
            error(`Attempted to register invalid logger for module: ${moduleName}`, 'Core');
        }
    }
    
    // --- Utility Functions ---
    function getTimestamp() {
        const now = new Date();
        const pad = n => String(n).padStart(2, '0');
        return `${pad(now.getDate())}${pad(now.getMonth() + 1)}${String(now.getFullYear()).slice(2)}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    }
    
    function triggerDownload(blob, filename) {
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
        log(`Download triggered: ${filename} (Size: ${(blob.size / 1024).toFixed(1)} KB)`);
    }
    
    function setReactTextareaValue(element, value) {
        log(`Attempting to set React textarea value to: "${value.substring(0, 70).replace(/\n/g, '\\n')}..."`);
        const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
        const prototype = Object.getPrototypeOf(element);
        const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

        if (valueSetter && valueSetter !== prototypeValueSetter) {
            prototypeValueSetter?.call(element, value);
            log("Used prototype value setter.");
        } else {
            valueSetter?.call(element, value);
            log("Used HTMLTextAreaElement value setter.");
        }

        element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        element.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));

        const key = Object.keys(element).find(k => k.startsWith("__reactProps$"));
        if (key && element[key]?.onChange) {
            try {
                log("Triggering React onChange on element...");
                element[key].onChange({ target: element });
            } catch (e) {
                log("ERROR triggering React onChange on element:");
                console.error(e);
            }
        } else {
            log("WARNING: React onChange handler not found for element.");
        }
        log(`Textarea value after attempting to set: "${element.value.substring(0, 70).replace(/\n/g, '\\n')}..."`);
    }
    
    // --- Functions to remove native elements ---
    function removeNativeCheckboxes() {
        const nativeCheckboxes = document.querySelectorAll(`input.sora-image-checkbox:not([${SCRIPT_CHECKBOX_MARKER}])`);
        let removedCount = 0;
        nativeCheckboxes.forEach(checkbox => { try { checkbox.remove(); removedCount++; } catch (e) {} });
        if (removedCount > 0) log(`Removed ${removedCount} native Aros checkboxes.`);
    }
    
    function removeNativeSelectionIndicators() {
        const indicators = document.querySelectorAll(NATIVE_INDICATOR_SELECTOR);
        let removedCount = 0;
        indicators.forEach(indicator => {
            if (indicator.querySelector('div.bg-black\\/25 div.border-2')) {
                try { indicator.remove(); removedCount++; } catch (e) { log(`Error removing native indicator: ${e.message}`); }
            }
        });
        if (removedCount > 0) log(`Removed ${removedCount} native selection indicators.`);
    }
    
    // --- Wait for Element ---
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
                log(`Element found: "${selector}". Executing callback...`);
                try {
                    callback(el);
                    log("waitForElement callback executed successfully.");
                } catch (e) {
                    log("FATAL ERROR during waitForElement callback execution:");
                    console.error(e);
                    alert("Fatal error during Aros Patcher script initialization (waitForElement). Check Console (F12) for details.");
                }
            } else if (checkCount >= maxChecks) {
                clearInterval(interval);
                log(`ERROR: Element "${selector}" not found after ${timeout/1000} seconds. Callback not executed.`);
                alert(`Aros Patcher: Important element "${selector}" not found. Script may not function correctly.`);
            }
        }, intervalTime);
    }
    
    // --- Module Initialization ---
    function init() {
        log("Core Module Initializing...");
        
        // Initial log to demonstrate UI logging if already registered (though UI usually registers after Core init)
        // log("Core init log test for UI panel.", 'info', 'Core');

        removeNativeCheckboxes();
        removeNativeSelectionIndicators();
        
        if (!completionObserver) {
            completionObserver = new MutationObserver((mutations) => {
                if (!isGenerating || !isRunning) return;

                let foundIndicatorRemoval = false;
                let foundNewImage = false;

                for (const mutation of mutations) {
                    if (mutation.type === 'childList') {
                        mutation.removedNodes.forEach(node => {
                            if (node.nodeType === 1 && node.querySelector && node.querySelector('svg[class*="desktop:h-20"] circle[class*="-rotate-90"]')) {
                                foundIndicatorRemoval = true;
                            } else if (node.nodeType === 1 && node.matches && node.matches('div[class*="absolute"][class*="text-token-text-secondary"]') && node.textContent.match(/^\d{1,3}%$/)) {
                                foundIndicatorRemoval = true;
                            }
                        });
                        mutation.addedNodes.forEach(node => {
                            if (node.nodeType === 1) {
                                if ((node.matches && node.matches('div[data-index="0"]')) || (node.querySelector && node.querySelector('div[data-index="0"]'))) {
                                    foundNewImage = true;
                                }
                            }
                        });
                    }
                }

                if (foundIndicatorRemoval) _generationIndicatorRemoved = true;
                if (foundNewImage) _newImagesAppeared = true;

                if (isGenerating && isRunning && _generationIndicatorRemoved && _newImagesAppeared) {
                    log("CompletionObserver: Both conditions met. Calling Aros.Prompt.handleGenerationComplete.");
                    _generationIndicatorRemoved = false;
                    _newImagesAppeared = false;
                    if (Aros.Prompt && Aros.Prompt.handleGenerationComplete) {
                        Aros.Prompt.handleGenerationComplete();
                    } else {
                        log("ERROR: Aros.Prompt.handleGenerationComplete not found!");
                    }
                }
            });
            log("Completion Observer created.");
        }
        
        log("Core Module Initialized.");
    }
    
    // --- Image Selection Functions ---
    function getSelectedImageUrls() {
        return selectedImageUrls;
    }

    function setSelectedImageUrls(urlsSet) {
        if (urlsSet instanceof Set) {
            selectedImageUrls = urlsSet;
            log(`Selected image URLs set. Count: ${selectedImageUrls.size}`, 'info', 'Core');
            // Potentially notify UI to update if direct manipulation from elsewhere
            if (Aros.UI && Aros.UI.updateSelectedCount) Aros.UI.updateSelectedCount(); 
        } else {
            error("setSelectedImageUrls expects a Set.", 'Core');
        }
    }

    function addSelectedImageUrl(url) {
        if (url && typeof url === 'string') {
            selectedImageUrls.add(url);
            log(`Added selected image URL: ${url}. Total: ${selectedImageUrls.size}`, 'info', 'Core');
            if (Aros.UI && Aros.UI.updateSelectedCount) Aros.UI.updateSelectedCount();
        } else {
            error("addSelectedImageUrl expects a non-empty string URL.", 'Core');
        }
    }

    function removeSelectedImageUrl(url) {
        if (url && typeof url === 'string') {
            selectedImageUrls.delete(url);
            log(`Removed selected image URL: ${url}. Total: ${selectedImageUrls.size}`, 'info', 'Core');
            if (Aros.UI && Aros.UI.updateSelectedCount) Aros.UI.updateSelectedCount();
        } else {
            error("removeSelectedImageUrl expects a non-empty string URL.", 'Core');
        }
    }

    function clearSelectedImages() {
        selectedImageUrls.clear();
        log("Selected images cleared.", 'info', 'Core');
        if (Aros.UI && Aros.UI.updateSelectedCount) Aros.UI.updateSelectedCount();
    }

    // --- Prompt Queue Functions ---
    function getPromptQueueSize() {
        return promptQueue.length;
    }

    function clearPromptQueue() {
        promptQueue = [];
        originalPromptList = [];
        totalPromptCount = 0;
        totalPromptsSentLoop = 0;
        log("Prompt queue and related counts cleared.", 'info', 'Core');
        if (Aros.UI && Aros.UI.updateStartButtonPromptCount) Aros.UI.updateStartButtonPromptCount();
    }

    // --- Persistence Related Functions ---
    function getPersistedImagesCount() {
        return persistedImages.length;
    }

    function shouldPersistImages() { // Alias for UI
        return isImagePersistenceEnabled;
    }

    function setPersistImages(state) { // Alias for UI
        setImagePersistenceEnabled(state);
    }

    // --- Core Processing Functions ---
    function startProcessing(promptsArray) {
        if (isRunning) {
            log("Processing is already running.", 'warn', 'Core');
            return;
        }
        if (!promptsArray || promptsArray.length === 0) {
            log("No prompts provided to start processing.", 'warn', 'Core');
            return;
        }

        log(`Starting processing with ${promptsArray.length} prompts.`, 'info', 'Core');
        setPromptQueue(promptsArray.slice()); // Use a copy
        setOriginalPromptList(promptsArray.slice());
        setTotalPromptCount(promptsArray.length);
        setTotalPromptsSentLoop(0);
        setRunning(true);

        if (Aros.UI && Aros.UI.showOverlay) Aros.UI.showOverlay("Processing started...");
        if (Aros.UI && Aros.UI.toggleCooldownInputState) Aros.UI.toggleCooldownInputState(false);
        // if (Aros.UI && Aros.UI.logToUIPanel) Aros.UI.logToUIPanel("Processing started.", "info"); this will be covered by log() itself

        // Kick off the first prompt processing (assuming Aros.Prompt has this)
        if (Aros.Prompt && Aros.Prompt.processNextPrompt) {
            Aros.Prompt.processNextPrompt();
        } else {
            error("Aros.Prompt.processNextPrompt() not found! Cannot start processing.", 'Core');
            setRunning(false); // Revert running state
            if (Aros.UI && Aros.UI.hideOverlay) Aros.UI.hideOverlay();
            if (Aros.UI && Aros.UI.toggleCooldownInputState) Aros.UI.toggleCooldownInputState(true);
        }
    }

    function stopProcessing() {
        if (!isRunning) {
            log("Processing is not currently running.", 'info', 'Core');
            return;
        }
        log("Stopping processing...", 'info', 'Core');
        setRunning(false);
        setGenerating(false); // Ensure any generation state is also reset

        // Clear any active timeouts/intervals related to processing cycle
        clearAutoSubmitTimeoutId();
        clearGenerationTimeoutId();
        clearManualTimerTimeoutId();
        clearVisualCountdownInterval();
        
        // Optionally clear prompt queue or leave it for user to decide?
        // clearPromptQueue(); // For now, let's not clear it, user might want to resume or see it.
        // Update UI
        if (Aros.UI && Aros.UI.hideOverlay) Aros.UI.hideOverlay();
        if (Aros.UI && Aros.UI.toggleCooldownInputState) Aros.UI.toggleCooldownInputState(true);
        if (Aros.UI && Aros.UI.updateProgress) Aros.UI.updateProgress(0,0); // Reset progress
        if (Aros.UI && Aros.UI.updateCooldownTimerDisplay) Aros.UI.updateCooldownTimerDisplay(0);
        // if (Aros.UI && Aros.UI.logToUIPanel) Aros.UI.logToUIPanel("Processing stopped.", "info"); this will be covered by log()

        log("Processing stopped.", 'info', 'Core');
    }

    // This function will be called by Aros.Prompt or other modules when a cooldown needs to start
    function startCooldownTimer(duration) {
        const actualDuration = duration || cooldownTime;
        log(`Starting cooldown timer for ${actualDuration}ms.`, 'info', 'Core');
        clearVisualCountdownInterval(); // Clear any existing interval

        let remainingTime = actualDuration;
        if (Aros.UI && Aros.UI.updateCooldownTimerDisplay) {
            Aros.UI.updateCooldownTimerDisplay(remainingTime);
        }

        visualCountdownInterval = setInterval(() => {
            remainingTime -= 100;
            if (Aros.UI && Aros.UI.updateCooldownTimerDisplay) {
                Aros.UI.updateCooldownTimerDisplay(remainingTime);
            }
            if (remainingTime <= 0) {
                clearInterval(visualCountdownInterval);
                visualCountdownInterval = null;
                log("Cooldown finished.", 'info', 'Core');
                if (Aros.UI && Aros.UI.updateCooldownTimerDisplay) {
                    Aros.UI.updateCooldownTimerDisplay(0);
                }
                // Potentially trigger next action if processing is still running
                if (isRunning && Aros.Prompt && Aros.Prompt.processNextPrompt) {
                    log("Cooldown ended, attempting to process next prompt.", 'info', 'Core');
                    Aros.Prompt.processNextPrompt();
                }
            }
        }, 100);
    }

    // --- Public API ---
    console.log('[aros_core.js] IIFE for Aros.Core executed, returning object.');
    return {
        // Constants
        SCRIPT_VERSION,
        SCRIPT_CHECKBOX_MARKER,
        NATIVE_INDICATOR_SELECTOR,
        PROMPT_DELIMITER,
        GENERATION_TIMEOUT_MS,
        IMAGE_PASTE_DELAY_MS,
        
        // State Getters & Setters (exposed carefully)
        getPromptQueue: () => promptQueue,
        setPromptQueue: (newQueue) => { promptQueue = newQueue; },
        addToPromptQueue: (item) => { promptQueue.push(item); },
        shiftPromptQueue: () => promptQueue.shift(),
        
        getOriginalPromptList: () => originalPromptList,
        setOriginalPromptList: (list) => { originalPromptList = list; },
        
        getTotalPromptCount: () => totalPromptCount,
        setTotalPromptCount: (count) => { totalPromptCount = count; },
        
        getTotalPromptsSentLoop: () => totalPromptsSentLoop,
        setTotalPromptsSentLoop: (count) => { totalPromptsSentLoop = count; },
        incrementTotalPromptsSentLoop: () => { totalPromptsSentLoop++; },
        
        isRunning: () => isRunning,
        setRunning: (state) => { isRunning = state; log(`isRunning set to: ${state}`, 'info', 'Core'); },
        
        isLooping: () => isLooping,
        setLooping: (state) => { isLooping = state; log(`isLooping set to: ${state}`); },
        
        isGenerating: () => isGenerating,
        setGenerating: (state) => { isGenerating = state; log(`isGenerating set to: ${state}`); },
        
        getCooldownTime: () => cooldownTime,
        setCooldownTime: (time) => { cooldownTime = parseInt(time, 10); log(`cooldownTime set to: ${cooldownTime}`); },
        
        getAutoSubmitTimeoutId: () => autoSubmitTimeoutId,
        setAutoSubmitTimeoutId: (id) => { autoSubmitTimeoutId = id; },
        clearAutoSubmitTimeoutId: () => { 
            if (autoSubmitTimeoutId) { clearTimeout(autoSubmitTimeoutId); autoSubmitTimeoutId = null; log("Cleared autoSubmitTimeoutId."); }
        },
        
        getGenerationTimeoutId: () => generationTimeoutId,
        setGenerationTimeoutId: (id) => { generationTimeoutId = id; },
        clearGenerationTimeoutId: () => {
            if (generationTimeoutId) { clearTimeout(generationTimeoutId); generationTimeoutId = null; log("Cleared generationTimeoutId."); }
        },

        getManualTimerTimeoutId: () => manualTimerTimeoutId,
        setManualTimerTimeoutId: (id) => { manualTimerTimeoutId = id; },
        clearManualTimerTimeoutId: () => {
            if (manualTimerTimeoutId) { clearTimeout(manualTimerTimeoutId); manualTimerTimeoutId = null; log("Cleared manualTimerTimeoutId."); }
        },

        getVisualCountdownInterval: () => visualCountdownInterval,
        setVisualCountdownInterval: (id) => { visualCountdownInterval = id; },
        clearVisualCountdownInterval: () => {
            if (visualCountdownInterval) { clearInterval(visualCountdownInterval); visualCountdownInterval = null; log("Cleared visualCountdownInterval."); }
        },
        
        isDownloading: () => isDownloading,
        setDownloading: (state) => { isDownloading = state; log(`isDownloading set to: ${state}`); },
        getDownloadErrors: () => downloadErrors,
        setDownloadErrors: (count) => { downloadErrors = count; },
        incrementDownloadErrors: () => { downloadErrors++; },

        isFindSimilarModeActive: () => isFindSimilarModeActive,
        setFindSimilarModeActive: (state) => { isFindSimilarModeActive = state; log(`isFindSimilarModeActive set to: ${state}`); },

        getCompletionObserver: () => completionObserver,
        setGenerationIndicatorRemovedFlag: (flag) => { _generationIndicatorRemoved = flag; },
        setNewImagesAppearedFlag: (flag) => { _newImagesAppeared = flag; },

        // Wildcard state
        isWildcardMode: () => isWildcardMode,
        setWildcardMode: (state) => { isWildcardMode = state; log(`isWildcardMode set to: ${state}`); },
        getWildcardTemplate: () => wildcardTemplate,
        setWildcardTemplate: (template) => { wildcardTemplate = template; },
        getGeneratedPromptCount: () => generatedPromptCount,
        setGeneratedPromptCount: (count) => { generatedPromptCount = parseInt(count, 10); },

        // Image Persistence state
        getPersistedImages: () => persistedImages,
        getPersistedImagesCount,
        shouldPersistImages,
        setPersistedImages: (images) => { persistedImages = images; },
        addPersistedImage: (imageFile) => { persistedImages.push(imageFile); if (Aros.UI && Aros.UI.updatePersistedImageCountUI) Aros.UI.updatePersistedImageCountUI(); },
        clearPersistedImages: () => { 
            persistedImages = []; 
            currentPersistentImageIndex = 0; 
            log("Persisted images cleared, index reset.", 'info', 'Core'); 
            if (Aros.UI && Aros.UI.updatePersistedImageCountUI) Aros.UI.updatePersistedImageCountUI();
        },
        
        isImagePersistenceEnabled: () => isImagePersistenceEnabled,
        setImagePersistenceEnabled: (state) => { isImagePersistenceEnabled = state; log(`isImagePersistenceEnabled set to: ${state}`); },

        isPastingSequence: () => isPastingSequence,
        setPastingSequence: (state) => { isPastingSequence = state; },
        getSequentialPasteTimeoutId: () => sequentialPasteTimeoutId,
        setSequentialPasteTimeoutId: (id) => { sequentialPasteTimeoutId = id; },
        clearSequentialPasteTimeoutId: () => {
            if(sequentialPasteTimeoutId) { clearTimeout(sequentialPasteTimeoutId); sequentialPasteTimeoutId = null; log("Cleared sequentialPasteTimeoutId."); }
        },
        getCurrentPersistentImageIndex: () => currentPersistentImageIndex,
        setCurrentPersistentImageIndex: (index) => { currentPersistentImageIndex = index; },
        
        // Image Selection (New)
        getSelectedImageUrls,
        setSelectedImageUrls,
        addSelectedImageUrl,
        removeSelectedImageUrl,
        clearSelectedImages,

        // Prompt Queue (New/Enhanced)
        getPromptQueueSize,
        clearPromptQueue,

        // Core Operations (New)
        startProcessing,
        stopProcessing,
        startCooldownTimer,

        // Logging (New/Enhanced)
        log,
        error,
        registerModuleLogger,
        
        // Core Functions
        getTimestamp,
        triggerDownload,
        setReactTextareaValue,
        removeNativeCheckboxes,
        removeNativeSelectionIndicators,
        waitForElement,
        init
    };
})();
console.log('[aros_core.js] Script end (top level). Aros.Core type:', typeof Aros.Core, '; Aros.Core defined:', Aros.Core ? 'Yes' : 'No');
if (window.Aros && Aros.Core) {
    console.log('[aros_core.js] Aros.Core defined. Keys:', Object.keys(Aros.Core).join(', '));
} else {
    console.error('[aros_core.js] Aros.Core is NOT defined after execution.');
} 