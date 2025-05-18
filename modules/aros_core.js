/**
 * Aros Patcher - Core Module
 * Contains essential variables, logging, and utility functions
 */

const ArosCore = (function() {
    'use strict';
    
    // --- Global Variables ---
    const SCRIPT_VERSION = "6.0";
    const SCRIPT_CHECKBOX_MARKER = 'data-auto-aros-cb';
    const NATIVE_INDICATOR_SELECTOR = 'div.absolute.left-2.top-2';
    const PROMPT_DELIMITER = '@@@@@';
    const GENERATION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
    const IMAGE_PASTE_DELAY_MS = 8000; // Delay between pasting multiple persisted images
    
    let promptQueue = [];
    let originalPromptList = [];    // Store original list for looping
    let totalPromptCount = 0;       // Total prompts in the *current* cycle or initial list
    let totalPromptsSentLoop = 0;   // Total prompts sent since start *if* looping
    let isRunning = false;
    let isLooping = false;          // Track loop checkbox state
    let isGenerating = false;       // Only relevant for Auto mode
    let cooldownTime = 130;         // Default manual cooldown
    let autoSubmitTimeoutId = null; // For Auto mode's 1-sec delay
    let generationTimeoutId = null; // For Auto mode's generation timeout
    let manualTimerTimeoutId = null; // ID for setTimeout of manual mode execution
    let visualCountdownInterval = null; // ID for setInterval updating manual cooldown UI
    let isDownloading = false;
    let downloadErrors = 0;
    let isFindSimilarModeActive = false;
    let imageObserver = null;
    let completionObserver = null;
    let _generationIndicatorRemoved = false; // For Auto mode completion detection
    let _newImagesAppeared = false; // For Auto mode completion detection
    let pageOverlayElement = null;
    let originalBodyOverflow = '';
    let originalHtmlOverflow = '';
    let stylesInjected = false;
    
    // --- Wildcard Variables ---
    let isWildcardMode = false;     // Toggle for wildcard mode
    let wildcardTemplate = "";      // Store the current wildcard template
    let generatedPromptCount = 10;  // Default number of prompts to generate
    
    // --- Image Persistence Variables ---
    let persistedImages = []; // Array to store File objects for persistent pasting
    let isImagePersistenceEnabled = false; // Controlled by a checkbox
    let isPastingSequence = false; // Flag to prevent multiple paste sequences
    let sequentialPasteTimeoutId = null; // For tracking sequential paste timeouts
    let currentPersistentImageIndex = 0; // Track which image we're currently using
    
    // --- Logging Function ---
    function log(msg) {
        const now = new Date();
        const timestamp = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(3, '0')}.${now.getMilliseconds().toString().padStart(3, '0')}`;
        console.log(`[Aros Patcher v${SCRIPT_VERSION} ${timestamp}] ${msg}`);
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

        // Dispatch events to notify React of the change
        element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        element.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));

        // Attempt to find and trigger React's internal event handler
        const key = Object.keys(element).find(k => k.startsWith("__reactProps$"));
        if (key && element[key]?.onChange) {
            try {
                log("Triggering React onChange on element...");
                element[key].onChange({ target: element });
            } catch (e) {
                log("ERROR triggering React onChange on element:"); console.error(e);
            }
        } else {
            log("WARNING: React onChange handler not found for element.");
        }
        log(`Textarea value after attempting to set: "${element.value.substring(0, 70).replace(/\n/g, '\\n')}..."`);
    }
    
    // --- Function to remove native checkboxes ---
    function removeNativeCheckboxes() {
        const nativeCheckboxes = document.querySelectorAll(`input.sora-image-checkbox:not([${SCRIPT_CHECKBOX_MARKER}])`);
        let removedCount = 0;
        nativeCheckboxes.forEach(checkbox => { 
            try { 
                checkbox.remove(); 
                removedCount++; 
            } catch (e) {} 
        });
        if (removedCount > 0) log(`Removed ${removedCount} native checkboxes.`);
    }
    
    // --- Function to remove native selection indicators ---
    function removeNativeSelectionIndicators() {
        const indicators = document.querySelectorAll(NATIVE_INDICATOR_SELECTOR);
        let removedCount = 0;
        indicators.forEach(indicator => {
            if (indicator.querySelector('div.bg-black\\/25 div.border-2')) {
                try { 
                    indicator.remove(); 
                    removedCount++; 
                } catch (e) { 
                    log(`Error removing native indicator: ${e.message}`); 
                }
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
                log(`Element found: "${selector}". Initializing script...`);
                try {
                    callback(el);
                    log("Initialization callback executed successfully.");
                } catch (e) {
                    log("FATAL ERROR during initialization callback execution:");
                    console.error(e);
                    alert("Fatal error during Aros Patcher script initialization. Cannot create UI. Check Console (F12) for details.");
                }
            } else if (checkCount >= maxChecks) {
                clearInterval(interval);
                log(`ERROR: Element "${selector}" not found after ${timeout/1000} seconds. Script cannot initialize UI.`);
                alert(`Aros Patcher: Important element "${selector}" not found to initialize UI. Script may not work correctly.`);
            }
        }, intervalTime);
    }
    
    // --- Module Initialization ---
    function init() {
        log("Aros Patcher Core Module Initializing...");
        
        // Initial removal of native elements
        removeNativeCheckboxes();
        removeNativeSelectionIndicators();
        
        // Create MutationObservers
        if (!completionObserver) {
            completionObserver = new MutationObserver((mutations) => {
                if (!isGenerating || !isRunning) return; // Ignore if not in Auto generation

                let foundIndicatorRemoval = false;
                let foundNewImage = false;

                for (const mutation of mutations) {
                    if (mutation.type === 'childList') {
                        // Check for removal of loading indicators
                        mutation.removedNodes.forEach(node => {
                            if (node.nodeType === 1 && node.querySelector && node.querySelector('svg[class*="desktop:h-20"] circle[class*="-rotate-90"]')) {
                                foundIndicatorRemoval = true;
                            } else if (node.nodeType === 1 && node.matches && node.matches('div[class*="absolute"][class*="text-token-text-secondary"]') && node.textContent.match(/^\d{1,3}%$/)) {
                                foundIndicatorRemoval = true;
                            }
                        });

                        // Check for addition of new image grid item
                        mutation.addedNodes.forEach(node => {
                            if (node.nodeType === 1) {
                                if ((node.matches && node.matches('div[data-index="0"]')) || (node.querySelector && node.querySelector('div[data-index="0"]'))) {
                                    foundNewImage = true;
                                }
                            }
                        });
                    }
                }

                // Update state flags
                if (foundIndicatorRemoval) _generationIndicatorRemoved = true;
                if (foundNewImage) _newImagesAppeared = true;

                // Check if both conditions are met to signal completion
                if (isGenerating && isRunning && _generationIndicatorRemoved && _newImagesAppeared) {
                    log("CompletionObserver: Both conditions met. Calling handleGenerationComplete.");
                    // Reset flags immediately to prevent double calls before disconnect
                    _generationIndicatorRemoved = false;
                    _newImagesAppeared = false;
                    ArosPrompt.handleGenerationComplete(); // Trigger the next step in Auto Mode
                }
            });
        }
        
        log("Aros Patcher Core Module Initialized.");
    }
    
    // --- Public API ---
    return {
        // Constants
        SCRIPT_VERSION,
        SCRIPT_CHECKBOX_MARKER,
        NATIVE_INDICATOR_SELECTOR,
        PROMPT_DELIMITER,
        GENERATION_TIMEOUT_MS,
        IMAGE_PASTE_DELAY_MS,
        
        // Variables - Getters and Setters
        getPromptQueue: () => promptQueue,
        setPromptQueue: (queue) => { promptQueue = queue; },
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
        setRunning: (state) => { isRunning = state; },
        
        isLooping: () => isLooping,
        setLooping: (state) => { isLooping = state; },
        
        isGenerating: () => isGenerating,
        setGenerating: (state) => { isGenerating = state; },
        
        getCooldownTime: () => cooldownTime,
        setCooldownTime: (time) => { cooldownTime = time; },
        
        getAutoSubmitTimeoutId: () => autoSubmitTimeoutId,
        setAutoSubmitTimeoutId: (id) => { autoSubmitTimeoutId = id; },
        clearAutoSubmitTimeout: () => { 
            if (autoSubmitTimeoutId) {
                clearTimeout(autoSubmitTimeoutId);
                autoSubmitTimeoutId = null;
                log("Cleared autoSubmitTimeoutId."); 
            }
        },
        
        getGenerationTimeoutId: () => generationTimeoutId,
        setGenerationTimeoutId: (id) => { generationTimeoutId = id; },
        clearGenerationTimeout: () => { 
            if (generationTimeoutId) {
                clearTimeout(generationTimeoutId);
                generationTimeoutId = null;
                log("Cleared generationTimeoutId."); 
            }
        },
        
        getManualTimerTimeoutId: () => manualTimerTimeoutId,
        setManualTimerTimeoutId: (id) => { manualTimerTimeoutId = id; },
        clearManualTimerTimeout: () => { 
            if (manualTimerTimeoutId) {
                clearTimeout(manualTimerTimeoutId);
                manualTimerTimeoutId = null;
                log("Cleared manual execution timer."); 
            }
        },
        
        getVisualCountdownInterval: () => visualCountdownInterval,
        setVisualCountdownInterval: (id) => { visualCountdownInterval = id; },
        clearVisualCountdownInterval: () => { 
            if (visualCountdownInterval) {
                clearInterval(visualCountdownInterval);
                visualCountdownInterval = null;
                log("Cleared manual visual countdown timer."); 
            }
        },
        
        isDownloading: () => isDownloading,
        setDownloading: (state) => { isDownloading = state; },
        
        getDownloadErrors: () => downloadErrors,
        setDownloadErrors: (errors) => { downloadErrors = errors; },
        incrementDownloadErrors: () => { downloadErrors++; },
        
        isFindSimilarModeActive: () => isFindSimilarModeActive,
        setFindSimilarModeActive: (state) => { isFindSimilarModeActive = state; },
        
        getCompletionObserver: () => completionObserver,
        
        getWildcardMode: () => isWildcardMode,
        setWildcardMode: (state) => { isWildcardMode = state; },
        
        getWildcardTemplate: () => wildcardTemplate,
        setWildcardTemplate: (template) => { wildcardTemplate = template; },
        
        getGeneratedPromptCount: () => generatedPromptCount,
        setGeneratedPromptCount: (count) => { generatedPromptCount = count; },
        
        getPersistedImages: () => persistedImages,
        setPersistedImages: (images) => { persistedImages = images; },
        addToPersistedImages: (image) => { persistedImages.push(image); },
        clearPersistedImages: () => { persistedImages = []; },
        
        isImagePersistenceEnabled: () => isImagePersistenceEnabled,
        setImagePersistenceEnabled: (state) => { isImagePersistenceEnabled = state; },
        
        isPastingSequence: () => isPastingSequence,
        setPastingSequence: (state) => { isPastingSequence = state; },
        
        getSequentialPasteTimeoutId: () => sequentialPasteTimeoutId,
        setSequentialPasteTimeoutId: (id) => { sequentialPasteTimeoutId = id; },
        clearSequentialPasteTimeout: () => { 
            if (sequentialPasteTimeoutId) {
                clearTimeout(sequentialPasteTimeoutId);
                sequentialPasteTimeoutId = null;
                log("Cleared sequential paste timeout."); 
            }
        },
        
        getCurrentPersistentImageIndex: () => currentPersistentImageIndex,
        setCurrentPersistentImageIndex: (index) => { currentPersistentImageIndex = index; },
        
        // Functions
        log,
        getTimestamp,
        triggerDownload,
        setReactTextareaValue,
        removeNativeCheckboxes,
        removeNativeSelectionIndicators,
        waitForElement,
        init
    };
})(); 