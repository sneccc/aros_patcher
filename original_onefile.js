        // ==UserScript==
        // @name         🧠 Aros Patcher
        // @namespace    http://tampermonkey.net/
        // @version      5.9
        // @description  Enhanced Aros video generation tool with prompt queueing and image management
        // @author       ArosPatcher
        // @match        *://sora.com/*
        // @match        *://www.sora.com/*
        // @match        *://www.sora.*.com/*
        // @match        *://sora.*.com/*
        // @match        https://sora.chatgpt.com/*
        // @grant        none
        // @require      https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js
        // @require      https://raw.githubusercontent.com/sneccc/aros_patcher/refs/heads/main/wildcards.js
        // ==/UserScript==

        (function () {
            'use strict';

            // --- Global Variables ---
            let promptQueue = [];
            let originalPromptList = [];    // << NEW (from 5.7) Store original list for looping
            let totalPromptCount = 0;       // Total prompts in the *current* cycle or initial list
            let totalPromptsSentLoop = 0;   // << NEW (from 5.7) Total prompts sent since start *if* looping
            let isRunning = false;
            let isLooping = false;          // << NEW (from 5.7) Track loop checkbox state
            let isGenerating = false;       // Only relevant for Auto mode now
            let cooldownTime = 130;         // Default manual cooldown
            let autoSubmitTimeoutId = null; // For Auto mode's 1-sec delay
            let generationTimeoutId = null; // For Auto mode's 5-min generation timeout
            const GENERATION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
            let manualTimerTimeoutId = null; // ID for setTimeout of manual mode execution (renamed from manualTimerInterval)
            let visualCountdownInterval = null; // ID for setInterval updating manual cooldown UI
            let selectedImageUrls = new Set();
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
            const SCRIPT_VERSION = "6.8"; // Updated version with direct textarea manipulation for remix mode
            const SCRIPT_CHECKBOX_MARKER = 'data-auto-sora-cb'; // From 5.5.5
            const NATIVE_INDICATOR_SELECTOR = 'div.absolute.left-2.top-2'; // From 5.5.5
            const PROMPT_DELIMITER = '@@@@@'; // <<< ADDED: Define the delimiter

            // --- NEW: Wildcard Variables ---
            let isWildcardMode = false;     // Toggle for wildcard mode
            let wildcardTemplate = "";      // Store the current wildcard template
            let generatedPromptCount = 10;  // Default number of prompts to generate

            // --- NEW: Remix Mode Variables ---
            let isRemixMode = false;        // Toggle for remix mode
            let isWaitingForRemix = false;  // Flag to track if we're waiting for remix button to appear
            let remixObserver = null;       // Observer to watch for remix button availability
            let remixTimeoutId = null;      // Timeout for remix button waiting

            // --- NEW: Remix Mode Worker ---
            let remixModeWorker = null;
            const remixWorkerCode = `
// --- Web Worker for Aros Patcher Remix Mode ---
function workerLog(message) {
    self.postMessage({ type: 'log', message: 'Worker: ' + message });
}

let promptQueue_w = [];
let originalPromptList_w = [];
let isRunning_w = false;
let isLooping_w = false;
let currentInterval_w = 5000;
let currentTimeoutId = null;

function processNextInWorker() {
    if (!isRunning_w) {
        workerLog("Not running, stopping periodic execution.");
        if (currentTimeoutId) clearTimeout(currentTimeoutId);
        currentTimeoutId = null;
        return;
    }

    if (promptQueue_w.length === 0) {
        if (isLooping_w && originalPromptList_w.length > 0) {
            workerLog("Queue empty, looping. Resetting from original list.");
            promptQueue_w = [...originalPromptList_w];
            self.postMessage({
                type: 'queue_refilled',
                queueSize: promptQueue_w.length,
                totalInLoop: originalPromptList_w.length
            });
        } else {
            workerLog("Queue empty, not looping. Signaling finished.");
            self.postMessage({ type: 'finished' });
            isRunning_w = false;
            if (currentTimeoutId) clearTimeout(currentTimeoutId);
            currentTimeoutId = null;
            return;
        }
    }

    if (promptQueue_w.length === 0) { // Check again
        workerLog("Queue still empty after loop check. Signaling finished.");
        self.postMessage({ type: 'finished' });
        isRunning_w = false;
        if (currentTimeoutId) clearTimeout(currentTimeoutId);
        currentTimeoutId = null;
        return;
    }

    const nextPrompt = promptQueue_w.shift();
    workerLog('Processing prompt: "' + nextPrompt + '"');
    self.postMessage({
        type: 'process_prompt_in_main',
        prompt: nextPrompt,
        remainingInQueue: promptQueue_w.length,
        totalInOriginalList: originalPromptList_w.length
    });
}

self.onmessage = function(e) {
    const data = e.data;
    workerLog('Received command: ' + data.command);

    switch (data.command) {
        case 'start':
            promptQueue_w = [...(data.prompts || [])];
            originalPromptList_w = [...(data.originalPrompts || data.prompts || [])];
            isLooping_w = data.isLooping || false;
            currentInterval_w = data.interval || 5000;
            isRunning_w = true;

            workerLog('Starting. Prompts: ' + promptQueue_w.length + ', Loop: ' + isLooping_w + ', Interval: ' + currentInterval_w + 'ms');
            self.postMessage({ type: 'started', initialQueueSize: promptQueue_w.length });
            
            if (currentTimeoutId) clearTimeout(currentTimeoutId);
            processNextInWorker();
            break;

        case 'stop':
            workerLog("Stopping.");
            isRunning_w = false;
            if (currentTimeoutId) clearTimeout(currentTimeoutId);
            currentTimeoutId = null;
            promptQueue_w = [];
            originalPromptList_w = [];
            self.postMessage({ type: 'stopped' });
            break;

        case 'schedule_next_tick_ack':
            workerLog("Main thread acknowledged prompt processing. Scheduling next tick.");
            if (isRunning_w) {
                if (currentTimeoutId) clearTimeout(currentTimeoutId);
                currentTimeoutId = setTimeout(processNextInWorker, currentInterval_w);
                workerLog('Next tick scheduled in ' + currentInterval_w + 'ms.');
            } else {
                workerLog("Was asked to schedule next tick, but not running. Won't schedule.");
            }
            break;
        
        case 'update_settings':
            workerLog("Updating settings.");
            if (data.hasOwnProperty('isLooping')) {
                isLooping_w = data.isLooping;
                workerLog('Looping set to: ' + isLooping_w);
            }
            if (data.hasOwnProperty('interval')) {
                currentInterval_w = data.interval;
                workerLog('Interval set to: ' + currentInterval_w + 'ms');
            }
            break;

        default:
            workerLog('Unknown command received: ' + data.command);
            break;
    }
};
workerLog("Worker script loaded and ready.");
`;

            // --- NEW: Image Persistence Globals ---
            let persistedImages = []; // Array to store File objects for persistent pasting
            let isImagePersistenceEnabled = false; // Controlled by a checkbox
            const IMAGE_PASTE_DELAY_MS = 8000; // Delay between pasting multiple persisted images (ms) - INCREASED to match clipboard_paste_toy.js
            let isPastingSequence = false; // Flag to prevent multiple paste sequences
            let sequentialPasteTimeoutId = null; // For tracking sequential paste timeouts

            // Add a state variable to track which image we're currently using
            let currentPersistentImageIndex = 0;

            // --- NEW: Function for Visual Countdown (Moved to higher scope) ---
            function startVisualCountdown(totalSeconds) {
                const cooldownBtn = document.getElementById('sora-cooldown'); // Ensure cooldownBtn is fetched here or passed
                if (visualCountdownInterval) clearInterval(visualCountdownInterval);

                let timeRemaining = totalSeconds;
                if (cooldownBtn && cooldownBtn.style.display !== 'none') {
                    cooldownBtn.textContent = `Cooldown: ${timeRemaining}s`;
                }

                visualCountdownInterval = setInterval(() => {
                    timeRemaining--;
                    if (cooldownBtn && cooldownBtn.style.display !== 'none') {
                        if(isRunning) { // Only update if still running
                            cooldownBtn.textContent = `Cooldown: ${Math.max(0, timeRemaining)}s`;
                        } else { // Stop countdown if main process stopped
                            clearInterval(visualCountdownInterval);
                            visualCountdownInterval = null;
                        }
                    } else if (!isRunning){ // Also stop if button is hidden and not running
                        clearInterval(visualCountdownInterval);
                        visualCountdownInterval = null;
                    }
                    if (timeRemaining <= 0) { // Stop when time reaches 0
                        clearInterval(visualCountdownInterval);
                        visualCountdownInterval = null;
                    }
                }, 1000);
                log(`Visual countdown started (${totalSeconds}s). ID: ${visualCountdownInterval}`);
            }
            // --- End Visual Countdown Function ---

            // --- Logging Function ---
            function log(msg) {
                const now = new Date();
                const timestamp = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(3, '0')}.${now.getMilliseconds().toString().padStart(3, '0')}`; // Minor fix: 3 digits for seconds padding
                console.log(`[Aros Patcher v${SCRIPT_VERSION} ${timestamp}] ${msg}`);
            }

            // --- Function to remove native checkboxes (from 5.5.5) ---
            function removeNativeCheckboxes() {
                // log("Scanning and removing native checkboxes..."); // Optional: Keep if needed
                const nativeCheckboxes = document.querySelectorAll(`input.sora-image-checkbox:not([${SCRIPT_CHECKBOX_MARKER}])`);
                let removedCount = 0;
                nativeCheckboxes.forEach(checkbox => { try { checkbox.remove(); removedCount++; } catch (e) {} });
                // if (removedCount > 0) log(`Removed ${removedCount} native checkboxes.`); // Optional
            }

            // --- Function to remove native selection indicators (from 5.5.5) ---
            function removeNativeSelectionIndicators() {
                // log("Scanning and removing native selection indicators..."); // Optional
                const indicators = document.querySelectorAll(NATIVE_INDICATOR_SELECTOR);
                let removedCount = 0;
                indicators.forEach(indicator => {
                    if (indicator.querySelector('div.bg-black\\/25 div.border-2')) {
                        try { indicator.remove(); removedCount++; } catch (e) { log(`Error removing native indicator: ${e.message}`); }
                    }
                });
                // if (removedCount > 0) log(`Removed ${removedCount} native selection indicators.`); // Optional
            }

            // --- Inject CSS ---
            function injectOverlayStyles() {
                if (stylesInjected) return;
                log("Injecting CSS..."); // Keep logging
                const style = document.createElement('style');
                style.textContent = `
                    /* Overlay Styles (from 5.7) */
                    @keyframes sora-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                    .sora-overlay-spinner { border: 4px solid rgba(255, 255, 255, 0.2); border-top-color: #fff; border-radius: 50%; width: 40px; height: 40px; animation: sora-spin 1s linear infinite; margin-bottom: 25px; }
                    .sora-overlay-text-main { color: #ffffff; font-size: 1.4em; font-weight: 500; text-shadow: 0 1px 3px rgba(0,0,0,0.4); margin-bottom: 8px; }
                    .sora-overlay-text-sub { color: #e0e0e0; font-size: 0.9em; text-shadow: 0 1px 2px rgba(0,0,0,0.3); max-width: 80%; text-align: center; line-height: 1.4; }
                    /* Checkbox Visibility Fix (from 5.5.5) */
                    input.sora-image-checkbox[${SCRIPT_CHECKBOX_MARKER}] { opacity: 1 !important; }
                    /* Mode Button Styles */
                    .mode-button.mode-active { 
                        background-color: rgba(60, 130, 250, 0.3) !important; 
                        color: white !important;
                        font-weight: 500;
                    }
                    .mode-button:hover { 
                        background-color: rgba(80, 80, 90, 0.4) !important; 
                    }
                    .mode-button.mode-active:hover { 
                        background-color: rgba(60, 130, 250, 0.4) !important; 
                    }
                    /* Code styling */
                    code {
                        background: rgba(0, 0, 0, 0.3);
                        padding: 2px 4px;
                        border-radius: 3px;
                        font-family: monospace;
                        font-size: 11px;
                    }
                    #sora-wildcard-controls details {
                        user-select: none;
                    }
                    #sora-wildcard-controls ul {
                        margin-top: 8px;
                        margin-bottom: 8px;
                    }
                    #sora-wildcard-controls p {
                        margin: 8px 0;
                    }
                `;
                document.head.appendChild(style);
                stylesInjected = true;
                log("CSS injected."); // Keep logging
            }

            // --- Overlay & Scroll Lock Functions (Use 5.7 version - more robust logging/checks) ---
            function createOverlay() {
                if (pageOverlayElement) return;
                injectOverlayStyles();
                log("Creating page lock overlay element...");
                pageOverlayElement = document.createElement('div');
                pageOverlayElement.id = 'sora-page-overlay';
                pageOverlayElement.style.cssText = `
                    position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
                    background-color: rgba(0, 0, 0, 0.45); z-index: 99999990;
                    opacity: 0; transition: opacity 0.3s ease;
                    backdrop-filter: blur(3px); -webkit-backdrop-filter: blur(3px);
                    display: flex; flex-direction: column; justify-content: center;
                    align-items: center; text-align: center; color: white;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                    /* Start hidden */
                    display: none;
                `;
                pageOverlayElement.innerHTML = `
                    <div class="sora-overlay-spinner"></div>
                    <div class="sora-overlay-text-main">Aros Patcher is running</div>
                    <div class="sora-overlay-text-sub">Please use Aros in another tab to continue.</div>
                `;
                document.body.appendChild(pageOverlayElement);
                log("Page lock overlay appended to body with content.");
            }

            function showOverlay() {
                if (!pageOverlayElement) createOverlay();
                // Only proceed if the overlay isn't already fully visible
                if (pageOverlayElement && pageOverlayElement.style.opacity !== '1') {
                    log("Showing page lock overlay and locking scroll.");
                    originalBodyOverflow = document.body.style.overflow;
                    originalHtmlOverflow = document.documentElement.style.overflow;
                    document.body.style.overflow = 'hidden';
                    document.documentElement.style.overflow = 'hidden';

                    pageOverlayElement.style.display = 'flex'; // Set display before transition
                    void pageOverlayElement.offsetWidth; // Force reflow
                    pageOverlayElement.style.opacity = '1';
                }
            }

            function hideOverlay() {
                // Only proceed if the overlay exists and is currently visible or fading out
                if (pageOverlayElement && pageOverlayElement.style.display !== 'none') {
                    // Check if scroll is currently locked by this script
                    const bodyLocked = document.body.style.overflow === 'hidden';
                    const htmlLocked = document.documentElement.style.overflow === 'hidden';

                    if (pageOverlayElement.style.opacity !== '0') {
                        log("Hiding page lock overlay.");
                        pageOverlayElement.style.opacity = '0';
                    }

                    // Unlock scroll immediately if locked
                    if (bodyLocked) {
                        document.body.style.overflow = originalBodyOverflow;
                    }
                    if (htmlLocked) {
                        document.documentElement.style.overflow = originalHtmlOverflow;
                    }
                    // Clear stored values only after restoring
                    originalBodyOverflow = '';
                    originalHtmlOverflow = '';


                    // Set display to none after the transition finishes
                    setTimeout(() => {
                        // Check again in case hideOverlay was called multiple times quickly
                        if (pageOverlayElement && pageOverlayElement.style.opacity === '0') {
                        pageOverlayElement.style.display = 'none';
                        log("Overlay display set to none.");
                        }
                    }, 300);
                } else {
                    // Ensure scroll is unlocked even if overlay wasn't visible
                    if (document.body.style.overflow === 'hidden') {
                        log("Scroll was locked, unlocking as overlay hide is requested (overlay not visible).");
                        document.body.style.overflow = originalBodyOverflow; // Attempt restore
                        originalBodyOverflow = '';
                    }
                    if (document.documentElement.style.overflow === 'hidden') {
                        document.documentElement.style.overflow = originalHtmlOverflow; // Attempt restore
                        originalHtmlOverflow = '';
                    }
                }
            }
            // --- End Overlay & Scroll Lock Functions ---

            // --- Utility Functions (Keep 5.7 versions - identical) ---
            function getTimestamp() { const now = new Date(); const pad = n => String(n).padStart(2, '0'); return `${pad(now.getDate())}${pad(now.getMonth() + 1)}${String(now.getFullYear()).slice(2)}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`; }
            function triggerDownload(blob, filename) { const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = filename; document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(link.href); log(`Download triggered: ${filename} (Size: ${(blob.size / 1024).toFixed(1)} KB)`); }

            // --- NEW HELPER: Set React Textarea Value ---
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
            // --- END NEW HELPER ---

            // --- UI Update Functions ---
            // Use 5.5.5 version - it includes the SCRIPT_CHECKBOX_MARKER logic
            function updateImageSelection() {
                log("Updating image selections (Library/Task compatible)..."); // Modified log
                let changedCount = 0;
                let initialSelectedSize = selectedImageUrls.size;
                try {
                    const filterHorizState = document.getElementById('sora-select-horizontal')?.checked ?? false;
                    const filterVertState = document.getElementById('sora-select-vertical')?.checked ?? false;
                    const filterSquareState = document.getElementById('sora-select-square')?.checked ?? false;
                    const deselectAll = !filterHorizState && !filterVertState && !filterSquareState;
                    // Combine selectors to cover both Library and Task pages
                    document.querySelectorAll(`div[data-index], div[style*="top:"][style*="left:"], .group\\/tile`).forEach(gridItem => {
                        const checkbox = gridItem.querySelector(`input.sora-image-checkbox[${SCRIPT_CHECKBOX_MARKER}]`);
                        const img = gridItem.querySelector("img"); // General image selector within the item
                        if (!checkbox || !img) return;

                        // Skip task prompt tiles explicitly if they somehow got a checkbox
                        const anchor = gridItem.querySelector('a');
                        if (anchor && anchor.getAttribute('href')?.startsWith('/t/task_')) {
                            return;
                        }

                        let shouldBeChecked = checkbox.checked;
                        const imgSrc = img.src;
                        if (img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
                            const imgWidth = img.naturalWidth;
                            const imgHeight = img.naturalHeight;
                            const isHoriz = imgWidth > imgHeight;
                            const isVert = imgHeight > imgWidth;
                            const isSquare = Math.abs(imgWidth - imgHeight) <= 1; // Tolerance for square
                            if (deselectAll) {
                                shouldBeChecked = false;
                            } else {
                                shouldBeChecked = (filterHorizState && isHoriz) || (filterVertState && isVert) || (filterSquareState && isSquare);
                            }
                            if (checkbox.checked !== shouldBeChecked) {
                                checkbox.checked = shouldBeChecked;
                                changedCount++;
                            }
                            if (shouldBeChecked) selectedImageUrls.add(imgSrc); else selectedImageUrls.delete(imgSrc);
                        } else if (!img.complete) { // If image hasn't loaded, trust the current checkbox state for the Set
                            if (checkbox.checked) selectedImageUrls.add(imgSrc); else selectedImageUrls.delete(imgSrc);
                        } else { // Image loaded but failed (e.g., 0 dimensions)
                            if (checkbox.checked) { checkbox.checked = false; changedCount++; }
                            selectedImageUrls.delete(imgSrc);
                        }
                    });
                    updateSelectedCount();
                    log(`Selection updated via filters. Changed: ${changedCount}, Total: ${selectedImageUrls.size}.`);
                } catch (e) {
                    log("ERROR updating image selection:"); console.error(e);
                }
            }

            // Use 5.7 version - identical but good practice
            function toggleCooldownInputState() { const autoCheckbox = document.getElementById('sora-auto-submit-checkbox'); const cooldownInput = document.getElementById('sora-cooldown-time'); const cooldownLabel = cooldownInput?.closest('div')?.querySelector('label'); if (!autoCheckbox || !cooldownInput) return; const isAuto = autoCheckbox.checked; if (isAuto) { cooldownInput.disabled = true; cooldownInput.style.opacity = '0.5'; cooldownInput.style.cursor = 'not-allowed'; if (cooldownLabel) cooldownLabel.style.opacity = '0.5'; } else { cooldownInput.disabled = false; cooldownInput.style.opacity = '1'; cooldownInput.style.cursor = 'auto'; if (cooldownLabel) cooldownLabel.style.opacity = '1'; } }

            // Use 5.7 version - includes Loop logic
            function updateStartButtonPromptCount() {
                const textarea = document.getElementById('sora-input');
                const startButton = document.getElementById('sora-start');
                const loopCheckbox = document.getElementById('sora-loop-checkbox');

                // Add checks for all elements
                if (!textarea || !startButton || !loopCheckbox) return;

                const isLoopChecked = loopCheckbox.checked;

                if (isLoopChecked) {
                    startButton.textContent = `▶ Start (∞)`;
                } else {
                    // Split by the delimiter, trim each resulting prompt, filter out empty ones
                    const prompts = textarea.value.split(PROMPT_DELIMITER).map(x => x.trim()).filter(Boolean);
                    const count = prompts.length;
                    startButton.textContent = `▶ Start (${count})`;
                }
            }

            // Use 5.7 version - identical
            function updateSelectedCount() { const count = selectedImageUrls.size; try { const btnText = document.getElementById("sora-download-text"); const btn = document.getElementById("sora-download-images"); const icon = document.getElementById("sora-download-icon"); const errorEl = document.getElementById("sora-download-error"); if (btnText && btn && !isDownloading) { btnText.textContent = `Download (${count})`; btn.disabled = (count === 0); if (icon) icon.style.display = 'inline'; if (errorEl) errorEl.textContent = ''; } else if (btn) { btn.disabled = true; } } catch (e) { log("ERROR updating selected count UI:"); console.error(e); } const btn = document.getElementById("sora-download-images"); if (btn && !isDownloading) { btn.disabled = (selectedImageUrls.size === 0); } }

            // --- NEW Helper for Image Persistence UI ---
            function updatePersistedImageCountUI() {
                const countEl = document.getElementById('sora-persisted-count');
                if (countEl) {
                    countEl.textContent = `(${persistedImages.length} persisted)`;
                }
                
                // Update preview gallery visibility
                const previewEl = document.getElementById('sora-persisted-preview');
                if (previewEl) {
                    if (persistedImages.length > 0) {
                        previewEl.style.display = 'flex';
                        const emptyMsg = previewEl.querySelector('.sora-empty-gallery');
                        if (emptyMsg) emptyMsg.style.display = 'none';
                    } else {
                        const emptyMsg = previewEl.querySelector('.sora-empty-gallery');
                        if (emptyMsg) emptyMsg.style.display = 'block';
                    }
                }
            }

            function handlePersistImagesToggle(event) {
                isImagePersistenceEnabled = event.target.checked;
                log(`Image persistence toggled to: ${isImagePersistenceEnabled}`);
                
                // Show/hide the preview gallery based on persistence setting
                const previewEl = document.getElementById('sora-persisted-preview');
                if (previewEl) {
                    if (isImagePersistenceEnabled && persistedImages.length > 0) {
                        previewEl.style.display = 'flex';
                    } else if (!isImagePersistenceEnabled) {
                        previewEl.style.display = 'none';
                    }
                }
            }
            
            // NEW: Function to create and add an image thumbnail to the preview gallery
            function addImageToPreviewGallery(imageFile, index) {
                const previewEl = document.getElementById('sora-persisted-preview');
                if (!previewEl) return;
                
                // Create a container for the thumbnail
                const thumbContainer = document.createElement('div');
                thumbContainer.className = 'sora-image-thumb';
                thumbContainer.dataset.index = index;
                thumbContainer.style.cssText = 'position: relative; width: 40px; height: 40px; border-radius: 4px; overflow: hidden; background: rgba(0,0,0,0.3);';
                
                // Create the image element
                const img = document.createElement('img');
                img.style.cssText = 'width: 100%; height: 100%; object-fit: cover;';
                img.title = imageFile.name;
                
                // Create a delete button
                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'sora-thumb-delete';
                deleteBtn.innerHTML = '×';
                deleteBtn.style.cssText = 'position: absolute; top: 0; right: 0; background: rgba(0,0,0,0.6); color: white; border: none; width: 16px; height: 16px; line-height: 14px; font-size: 14px; font-weight: bold; cursor: pointer; border-radius: 0 0 0 4px;';
                deleteBtn.title = 'Remove this image';
                
                // Add event listener to the delete button
                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    removePersistedImage(parseInt(thumbContainer.dataset.index));
                });
                
                // Set image source from the File object
                const reader = new FileReader();
                reader.onload = (e) => {
                    img.src = e.target.result;
                };
                reader.readAsDataURL(imageFile);
                
                // Add elements to the DOM
                thumbContainer.appendChild(img);
                thumbContainer.appendChild(deleteBtn);
                previewEl.appendChild(thumbContainer);
                
                // Make sure the empty message is hidden
                const emptyMsg = previewEl.querySelector('.sora-empty-gallery');
                if (emptyMsg) emptyMsg.style.display = 'none';
                
                // Show the preview gallery
                previewEl.style.display = 'flex';
            }
            
            // NEW: Function to remove an image from persistedImages and update the UI
            function removePersistedImage(index) {
                if (index < 0 || index >= persistedImages.length) return;
                
                log(`Removing persisted image at index ${index}: ${persistedImages[index].name}`);
                
                // Remove the image from the array
                persistedImages.splice(index, 1); // Remove 1 element at index
                
                // Reset current index if needed
                if (currentPersistentImageIndex >= persistedImages.length) {
                    currentPersistentImageIndex = 0;
                }
                
                // Update the UI
                refreshImagePreviewGallery();
                updatePersistedImageCountUI();
            }
            
            // NEW: Function to refresh the entire image preview gallery
            function refreshImagePreviewGallery() {
                const previewEl = document.getElementById('sora-persisted-preview');
                if (!previewEl) return;
                
                // Clear current thumbnails
                const currentThumbs = previewEl.querySelectorAll('.sora-image-thumb');
                currentThumbs.forEach(thumb => thumb.remove());
                
                // Recreate all thumbnails
                persistedImages.forEach((imageFile, index) => {
                    addImageToPreviewGallery(imageFile, index);
                });
                
                // Show/hide empty message
                const emptyMsg = previewEl.querySelector('.sora-empty-gallery');
                if (emptyMsg) {
                    emptyMsg.style.display = persistedImages.length === 0 ? 'block' : 'none';
                }
                
                // Show/hide the gallery
                if (persistedImages.length > 0 && isImagePersistenceEnabled) {
                    previewEl.style.display = 'flex';
                } else {
                    previewEl.style.display = 'none';
                }
            }

            // Function to paste a single persisted image - inspired by clipboard_paste_toy.js
            async function pasteSinglePersistedImage() {
                if (isPastingSequence) {
                    log("Already pasting, please wait");
                    return;
                }
                
                if (persistedImages.length === 0) {
                    alert('No persisted images available.');
                    return;
                }
                
                // Use modulo to cycle through images
                if (currentPersistentImageIndex >= persistedImages.length) {
                    currentPersistentImageIndex = 0;
                }
                
                isPastingSequence = true;
                
                try {
                    const textarea = document.querySelector('textarea[placeholder*="Describe"], textarea.flex.w-full');
                    if (!textarea) {
                        alert('Aros textarea not found. Make sure you are on a generation page.');
                        isPastingSequence = false;
                        return;
                    }
                    
                    // Remember original text
                    const originalText = textarea.value || '';
                    
                    // Focus the textarea (important!)
                    textarea.focus();
                    await new Promise(resolve => setTimeout(resolve, 500));
                    
                    // Get current image
                    const imageFile = persistedImages[currentPersistentImageIndex];
                    log(`Pasting single image ${currentPersistentImageIndex + 1}/${persistedImages.length}: ${imageFile.name}`);
                    
                    // Create clipboard data
                    const dt = new DataTransfer();
                    dt.items.add(imageFile);
                    
                    // Create and dispatch paste event
                    const pasteEvent = new ClipboardEvent('paste', {
                        bubbles: true,
                        cancelable: true,
                        clipboardData: dt
                    });
                    
                    // Dispatch the event
                    textarea.dispatchEvent(pasteEvent);
                    log(`Pasted image ${currentPersistentImageIndex + 1}/${persistedImages.length}`);
                    
                    // Increment for next time
                    currentPersistentImageIndex = (currentPersistentImageIndex + 1) % persistedImages.length;
                }
                catch (e) {
                    log(`ERROR: Failed to paste image: ${e.message}`);
                }
                finally {
                    // Wait a bit before releasing the lock to ensure paste completes
                    setTimeout(() => {
                        isPastingSequence = false;
                    }, 1000);
                }
            }

            // Stop sequential paste process
            function stopSequentialPaste() {
                if (sequentialPasteTimeoutId) {
                    clearTimeout(sequentialPasteTimeoutId);
                    sequentialPasteTimeoutId = null;
                    log("Sequential paste stopped");
                }
            }

            // Function to manually paste all persisted images to current Aros prompt - using same approach as submitPrompt
            async function handlePasteAllImages() {
                log("Paste All Images button clicked");
                
                if (persistedImages.length === 0) {
                    log("No persisted images to paste");
                    alert("No images have been persisted. Paste images into the prompt textarea first.");
                    return;
                }
                
                if (isPastingSequence) {
                    log("Already pasting a sequence, please wait");
                    alert("Already pasting images. Please wait for the current sequence to complete.");
                    return;
                }
                
                // Stop any existing sequence
                stopSequentialPaste();
                
                // Create a fake button for simulation
                const pasteAllButton = document.getElementById('sora-paste-all-images');
                if (pasteAllButton) {
                    pasteAllButton.disabled = true;
                    pasteAllButton.style.opacity = '0.6';
                }
                
                try {
                    // Reset to start with the first image
                    currentPersistentImageIndex = 0;
                    
                    // For multiple images, we need to paste them one by one with delays
                    // but WAIT until all are done before proceeding
                    
                    if (persistedImages.length === 1) {
                        // For a single image, just paste it directly
                        log(`Pasting single persisted image manually`);
                        await pasteSinglePersistedImage();
                    } else {
                        // For multiple images, paste them sequentially with waiting
                        log(`Manually pasting ${persistedImages.length} images sequentially...`);
                        
                        // First image immediately
                        await pasteSinglePersistedImage();
                        
                        // Then remaining images with delays in between
                        for (let i = 1; i < persistedImages.length; i++) {
                            log(`Waiting ${IMAGE_PASTE_DELAY_MS}ms before pasting image ${i+1}/${persistedImages.length}...`);
                            await new Promise(resolve => setTimeout(resolve, IMAGE_PASTE_DELAY_MS));
                            
                            await pasteSinglePersistedImage();
                        }
                        
                        log(`Completed manual pasting of ${persistedImages.length} images sequentially`);
                    }
                } catch (error) {
                    log(`Error during manual image pasting: ${error.message}`);
                } finally {
                    // Always re-enable the button
                    if (pasteAllButton) {
                        pasteAllButton.disabled = false;
                        pasteAllButton.style.opacity = '1';
                    }
                }
            }

            // --- UI Creation ---
            function createUI() {
                log("Creating main UI...");
                const wrapper = document.createElement('div'); wrapper.id = 'sora-auto-ui';
                wrapper.style.cssText = `position: fixed; bottom: 15px; left: 20px; background: rgba(35, 35, 40, 0.65); backdrop-filter: blur(10px) saturate(180%); -webkit-backdrop-filter: blur(10px) saturate(180%); padding: 20px 20px 15px 20px; border-radius: 16px; z-index: 99999999; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.37); width: 330px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; border: 1px solid rgba(255, 255, 255, 0.12); color: #e0e0e0; transition: opacity 0.3s ease, transform 0.3s ease; opacity: 1; transform: scale(1); display: block; pointer-events: auto;`;

                // --- UPDATED textarea placeholder text ---
                const placeholderText = isWildcardMode ? 
                    `Enter a template with wildcards like __color__ and variations like [option1, option2].\nExamples:\nA __animal__ in a __location__ at __time__\nA [red, blue, green] __object__ with __material__ texture` :
                    isRemixMode ?
                    `Enter prompts for remixing existing generations.\nExample:\ngenerate a wolf on the same style\n${PROMPT_DELIMITER}\nmake it more colorful\n${PROMPT_DELIMITER}\nadd a forest background...\nPress 'E' to trigger remix manually.` :
                    `Enter prompts, separated by a line containing ${PROMPT_DELIMITER}\nExample:\nPrompt 1 Line 1\nPrompt 1 Line 2\n${PROMPT_DELIMITER}\nPrompt 2\n${PROMPT_DELIMITER}\nPrompt 3...\nEnable 'Loop' to repeat.\nPaste images here (enable 'Persist Images' to reuse).`;

                // --- UPDATED wrapper innerHTML to include wildcard mode switch ---
                wrapper.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;"> <h3 style="margin: 0; font-size: 17px; display: flex; align-items: center; gap: 10px; color: #ffffff; font-weight: 500;"> <img src="https://www.svgrepo.com/show/306500/openai.svg" width="22" height="22" style="filter: invert(1);" alt="OpenAI Logo"/> Aros Patcher <span style="font-size: 9px; opacity: 0.6; font-weight: 300; margin-left: -5px;">build ${SCRIPT_VERSION}</span> </h3> <button id="sora-close" style=" background: rgba(80, 80, 80, 0.4); backdrop-filter: blur(5px) saturate(150%); -webkit-backdrop-filter: blur(5px) saturate(150%); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; padding: 2px 6px; font-size: 16px; color: rgba(255, 255, 255, 0.7); cursor: pointer; transition: background-color 0.2s ease, color 0.2s ease, border-color 0.2s ease; " onmouseover="this.style.backgroundColor='rgba(100, 100, 100, 0.6)'; this.style.color='rgba(255, 255, 255, 0.9)'; this.style.borderColor='rgba(255, 255, 255, 0.15)'" onmouseout="this.style.backgroundColor='rgba(80, 80, 80, 0.4)'; this.style.color='rgba(255, 255, 255, 0.7)'; this.style.borderColor='rgba(255, 255, 255, 0.1)'" title="Close Panel">✕</button> </div>
                    
                    <!-- Mode Switch -->
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                        <label style="font-size: 13px; color: #bdbdbd; font-weight: 400; white-space: nowrap;">Input Mode:</label>
                        <div style="display: flex; background: rgba(0, 0, 0, 0.25); border-radius: 10px; overflow: hidden; border: 1px solid rgba(255, 255, 255, 0.1);">
                            <button id="sora-mode-normal" class="mode-button mode-active" style="padding: 6px 8px; font-size: 11px; border: none; cursor: pointer; background: transparent; color: #e0e0e0; transition: background-color 0.2s ease;">Normal</button>
                            <button id="sora-mode-wildcard" class="mode-button" style="padding: 6px 8px; font-size: 11px; border: none; cursor: pointer; background: transparent; color: #e0e0e0; transition: background-color 0.2s ease;">Wildcard</button>
                            <button id="sora-mode-remix" class="mode-button" style="padding: 6px 8px; font-size: 11px; border: none; cursor: pointer; background: transparent; color: #e0e0e0; transition: background-color 0.2s ease;">Remix</button>
                        </div>
                    </div>
                    
                    <label id="textarea-label" style="font-size: 13px; color: #bdbdbd; font-weight: 400; margin-bottom: 5px; display: block;">Enter prompt list (separated by ${PROMPT_DELIMITER}):</label> 
                    <textarea rows="5" id="sora-input" placeholder="${placeholderText}" style="width: 100%; padding: 12px; border: 1px solid rgba(255, 255, 255, 0.1); background: rgba(0, 0, 0, 0.25); border-radius: 10px; resize: vertical; font-size: 12px; color: #e0e0e0; margin-top: 0px; margin-bottom: 12px; box-sizing: border-box; min-height: 80px; overflow-y: hidden;"></textarea>

                    <!-- === Wildcard Controls (initially hidden) === -->
                    <div id="sora-wildcard-controls" style="display: none; margin-bottom: 15px;">
                        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px;">
                            <label style="font-size: 13px; color: #bdbdbd; font-weight: 400; white-space: nowrap;">Generate:</label>
                            <input id="sora-prompt-count" type="number" min="1" max="100" value="${generatedPromptCount}" style="width: 60px; padding: 8px 10px; border: 1px solid rgba(255, 255, 255, 0.1); background: rgba(0, 0, 0, 0.25); color: #e0e0e0; border-radius: 10px; font-size: 14px; box-sizing: border-box;" title="Number of prompts to generate"/>
                            <label style="font-size: 13px; color: #bdbdbd; font-weight: 400; white-space: nowrap;">prompts</label>
                            <button id="sora-load-example" style="background: rgba(80, 80, 80, 0.5); color: white; padding: 6px 12px; border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 10px; cursor: pointer; margin-left: auto; font-size: 12px; margin-right: 8px;">Load Example</button>
                            <button id="sora-generate-prompts" style="background: rgba(60, 130, 250, 0.5); color: white; padding: 6px 12px; border: 1px solid rgba(60, 130, 250, 0.6); border-radius: 10px; cursor: pointer; font-size: 12px;">Generate</button>
                        </div>
                        
                        <div style="background: rgba(60, 130, 250, 0.15); padding: 10px; border-radius: 10px; margin-bottom: 12px; border: 1px solid rgba(60, 130, 250, 0.3);">
                            <p style="margin: 0 0 8px 0; font-size: 12px; color: #e0e0e0;">
                                <b>How wildcards work:</b> Each <code>__wildcard__</code> is replaced with a random value from its category.
                            </p>
                            <p style="margin: 0; font-size: 12px; color: #e0e0e0;">
                                <b>How variations work:</b> Each <code>[option1, option2]</code> creates multiple prompts with each option.
                            </p>
                        </div>
                        
                        <details style="margin-bottom: 10px; color: #bdbdbd; font-size: 12px;">
                            <summary style="cursor: pointer; padding: 5px 0;">Available Wildcards</summary>
                            <div style="background: rgba(0, 0, 0, 0.2); padding: 8px; border-radius: 8px; margin-top: 5px; max-height: 120px; overflow-y: auto;">
                                <p>Use the format <code>__category__</code> for wildcards:</p>
                                <ul style="margin: 5px 0; padding-left: 20px; columns: 2;">
                                    <li>__color__</li>
                                    <li>__animal__</li>
                                    <li>__object__</li>
                                    <li>__material__</li>
                                    <li>__emotion__</li>
                                    <li>__weather__</li>
                                    <li>__time__</li>
                                    <li>__location__</li>
                                    <li>__style__</li>
                                    <li>__lighting__</li>
                                    <li>__camera__</li>
                                </ul>
                                <p>Use brackets for variations: <code>[option1, option2]</code></p>
                                <p>Example: "A __animal__ in a __location__ during __time__"</p>
                            </div>
                        </details>
                    </div>

                    <!-- === Copied from v5.7: Cooldown, Loop, Auto Row - Cooldown width increased === -->
                    <div id="sora-mode-controls" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; gap: 15px;">
                        <!-- Cooldown Group -->
                        <div style="display: flex; align-items: center; gap: 5px;">
                            <label style="font-size: 13px; color: #bdbdbd; font-weight: 400; white-space: nowrap; transition: opacity 0.3s ease;">⏱ Cooldown:</label>
                            <input id="sora-cooldown-time" type="number" min="1" value="${cooldownTime}" style="width: 77px; padding: 8px 10px; border: 1px solid rgba(255, 255, 255, 0.1); background: rgba(0, 0, 0, 0.25); color: #e0e0e0; border-radius: 10px; font-size: 14px; box-sizing: border-box; transition: opacity 0.3s ease, cursor 0.3s ease;" title="Wait time between prompts when 'Auto' is off"/>
                        </div>
                        <!-- Loop & Auto Group -->
                        <div style="display: flex; align-items: center; gap: 15px;">
                            <label title="Repeat the entire prompt list indefinitely" style="display: flex; align-items: center; gap: 7px; font-size: 13px; color: #d0d0d0; cursor: pointer;">
                                <input type="checkbox" id="sora-loop-checkbox" style="transform: scale(1.1); cursor: pointer; accent-color: #4a90e2;"/> Loop
                            </label>
                            <label title="Automatically submit next prompt 1 second after generation finishes (or after 5 minutes if stuck)" style="display: flex; align-items: center; gap: 7px; font-size: 13px; color: #d0d0d0; cursor: pointer;">
                                <input type="checkbox" id="sora-auto-submit-checkbox" style="transform: scale(1.1); cursor: pointer; accent-color: #4a90e2;"/> Auto
                            </label>
                        </div>
                    </div>
                    <!-- === END Copied Row === -->

                    <!-- === NEW: Image Persistence Row === -->
                    <div id="sora-persistence-controls" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px; margin-top: -5px; gap: 15px;">
                        <label title="If checked, any images you paste into the prompt list will be re-pasted for every subsequent prompt in the current run." style="display: flex; align-items: center; gap: 7px; font-size: 13px; color: #d0d0d0; cursor: pointer;">
                            <input type="checkbox" id="sora-persist-images-checkbox" style="transform: scale(1.1); cursor: pointer; accent-color: #4a90e2;"/> 📷 Persist Images
                        </label>
                        <button id="sora-paste-all-images" title="Paste all persisted images into the current Aros prompt" style="background: rgba(60, 130, 250, 0.5); color: white; padding: 4px 10px; border: 1px solid rgba(60, 130, 250, 0.6); border-radius: 8px; cursor: pointer; font-size: 12px; white-space: nowrap;">Paste All Images</button>
                        <span id="sora-persisted-count" style="font-size: 12px; color: #bdbdbd; white-space: nowrap;">(0 persisted)</span>
                    </div>
                    
                    <!-- NEW: Image Preview Gallery -->
                    <div id="sora-persisted-preview" style="display: none; flex-wrap: wrap; gap: 8px; margin-bottom: 15px; max-height: 100px; overflow-y: auto; background: rgba(0, 0, 0, 0.2); padding: 8px; border-radius: 8px; align-items: flex-start; min-height: 32px;">
                        <!-- Thumbnail previews will be added here dynamically -->
                        <div class="sora-empty-gallery" style="width: 100%; text-align: center; color: #888; font-size: 12px; padding: 5px;">
                            No images persisted yet. Paste an image into the text area above.
                        </div>
                    </div>
                    <!-- END: Image Preview Gallery -->
                    
                    <!-- === END Image Persistence Row === -->

                    <div style="display: flex; gap: 10px; margin-bottom: 20px;"> <button id="sora-start" style=" flex: 1; background: rgba(60, 130, 250, 0.5); backdrop-filter: blur(5px) saturate(150%); -webkit-backdrop-filter: blur(5px) saturate(150%); color: white; padding: 10px; border: 1px solid rgba(60, 130, 250, 0.6); border-radius: 10px; cursor: pointer; font-weight: 500; transition: background-color 0.2s ease, border-color 0.2s ease; ">▶ Start (0)</button> <button id="sora-clear" style=" flex: 1; background: rgba(80, 80, 80, 0.5); backdrop-filter: blur(5px) saturate(150%); -webkit-backdrop-filter: blur(5px) saturate(150%); color: #d0d0d0; padding: 10px; border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 10px; cursor: pointer; transition: background-color 0.2s ease, border-color 0.2s ease; " onmouseover="this.style.backgroundColor='rgba(100, 100, 100, 0.6)'; this.style.borderColor='rgba(255, 255, 255, 0.2)'" onmouseout="this.style.backgroundColor='rgba(80, 80, 80, 0.5)'; this.style.borderColor='rgba(255, 255, 255, 0.15)'">🗑️ Clear</button> </div>
                    <hr style="border: none; border-top: 1px solid rgba(255, 255, 255, 0.1); margin: 18px 0;" />
                    <div style="font-size: 13px; color: #bdbdbd; margin-bottom: 12px; font-weight: 400;">Select images to download:</div> <div style="display: flex; gap: 18px; margin-bottom: 15px; flex-wrap: wrap; justify-content: flex-start; align-items: center;"> <label title="Select images wider than tall" style="display: flex; align-items: center; gap: 7px; font-size: 13px; color: #d0d0d0; cursor: pointer;"> <input type="checkbox" id="sora-select-horizontal" style="transform: scale(1.1); cursor: pointer; accent-color: #4a90e2;" /> Landscape </label> <label title="Select images taller than wide" style="display: flex; align-items: center; gap: 7px; font-size: 13px; color: #d0d0d0; cursor: pointer;"> <input type="checkbox" id="sora-select-vertical" style="transform: scale(1.1); cursor: pointer; accent-color: #4a90e2;" /> Portrait </label> <label title="Select images with equal width and height" style="display: flex; align-items: center; gap: 7px; font-size: 13px; color: #d0d0d0; cursor: pointer;"> <input type="checkbox" id="sora-select-square" style="transform: scale(1.1); cursor: pointer; accent-color: #4a90e2;" /> Square </label> </div>
                    <hr style="border: none; border-top: 1px solid rgba(255, 255, 255, 0.08); margin: 18px 0;" />
                    <div style="font-size: 13px; color: #bdbdbd; margin-bottom: 10px; font-weight: 400;">Crop option for download:</div> <div id="sora-crop-options" style="display: flex; flex-direction: row; flex-wrap: wrap; gap: 15px; margin-bottom: 15px;"> <label style="display: flex; align-items: center; gap: 5px; font-size: 13px; color: #d0d0d0; cursor: pointer;"> <input type="radio" name="sora-crop-option" value="none" checked style="cursor: pointer; accent-color: #4a90e2; transform: scale(1.1);" /> Original </label> <label style="display: flex; align-items: center; gap: 5px; font-size: 13px; color: #d0d0d0; cursor: pointer;"> <input type="radio" name="sora-crop-option" value="16:9" style="cursor: pointer; accent-color: #4a90e2; transform: scale(1.1);" /> 16:9 </label> <label style="display: flex; align-items: center; gap: 5px; font-size: 13px; color: #d0d0d0; cursor: pointer;"> <input type="radio" name="sora-crop-option" value="9:16" style="cursor: pointer; accent-color: #4a90e2; transform: scale(1.1);" /> 9:16 </label> <label style="display: flex; align-items: center; gap: 5px; font-size: 13px; color: #d0d0d0; cursor: pointer;"> <input type="radio" name="sora-crop-option" value="1:1" style="cursor: pointer; accent-color: #4a90e2; transform: scale(1.1);" /> 1:1 </label> </div>
                    <div style="display: flex; gap: 10px; margin-top: 20px; align-items: stretch;"> <button id="sora-download-images" style=" flex-grow: 1; background: rgba(46, 160, 67, 0.5); backdrop-filter: blur(5px) saturate(150%); -webkit-backdrop-filter: blur(5px) saturate(150%); color: white; padding: 11px; border: 1px solid rgba(46, 160, 67, 0.6); border-radius: 10px; cursor: pointer; font-size: 14px; display: flex; align-items: center; justify-content: center; gap: 8px; transition: background-color 0.2s ease, border-color 0.2s ease, opacity 0.2s ease; font-weight: 500; " onmouseover="if(!this.disabled) { this.style.backgroundColor='rgba(46, 160, 67, 0.7)'; this.style.borderColor='rgba(46, 160, 67, 0.8)'; }" onmouseout="if(!this.disabled) { this.style.backgroundColor='rgba(46, 160, 67, 0.5)'; this.style.borderColor='rgba(46, 160, 67, 0.6)'; }"> <svg id="sora-download-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-download" viewBox="0 0 16 16" style="display: inline;"> <path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5"/> <path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708z"/> </svg> <span id="sora-download-text">Download (0)</span> </button> <button id="sora-find-similar-button" title="Activate find similar image mode" style=" flex-shrink: 0; background: rgba(80, 80, 90, 0.5); backdrop-filter: blur(5px) saturate(150%); -webkit-backdrop-filter: blur(5px) saturate(150%); color: white; padding: 11px 14px; border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 10px; cursor: pointer; font-size: 14px; display: flex; align-items: center; justify-content: center; transition: background-color 0.2s ease, border-color 0.2s ease; " onmouseover="if(!this.classList.contains('active')) { this.style.backgroundColor='rgba(100, 100, 110, 0.6)'; this.style.borderColor='rgba(255, 255, 255, 0.2)'; }" onmouseout="if(!this.classList.contains('active')) { this.style.backgroundColor='rgba(80, 80, 90, 0.5)'; this.style.borderColor='rgba(255, 255, 255, 0.15)'; }"> <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-cursor-fill" viewBox="0 0 16 16"> <path d="M14.082 2.182a.5.5 0 0 1 .103.557L8.528 15.467a.5.5 0 0 1-.917-.007L5.57 10.694.803 8.652a.5.5 0 0 1-.006-.916l12.728-5.657a.5.5 0 0 1 .556.103z"/> </svg> </button> </div>
                    <style> #sora-download-images:disabled { background: rgba(80, 80, 80, 0.3) !important; border-color: rgba(255, 255, 255, 0.08) !important; color: rgba(255, 255, 255, 0.4) !important; backdrop-filter: blur(2px) saturate(100%); -webkit-backdrop-filter: blur(2px) saturate(100%); opacity: 0.6; cursor: not-allowed; } #sora-find-similar-button.active { background-color: rgba(60, 130, 250, 0.65) !important; border-color: rgba(60, 130, 250, 0.8) !important; } 
                    .sora-thumb-delete:hover { background: rgba(255, 50, 50, 0.8) !important; } </style>
                    <div id="sora-download-progress" style="display: none;"></div>
                    <div id="sora-download-error" style="font-size: 11px; color: #ff8a8a; text-align: center; margin-top: 5px; font-weight: 400;"></div>
                `;
                
                document.body.appendChild(wrapper);
                log("Main UI elements appended to body.");

                // Add event listeners for wildcard mode
                document.getElementById('sora-mode-normal').addEventListener('click', () => {
                    toggleInputMode('normal');
                });
                
                document.getElementById('sora-mode-wildcard').addEventListener('click', () => {
                    toggleInputMode('wildcard');
                });

                document.getElementById('sora-mode-remix').addEventListener('click', () => {
                    toggleInputMode('remix');
                });

                document.getElementById('sora-generate-prompts').addEventListener('click', handleGeneratePrompts);
                document.getElementById('sora-load-example').addEventListener('click', handleLoadExample);

                // Event Listeners & Drag Logic (Use 5.7 version - includes interactive check)
                let isDragging = false; let offsetX, offsetY; function dragMouseDown(e) { if (pageOverlayElement && pageOverlayElement.style.display !== 'none') return; if (e.button !== 0) return; const targetTagName = e.target.tagName.toLowerCase(); const isInteractive = ['input', 'button', 'textarea', 'svg', 'span', 'label', 'img'].includes(targetTagName) || e.target.closest('button, input, textarea, a, label[style*="cursor: pointer"], img'); if (isInteractive) { return; } log("Drag mouse down started on UI panel."); isDragging = true; wrapper.style.cursor = 'grabbing'; const rect = wrapper.getBoundingClientRect(); offsetX = e.clientX - rect.left; offsetY = e.clientY - rect.top; wrapper.style.bottom = 'auto'; wrapper.style.top = `${rect.top}px`; wrapper.style.left = `${rect.left}px`; document.addEventListener('mousemove', elementDrag); document.addEventListener('mouseup', closeDragElement); e.preventDefault(); } function elementDrag(e) { if (isDragging) { e.preventDefault(); const newTop = e.clientY - offsetY; const newLeft = e.clientX - offsetX; wrapper.style.top = `${newTop}px`; wrapper.style.left = `${newLeft}px`; } } function closeDragElement() { if (isDragging) { log("Drag mouse up, ending drag."); isDragging = false; wrapper.style.cursor = 'grab'; document.removeEventListener('mousemove', elementDrag); document.removeEventListener('mouseup', closeDragElement); } } wrapper.addEventListener('mousedown', dragMouseDown); wrapper.style.cursor = 'grab';
                log("Drag listeners added to UI panel.");

                // Button/Input Listeners (Add Loop checkbox listener from 5.7)
                document.getElementById('sora-start').addEventListener('click', handleStart);
                document.getElementById('sora-clear').addEventListener('click', handleClear);
                document.getElementById('sora-close').addEventListener('click', handleClose);
                document.getElementById('sora-download-images').addEventListener('click', handleDownload);
                document.getElementById('sora-find-similar-button').addEventListener('click', toggleFindSimilarMode);
                document.getElementById('sora-select-horizontal').addEventListener('change', updateImageSelection);
                document.getElementById('sora-select-vertical').addEventListener('change', updateImageSelection);
                document.getElementById('sora-select-square').addEventListener('change', updateImageSelection);
                document.getElementById('sora-auto-submit-checkbox').addEventListener('input', toggleCooldownInputState);
                document.getElementById('sora-loop-checkbox').addEventListener('change', handleLoopToggle); // << ADDED from 5.7
                document.getElementById('sora-input').addEventListener('input', updateStartButtonPromptCount);

                // Add the paste event listener for image simulation to our script's textarea
                const scriptInputTextarea = document.getElementById('sora-input');
                if (scriptInputTextarea) {
                    scriptInputTextarea.addEventListener('paste', handleSimulatedImagePaste);
                    log("Paste event listener for image simulation added to script's input textarea (sora-input).");
                } else {
                    log("ERROR: Script's input textarea (sora-input) not found to attach image paste listener.");
                }

                // Add event listener for the new persist images checkbox
                const persistCheckbox = document.getElementById('sora-persist-images-checkbox');
                if (persistCheckbox) {
                    persistCheckbox.addEventListener('change', handlePersistImagesToggle);
                    log("Event listener for persist images checkbox added.");
                } else {
                    log("ERROR: Persist images checkbox not found to attach listener.");
                }
                
                // Add event listener for the paste all images button
                const pasteAllButton = document.getElementById('sora-paste-all-images');
                if (pasteAllButton) {
                    pasteAllButton.addEventListener('click', handlePasteAllImages);
                    log("Event listener for paste all images button added.");
                } else {
                    log("ERROR: Paste all images button not found to attach listener.");
                }

                log("Event listeners added to UI controls.");

                // Initial state (Use 5.7 versions - identical)
                toggleCooldownInputState();
                updateStartButtonPromptCount();
                updatePersistedImageCountUI(); // Initialize persisted image count display
                
                // Initialize the preview gallery display
                const previewEl = document.getElementById('sora-persisted-preview');
                if (previewEl) {
                    if (persistedImages.length > 0 && isImagePersistenceEnabled) {
                        previewEl.style.display = 'flex';
                    } else {
                        previewEl.style.display = 'none';
                    }
                }
                
                createAuxiliaryUI(); // Creates aux UI and overlay placeholder
                log("Auxiliary UI and Overlay created.");
            }

            // Use 5.7 version - identical
            function createAuxiliaryUI() {
                log("Creating auxiliary UI (progress, cooldown, stop)...");
                const auxContainer = document.createElement('div'); auxContainer.id = 'sora-aux-controls-container';
                auxContainer.style.cssText = `position: fixed; bottom: 15px; left: 20px; z-index: 99999998; display: none; align-items: center; gap: 10px; transition: opacity 0.3s ease; opacity: 1; pointer-events: auto;`;
                const glassItemStyle = `background: rgba(45, 45, 50, 0.7); backdrop-filter: blur(8px) saturate(150%); -webkit-backdrop-filter: blur(8px) saturate(150%); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 10px; padding: 8px 14px; font-size: 13px; color: #d5d5d5; display: none; white-space: nowrap; box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2); transition: background-color 0.2s ease, border-color 0.2s ease;`; const progress = document.createElement('div'); progress.id = 'sora-progress'; progress.style.cssText = glassItemStyle; progress.textContent = 'Processing...'; auxContainer.appendChild(progress); const cooldownBtn = document.createElement('button'); cooldownBtn.id = 'sora-cooldown'; cooldownBtn.style.cssText = glassItemStyle + `cursor: default;`; cooldownBtn.textContent = `⏱ Cooldown: --s`; auxContainer.appendChild(cooldownBtn); const stopBtn = document.createElement('button'); stopBtn.id = 'sora-stop-button'; stopBtn.style.cssText = glassItemStyle + `background: rgba(200, 50, 60, 0.7); border-color: rgba(255, 99, 132, 0.4); color: white; cursor: pointer; font-weight: 500;`; stopBtn.textContent = '🛑 Stop'; stopBtn.title = 'Stop sending prompts and save remaining ones'; stopBtn.onclick = handleStop; stopBtn.onmouseover = function () { this.style.backgroundColor = 'rgba(220, 53, 69, 0.8)'; this.style.borderColor = 'rgba(255, 99, 132, 0.6)'; }; stopBtn.onmouseout = function () { this.style.backgroundColor = 'rgba(200, 50, 60, 0.7)'; this.style.borderColor = 'rgba(255, 99, 132, 0.4)'; }; auxContainer.appendChild(stopBtn); document.body.appendChild(auxContainer);
                const miniBtn = document.createElement('div'); miniBtn.id = 'sora-minibtn'; miniBtn.style.cssText = `position: fixed; bottom: 15px; left: 20px; width: 16px; height: 16px; background: rgba(255, 255, 255, 0.8); border-radius: 50%; cursor: pointer; z-index: 99999999; box-shadow: 0 0 8px rgba(255, 255, 255, 0.5); display: none; border: 1px solid rgba(255, 255, 255, 0.3); transition: background-color 0.2s ease; pointer-events: auto;`; miniBtn.onmouseover = function () { this.style.backgroundColor = 'rgba(255, 255, 255, 1)'; }; miniBtn.onmouseout = function () { this.style.backgroundColor = 'rgba(255, 255, 255, 0.8)'; }; miniBtn.title = 'Reopen Aros Patcher'; miniBtn.onclick = handleMiniButtonClick; document.body.appendChild(miniBtn);
                log("Auxiliary UI appended to body.");
                createOverlay(); // Create overlay element now
            }

            // --- Button Handlers ---
            // Add handleLoopToggle from 5.7
            function handleLoopToggle(event) {
                log(`Loop checkbox toggled to: ${event.target.checked}. State will be read on Start.`);
                updateStartButtonPromptCount();
            }

            // MODIFIED FUNCTION for handling paste and simulating it on the page's main input
            async function handleSimulatedImagePaste(event) {
                log("Paste event detected on script's input textarea.");
                const items = (event.clipboardData || event.originalEvent?.clipboardData)?.items;
                if (!items) {
                    log("No clipboard items found in script's textarea paste event.");
                    return;
                }

                let imageFile = null;
                for (let i = 0; i < items.length; i++) {
                    if (items[i].kind === 'file' && items[i].type.startsWith('image/')) {
                        imageFile = items[i].getAsFile(); // This is a File object
                        break;
                    }
                }

                if (imageFile) {
                    log(`Image file found in script's clipboard: ${imageFile.name}, type: ${imageFile.type}, size: ${imageFile.size} bytes`);
                    event.preventDefault(); // Prevent default paste into our script's textarea

                    const scriptTextarea = event.target;
                    const originalValue = scriptTextarea.value;
                    const selectionStart = scriptTextarea.selectionStart;
                    const selectionEnd = scriptTextarea.selectionEnd;
                    // Make the line in our script's textarea where paste occurred empty
                    scriptTextarea.value = originalValue.substring(0, selectionStart) + originalValue.substring(selectionEnd);
                    scriptTextarea.selectionStart = scriptTextarea.selectionEnd = selectionStart;
                    log("Ensured script's textarea reflects an empty prompt for the pasted image at the paste location.");
                    scriptTextarea.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));

                    if (isImagePersistenceEnabled) {
                        persistedImages.push(imageFile);
                        // Add the image to the preview gallery
                        addImageToPreviewGallery(imageFile, persistedImages.length - 1);
                        log(`Image "${imageFile.name}" added to persistent store. Total persisted: ${persistedImages.length}`);
                        updatePersistedImageCountUI();
                        // Reset index when images are updated
                        currentPersistentImageIndex = 0;
                        log(`PERSISTENCE: Reset current image index to 0 after adding new persisted image.`);
                        // With persistence ON, we DO NOT immediately paste to Aros's UI here.
                        // submitPrompt will handle pasting all persisted images when the prompt is run.
                        log("Persistence ON: Image stored. It will be pasted when prompts run.");
                    } else {
                        // Persistence OFF: Perform immediate single-use paste to Aros's UI 
                        // (using the same approach as pasteSinglePersistedImage)
                        log("Persistence OFF: Attempting immediate paste to Aros's UI for single use.");
                        
                        // Temporarily add the image to persist array and use our paste function
                        persistedImages.push(imageFile);
                        currentPersistentImageIndex = persistedImages.length - 1;
                        
                        await pasteSinglePersistedImage();
                        
                        // Then remove the image from persistence (since persistence is off)
                        persistedImages.pop();
                        currentPersistentImageIndex = 0;
                        
                        log(`Persistence OFF: Single-use paste complete`);
                    }
                } else {
                    log("No image file found in pasted content. Default paste behavior will proceed in script's textarea.");
                }
            }

            // Modify handleStart using 5.7 logic
            function handleStart() {
                log("Start button clicked.");
                // Reset the current persistent image index when starting
                currentPersistentImageIndex = 0;
                log(`PERSISTENCE: Reset current image index to 0 at start.`);

                const input = document.getElementById('sora-input').value;
                // Split by the delimiter, trim each resulting prompt, filter out empty ones
                const prompts = input.split(PROMPT_DELIMITER).map(x => x.trim()).filter(Boolean);
                const isAuto = document.getElementById('sora-auto-submit-checkbox')?.checked ?? false;
                isLooping = document.getElementById('sora-loop-checkbox')?.checked ?? false; // << Read loop state (from 5.7)
                totalPromptsSentLoop = 0; // << Reset total loop count (from 5.7)
                let currentCooldown = cooldownTime;

                if (prompts.length === 0) {
                    log("Start cancelled: No prompts entered.");
                    return alert(`❗ Please enter at least 1 prompt. Use a line with ${PROMPT_DELIMITER} to separate multiple prompts.`);
                }
                if (isRunning) { log("Start cancelled: Process already running."); return; }

                if (!isAuto) {
                    const cooldownInputVal = parseInt(document.getElementById('sora-cooldown-time').value);
                    currentCooldown = isNaN(cooldownInputVal) ? cooldownTime : Math.max(1, cooldownInputVal);
                    cooldownTime = currentCooldown;
                    log(`Manual mode selected. Cooldown set to ${currentCooldown}s.`);
                } else {
                    log(`Auto mode selected. Manual cooldown input ignored.`);
                }

                log(`Starting process with ${prompts.length} prompts. Mode: ${isAuto ? 'Auto' : 'Manual'}. Loop: ${isLooping}.`); // << Added Loop log (from 5.7)
                promptQueue = [...prompts];
                if (isLooping) { // << Store original list if looping (from 5.7)
                    originalPromptList = [...prompts];
                    log(`Loop mode active. Stored ${originalPromptList.length} original prompts.`);
                } else {
                    originalPromptList = [];
                }
                totalPromptCount = prompts.length; // Total for this cycle (or initial)
                isRunning = true;
                isGenerating = false;

                showOverlay();

                const mainUI = document.getElementById('sora-auto-ui');
                if (mainUI) {
                    log("Hiding main UI panel.");
                    mainUI.style.opacity = '0';
                    mainUI.style.transform = 'scale(0.95)';
                    setTimeout(() => { mainUI.style.display = 'none'; }, 300);
                }
                const miniBtn = document.getElementById('sora-minibtn');
                if (miniBtn) miniBtn.style.display = 'none';

                const auxContainer = document.getElementById('sora-aux-controls-container');
                const progressEl = document.getElementById('sora-progress');
                const cooldownEl = document.getElementById('sora-cooldown');
                const stopBtn = document.getElementById('sora-stop-button');
                if (auxContainer) auxContainer.style.display = 'flex';
                if (progressEl) progressEl.style.display = 'inline-block';
                if (cooldownEl) cooldownEl.style.display = isAuto ? 'none' : 'inline-block';
                if (stopBtn) stopBtn.style.display = 'inline-block';
                log("Auxiliary UI controls made visible.");

                updateProgress(); // Update initial progress text

                // Check if we're in remix mode and use appropriate start functions
                if (isRemixMode) {
                    log("Remix mode detected. Starting remix workflow via worker.");
                    initializeRemixWorker(); // Ensure worker is ready
                    if (!remixModeWorker) {
                        alert("Failed to initialize remix worker. Remix mode cannot start.");
                        log("ERROR: Remix worker not initialized in handleStart.");
                        isRunning = false; // ensure we don't proceed
                        updateProgress();
                        return;
                    }

                    if (isAuto) { // isAuto is the sora-auto-submit-checkbox
                        startRemixLoop(); // This is the new worker-based auto remix loop
                    } else {
                        // Manual Remix Mode
                        const cooldownInput = document.getElementById('sora-cooldown-time');
                        let currentCooldown = parseInt(cooldownInput?.value, 10) || 5; // Default 5s
                        if (currentCooldown < 1) currentCooldown = 1; // Min 1s
                         startManualRemixLoop(currentCooldown); // This is the new worker-based manual remix loop
                    }
                } else {
                    // Normal or wildcard mode
                    if (isAuto) {
                        startAutoLoop();
                    } else {
                        startManualTimerLoop(currentCooldown);
                    }
                }
            }

            // Modified to include stopping sequential paste
            function handleClear() {
                log("Clear button clicked.");
                document.getElementById('sora-input').value = '';
                updateStartButtonPromptCount();
                log("Prompt input cleared and button count updated.");

                // Stop any ongoing sequential paste process
                if (sequentialPasteTimeoutId) {
                    clearTimeout(sequentialPasteTimeoutId);
                    sequentialPasteTimeoutId = null;
                    isPastingSequence = false;
                    log("Cleared sequential image paste timeout on clear.");
                }

                // Clear persisted images and update UI
                persistedImages = [];
                currentPersistentImageIndex = 0;
                log(`PERSISTENCE: Reset current image index to 0 after clearing persisted images.`);
                refreshImagePreviewGallery(); // Refresh the gallery
                updatePersistedImageCountUI();
                log("Persisted images cleared.");

                if (remixModeWorker && isRunning && isRemixMode) {
                    log("Remix mode is running and clear was pressed. Stopping worker and clearing its queue state.");
                    // Simplest is to stop. Worker will clear its internal queues on stop command.
                    remixModeWorker.postMessage({ command: 'stop' });
                    // UI will reflect this via isRunning becoming false after worker acks stop.
                }
            }

            // Use 5.7 version - identical
            function handleClose() { log("Close button clicked."); const wrapper = document.getElementById('sora-auto-ui'); if (!wrapper) return; wrapper.style.opacity = '0'; wrapper.style.transform = 'scale(0.95)'; setTimeout(() => { wrapper.style.display = 'none'; if (!isRunning) { const miniBtn = document.getElementById('sora-minibtn'); if (miniBtn) miniBtn.style.display = 'block'; log("Main UI hidden, mini button shown."); } }, 300); }
            // Use 5.7 version - identical
            function handleMiniButtonClick() { log("Mini button clicked."); if (!isRunning) { const wrapper = document.getElementById('sora-auto-ui'); const miniBtn = document.getElementById('sora-minibtn'); if (wrapper) { wrapper.style.display = 'block'; void wrapper.offsetWidth; wrapper.style.opacity = '1'; wrapper.style.transform = 'scale(1)'; log("Main UI restored."); } if (miniBtn) miniBtn.style.display = 'none'; const auxContainer = document.getElementById('sora-aux-controls-container'); if (auxContainer) auxContainer.style.display = 'none'; hideOverlay(); /* Hide overlay & unlock scroll */ } else { log("Cannot open UI while process is running."); } }

            // Modify handleStop using 5.7 logic
            function handleStop(workerInitiatedStop = false) {
                log(`Stop called. Worker-initiated: ${workerInitiatedStop}`);
                isRunning = false;
                isGenerating = false;
                isWaitingForRemix = false;

                if (remixModeWorker && !workerInitiatedStop) {
                    log("Telling remix worker to stop.");
                    remixModeWorker.postMessage({ command: 'stop' });
                } else if (remixModeWorker && workerInitiatedStop){
                    log("Worker initiated stop, main thread acknowledging. Not sending stop back to worker.");
                }

                // Clear all relevant timeouts and intervals
                if (autoSubmitTimeoutId) { clearTimeout(autoSubmitTimeoutId); autoSubmitTimeoutId = null; log("Cleared pending auto-submit timeout on stop."); }
                if (generationTimeoutId) { clearTimeout(generationTimeoutId); generationTimeoutId = null; log("Cleared pending generation timeout on stop."); }
                if (manualTimerTimeoutId) { clearTimeout(manualTimerTimeoutId); manualTimerTimeoutId = null; log("Cleared manual execution timer on stop."); }
                if (visualCountdownInterval) { clearInterval(visualCountdownInterval); visualCountdownInterval = null; log("Cleared manual visual countdown timer on stop.");}

                hideOverlay();
                const cooldownBtn = document.getElementById('sora-cooldown');
                if (cooldownBtn) {
                    cooldownBtn.textContent = '⏱ Cooldown: --s';
                    cooldownBtn.style.display = 'none';
                }

                const done = totalPromptCount > 0 ? (totalPromptCount - promptQueue.length) : 0;
                const totalSentDisplay = totalPromptsSentLoop > 0 ? totalPromptsSentLoop : done; // << Use loop count if available (from 5.7)
                const progressEl = document.getElementById('sora-progress');
                if (progressEl) { progressEl.textContent = `Stopped (Total: ${totalSentDisplay})`; log(`Process stopped manually. Total sent: ${totalSentDisplay}.`); } // << Updated message (from 5.7)

                if (promptQueue.length > 0) { saveRemainingPromptsToFile(); }
                else { log("No remaining prompts to save on stop."); }
                promptQueue = [];
                originalPromptList = []; // << Reset original list (from 5.7)
                totalPromptCount = 0;    // Reset cycle count
                totalPromptsSentLoop = 0;// << Reset total loop count (from 5.7)
                
                // Make sure preview gallery reflects current state
                refreshImagePreviewGallery();

                setTimeout(() => {
                    if (!isRunning) { // Check again
                        const auxContainer = document.getElementById('sora-aux-controls-container');
                        if (auxContainer) auxContainer.style.display = 'none';
                        const miniBtn = document.getElementById('sora-minibtn');
                        const mainUI = document.getElementById('sora-auto-ui');
                        if (miniBtn && (!mainUI || mainUI.style.display === 'none')) {
                            miniBtn.style.display = 'block';
                            log("Auxiliary UI hidden, mini button shown after stop.");
                        } else {
                            log("Auxiliary UI hidden after stop.");
                        }
                        updateStartButtonPromptCount(); // << Reset start button text (from 5.7)
                    }
                }, 4000);
            }

            // Use 5.7 version - identical
            function saveRemainingPromptsToFile() {
                if (!promptQueue || promptQueue.length === 0) { log("Attempted to save prompts, but queue is empty."); return; }
                log(`Saving ${promptQueue.length} remaining prompts to file...`);
                // Join with the delimiter surrounded by newlines for better readability/re-parsing
                const content = promptQueue.join(`\n${PROMPT_DELIMITER}\n`);
                const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
                const filename = `AutoSora_remaining_${getTimestamp()}.txt`;
                try { triggerDownload(blob, filename); log("Remaining prompts file download triggered."); }
                catch (e) { log("ERROR triggering download for remaining prompts file:"); console.error(e); }
            }

            // --- Core Logic ---
            // Modify updateProgress using 5.7 logic
            function updateProgress() {
                const progressEl = document.getElementById('sora-progress');
                const auxContainer = document.getElementById('sora-aux-controls-container');
                const cooldownEl = document.getElementById('sora-cooldown');
                const stopBtn = document.getElementById('sora-stop-button');
                const isAuto = document.getElementById('sora-auto-submit-checkbox')?.checked ?? false;

                if (!progressEl || !auxContainer) { return; }

                if (isRunning) {
                    let statusText;
                    // --- ADDED (from 5.7): Display logic for loop mode ---
                    if (isLooping) {
                        statusText = `Sent: ${totalPromptsSentLoop} / ∞`; // Use infinity symbol
                    } else {
                        const done = totalPromptCount > 0 ? (totalPromptCount - promptQueue.length) : 0;
                        statusText = `Sent: ${done} / ${totalPromptCount}`;
                    }
                    // --- END ADDED ---
                    progressEl.textContent = statusText;

                    if (auxContainer.style.display !== 'flex') auxContainer.style.display = 'flex';
                    if (progressEl.style.display !== 'inline-block') progressEl.style.display = 'inline-block';
                    if (cooldownEl) {
                        cooldownEl.style.display = (!isAuto) ? 'inline-block' : 'none';
                    }
                    if (stopBtn && stopBtn.style.display !== 'inline-block') stopBtn.style.display = 'inline-block';

                } else { // isRunning = false (Đã dừng hoặc hoàn thành)
                    const done = totalPromptCount > 0 ? (totalPromptCount - promptQueue.length) : 0;
                    const totalSentDisplay = totalPromptsSentLoop > 0 ? totalPromptsSentLoop : done; // << Use loop count if available (from 5.7)

                    // --- UPDATED (from 5.7): Completion/Stop message logic considering looping ---
                    if (totalPromptCount > 0 && done === totalPromptCount && !isLooping) { // Normal completion (not looping)
                        progressEl.textContent = `Complete: ${done} / ${totalPromptCount}.`;
                        log(`Finished processing all ${totalPromptCount} prompts (Loop disabled).`);
                    } else if (progressEl.textContent.indexOf('Stopped') === -1 && progressEl.textContent.indexOf('Complete') === -1) {
                        // Show stopped message if not already shown and not completed normally (or if stopped while looping)
                        progressEl.textContent = `Stopped (Total: ${totalSentDisplay})`;
                        log(`Process stopped or finished incompletely/looping. Total sent: ${totalSentDisplay}.`);
                    } else if (totalPromptCount === 0 && progressEl.textContent.indexOf('Stopped') === -1) {
                        progressEl.textContent = 'Idle/Stopped.';
                        log("Progress updated: Idle/Stopped state.");
                    }
                    // --- END UPDATED ---

                    // Hide UI phụ after delay ONLY IF NOT LOOPING (or stopped before starting)
                    // --- UPDATED (from 5.7): Check loop state before hiding UI ---
                    if (!isLooping || totalPromptCount == 0) {
                        setTimeout(() => {
                            if (!isRunning) { // Check again
                                hideOverlay();
                                if (auxContainer) auxContainer.style.display = 'none';
                                if (cooldownEl) cooldownEl.style.display = 'none';

                                const mainUI = document.getElementById('sora-auto-ui');
                                const miniBtn = document.getElementById('sora-minibtn');
                                if (miniBtn && (!mainUI || mainUI.style.display === 'none')) {
                                    miniBtn.style.display = 'block';
                                    log("Auxiliary UI hidden, overlay hidden/scroll unlocked, mini button shown after completion/stop (non-loop).");
                                } else {
                                    log("Auxiliary UI hidden, overlay hidden/scroll unlocked after completion/stop (non-loop).");
                                }

                                // Reset counts only on normal non-loop completion
                                if (totalPromptCount > 0 && done === totalPromptCount && !isLooping) {
                                    totalPromptCount = 0;
                                    totalPromptsSentLoop = 0;
                                    updateStartButtonPromptCount();
                                    log("Reset counts after successful completion (no loop).");
                                }
                            }
                        }, 4000);
                    } else {
                        log("Looping was active or ended mid-cycle. Auxiliary UI remains visible until stopped manually.");
                    }
                    // --- END UPDATED ---
                }
            }

            // Add a helper function for simulating keyboard typing
            function simulateTyping(element, text) {
                const perCharDelay = 10; // ms between characters
                let index = 0;

                // Focus the element first
                element.focus();

                function typeNextChar() {
                    if (index >= text.length) return;

                    const char = text.charAt(index);

                    // Create keyboard events
                    const keyDown = new KeyboardEvent('keydown', {
                        key: char,
                        code: `Key${char.toUpperCase()}`,
                        bubbles: true,
                        cancelable: true
                    });

                    const keyPress = new KeyboardEvent('keypress', {
                        key: char,
                        code: `Key${char.toUpperCase()}`,
                        bubbles: true,
                        cancelable: true
                    });

                    const keyUp = new KeyboardEvent('keyup', {
                        key: char,
                        code: `Key${char.toUpperCase()}`,
                        bubbles: true,
                        cancelable: true
                    });

                    // Dispatch events
                    element.dispatchEvent(keyDown);
                    element.dispatchEvent(keyPress);

                    // Modify the value
                    element.value += char;

                    // Dispatch input event
                    element.dispatchEvent(new Event('input', { bubbles: true }));

                    // Finish key sequence
                    element.dispatchEvent(keyUp);

                    // Move to next character
                    index++;

                    // Schedule next character
                    setTimeout(typeNextChar, perCharDelay);
                }

                // Start typing
                setTimeout(typeNextChar, 0);

                // Return a promise that resolves when all typing is complete
                return new Promise(resolve => {
                    setTimeout(resolve, text.length * perCharDelay + 100);
                });
            }

            async function submitPrompt(promptText, isAutoMode = true) {
                if (!isRunning) {
                    log("submitPrompt cancelled: Not running.");
                    return;
                }

                // Find Aros's textarea
        const arosTextarea = document.querySelector('textarea[placeholder*="Describe"], textarea.flex.w-full');
        if (!arosTextarea) {
            log("ERROR: Aros page's main prompt textarea not found. Stopping.");
            handleStop();
            return;
        }

                // Stop any existing sequence
                stopSequentialPaste();

                // REVERSE ORDER APPROACH: First set text, then paste image

                // 1. Clear textarea and set text prompt first
                log(`Setting text prompt first: "${promptText.substring(0, 50)}..."`);
                arosTextarea.value = promptText;
                arosTextarea.dispatchEvent(new Event('input', { bubbles: true }));
                arosTextarea.dispatchEvent(new Event('change', { bubbles: true }));

                // Try to trigger React's onChange handler directly
                const reactKey = Object.keys(arosTextarea).find(k => k.startsWith("__reactProps$"));
                if (reactKey && arosTextarea[reactKey]?.onChange) {
                    try {
                        log("Triggering React onChange handler directly for text...");
                        arosTextarea[reactKey].onChange({ target: arosTextarea });
                    } catch (e) {
                        log("Error triggering React onChange for text: " + e.message);
                    }
                }

                // Wait for the text to be processed
                await new Promise(resolve => setTimeout(resolve, 500));

                // 2. Now paste images if using persistence
                if (isImagePersistenceEnabled && persistedImages.length > 0) {
                    // Reset to start with the first image
                    currentPersistentImageIndex = 0;
                    
                    // CRITICAL: For multiple images, we need to paste them one by one with delays
                    // but WAIT until all are done before proceeding
                    
                    if (persistedImages.length === 1) {
                        // For a single image, just paste it directly
                        log(`Pasting single persisted image`);
                        await pasteSinglePersistedImage();
                    } else {
                        // For multiple images, paste them sequentially with waiting
                        log(`Pasting ${persistedImages.length} images sequentially...`);
                        
                        // First image immediately
                        await pasteSinglePersistedImage();
                        
                        // Then remaining images with delays in between
                        for (let i = 1; i < persistedImages.length; i++) {
                            if (!isRunning) break; // Check if we've been stopped
                            
                            log(`Waiting ${IMAGE_PASTE_DELAY_MS}ms before pasting image ${i+1}/${persistedImages.length}...`);
                            await new Promise(resolve => setTimeout(resolve, IMAGE_PASTE_DELAY_MS));
                            
                            if (!isRunning) break; // Check again after the delay
                            await pasteSinglePersistedImage();
                        }
                        
                        log(`Completed pasting ${persistedImages.length} images sequentially`);
                    }
                }

                // 3. Check what's in the textarea now
                log(`Current textarea value after both text and image: "${arosTextarea.value.substring(0, 70).replace(/\n/g, '\\n')}..."`);

                // 4. One more check to ensure text is still there
                if (!arosTextarea.value.includes(promptText)) {
                    log("WARNING: Text prompt not found in textarea after image paste. Attempting to set it again.");
                    try {
                        // Attempt to paste just the text using clipboard
                        const textDt = new DataTransfer();
                        textDt.setData('text/plain', promptText);
                        const textPasteEvent = new ClipboardEvent('paste', {
                            bubbles: true,
                            cancelable: true,
                            clipboardData: textDt
                        });
                        arosTextarea.dispatchEvent(textPasteEvent);
                        log("Text repasted via clipboard event");
                        await new Promise(resolve => setTimeout(resolve, 500));
                    } catch (e) {
                        log("Error trying to repaste text: " + e.message);
                    }
                }
                
                // Wait for submit button to enable - use longer wait after multiple images
                const waitTime = (isImagePersistenceEnabled && persistedImages.length > 1) ? 5000 : 2000; // 5 seconds for multiple images, 2 seconds otherwise
                log(`Waiting ${waitTime/1000} seconds for submit button to enable...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));

                if (!isRunning) {
                    log("Submit button click cancelled: Not running.");
                    return;
                }

                // Find and click the submit button - use multiple strategies
                let submitBtn = document.querySelector('button[data-disabled="false"][class*="bg-token-bg-inverse"]');
                
                // Fallback selectors if the primary one fails
                if (!submitBtn) {
                    log("Primary button selector failed, trying alternatives...");
                    // Try other potential selectors
                    const alternatives = [
                        'button[class*="bg-token-bg-inverse"]:not([disabled])',
                        'button.text-token-text-primary[class*="bg-token-bg-inverse"]',
                        'button[class*="bg-token-bg-inverse"][class*="hover:bg"]',
                        'form button[type="submit"]:not([disabled])',
                        'button:not([disabled])[class*="bg-black"]', // Common pattern in Sora
                        // Last resort - any enabled button with text like "Generate" or "Create"
                        'button:not([disabled]):not([aria-hidden="true"])'
                    ];
                    
                    for (const selector of alternatives) {
                        const buttons = Array.from(document.querySelectorAll(selector));
                        // Filter for buttons that look like they're submit buttons
                        const possibleBtn = buttons.find(btn => {
                            const text = btn.textContent.toLowerCase();
                            return text.includes("generat") || 
                                text.includes("creat") || 
                                text.includes("submit") ||
                                text.includes("send");
                        });
                        
                        if (possibleBtn) {
                            submitBtn = possibleBtn;
                            log(`Found submit button using alternative selector: ${selector}`);
                            break;
                        }
                    }
                }
                
                if (submitBtn) {
                    log("Submit button found and enabled.");

                    if (isAutoMode) {
                        log("Auto Mode: Setting flags, starting observer, clicking...");
                        isGenerating = true;
                        _generationIndicatorRemoved = false;
                        _newImagesAppeared = false;

                        const gridContainer = document.querySelector('div[class*="max-w-"][class*="flex-col"]') ?? document.body;
                        if (completionObserver) {
                            try {
                                completionObserver.observe(gridContainer, { childList: true, subtree: true });
                            } catch (e) {
                                log(`ERROR starting completion observer: ${e.message}`);
                            }
                        }

                        if (generationTimeoutId) {
                            clearTimeout(generationTimeoutId);
                        }

                        generationTimeoutId = setTimeout(() => {
                            if (!isRunning || !isGenerating) return;
                            log(`ERROR: Generation TIMEOUT reached.`);
                            isGenerating = false;
                            completionObserver?.disconnect();
                            _generationIndicatorRemoved = false;
                            _newImagesAppeared = false;
                            generationTimeoutId = null;
                            updateProgress();

                            if (promptQueue.length > 0 || (isLooping && originalPromptList.length > 0)) {
                                processNextPrompt();
                            } else {
                                handleStop();
                            }
                        }, GENERATION_TIMEOUT_MS);
                    }

                    // Click the button - try React handler first
                    const btnKey = Object.keys(submitBtn).find(k => k.startsWith("__reactProps$"));
                    if (btnKey && submitBtn[btnKey]?.onClick) {
                        try {
                            submitBtn[btnKey].onClick({ bubbles: true, cancelable: true });
                            log("React onClick triggered on submit button.");
                        } catch (e) {
                            submitBtn.click();
                            log("Used standard click() after React onClick error.");
                        }
                    } else {
                        submitBtn.click();
                        log("Used standard click() - no React handler found.");
                    }
                } else {
                    log("ERROR: Submit button not found after delay. Stopping.");
                    handleStop();
                }
            }

            // Modify handleGenerationComplete using 5.7 logic
            function handleGenerationComplete() { // Only used in Auto Mode
                if (!isRunning || !isGenerating) {
                    log(`handleGenerationComplete called but state is not correct (running: ${isRunning}, generating: ${isGenerating}). Ignoring.`); // << Log from 5.7
                    return;
                }

                if (generationTimeoutId) { clearTimeout(generationTimeoutId); log(`Generation completed before timeout. Timeout ${generationTimeoutId} cancelled.`); generationTimeoutId = null; } // << Log from 5.7
                else { log("Generation completed, but no active timeout ID found."); } // << Log from 5.7

                log("Generation complete confirmed by observer (Auto Mode). Handling next step...");
                isGenerating = false;
                completionObserver?.disconnect();
                log("Completion observer disconnected.");
                // Don't call updateProgress here, processNextPrompt will do it

                if (autoSubmitTimeoutId) { clearTimeout(autoSubmitTimeoutId); autoSubmitTimeoutId = null; }

                const isAuto = document.getElementById('sora-auto-submit-checkbox')?.checked ?? false;
                if (!isAuto) {
                    log("WARNING: handleGenerationComplete triggered but checkbox indicates Manual mode. Stopping Auto logic."); // << Log from 5.7
                    return;
                }

                // --- UPDATED (from 5.7): Check loop before deciding to stop ---
                if (promptQueue.length > 0 || (isLooping && originalPromptList.length > 0)) {
                    log("Auto mode: Scheduling next prompt in 1 second.");
                    autoSubmitTimeoutId = setTimeout(() => {
                        autoSubmitTimeoutId = null;
                        if (isRunning) {
                            log("Auto-submit timer fired.");
                            processNextPrompt();
                        } else {
                            log("Auto-submit timer fired but process was stopped.");
                        }
                    }, 1000);
                } else {
                    log("Auto mode: Queue empty after generation and not looping. Process finished.");
                    isRunning = false;
                    updateProgress(); // Update UI to final state (calls hideOverlay etc. after delay)
                }
                // --- END UPDATED ---
            }

            // Modify processNextPrompt using 5.7 logic - NOW ASYNC
            async function processNextPrompt() { // Only used for Auto Mode
                if (!isRunning) { log("processNextPrompt: Aborted, not running."); updateProgress(); return; }

                // Log current persistent image state
                if (isImagePersistenceEnabled && persistedImages.length > 0) {
                    log(`PERSISTENCE STATE: Next prompt will use image index ${currentPersistentImageIndex} (${persistedImages[currentPersistentImageIndex]?.name || "unknown"})`);
                }

                // << ADDED (from 5.7): Check loop state >>
                if (promptQueue.length === 0) {
                    if (isLooping && originalPromptList.length > 0) {
                        log("Auto Loop: Prompt queue empty. Resetting from original list.");
                        promptQueue = [...originalPromptList];
                        totalPromptCount = originalPromptList.length; // Reset cycle count for display
                        // Don't reset totalPromptsSentLoop here
                    } else {
                        log("processNextPrompt: Queue is empty and not looping. Finishing run.");
                        isRunning = false;
                        updateProgress(); // Trigger final state update
                        return;
                    }
                }
                // << END ADDED >>

                if (autoSubmitTimeoutId) { clearTimeout(autoSubmitTimeoutId); autoSubmitTimeoutId = null; log("Cleared autoSubmitTimeoutId in processNextPrompt."); } // Log from 5.7
                if (generationTimeoutId) { clearTimeout(generationTimeoutId); generationTimeoutId = null; log("Cleared generationTimeoutId in processNextPrompt."); } // Log from 5.7

                totalPromptsSentLoop++; // << Increment total *before* shifting (from 5.7)
                const nextPrompt = promptQueue.shift();
                updateProgress(); // << Update progress display *before* submitting next (from 5.7)
                await submitPrompt(nextPrompt, true); // Await the async submission
            }

            // Modify startAutoLoop using 5.7 logic (logging, call order)
            function startAutoLoop() {
                if (!isRunning || (promptQueue.length === 0 && !isLooping)) { // Modified condition slightly
                    log("startAutoLoop: Condition not met (not running or empty queue and not looping).");
                    isRunning = false;
                    updateProgress();
                    return;
                }
                log(`Starting AUTO loop. Loop: ${isLooping}`); // Log from 5.7
                // updateProgress(); // Moved updateProgress call inside processNextPrompt
                processNextPrompt(); // Start the first prompt
            }

            // Modify startManualTimerLoop using 5.7 logic - REFACTORED FOR ASYNC
            function startManualTimerLoop(intervalSeconds) {
                log(`Starting MANUAL Timer Loop with ${intervalSeconds}s interval. Loop: ${isLooping}. Image Persistence: ${isImagePersistenceEnabled}`);
                const intervalMs = intervalSeconds * 1000;
                const cooldownBtn = document.getElementById('sora-cooldown');
                // manualTimerTimeoutId is already declared globally and managed by stopManualTimer

                const stopManualTimer = () => {
                    if (manualTimerTimeoutId) {
                        clearTimeout(manualTimerTimeoutId);
                        manualTimerTimeoutId = null;
                        log("Manual execution timer (setTimeout) cleared.");
                    }
                    if (visualCountdownInterval) {
                        clearInterval(visualCountdownInterval);
                        visualCountdownInterval = null;
                        // Reset text only if not running, otherwise let the next countdown overwrite it
                        if (cooldownBtn && !isRunning) cooldownBtn.textContent = `Cooldown: --s`;
                        log("Manual visual countdown timer cleared.");
                    }
                };

                // startVisualCountdown is now defined globally

                // manualTick must be defined before scheduleNextManualTick if scheduleNextManualTick calls it directly.
                // However, scheduleNextManualTick uses setTimeout, so manualTick can be defined later in scope.
                // For clarity, defining manualTick first.

                const manualTick = async () => {
                    if (!isRunning) {
                        log("Manual Timer Tick: Stopping - Not running.");
                        stopManualTimer(); // Ensure all timers are stopped
                        updateProgress(); // Update to final state
                        return;
                    }

                    if (promptQueue.length === 0) {
                        if (isLooping && originalPromptList.length > 0) {
                            log("Manual Timer Loop: Prompt queue empty. Resetting from original list.");
                            promptQueue = [...originalPromptList];
                            totalPromptCount = originalPromptList.length; // Reset cycle count for display
                        } else {
                            log("Manual Timer Tick: Stopping - Queue empty and not looping.");
                            stopManualTimer();
                            isRunning = false;
                            updateProgress(); // Update to final state
                            return;
                        }
                    }

                    totalPromptsSentLoop++;
                    const nextPrompt = promptQueue.shift();
                    updateProgress();
                    startVisualCountdown(intervalSeconds); // Start UI countdown before long await
                    await submitPrompt(nextPrompt, false); // Await the async submitPrompt

                    if (isRunning) {
                        if (promptQueue.length > 0 || (isLooping && originalPromptList.length > 0)) {
                            log("Manual Timer: Prompt submitted. Scheduling next tick after cooldown.");
                            scheduleNextManualTick(intervalMs); // scheduleNextManualTick defined below
                        } else {
                            log("Manual Timer: All prompts processed (or not looping). Finishing run after this prompt's cooldown.");
                            stopManualTimer();
                            isRunning = false;
                            updateProgress();
                        }
                    } else {
                        log("Manual Timer Tick: Detected isRunning=false after prompt submission. Stopping timers.");
                        stopManualTimer();
                        updateProgress();
                    }
                };

                const scheduleNextManualTick = (delay) => {
                    if (manualTimerTimeoutId) clearTimeout(manualTimerTimeoutId);
                    manualTimerTimeoutId = setTimeout(async () => {
                        await manualTick(); // manualTick is defined above
                    }, delay);
                    log(`Scheduled next manual tick in ${delay}ms. ID: ${manualTimerTimeoutId}`);
                };

                // --- Initial prompt submission --- (wrapped in async IIFE)
                if (isRunning && promptQueue.length > 0) {
                    log("Manual Timer: Preparing to send initial prompt.");
                    (async () => {
                        totalPromptsSentLoop++;
                        const firstPrompt = promptQueue.shift();
                        updateProgress();
                        startVisualCountdown(intervalSeconds);
                        await submitPrompt(firstPrompt, false);

                        if (isRunning) {
                            if (promptQueue.length > 0 || (isLooping && originalPromptList.length > 0)) {
                                log("Manual Timer: Initial prompt submitted. Scheduling next tick.");
                                scheduleNextManualTick(intervalMs);
                            } else {
                                log("Manual Timer: Only one prompt was in the queue and not looping. Finishing run after its cooldown.");
                                stopManualTimer();
                                isRunning = false;
                                updateProgress();
                            }
                        } else {
                            log("Manual Timer: Process was stopped during or after initial prompt submission. No further ticks scheduled.");
                            stopManualTimer();
                            updateProgress();
                        }
                    })();
                } else if (isRunning && promptQueue.length === 0 && isLooping && originalPromptList.length > 0) {
                    log("Manual Timer: Started with empty queue but looping. Resetting queue and starting tick.");
                    promptQueue = [...originalPromptList];
                    totalPromptCount = originalPromptList.length;
                    scheduleNextManualTick(0);
                } else if (isRunning) {
                    log("Manual Timer: Started with an empty queue and no way to loop. Stopping.");
                    isRunning = false;
                    stopManualTimer();
                    updateProgress();
                } else {
                    log("Manual Timer: Initial state not suitable for starting timer (isRunning is false).");
                    updateProgress();
                }
            }

            // --- Download Logic ---
            // Use 5.7 version - identical but more robust logging/handling
            async function handleDownload() {
                log("Download button clicked.");
                const btn = document.getElementById("sora-download-images");
                const btnText = document.getElementById("sora-download-text");
                const btnIcon = document.getElementById("sora-download-icon");
                const errorEl = document.getElementById("sora-download-error");
                if (!btn || !btnText || !btnIcon || !errorEl) { log("ERROR: Download UI elements not found."); return; }

                if (isDownloading) { log("Download stop requested."); isDownloading = false; btnText.textContent = `Stopping...`; return; }

                const urlsToDownload = Array.from(selectedImageUrls);
                if (urlsToDownload.length === 0) { log("Download skipped: No images selected."); errorEl.textContent = "No images selected."; setTimeout(() => { if (!isDownloading && errorEl) errorEl.textContent = ''; }, 3000); return; }

                isDownloading = true;
                downloadErrors = 0;
                let successfulCount = 0;
                const totalFiles = urlsToDownload.length;
                const selectedCropOption = document.querySelector('input[name="sora-crop-option"]:checked')?.value ?? 'none';
                btn.disabled = true;
                btnIcon.style.display = 'none';
                btnText.textContent = `Preparing... (0/${totalFiles})`;
                errorEl.textContent = '';
                log(`Starting download of ${totalFiles} images. Crop: ${selectedCropOption}`);

                if (totalFiles === 1) { // Single file download
                    log("Processing single image download...");
                    const url = urlsToDownload[0];
                    btnText.textContent = `Processing 1 image...`;
                    try {
                        const blob = await convertWebpToPngBlob(url, selectedCropOption);
                        if (blob && isDownloading) {
                            const timestamp = getTimestamp();
                            const filename = `AutoAros_${selectedCropOption}_${timestamp}.png`;
                            triggerDownload(blob, filename);
                            btnText.textContent = `Downloaded 1 image`;
                            successfulCount = 1;
                        } else if (!blob && isDownloading) {
                            downloadErrors = 1;
                            errorEl.textContent = `Error processing image. Check Console.`;
                            btnText.textContent = `Download error`;
                        } else if (!isDownloading) {
                            errorEl.textContent = `Download stopped.`;
                            btnText.textContent = `Download stopped`;
                        }
                    } catch (err) {
                        if (isDownloading) {
                            downloadErrors = 1;
                            log(`ERROR processing single image (${url.substring(0, 30)}...): ${err.message}`); console.error(err);
                            errorEl.textContent = `Error processing image. Check Console.`;
                            btnText.textContent = `Download error`;
                        } else {
                            errorEl.textContent = `Download stopped.`;
                            btnText.textContent = `Download stopped`;
                        }
                    } finally {
                        const wasDownloading = isDownloading;
                        isDownloading = false;
                        if (btnIcon) btnIcon.style.display = 'inline';
                        setTimeout(() => { if (!isDownloading) updateSelectedCount(); }, 3000); // Reset UI sooner
                        log(`Single image download process finished (was downloading: ${wasDownloading}). Success: ${successfulCount}, Errors: ${downloadErrors}`);
                    }
                    return;
                }

                // Multiple files download (ZIP)
                log("Processing multiple images concurrently...");
                let processedImageCount = 0;
                btnText.textContent = `Processing images: 0/${totalFiles} (0%)`;

                const conversionPromises = urlsToDownload.map((url, index) => {
                    return convertWebpToPngBlob(url, selectedCropOption)
                        .then(blob => {
                            if (isDownloading) {
                                processedImageCount++;
                                const percentage = ((processedImageCount / totalFiles) * 100).toFixed(0);
                                btnText.textContent = `Processing images: ${processedImageCount}/${totalFiles} (${percentage}%)`;
                            }
                            return blob; // Return the blob if successful
                        })
                        .catch(error => {
                            if (isDownloading) {
                                processedImageCount++; // Count errors as processed too
                                const percentage = ((processedImageCount / totalFiles) * 100).toFixed(0);
                                btnText.textContent = `Processing images: ${processedImageCount}/${totalFiles} (${percentage}%)`;
                                log(`ERROR processing image ${processedImageCount}/${totalFiles}: ${error.message}`);
                            }
                            // Do not re-throw, let Promise.allSettled handle it
                            return null; // Return null to indicate failure
                        });
                });

                const results = await Promise.allSettled(conversionPromises);

                if (!isDownloading) {
                    log("Download stopped during image processing phase.");
                    errorEl.textContent = "Download stopped.";
                    btnText.textContent = "Download stopped";
                    if(btnIcon) btnIcon.style.display = 'inline';
                    setTimeout(() => { if (!isDownloading) updateSelectedCount(); }, 3000);
                    return;
                }

                log("All image processing settled. Preparing ZIP...");
                btnText.textContent = `Processed ${totalFiles}/${totalFiles} (100%). Preparing ZIP...`;

                const zip = new JSZip();
                let zipFileCount = 0;
                results.forEach((result, index) => {
                    if (result.status === 'fulfilled' && result.value) { // Check for fulfilled and non-null blob
                        const blob = result.value;
                        const filename = `image_${index + 1}.png`;
                        zip.file(filename, blob);
                        successfulCount++;
                        zipFileCount++;
                    } else {
                        downloadErrors++;
                        const reason = result.status === 'rejected' ? result.reason : 'Processing returned null';
                        log(`ERROR processing image index ${index} for ZIP: ${reason instanceof Error ? reason.message : reason}`);
                    }
                });

                if (!isDownloading) {
                    log("Download stopped during ZIP preparation.");
                    errorEl.textContent = "Stopped creating ZIP.";
                    btnText.textContent = "Stopped creating ZIP";
                    if(btnIcon) btnIcon.style.display = 'inline';
                    setTimeout(() => { if (!isDownloading) updateSelectedCount(); }, 3000);
                    return;
                }

                if (successfulCount > 0) {
                    try {
                        log(`Generating ZIP file with ${successfulCount} images...`);
                        btnText.textContent = 'Creating ZIP file...';
                        const zipBlob = await zip.generateAsync(
                            { type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } },
                            (metadata) => {
                                if (!isDownloading) throw new Error("Zip generation cancelled.");
                                btnText.textContent = `Compressing ZIP: ${metadata.percent.toFixed(0)}%`;
                            }
                        );

                        if (!isDownloading) {
                            log("Download stopped during ZIP generation.");
                            errorEl.textContent = "Stopped creating ZIP.";
                            btnText.textContent = "Stopped creating ZIP";
                        } else {
                            const zipFilename = `AutoAros_Bulk_${getTimestamp()}.zip`;
                            triggerDownload(zipBlob, zipFilename);
                            btnText.textContent = `Downloaded ${successfulCount}/${totalFiles} images`;
                            if (downloadErrors > 0) {
                                errorEl.textContent = `${downloadErrors} errors occurred while processing images.`;
                                log(`${downloadErrors} errors occurred during image processing.`);
                            }
                            log(`ZIP download triggered for ${successfulCount} files.`);
                        }
                    } catch (error) {
                        log("ERROR during ZIP generation or download:"); console.error(error);
                        if (error.message === "Zip generation cancelled.") {
                            errorEl.textContent = "Stopped creating ZIP file.";
                            btnText.textContent = "Stopped creating ZIP";
                        } else if (isDownloading){
                            errorEl.textContent = "Error creating ZIP file. Check Console.";
                            btnText.textContent = "Error creating ZIP";
                        } else {
                            errorEl.textContent = "Stopped.";
                            btnText.textContent = "Stopped";
                        }
                    }
                } else if (isDownloading) {
                    btnText.textContent = "Image processing error";
                    errorEl.textContent = `Could not process any images (${downloadErrors} errors).`;
                    log("No images were successfully processed.");
                } else {
                    log("Download stopped, no successful images to ZIP.");
                    // UI should already reflect stopped state
                }

                const wasDownloadingMulti = isDownloading;
                isDownloading = false;
                if (btnIcon) btnIcon.style.display = 'inline';
                setTimeout(() => { if (!isDownloading) updateSelectedCount(); }, 5000); // Longer delay after ZIP
                log(`Multiple image download process finished (was downloading: ${wasDownloadingMulti}). Success: ${successfulCount}, Errors: ${downloadErrors}`);
            }

            // Use 5.7 version - identical but better logging/error handling
            async function convertWebpToPngBlob(url, cropOption = 'none') {
                const start = performance.now();
                try {
                    if (!isDownloading) throw new Error("Download cancelled before fetching.");
                    const response = await fetch(url, { cache: "no-store"}); // Bypass cache for freshness
                    if (!response.ok) throw new Error(`Fetch failed: ${response.status} ${response.statusText} for ${url.substring(url.length - 50)}`);
                    const webpBlob = await response.blob();
                    if (webpBlob.size === 0) throw new Error(`Fetched blob is empty for ${url.substring(url.length - 50)}`);
                    if (!isDownloading) throw new Error("Download cancelled after fetching.");

                    const imgBitmap = await createImageBitmap(webpBlob);
                    let sourceX = 0, sourceY = 0;
                    let sourceWidth = imgBitmap.width;
                    let sourceHeight = imgBitmap.height;
                    let targetWidth = imgBitmap.width;
                    let targetHeight = imgBitmap.height;
                    const targetCanvas = document.createElement("canvas");

                    if (cropOption !== 'none' && sourceWidth > 0 && sourceHeight > 0) {
                        let targetRatio = 1;
                        let canvasTargetWidth = sourceWidth; // Default to original size
                        let canvasTargetHeight = sourceHeight;

                        // Determine target ratio and potentially ideal canvas size
                        switch (cropOption) {
                            case '16:9': targetRatio = 16 / 9; canvasTargetWidth = 1920; canvasTargetHeight = 1080; break;
                            case '9:16': targetRatio = 9 / 16; canvasTargetWidth = 1080; canvasTargetHeight = 1920; break;
                            case '1:1':  targetRatio = 1 / 1;  canvasTargetWidth = 1080; canvasTargetHeight = 1080; break;
                        }

                        const currentRatio = sourceWidth / sourceHeight;

                        // Only crop if the ratio is significantly different
                        if (Math.abs(currentRatio - targetRatio) >= 0.01) {
                            log(`Cropping image (${sourceWidth}x${sourceHeight}, ratio ${currentRatio.toFixed(2)}) to ${cropOption} (ratio ${targetRatio.toFixed(2)})`);
                            if (currentRatio > targetRatio) { // Image is wider than target, crop sides
                                const idealWidth = sourceHeight * targetRatio;
                                sourceX = (sourceWidth - idealWidth) / 2;
                                sourceWidth = idealWidth;
                            } else { // Image is taller than target, crop top/bottom
                                const idealHeight = sourceWidth / targetRatio;
                                sourceY = (sourceHeight - idealHeight) / 2;
                                sourceHeight = idealHeight;
                            }
                        } else {
                            log(`Image already close to ${cropOption} ratio. No crop applied.`);
                        }
                        // Decide target canvas size: Use specified size if cropping, else use source size
                        targetWidth = canvasTargetWidth;
                        targetHeight = canvasTargetHeight;

                    } else { // 'none' or invalid source dimensions
                        targetWidth = sourceWidth;
                        targetHeight = sourceHeight;
                    }

                    if (targetWidth <= 0 || targetHeight <= 0 || sourceWidth <= 0 || sourceHeight <= 0 || sourceX < 0 || sourceY < 0) {
                        throw new Error(`Invalid dimensions calculated (Src: ${sourceWidth}x${sourceHeight}@${sourceX},${sourceY} -> Target: ${targetWidth}x${targetHeight})`);
                    }

                    targetCanvas.width = targetWidth;
                    targetCanvas.height = targetHeight;
                    const ctx = targetCanvas.getContext("2d", { alpha: false }); // No alpha needed for PNG usually
                    ctx.imageSmoothingQuality = "high";
                    // Draw the (potentially cropped) source onto the target canvas (potentially resizing)
                    ctx.drawImage(
                        imgBitmap,
                        sourceX, sourceY,       // Source rectangle top-left
                        sourceWidth, sourceHeight, // Source rectangle dimensions
                        0, 0,                  // Destination canvas top-left
                        targetWidth, targetHeight // Destination canvas dimensions
                    );

                    imgBitmap.close(); // Release memory

                    return new Promise((resolve, reject) => {
                        if (!isDownloading) return reject(new Error("Download cancelled before blob creation."));
                        targetCanvas.toBlob(blob => {
                            if (blob) {
                                if (!isDownloading) return reject(new Error("Download cancelled during blob creation."));
                                const duration = performance.now() - start;
                                log(`Image converted/cropped (${cropOption}) in ${duration.toFixed(0)}ms. Size: ${(blob.size / 1024).toFixed(1)} KB`);
                                resolve(blob);
                            } else {
                                reject(new Error("Canvas toBlob returned null."));
                            }
                        }, "image/png", 0.95); // Quality setting for PNG
                    });

                } catch (error) {
                    const duration = performance.now() - start;
                    if (error.message.includes("cancelled")) {
                        log(`Conversion cancelled for ${url.substring(url.length - 50)}...: ${error.message}`);
                    } else {
                        log(`ERROR converting image ${url.substring(url.length - 50)}... in ${duration.toFixed(0)}ms: ${error.message}`);
                        console.error(`Full error for ${url}:`, error);
                    }
                    throw error; // Re-throw to be caught by Promise.allSettled
                }
            }
            // --- End Download Logic ---

            // --- Image Checkbox & Selection Logic ---
            // Use 5.5.5 version - it handles native checkbox removal and skipping task tiles
            function handleImageError() { log(`ERROR: Failed load for CB init: ${this.src.substring(0, 50)}...`); this.removeEventListener('error', handleImageError); }

            function insertCheckbox(img) {
                try {
                    const libraryAnchor = img.closest('a');
                    let containerElement;

                    // --- Check if it's the task prompt tile and skip --- (from 5.5.5)
                    if (libraryAnchor && libraryAnchor.getAttribute('href')?.startsWith('/t/task_')) {
                        // log(`Skipping checkbox for task prompt tile: ${img.src.substring(img.src.length - 20)}`);
                        return; // Do not add checkbox to this specific tile
                    }
                    // --- END Check ---

                    // Determine container based on context (from 5.5.5)
                    if (libraryAnchor) { containerElement = img.closest('div[data-index]'); }
                    else { containerElement = img.closest('div[style*="top:"][style*="left:"]') ?? img.closest('.group\\/tile'); } // Covers Task page
                    if (!containerElement) { /* log(`No container found for img: ${img.src.substring(0,50)}...`);*/ return; }

                    // Remove native checkbox if present (from 5.5.5)
                    const existingNativeCheckbox = containerElement.querySelector(`input.sora-image-checkbox:not([${SCRIPT_CHECKBOX_MARKER}])`);
                    if (existingNativeCheckbox) { try { existingNativeCheckbox.remove(); } catch (e) {} }

                    // Don't add if our checkbox already exists
                    if (containerElement.querySelector(`input.sora-image-checkbox[${SCRIPT_CHECKBOX_MARKER}]`)) return;

                    const checkbox = document.createElement("input"); checkbox.type = "checkbox"; checkbox.className = "sora-image-checkbox"; checkbox.setAttribute(SCRIPT_CHECKBOX_MARKER, 'true'); // Mark our checkbox
                    Object.assign(checkbox.style, { position: "absolute", top: "8px", left: "8px", zIndex: "10", width: "18px", height: "18px", cursor: "pointer", transform: "scale(1.3)", accentColor: "#4a90e2", backgroundColor: "rgba(255,255,255,0.7)", border: "1px solid rgba(0,0,0,0.3)", borderRadius: "3px", opacity: '1' /* Ensure visibility */ });
                    checkbox.title = "Select/deselect this image";

                    // Function to set state based on filters (primarily for Library view where filters apply)
                    const setInitialCheckboxStateBasedOnFilters = () => {
                        try {
                            if (!img.complete || img.naturalWidth === 0 || img.naturalHeight === 0) return;
                            const filterH = document.getElementById('sora-select-horizontal')?.checked ?? false;
                            const filterV = document.getElementById('sora-select-vertical')?.checked ?? false;
                            const filterS = document.getElementById('sora-select-square')?.checked ?? false;
                            const imgW = img.naturalWidth; const imgH = img.naturalHeight;
                            let shouldBe = false;
                            const isH = imgW > imgH; const isV = imgH > imgW; const isS = Math.abs(imgW - imgH) <= 1;
                            if (!filterH && !filterV && !filterS) { shouldBe = false; }
                            else { shouldBe = (filterH && isH) || (filterV && isV) || (filterS && isS); }

                            if (checkbox.checked !== shouldBe) {
                                checkbox.checked = shouldBe;
                                // Update Set only if state actually changed
                                if (shouldBe) { selectedImageUrls.add(img.src); } else { selectedImageUrls.delete(img.src); }
                                updateSelectedCount();
                            } else {
                                // Ensure Set is consistent even if checkbox state didn't change visually
                                if (shouldBe) { if (!selectedImageUrls.has(img.src)) { selectedImageUrls.add(img.src); updateSelectedCount(); }}
                                else { if (selectedImageUrls.has(img.src)) { selectedImageUrls.delete(img.src); updateSelectedCount(); } }
                            }
                        } catch (e) { log(`ERROR setInitialCheckboxStateBasedOnFilters: ${e.message}`); }
                    };

                    checkbox.addEventListener("change", (e) => {
                        if (e.target.checked) selectedImageUrls.add(img.src);
                        else selectedImageUrls.delete(img.src);
                        updateSelectedCount();
                    });

                    const currentPos = window.getComputedStyle(containerElement).position;
                    if (currentPos === 'static' || currentPos === '') containerElement.style.position = 'relative'; // Ensure relative positioning

                    containerElement.insertBefore(checkbox, containerElement.firstChild);

                    // Set initial state: Apply filters if possible (Library), otherwise just ensure unchecked (Task)
                    if (img.complete && img.naturalWidth > 0) {
                        setInitialCheckboxStateBasedOnFilters();
                    } else {
                        img.removeEventListener('load', setInitialCheckboxStateBasedOnFilters); // Remove previous listeners
                        img.removeEventListener('error', handleImageError);
                        img.addEventListener('load', setInitialCheckboxStateBasedOnFilters, { once: true });
                        img.addEventListener('error', handleImageError, { once: true });
                        // Default to unchecked until loaded, Set will be updated by listener or filter change
                        checkbox.checked = false;
                    }
                } catch (e) { log(`ERROR inserting checkbox: ${e.message}`); console.error(e); }
            }

            // --- Observers ---
            // Use 5.5.5 version of imageObserver - it handles native element removal and task tile skipping
            imageObserver = new MutationObserver((mutations) => {
                let imagesToCheck = new Set();
                let nativeElementsRemoved = false;

                for (const mutation of mutations) {
                    if (mutation.type === 'childList') {
                        for (const node of mutation.addedNodes) {
                            if (node.nodeType === 1) { // Check if it's an element node
                                // --- Remove native elements if they appear late --- (from 5.5.5)
                                if (node.matches && node.matches(`input.sora-image-checkbox:not([${SCRIPT_CHECKBOX_MARKER}])`)) { try { node.remove(); nativeElementsRemoved = true; } catch (e) {} }
                                else if (node.querySelectorAll) { node.querySelectorAll(`input.sora-image-checkbox:not([${SCRIPT_CHECKBOX_MARKER}])`).forEach(cb => { try { cb.remove(); nativeElementsRemoved = true; } catch (e) {} }); }
                                if (node.matches && node.matches(NATIVE_INDICATOR_SELECTOR) && node.querySelector('div.bg-black\\/25')) { try { node.remove(); nativeElementsRemoved = true; } catch (e) {} }
                                else if (node.querySelectorAll) { node.querySelectorAll(NATIVE_INDICATOR_SELECTOR).forEach(indicator => { if (indicator.querySelector('div.bg-black\\/25')) { try { indicator.remove(); nativeElementsRemoved = true; } catch (e) {} } }); }
                                // --- End native element removal ---

                                let container = null; let img = null;
                                // Check if the added node itself is a relevant container (from 5.5.5)
                                if (node.matches && (node.matches('div[data-index]') || node.matches('div[style*="top:"][style*="left:"]') || node.matches('.group\\/tile'))) {
                                    container = node;
                                    img = container.querySelector('img');
                                }
                                // Or check if the added node CONTAINS relevant items (from 5.5.5)
                                else if (node.querySelectorAll) {
                                    // This finds items within the added node, handles cases where a batch of items is added
                                    node.querySelectorAll('div[data-index], div[style*="top:"][style*="left:"], .group\\/tile').forEach(item => {
                                        const itemImg = item.querySelector('img');
                                        if (itemImg) {
                                            // Check and add logic needs to happen per item found
                                            const anchor = item.querySelector('a');
                                            if (!item.querySelector(`input.sora-image-checkbox[${SCRIPT_CHECKBOX_MARKER}]`) && !(anchor && anchor.getAttribute('href')?.startsWith('/t/task_'))) {
                                                imagesToCheck.add(itemImg);
                                            }
                                        }
                                    });
                                }

                                // Process the directly added node if it was a container
                                if (container && img) {
                                    const anchor = container.querySelector('a');
                                    // Check if it needs a checkbox AND is not a task tile prompt
                                    if (!container.querySelector(`input.sora-image-checkbox[${SCRIPT_CHECKBOX_MARKER}]`) && !(anchor && anchor.getAttribute('href')?.startsWith('/t/task_'))) {
                                        imagesToCheck.add(img);
                                    }
                                }
                            }
                        }
                    }
                }
                if (nativeElementsRemoved) { /* log("ImageObserver removed late-added native element(s)."); */ } // Optional log
                if (imagesToCheck.size > 0) {
                    // log(`ImageObserver found ${imagesToCheck.size} new images potentially needing checkboxes.`);
                    imagesToCheck.forEach(img => insertCheckbox(img)); // insertCheckbox handles the rest
                }
            });

            // Use 5.7 version of completionObserver - identical logic, better logging
            completionObserver = new MutationObserver((mutations) => { // Only used in Auto Mode
                if (!isGenerating || !isRunning) return; // Ignore if not in Auto generation

                let foundIndicatorRemoval = false;
                let foundNewImage = false;

                for (const mutation of mutations) {
                    if (mutation.type === 'childList') {
                        // Check for removal of loading indicators
                        mutation.removedNodes.forEach(node => {
                            if (node.nodeType === 1 && node.querySelector && node.querySelector('svg[class*="desktop:h-20"] circle[class*="-rotate-90"]')) {
                                // log("Completion Observer: Found removed SVG loading indicator.");
                                foundIndicatorRemoval = true;
                            } else if (node.nodeType === 1 && node.matches && node.matches('div[class*="absolute"][class*="text-token-text-secondary"]') && node.textContent.match(/^\d{1,3}%$/)) {
                                // log("Completion Observer: Found removed percentage indicator.");
                                foundIndicatorRemoval = true;
                            }
                            // Add more checks for other potential loading indicators if needed
                        });

                        // Check for addition of new image grid item (specifically index 0 is usually the newest)
                        mutation.addedNodes.forEach(node => {
                            if (node.nodeType === 1) {
                                if ((node.matches && node.matches('div[data-index="0"]')) || (node.querySelector && node.querySelector('div[data-index="0"]'))) {
                                    // log("Completion Observer: Found added new image grid item (data-index='0').");
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
                    log("CompletionObserver: Both conditions met (_generationIndicatorRemoved && _newImagesAppeared). Calling handleGenerationComplete.");
                    // Reset flags immediately to prevent double calls before disconnect
                    _generationIndicatorRemoved = false;
                    _newImagesAppeared = false;
                    handleGenerationComplete(); // Trigger the next step in Auto Mode
                }
            });

            // --- Find Similar Logic ---
            // Use 5.7 version - identical
            function toggleFindSimilarMode() {
                isFindSimilarModeActive = !isFindSimilarModeActive;
                const button = document.getElementById('sora-find-similar-button');
                if (button) {
                    if (isFindSimilarModeActive) {
                        button.classList.add('active');
                        button.title = 'Deactivate find similar mode (Click an image to find similar)';
                        log("Find Similar mode ACTIVATED.");
                        document.body.style.cursor = 'crosshair'; // Optional visual cue
                    } else {
                        button.classList.remove('active');
                        button.title = 'Activate find similar image mode';
                        log("Find Similar mode DEACTIVATED.");
                        document.body.style.cursor = 'default'; // Reset cursor
                    }
                }
            }

            // Use 5.7 version - identical logic, better logging
            function handleDocumentClickForSimilar(event) {
                if (!isFindSimilarModeActive) { return; } // Only act if mode is active

                const link = event.target.closest('a');
                if (!link || !link.href) {
                    // log("Find Similar: Clicked outside an image link.");
                    return;
                } // Clicked outside a link

                // Regex to find sora generation IDs like "gen_..."
                const soraGenRegex = /^https?:\/\/(?:www\.)?sora(?:\.\w+)*\.com\/g\/(gen_[a-zA-Z0-9]+)/;
                const match = link.href.match(soraGenRegex);

                if (match && match[1]) {
                    const genId = match[1];
                    const exploreUrl = `${window.location.origin}/explore?query=${genId}`;
                    log(`Find Similar Mode: Match found (${genId}). Opening with window.open: ${exploreUrl}`);

                    event.preventDefault(); // Stop the default link navigation
                    event.stopPropagation(); // Stop the event from bubbling up further

                    window.open(exploreUrl, '_blank'); // Open the explore URL in a new tab

                    // Optionally deactivate the mode after one use
                    // toggleFindSimilarMode();

                } else {
                    // log(`Find Similar: Clicked link (${link.href}) did not match Sora generation pattern.`);
                }
            }

            // --- Initialization ---
            // Use 5.7 version - identical but better error handling structure
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

            // --- Script Entry Point ---
            log("Script starting...");
            if (typeof JSZip === 'undefined') { log("FATAL ERROR: JSZip library not loaded."); alert("Critical Error: JSZip library not loaded."); return; }
            else { log("JSZip library loaded successfully."); }

            // Use 5.5.5 waitForElement target selector and initialization logic, combined with 5.7 robustness
            waitForElement('main, div[role="dialog"]', (commonElement) => { // Target from 5.5.5
                try {
                    log("Common page element found. Proceeding with initialization..."); // Log from 5.7 style

                    // --- Check if wildcardUtils is loaded ---
                    if (typeof wildcardUtils !== 'undefined' && wildcardUtils && typeof wildcardUtils.generatePrompts === 'function') {
                        log("SUCCESS: wildcardUtils (from wildcards.js) appears to be loaded correctly.");
                    } else if (typeof wildcardUtils !== 'undefined') {
                        log("WARNING: wildcardUtils is defined, but it might be incomplete or not the expected object (e.g., generatePrompts function is missing).");
                        console.log('Current wildcardUtils:', wildcardUtils);
                    } else {
                        log("ERROR: wildcardUtils is undefined. wildcards.js was not loaded or executed correctly. Check @require URL and wildcards.js content.");
                    }
                    // --- End check ---

                    // Initial removal of native elements (from 5.5.5)
                    removeNativeCheckboxes();
                    removeNativeSelectionIndicators();

                    createUI(); // Creates main UI, aux UI, and overlay placeholder
                    hideOverlay(); // Ensure overlay is hidden initially
                    log("UI creation function finished. Initial overlay state set to hidden."); // Log from 5.7

                    log("Performing initial image scan..."); // Log from 5.7
                    let initialImages = 0;
                    // Use combined selector from 5.5.5 to cover library and task pages
                    document.querySelectorAll('div[data-index] a > img, div[style*="top:"][style*="left:"] img, .group\\/tile img').forEach(img => {
                        insertCheckbox(img); // insertCheckbox now handles skipping task prompts
                        initialImages++;
                    });
                    log(`Initial image scan complete. Processed ${initialImages} images.`); // Log from 5.7
                    updateSelectedCount(); // Update download button count

                    log("Setting up Image Observer..."); // Log from 5.7
                    // Use the more comprehensive observer target selector from 5.5.5
                    const observerTarget = document.querySelector(
                        '[data-testid="virtuoso-scroller"] > div, main div[class*="grid"], div[role="dialog"] div.flex.h-full.flex-col, body'
                    ) ?? document.body;

                    if (observerTarget) {
                        // Observer callback (5.5.5 version) handles removing native elements and skipping task prompts
                        imageObserver.observe(observerTarget, { childList: true, subtree: true });
                        log(`Image Observer started observing ${observerTarget.tagName}${observerTarget.id ? '#'+observerTarget.id : ''}${observerTarget.className ? '.'+observerTarget.className.split(' ').join('.') : ''}.`); // Log from 5.5.5 style
                    } else {
                        // Fallback logic is the same
                        log("WARNING: Could not find specific image grid container, observing document body. This might be less efficient.");
                        imageObserver.observe(document.body, { childList: true, subtree: true });
                    }

                    if (!completionObserver) { log("ERROR: Completion observer was not initialized correctly."); }
                    else { log("Completion observer initialized (for Auto Mode)."); } // Log from 5.7

                    // Add the global click listener for the "Find Similar" feature
                    document.addEventListener('click', handleDocumentClickForSimilar, true); // Use capture phase
                    log("Added global click listener for Find Similar mode."); // Log from 5.7
                    
                    // Add keyboard listener for remix mode 'E' key
                    document.addEventListener('keydown', handleKeyboardShortcuts, true);
                    log("Added global keyboard listener for remix mode shortcuts.");
                    
                    log("Initialization complete."); // Log from 5.7

                } catch (e) { // Use more robust error handling from 5.7
                    log("FATAL ERROR during script initialization after core element found:");
                    console.error(e);
                    alert("A critical error occurred during Aros Patcher initialization. Check Console (F12).");
                }
            });

            // --- NEW: Toggle Input Mode Function ---
            function toggleInputMode(mode) {
                if (mode === 'wildcard' && typeof wildcardUtils === 'undefined') {
                    alert('Wildcard functionality is unavailable because the supporting library (wildcards.js) could not be loaded. Please check the @require URL for wildcards.js in the script header.');
                    log("Attempted to switch to Wildcard mode, but wildcardUtils is not loaded. Preventing switch.");
                    return; // Prevent switching to wildcard mode
                }

                // Reset all mode flags
                isWildcardMode = false;
                isRemixMode = false;

                // Set the appropriate mode
                if (mode === 'wildcard') {
                    isWildcardMode = true;
                } else if (mode === 'remix') {
                    isRemixMode = true;
                }

                const normalModeBtn = document.getElementById('sora-mode-normal');
                const wildcardModeBtn = document.getElementById('sora-mode-wildcard');
                const remixModeBtn = document.getElementById('sora-mode-remix');
                const wildcardControls = document.getElementById('sora-wildcard-controls');
                const textareaLabel = document.getElementById('textarea-label');
                const textarea = document.getElementById('sora-input');
                
                // Reset all button styles
                [normalModeBtn, wildcardModeBtn, remixModeBtn].forEach(btn => {
                    if (btn) {
                        btn.classList.remove('mode-active');
                        btn.style.backgroundColor = 'transparent';
                    }
                });
                
                // Update UI based on selected mode
                if (isWildcardMode) {
                    wildcardModeBtn.classList.add('mode-active');
                    wildcardModeBtn.style.backgroundColor = 'rgba(60, 130, 250, 0.3)';
                    wildcardControls.style.display = 'block';
                    textareaLabel.textContent = 'Enter prompt template with wildcards:';
                    textarea.placeholder = 'Enter a template with wildcards like __color__ and variations like [option1, option2].\nExamples:\nA __animal__ in a __location__ at __time__\nA [red, blue, green] __object__ with __material__ texture';
                } else if (isRemixMode) {
                    remixModeBtn.classList.add('mode-active');
                    remixModeBtn.style.backgroundColor = 'rgba(60, 130, 250, 0.3)';
                    wildcardControls.style.display = 'none';
                    textareaLabel.textContent = 'Enter prompts for remixing:';
                    textarea.placeholder = `Enter prompts for remixing existing generations.\nExample:\ngenerate a wolf on the same style\n${PROMPT_DELIMITER}\nmake it more colorful\n${PROMPT_DELIMITER}\nadd a forest background...\nPress 'E' to trigger remix manually.`;
                } else { // normal mode
                    normalModeBtn.classList.add('mode-active');
                    normalModeBtn.style.backgroundColor = 'rgba(60, 130, 250, 0.3)';
                    wildcardControls.style.display = 'none';
                    textareaLabel.textContent = `Enter prompt list (separated by ${PROMPT_DELIMITER}):`;
                    textarea.placeholder = `Enter prompts, separated by a line containing ${PROMPT_DELIMITER}\nExample:\nPrompt 1 Line 1\nPrompt 1 Line 2\n${PROMPT_DELIMITER}\nPrompt 2\n${PROMPT_DELIMITER}\nPrompt 3...\nEnable 'Loop' to repeat.\nPaste images here (enable 'Persist Images' to reuse).`;
                }
                
                log(`Input mode switched to ${mode} mode`);
            }

            // --- NEW: Handle Generate Prompts Function ---
            function handleGeneratePrompts() {
                const template = document.getElementById('sora-input').value.trim();
                if (!template) {
                    log("Generate prompts cancelled: No template entered.");
                    return alert('Please enter a prompt template with wildcards.');
                }
                log(`➡️ [handleGeneratePrompts] Original template from textarea: "${template}"`);

                wildcardTemplate = template;
                const countInput = document.getElementById('sora-prompt-count');
                const count = parseInt(countInput.value);
                if (isNaN(count) || count < 1 || count > 100) {
                    log(`Invalid prompt count (${countInput.value}), using default of 10.`);
                    generatedPromptCount = 10;
                    countInput.value = 10;
                } else {
                    generatedPromptCount = count;
                }
                
                log(`Generating ${generatedPromptCount} prompts from template: "${template.substring(0, 50)}..."`);
                
                try {
                    // Check if wildcardUtils exists (from the required wildcards.js)
                    if (typeof wildcardUtils === 'undefined') {
                        throw new Error('Wildcard utilities not loaded. Make sure the script is correctly included.');
                    }
                    
                    // Generate prompts using the wildcard utilities
                    const generatedPrompts = wildcardUtils.generatePrompts(template, generatedPromptCount);
                    log(`⬅️ [handleGeneratePrompts] Prompts received from wildcardUtils.generatePrompts:`);
                    console.log(generatedPrompts);
                    
                    // Join prompts with the delimiter for display
                    const formattedResult = generatedPrompts.join(`\n${PROMPT_DELIMITER}\n`);
                    
                    // Switch back to normal mode to display generated prompts
                    toggleInputMode('normal');
                    
                    // Display the generated prompts
                    document.getElementById('sora-input').value = formattedResult;
                    updateStartButtonPromptCount();
                    
                    log(`📄 [handleGeneratePrompts] Formatted result set to textarea: "${formattedResult.substring(0, 200)}..."`);
                    log(`✅ Successfully generated ${generatedPrompts.length} prompts from template.`);
                } catch (error) {
                    log(`ERROR generating prompts: ${error.message}`);
                    alert(`Error generating prompts: ${error.message}`);
                }
            }

            // --- NEW: Handle Load Example Function ---
            function handleLoadExample() {
                try {
                    // Check if wildcardUtils exists (from the required wildcards.js)
                    if (typeof wildcardUtils === 'undefined' || !wildcardUtils.getRandomExample) {
                        throw new Error('Wildcard utilities not loaded correctly.');
                    }
                    
                    // Check if there's a URL parameter for a specific template type
                    const urlParams = new URLSearchParams(window.location.search);
                    const templateType = urlParams.get('template');
                    
                    let exampleTemplate;
                    
                    // Custom template for porcelain if requested
                    if (templateType === 'porcelain') {
                        exampleTemplate = "Generate a [delicate, ornate, minimalist, sculptural] __color__ __object__ made of shiny porcelain, with [floral, geometric, abstract, figurative] intricate details, __lighting__ enhancing the reflective surface, displayed in a __location__, photographed with __camera__ technique, __style__ aesthetic.";
                    } else {
                        // Get a random example template
                        exampleTemplate = wildcardUtils.getRandomExample();
                    }
                    
                    // Set it in the textarea
                    document.getElementById('sora-input').value = exampleTemplate;
                    
                    log(`Loaded example template: "${exampleTemplate}"`);
                } catch (error) {
                    log(`ERROR loading example: ${error.message}`);
                    alert(`Error loading example: ${error.message}`);
                }
            }

            // --- NEW: Remix Mode Functions ---
            function findRemixButton() {
                // Look for the "Edit remix" button based on the provided HTML structure
                const remixButtons = document.querySelectorAll('button');
                for (const button of remixButtons) {
                    const textDiv = button.querySelector('div.w-full.truncate');
                    if (textDiv && textDiv.textContent.trim() === 'Edit remix') {
                        return button;
                    }
                }
                return null;
            }

            function findRemixSubmitButton() {
                // Look for the "Remix" submit button
                const buttons = document.querySelectorAll('button[data-disabled="false"]');
                for (const button of buttons) {
                    if (button.textContent.trim() === 'Remix') {
                        return button;
                    }
                }
                return null;
            }

            function isRemixButtonAvailable() {
                const remixBtn = findRemixButton();
                return remixBtn && remixBtn.getAttribute('data-disabled') === 'false';
            }

            async function clickRemixButton() {
                const remixBtn = findRemixButton();
                if (!remixBtn) {
                    log("ERROR: Remix button not found");
                    return false;
                }

                if (remixBtn.getAttribute('data-disabled') === 'true') {
                    log("Remix button found but disabled, waiting...");
                    return false;
                }

                log("Clicking remix button...");
                
                // Try React handler first, then fallback to regular click
                const btnKey = Object.keys(remixBtn).find(k => k.startsWith("__reactProps$"));
                if (btnKey && remixBtn[btnKey]?.onClick) {
                    try {
                        remixBtn[btnKey].onClick({ bubbles: true, cancelable: true });
                        log("React onClick triggered on remix button.");
                    } catch (e) {
                        remixBtn.click();
                        log("Used standard click() after React onClick error.");
                    }
                } else {
                    remixBtn.click();
                    log("Used standard click() - no React handler found.");
                }

                return true;
            }

            async function waitForRemixButton() {
                return new Promise((resolve) => {
                    let attempts = 0;
                    const maxAttempts = 60; // 30 seconds with 500ms intervals
                    
                    const checkRemix = () => {
                        attempts++;
                        
                        if (!isRunning) {
                            log("Remix waiting cancelled: Not running.");
                            resolve(false);
                            return;
                        }

                        if (isRemixButtonAvailable()) {
                            log(`Remix button became available after ${attempts * 0.5} seconds.`);
                            resolve(true);
                            return;
                        }

                        if (attempts >= maxAttempts) {
                            log("ERROR: Remix button did not become available within 30 seconds.");
                            resolve(false);
                            return;
                        }

                        setTimeout(checkRemix, 500);
                    };

                    checkRemix();
                });
            }

            async function submitRemixPrompt(promptText) {
                if (!isRunning) {
                    log("submitRemixPrompt cancelled: Not running.");
                    return;
                }

                log(`=== REMIX PROMPT SUBMISSION (CLEAR-FIRST APPROACH) ===`);
                log(`Target prompt text: "${promptText}"`);

                // Find the remix textarea - be more specific for remix mode
                log("Finding remix textarea (prioritizing document.activeElement)...");
                let arosTextarea = null;

                // Prioritize document.activeElement if it's a textarea, as clicking "Edit remix" should focus it.
                if (document.activeElement && document.activeElement.tagName === 'TEXTAREA') {
                    const el = document.activeElement;
                    const rect = el.getBoundingClientRect();
                    const isVisible = rect.width > 0 && rect.height > 0 &&
                                   window.getComputedStyle(el).display !== 'none' &&
                                   window.getComputedStyle(el).visibility !== 'hidden';
                    if (isVisible) {
                        // Check if it's within a dialog, which is common for remix modals
                        if (el.closest('[role="dialog"]')) {
                            log("Using document.activeElement as it's a visible TEXTAREA within a dialog.");
                            arosTextarea = el;
                        } else {
                            log("document.activeElement is a visible TEXTAREA, but not in a dialog. Using it cautiously.");
                            arosTextarea = el; // Still a strong candidate
                        }
                    } else {
                        log("document.activeElement is a TEXTAREA but not visible. Will try fallback.");
                    }
                }

                if (!arosTextarea) {
                    log("document.activeElement was not a suitable TEXTAREA. Fallback: Searching for textarea in a dialog or visible one.");
                    // Try to find a textarea within a dialog first
                    const dialogTextareas = document.querySelectorAll('[role="dialog"] textarea');
                    for (const ta of dialogTextareas) {
                        const rect = ta.getBoundingClientRect();
                        const isVisible = rect.width > 0 && rect.height > 0 &&
                                       window.getComputedStyle(ta).display !== 'none' &&
                                       window.getComputedStyle(ta).visibility !== 'hidden';
                        if (isVisible) {
                            arosTextarea = ta;
                            log("Fallback: Found a visible textarea within a [role='dialog'].");
                            break;
                        }
                    }

                    // If still not found, try any visible textarea (last resort, less specific)
                    // This targets textareas that might be part of the remix UI but not in a strict dialog
                    if (!arosTextarea) {
                        log("Fallback: No textarea in dialog found. Searching for any visible textarea likely for remix.");
                        const allTextareas = document.querySelectorAll('textarea');
                        for (const ta of allTextareas) {
                            const rect = ta.getBoundingClientRect();
                            const isVisible = rect.width > 0 && rect.height > 0 &&
                                           window.getComputedStyle(ta).display !== 'none' &&
                                           window.getComputedStyle(ta).visibility !== 'hidden';
                            // Add heuristics: placeholder text or specific classes if known, or just being visible
                            if (isVisible && (ta.placeholder.toLowerCase().includes('remix') || ta.placeholder.toLowerCase().includes('edit') || ta.classList.contains('flex') || ta.classList.contains('w-full'))) {
                                arosTextarea = ta;
                                log("Fallback: Found a generic visible textarea with remix-like properties (last resort).");
                                break;
                            }
                        }
                        // If still no specific one, take the first visible one if any
                        if (!arosTextarea) {
                             for (const ta of allTextareas) {
                                const rect = ta.getBoundingClientRect();
                                if (rect.width > 0 && rect.height > 0 && window.getComputedStyle(ta).display !== 'none' && window.getComputedStyle(ta).visibility !== 'hidden') {
                                    arosTextarea = ta;
                                    log("Fallback: Took the very first generic visible textarea (absolute last resort).");
                                    break;
                                }
                            }
                        }
                    }
                }

                if (!arosTextarea) {
                    log("ERROR: Remix textarea could not be reliably identified. Stopping.");
                    handleStop();
                    return;
                }

                log(`Selected Remix Textarea - Class: ${arosTextarea.className}, ID: ${arosTextarea.id}, Placeholder: "${arosTextarea.placeholder}", Value: "${arosTextarea.value.substring(0,30)}..."`);


                log(`Found textarea with initial content: "${arosTextarea.value?.substring(0, 50) || 'empty'}..."`);

                // Focus the textarea
                arosTextarea.focus();
                await new Promise(resolve => setTimeout(resolve, 300));

                // STEP 1: AGGRESSIVE TEXT CLEARING using multiple methods
                log("STEP 1: Clearing existing text with multiple approaches...");
                
                // Method A: Select all and delete with keyboard simulation
                log("Clearing Method A: Select All + Delete key simulation...");
                try {
                    // Select all text
                    arosTextarea.select();
                    arosTextarea.value = '';
                    
                    // Simulate Delete key
                    const deleteEvent = new KeyboardEvent('keydown', {
                        key: 'Delete',
                        code: 'Delete',
                        keyCode: 46,
                        bubbles: true,
                        cancelable: true
                    });
                    arosTextarea.dispatchEvent(deleteEvent);
                    
                    // Also try Backspace
                    const backspaceEvent = new KeyboardEvent('keydown', {
                        key: 'Backspace',
                        code: 'Backspace',
                        keyCode: 8,
                        bubbles: true,
                        cancelable: true
                    });
                    arosTextarea.dispatchEvent(backspaceEvent);
                    
                    // Clear the value directly
                    arosTextarea.value = '';
                    arosTextarea.dispatchEvent(new Event('input', { bubbles: true }));
                    
                    await new Promise(resolve => setTimeout(resolve, 200));
                    log(`After Method A: "${arosTextarea.value}"`);
                } catch (e) {
                    log(`Method A failed: ${e.message}`);
                }

                // Method B: execCommand deleteWordBackward/deleteWordForward
                log("Clearing Method B: execCommand delete operations...");
                try {
                    arosTextarea.focus();
                    arosTextarea.select();
                    
                    // Try different delete commands
                    document.execCommand('selectAll');
                    document.execCommand('delete');
                    document.execCommand('removeFormat');
                    
                    // Ensure it's empty
                    arosTextarea.value = '';
                    arosTextarea.textContent = '';
                    
                    await new Promise(resolve => setTimeout(resolve, 200));
                    log(`After Method B: "${arosTextarea.value}"`);
                } catch (e) {
                    log(`Method B failed: ${e.message}`);
                }

                // Method C: Character-by-character deletion
                log("Clearing Method C: Character-by-character deletion...");
                try {
                    const currentLength = arosTextarea.value.length;
                    if (currentLength > 0) {
                        // Position cursor at end
                        arosTextarea.setSelectionRange(currentLength, currentLength);
                        
                        // Delete each character with backspace simulation
                        for (let i = 0; i < currentLength; i++) {
                            // Simulate backspace key
                            const backspaceEvent = new KeyboardEvent('keydown', {
                                key: 'Backspace',
                                code: 'Backspace',
                                keyCode: 8,
                                bubbles: true,
                                cancelable: true
                            });
                            arosTextarea.dispatchEvent(backspaceEvent);
                            
                            // Remove character from value
                            arosTextarea.value = arosTextarea.value.slice(0, -1);
                            arosTextarea.dispatchEvent(new Event('input', { bubbles: true }));
                            
                            // Small delay every 10 characters
                            if (i % 10 === 0) {
                                await new Promise(resolve => setTimeout(resolve, 10));
                            }
                        }
                    }
                    
                    await new Promise(resolve => setTimeout(resolve, 200));
                    log(`After Method C: "${arosTextarea.value}"`);
                } catch (e) {
                    log(`Method C failed: ${e.message}`);
                }

                // Method D: React-specific clearing
                log("Clearing Method D: React-specific clearing...");
                try {
                    // Find React props and trigger onChange with empty value
                    const reactKeyClear = Object.keys(arosTextarea).find(k => k.startsWith("__reactProps$")); // Renamed to avoid conflict
                    if (reactKeyClear && arosTextarea[reactKeyClear]?.onChange) {
                        // Create a fake event with empty value
                        const fakeEvent = {
                            target: { ...arosTextarea, value: '' }, // Ensure value is part of the event target
                            currentTarget: arosTextarea
                        };
                        arosTextarea[reactKeyClear].onChange(fakeEvent);
                    }
                    
                    // Also clear the actual DOM value
                    arosTextarea.value = '';
                    arosTextarea.textContent = '';
                    
                    // Dispatch all relevant events
                    arosTextarea.dispatchEvent(new Event('input', { bubbles: true }));
                    arosTextarea.dispatchEvent(new Event('change', { bubbles: true }));
                    
                    await new Promise(resolve => setTimeout(resolve, 200));
                    log(`After Method D: "${arosTextarea.value}"`);
                } catch (e) {
                    log(`Method D failed: ${e.message}`);
                }

                // Final verification that textarea is empty
                const afterClearValue = arosTextarea.value || arosTextarea.textContent || '';
                log(`After all clearing methods: "${afterClearValue}"`);
                
                if (afterClearValue.length > 0) {
                    log(`WARNING: Textarea still contains text after clearing: "${afterClearValue}"`);
                    // Force clear one more time
                    arosTextarea.value = '';
                    arosTextarea.textContent = '';
                    arosTextarea.innerHTML = '';
                }

                // STEP 2: SET NEW TEXT (now that it should be empty)
                log("STEP 2: Setting new text in cleared textarea...");
                
                // Wait longer after clearing to let React settle
                await new Promise(resolve => setTimeout(resolve, 800));
                
                // Ensure textarea is still focused
                arosTextarea.focus();
                await new Promise(resolve => setTimeout(resolve, 200));
                
                // Method 1: Direct value setting with React events
                log("Setting text Method 1: Direct value assignment with React events...");
                arosTextarea.value = promptText;
                
                // Dispatch input event immediately
                arosTextarea.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                
                // Trigger React onChange if available
                const reactKeyTextSet = Object.keys(arosTextarea).find(k => k.startsWith("__reactProps$")); // Renamed for clarity
                if (reactKeyTextSet && arosTextarea[reactKeyTextSet]?.onChange) {
                    try {
                        log("Triggering React onChange for new text with {target: arosTextarea} which has .value set...");
                        arosTextarea[reactKeyTextSet].onChange({ target: arosTextarea }); // Pass the textarea itself, its .value is already updated
                    } catch (e) {
                        log(`React onChange (for new text) failed: ${e.message}`);
                    }
                }
                
                // Dispatch change event
                arosTextarea.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
                
                await new Promise(resolve => setTimeout(resolve, 500));
                
                // Verify the new text was set
                let afterSetValue = arosTextarea.value || arosTextarea.textContent || '';
                log(`After Method 1: "${afterSetValue}"`);
                
                // Method 2: execCommand insertText (if Method 1 didn't work)
                if (!afterSetValue.includes(promptText.substring(0, 10))) {
                    log("Setting text Method 2: execCommand insertText...");
                    arosTextarea.focus();
                    arosTextarea.setSelectionRange(0, 0); // Position at start
                    
                    const execSuccess = document.execCommand('insertText', false, promptText);
                    log(`execCommand insertText result: ${execSuccess}`);
                    
                    await new Promise(resolve => setTimeout(resolve, 500));
                    
                    afterSetValue = arosTextarea.value || arosTextarea.textContent || '';
                    log(`After Method 2: "${afterSetValue}"`);
                }
                
                // Method 3: Character-by-character typing (if Methods 1 & 2 didn't work)
                if (!afterSetValue.includes(promptText.substring(0, 10))) {
                    log("Setting text Method 3: Character-by-character typing...");
                    arosTextarea.focus();
                    arosTextarea.setSelectionRange(0, 0);
                    
                    // Type each character with events
                    for (let i = 0; i < promptText.length; i++) {
                        const char = promptText.charAt(i);
                        
                        // Add character to value
                        arosTextarea.value += char;
                        
                        // Dispatch input event for each character
                        arosTextarea.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                        
                        // Small delay every 20 characters to not overwhelm
                        if (i % 20 === 0) {
                            await new Promise(resolve => setTimeout(resolve, 50));
                        }
                    }
                    
                    // Final change event
                    arosTextarea.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
                    
                    // Try React onChange again
                    if (reactKeyTextSet && arosTextarea[reactKeyTextSet]?.onChange) {
                        try {
                            arosTextarea[reactKeyTextSet].onChange({ target: arosTextarea });
                        } catch (e) {
                            log(`React onChange failed on typing: ${e.message}`);
                        }
                    }
                    
                    await new Promise(resolve => setTimeout(resolve, 500));
                    
                    afterSetValue = arosTextarea.value || arosTextarea.textContent || '';
                    log(`After Method 3: "${afterSetValue}"`);
                }
                
                // Method 4: Force React state update (if all else fails)
                if (!afterSetValue.includes(promptText.substring(0, 10))) {
                    log("Setting text Method 4: Force React state update...");

                    // Try using React's internal value setter
                    const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
                    if (valueSetter) {
                        valueSetter.call(arosTextarea, promptText);
                        log("Used HTMLTextAreaElement value setter");
                    }

                    // Create a more complete React event
                    const reactKeyForce = Object.keys(arosTextarea).find(k => k.startsWith("__reactProps$")); // Renamed
                    const syntheticEvent = {
                        target: arosTextarea, // arosTextarea's value should be promptText here
                        currentTarget: arosTextarea,
                        type: 'change',
                        bubbles: true,
                        cancelable: true,
                        nativeEvent: new Event('change') // ensure nativeEvent exists
                    };

                    if (reactKeyForce && arosTextarea[reactKeyForce]?.onChange) {
                        try {
                            // Crucially, ensure arosTextarea.value IS promptText before this call
                            // The valueSetter above should have handled this.
                            arosTextarea[reactKeyForce].onChange(syntheticEvent);
                            log("Triggered React onChange with synthetic event");
                        } catch (e) {
                            log(`Synthetic React onChange failed: ${e.message}`);
                        }
                    }
                    
                    // Dispatch all events again
                    arosTextarea.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                    arosTextarea.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
                    
                    await new Promise(resolve => setTimeout(resolve, 500));
                    
                    afterSetValue = arosTextarea.value || arosTextarea.textContent || '';
                    log(`After Method 4: "${afterSetValue}"`);
                }

                // Final verification
                const finalValue = arosTextarea.value || arosTextarea.textContent || '';
                log(`FINAL RESULT: "${finalValue}"`);
                log(`Expected text found: ${finalValue.includes(promptText.substring(0, 10))}`);
                
                if (!finalValue.includes(promptText.substring(0, 10))) {
                    log(`❌ WARNING: New text was not successfully set! Final value: "${finalValue}"`);
                    log(`❌ Expected to find: "${promptText.substring(0, 10)}"`);
                } else {
                    log(`✅ SUCCESS: New text was successfully set!`);
                }
                
                log(`=== END REMIX PROMPT SUBMISSION ===`);

                // Continue with submit button logic
                log("Waiting for remix submit button to enable...");
                await new Promise(resolve => setTimeout(resolve, 1000));

                if (!isRunning) {
                    log("Remix submit cancelled: Not running.");
                    return;
                }

                // Find and click the remix submit button
                const submitBtn = findRemixSubmitButton();
                if (submitBtn) {
                    log("Remix submit button found and enabled.");

                    // Set generation flags for auto mode
                    const isAuto = document.getElementById('sora-auto-submit-checkbox')?.checked ?? false;
                    if (isAuto) {
                        log("Auto Mode: Setting flags for remix submission...");
                        isGenerating = true;
                        _generationIndicatorRemoved = false;
                        _newImagesAppeared = false;

                        const gridContainer = document.querySelector('div[class*="max-w-"][class*="flex-col"]') ?? document.body;
                        if (completionObserver) {
                            try {
                                completionObserver.observe(gridContainer, { childList: true, subtree: true });
                            } catch (e) {
                                log(`ERROR starting completion observer for remix: ${e.message}`);
                            }
                        }

                        if (generationTimeoutId) {
                            clearTimeout(generationTimeoutId);
                        }

                        generationTimeoutId = setTimeout(() => {
                            if (!isRunning || !isGenerating) return;
                            log(`ERROR: Remix generation TIMEOUT reached.`);
                            isGenerating = false;
                            completionObserver?.disconnect();
                            _generationIndicatorRemoved = false;
                            _newImagesAppeared = false;
                            generationTimeoutId = null;
                            updateProgress();

                            if (promptQueue.length > 0 || (isLooping && originalPromptList.length > 0)) {
                                processNextRemixPrompt();
                            } else {
                                handleStop();
                            }
                        }, GENERATION_TIMEOUT_MS);
                    }

                    // Click the remix submit button
                    const btnKey = Object.keys(submitBtn).find(k => k.startsWith("__reactProps$"));
                    if (btnKey && submitBtn[btnKey]?.onClick) {
                        try {
                            submitBtn[btnKey].onClick({ bubbles: true, cancelable: true });
                            log("React onClick triggered on remix submit button.");
                        } catch (e) {
                            submitBtn.click();
                            log("Used standard click() after React onClick error on remix submit.");
                        }
                    } else {
                        submitBtn.click();
                        log("Used standard click() on remix submit - no React handler found.");
                    }
                } else {
                    log("ERROR: Remix submit button not found. Stopping.");
                    handleStop();
                }
            }

            async function processNextRemixPrompt() {
                if (!isRunning) { 
                    log("processNextRemixPrompt: Aborted, not running."); 
                    updateProgress(); 
                    return; 
                }

                // Check loop state for remix mode
                if (promptQueue.length === 0) {
                    if (isLooping && originalPromptList.length > 0) {
                        log("Remix Loop: Prompt queue empty. Resetting from original list.");
                        promptQueue = [...originalPromptList];
                        totalPromptCount = originalPromptList.length;
                    } else {
                        log("processNextRemixPrompt: Queue is empty and not looping. Finishing run.");
                        isRunning = false;
                        updateProgress();
                        return;
                    }
                }

                if (autoSubmitTimeoutId) { 
                    clearTimeout(autoSubmitTimeoutId); 
                    autoSubmitTimeoutId = null; 
                    log("Cleared autoSubmitTimeoutId in processNextRemixPrompt."); 
                }
                if (generationTimeoutId) { 
                    clearTimeout(generationTimeoutId); 
                    generationTimeoutId = null; 
                    log("Cleared generationTimeoutId in processNextRemixPrompt."); 
                }

                totalPromptsSentLoop++;
                const nextPrompt = promptQueue.shift();
                updateProgress();

                // Wait for remix button to become available
                log("Waiting for remix button to become available...");
                const remixAvailable = await waitForRemixButton();
                
                if (!remixAvailable || !isRunning) {
                    log("Remix button not available or process stopped. Stopping.");
                    handleStop();
                    return;
                }

                // Click the remix button
                const remixClicked = await clickRemixButton();
                if (!remixClicked || !isRunning) {
                    log("Failed to click remix button or process stopped. Stopping.");
                    handleStop();
                    return;
                }

                // Wait a moment for the remix interface to load
                await new Promise(resolve => setTimeout(resolve, 1000));

                if (!isRunning) {
                    log("Process stopped while waiting for remix interface.");
                    return;
                }

                // Submit the remix prompt
                await submitRemixPrompt(nextPrompt);
            }

            function startRemixLoop() {
                if (!isRunning || (promptQueue.length === 0 && !isLooping)) {
                    log("startRemixLoop: Condition not met (not running or empty queue and not looping).");
                    isRunning = false;
                    updateProgress();
                    return;
                }
                log(`Starting REMIX loop. Loop: ${isLooping}`);
                processNextRemixPrompt();
            }

            // --- NEW: Keyboard Shortcuts Handler ---
            function handleKeyboardShortcuts(event) {
                // Only handle 'E' key for remix mode
                if (event.key.toLowerCase() === 'e' && isRemixMode && !isRunning) {
                    // Check if we're not typing in an input field
                    const activeElement = document.activeElement;
                    const isTyping = activeElement && (
                        activeElement.tagName === 'INPUT' || 
                        activeElement.tagName === 'TEXTAREA' || 
                        activeElement.contentEditable === 'true'
                    );
                    
                    if (!isTyping) {
                        event.preventDefault();
                        log("'E' key pressed - triggering manual remix.");
                        handleManualRemix();
                    }
                }
            }

            // --- NEW: Manual Remix Handler ---
            async function handleManualRemix() {
                if (isRunning) {
                    log("Manual remix cancelled: Process already running.");
                    return;
                }

                log("Manual remix triggered via 'E' key.");
                
                // Check if remix button is available
                if (!isRemixButtonAvailable()) {
                    log("Manual remix: Remix button not available.");
                    alert("Remix button is not available. Please wait for a generation to complete first.");
                    return;
                }

                // Get the current prompt from the textarea
                const input = document.getElementById('sora-input').value.trim();
                if (!input) {
                    log("Manual remix: No prompt entered.");
                    alert("Please enter a prompt for remixing.");
                    return;
                }

                // Use the first prompt if multiple are entered
                const prompts = input.split(PROMPT_DELIMITER).map(x => x.trim()).filter(Boolean);
                const promptToUse = prompts[0];

                try {
                    // Click the remix button
                    const remixClicked = await clickRemixButton();
                    if (!remixClicked) {
                        log("Manual remix: Failed to click remix button.");
                        alert("Failed to click remix button.");
                        return;
                    }

                    // Wait for remix interface to load
                    await new Promise(resolve => setTimeout(resolve, 1000));

                    // Submit the prompt
                    await submitRemixPrompt(promptToUse);
                    log("Manual remix completed successfully.");
                } catch (error) {
                    log(`Manual remix error: ${error.message}`);
                    alert(`Manual remix failed: ${error.message}`);
                }
            }

            // --- NEW: Manual Remix Loop Function ---
            function startManualRemixLoop(intervalSeconds) {
                log(`Starting MANUAL Remix Loop with ${intervalSeconds}s interval. Loop: ${isLooping}`);
                const intervalMs = intervalSeconds * 1000;
                const cooldownBtn = document.getElementById('sora-cooldown');

                const stopManualTimer = () => {
                    if (manualTimerTimeoutId) {
                        clearTimeout(manualTimerTimeoutId);
                        manualTimerTimeoutId = null;
                        log("Manual remix timer cleared.");
                    }
                    if (visualCountdownInterval) {
                        clearInterval(visualCountdownInterval);
                        visualCountdownInterval = null;
                        if (cooldownBtn && !isRunning) cooldownBtn.textContent = `Cooldown: --s`;
                        log("Manual remix visual countdown timer cleared.");
                    }
                };

                const startVisualCountdown = (totalSeconds) => {
                    if (visualCountdownInterval) clearInterval(visualCountdownInterval);

                    let timeRemaining = totalSeconds;
                    if (cooldownBtn && cooldownBtn.style.display !== 'none') {
                        cooldownBtn.textContent = `Cooldown: ${timeRemaining}s`;
                    }

                    visualCountdownInterval = setInterval(() => {
                        timeRemaining--;
                        if (cooldownBtn && cooldownBtn.style.display !== 'none') {
                            if(isRunning) {
                                cooldownBtn.textContent = `Cooldown: ${Math.max(0, timeRemaining)}s`;
                            } else {
                                clearInterval(visualCountdownInterval);
                                visualCountdownInterval = null;
                            }
                        } else if (!isRunning){
                            clearInterval(visualCountdownInterval);
                            visualCountdownInterval = null;
                        }
                        if (timeRemaining <= 0) {
                            clearInterval(visualCountdownInterval);
                            visualCountdownInterval = null;
                        }
                    }, 1000);
                    log(`Manual remix visual countdown started (${totalSeconds}s).`);
                };

                const manualRemixTick = async () => {
                    if (!isRunning) {
                        log("Manual Remix Timer Tick: Stopping - Not running.");
                        stopManualTimer();
                        updateProgress();
                        return;
                    }

                    if (promptQueue.length === 0) {
                        if (isLooping && originalPromptList.length > 0) {
                            log("Manual Remix Timer Loop: Prompt queue empty. Resetting from original list.");
                            promptQueue = [...originalPromptList];
                            totalPromptCount = originalPromptList.length;
                        } else {
                            log("Manual Remix Timer Tick: Stopping - Queue empty and not looping.");
                            stopManualTimer();
                            isRunning = false;
                            updateProgress();
                            return;
                        }
                    }

                    totalPromptsSentLoop++;
                    const nextPrompt = promptQueue.shift();
                    updateProgress();
                    startVisualCountdown(intervalSeconds);

                    // Wait for remix button and process the prompt
                    const remixAvailable = await waitForRemixButton();
                    if (!remixAvailable || !isRunning) {
                        log("Remix button not available or process stopped during manual mode.");
                        stopManualTimer();
                        handleStop();
                        return;
                    }

                    const remixClicked = await clickRemixButton();
                    if (!remixClicked || !isRunning) {
                        log("Failed to click remix button during manual mode.");
                        stopManualTimer();
                        handleStop();
                        return;
                    }

                    await new Promise(resolve => setTimeout(resolve, 1000));
                    if (!isRunning) {
                        stopManualTimer();
                        return;
                    }

                    await submitRemixPrompt(nextPrompt);

                    if (isRunning) {
                        if (promptQueue.length > 0 || (isLooping && originalPromptList.length > 0)) {
                            log("Manual Remix Timer: Prompt submitted. Scheduling next tick after cooldown.");
                            manualTimerTimeoutId = setTimeout(async () => {
                                await manualRemixTick();
                            }, intervalMs);
                            log(`Scheduled next manual remix tick in ${intervalMs}ms.`);
                        } else {
                            log("Manual Remix Timer: All prompts processed. Finishing run after cooldown.");
                            stopManualTimer();
                            isRunning = false;
                            updateProgress();
                        }
                    } else {
                        log("Manual Remix Timer Tick: Detected isRunning=false after prompt submission. Stopping timers.");
                        stopManualTimer();
                        updateProgress();
                    }
                };

                // Initial prompt submission for manual remix mode
                if (isRunning && promptQueue.length > 0) {
                    log("Manual Remix Timer: Preparing to send initial prompt.");
                    (async () => {
                        totalPromptsSentLoop++;
                        const firstPrompt = promptQueue.shift();
                        updateProgress();
                        startVisualCountdown(intervalSeconds);

                        const remixAvailable = await waitForRemixButton();
                        if (!remixAvailable || !isRunning) {
                            log("Initial remix button not available or process stopped.");
                            stopManualTimer();
                            handleStop();
                            return;
                        }

                        const remixClicked = await clickRemixButton();
                        if (!remixClicked || !isRunning) {
                            log("Failed to click initial remix button.");
                            stopManualTimer();
                            handleStop();
                            return;
                        }

                        await new Promise(resolve => setTimeout(resolve, 1000));
                        if (!isRunning) {
                            stopManualTimer();
                            return;
                        }

                        await submitRemixPrompt(firstPrompt);

                        if (isRunning) {
                            if (promptQueue.length > 0 || (isLooping && originalPromptList.length > 0)) {
                                log("Manual Remix Timer: Initial prompt submitted. Scheduling next tick.");
                                manualTimerTimeoutId = setTimeout(async () => {
                                    await manualRemixTick();
                                }, intervalMs);
                                log(`Scheduled next manual remix tick in ${intervalMs}ms.`);
                            } else {
                                log("Manual Remix Timer: Only one prompt was in the queue and not looping. Finishing run after cooldown.");
                                stopManualTimer();
                                isRunning = false;
                                updateProgress();
                            }
                        } else {
                            log("Manual Remix Timer: Process was stopped during initial prompt submission.");
                            stopManualTimer();
                            updateProgress();
                        }
                    })();
                } else if (isRunning && promptQueue.length === 0 && isLooping && originalPromptList.length > 0) {
                    log("Manual Remix Timer: Started with empty queue but looping. Resetting queue and starting tick.");
                    promptQueue = [...originalPromptList];
                    totalPromptCount = originalPromptList.length;
                    manualTimerTimeoutId = setTimeout(async () => {
                        await manualRemixTick();
                    }, 0);
                } else if (isRunning) {
                    log("Manual Remix Timer: Started with an empty queue and no way to loop. Stopping.");
                    isRunning = false;
                    stopManualTimer();
                    updateProgress();
                } else {
                    log("Manual Remix Timer: Initial state not suitable for starting timer (isRunning is false).");
                    updateProgress();
                }
            }

            // --- NEW: Remix Worker Message Handler ---
            async function handleRemixWorkerMessage(e) {
                const data = e.data;
                log(`Main received from worker: ${JSON.stringify(data)}`);

                switch (data.type) {
                    case 'log':
                        log(data.message); // Log messages from worker
                        break;
                    case 'started':
                        log(`Remix worker reported started. Initial queue: ${data.initialQueueSize}`);
                        // Update UI to reflect that the worker has started and potentially the queue size.
                        // The promptQueue in main thread is the source for the worker's initial queue.
                        // totalPromptCount = data.initialQueueSize; // Or based on main promptQueue.length before worker start
                        updateProgress();
                        break;
                    case 'stopped':
                    case 'finished':
                        log(`Remix worker reported ${data.type}.`);
                        if (data.type === 'finished' && isRunning) {
                            log("Worker finished processing queue (e.g., empty and not looping).");
                            handleStop(true); // Pass true to indicate worker initiated this, avoid double-stopping worker
                        } else if (data.type === 'stopped' && isRunning) {
                            // If worker confirmed stop due to main thread request, update UI.
                            // isRunning should already be false if main thread called handleStop which then told worker.
                            // This case is more for worker confirming its stopped state.
                        }
                        updateProgress();
                        break;
                    case 'queue_refilled':
                        log(`Worker refilled queue. Main thread promptQueue may be stale. Worker size: ${data.queueSize}, Total in Loop: ${data.totalInLoop}`);
                        // The main thread promptQueue is NOT directly modified here.
                        // The worker manages its own queue. UI should reflect worker's state.
                        // updateProgress() will use main thread's promptQueue, which might be misleading for count.
                        // This needs to be reconciled if UI relies heavily on main thread promptQueue size during worker operation.
                        // For now, log it. A more sophisticated updateProgress would take worker's counts.
                        updateProgress(); // Call to update general UI elements like status.
                        break;
                    case 'process_prompt_in_main':
                        log(`Main: Worker requests processing for prompt: "${data.prompt}"`);
                        if (!isRunning || !isRemixMode) {
                            log("Main: Worker requested prompt processing, but main state is not running/remix. Telling worker to stop.");
                            if (remixModeWorker) remixModeWorker.postMessage({ command: 'stop' });
                            return;
                        }

                        totalPromptsSentLoop++; // Increment when main starts processing a worker-initiated prompt.
                        // updateProgress() will be called after submission.

                        log("Main: Waiting for remix button (worker request)...");
                        const remixAvailable = await waitForRemixButton();
                        if (!remixAvailable || !isRunning) {
                            log("Main: Remix button not available or stopped (worker request). Stopping.");
                            handleStop();
                            return;
                        }

                        const remixClicked = await clickRemixButton();
                        if (!remixClicked || !isRunning) {
                            log("Main: Failed to click remix button (worker request). Stopping.");
                            handleStop();
                            return;
                        }

                        await new Promise(resolve => setTimeout(resolve, 1000)); // UI load

                        if (!isRunning) {
                            log("Main: Stopped while waiting for remix UI (worker request).");
                            handleStop();
                            return;
                        }

                        if (generationTimeoutId) { clearTimeout(generationTimeoutId); generationTimeoutId = null;}
                        if (autoSubmitTimeoutId) { clearTimeout(autoSubmitTimeoutId); autoSubmitTimeoutId = null; }

                        await submitRemixPrompt(data.prompt);

                        if (isRunning) {
                            log("Main: Prompt submitted to DOM. Acknowledging worker.");
                            if (remixModeWorker) remixModeWorker.postMessage({ command: 'schedule_next_tick_ack' });
                            
                            // If in manual remix mode, restart visual countdown after successful submission
                            const autoCheckbox = document.getElementById('sora-auto-submit-checkbox');
                            if (isRemixMode && (!autoCheckbox || !autoCheckbox.checked)) {
                                const cooldownInput = document.getElementById('sora-cooldown-time');
                                let currentCooldown = parseInt(cooldownInput?.value, 10) || 5;
                                if (currentCooldown < 1) currentCooldown = 1;
                                log(`Manual Remix (Worker): Restarting visual countdown for ${currentCooldown}s.`);
                                startVisualCountdown(currentCooldown);
                            }
                        } else {
                            log("Main: Not running after prompt submission. Telling worker to stop.");
                            if (remixModeWorker) remixModeWorker.postMessage({ command: 'stop' });
                        }
                        updateProgress();
                        break;
                    default:
                        log(`Main: Unknown message type from worker: ${data.type}`);
                }
            }

            // --- NEW: Initialize Remix Worker ---
            function initializeRemixWorker() {
                if (remixModeWorker) {
                    log("Remix worker already initialized.");
                    return;
                }
                try {
                    log("Initializing remix worker...");
                    const blob = new Blob([remixWorkerCode], { type: 'application/javascript' });
                    const workerUrl = URL.createObjectURL(blob);
                    remixModeWorker = new Worker(workerUrl);
                    URL.revokeObjectURL(workerUrl); // Revoke immediately as worker is created

                    remixModeWorker.onmessage = handleRemixWorkerMessage;
                    remixModeWorker.onerror = function(error) {
                        log(`Remix Worker Error: ${error.message} at ${error.filename}:${error.lineno}`);
                        console.error("Remix Worker Error:", error);
                        // Consider stopping the process or alerting the user
                        if (isRunning && isRemixMode) {
                            handleStop();
                            alert("A critical error occurred in the Remix background worker. Remix mode has been stopped. Please check the console (F12).");
                        }
                    };
                    log("Remix worker instance created and listeners attached.");
                } catch (e) {
                    log(`FATAL: Could not initialize remix worker: ${e.message}`);
                    console.error("Worker Init Failed:", e);
                    remixModeWorker = null; // Ensure it's null on failure
                    alert("Failed to initialize the Remix background worker. Remix mode may not work correctly in the background.");
                }
            }

            // --- EXISTING Remix Functions to verify ---
            // processNextRemixPrompt will be largely replaced by worker interaction,
            // but its DOM manipulation parts will be called from handleRemixWorkerMessage.
            // We need to ensure it doesn't have its own looping/setTimeout anymore.

            async function processNextRemixPrompt() {
                // THIS FUNCTION'S LOOPING LOGIC IS NOW HANDLED BY THE WORKER if active.
                // It should primarily be a collection of DOM actions triggered by worker.
                // If called directly (e.g. worker failed or not in remix worker mode), it can serve as a fallback for ONE prompt.
                if (remixModeWorker && isRunning && isRemixMode && isWorkerRemixActive()) {
                    log("WARNING: processNextRemixPrompt called directly while worker is active for remix. Worker should be driving. Ignoring direct call.");
                    return;
                }

                log("processNextRemixPrompt (direct call or non-worker path)");

                if (!isRunning) {
                    log("processNextRemixPrompt: Aborted, not running.");
                    updateProgress();
                    return;
                }

                // Queue management for direct call (fallback)
                if (promptQueue.length === 0) {
                    if (isLooping && originalPromptList.length > 0) {
                        log("Remix Loop (direct): Prompt queue empty. Resetting from original list.");
                        promptQueue = [...originalPromptList];
                        totalPromptCount = originalPromptList.length;
                    } else {
                        log("processNextRemixPrompt (direct): Queue empty and not looping. Finishing run.");
                        handleStop(); // Stop normally
                        return;
                    }
                }
                if (promptQueue.length === 0) { // check again if only looping reset the queue
                    log("processNextRemixPrompt (direct): Queue still empty after loop logic. Finishing run.");
                    handleStop(); // Stop normally
                    return;
                }

                // Clear old auto-mode timers if any were active (relevant for direct/fallback path)
                if (autoSubmitTimeoutId) { clearTimeout(autoSubmitTimeoutId); autoSubmitTimeoutId = null; log("Cleared autoSubmitTimeoutId in processNextRemixPrompt (direct)."); }
                if (generationTimeoutId) { clearTimeout(generationTimeoutId); generationTimeoutId = null; log("Cleared generationTimeoutId in processNextRemixPrompt (direct)."); }

                totalPromptsSentLoop++; // Only increment if main thread is managing this specific call
                const nextPrompt = promptQueue.shift();
                updateProgress(); // Reflect shifted prompt

                log("Waiting for remix button to become available (direct)...");
                const remixAvailable = await waitForRemixButton();

                if (!remixAvailable || !isRunning) {
                    log("Remix button not available or process stopped (direct). Stopping.");
                    handleStop();
                    return;
                }

                const remixClicked = await clickRemixButton();
                if (!remixClicked || !isRunning) {
                    log("Failed to click remix button or process stopped (direct). Stopping.");
                    handleStop();
                    return;
                }

                await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for UI

                if (!isRunning) {
                    log("Process stopped while waiting for remix interface (direct).");
                    handleStop(); // Ensure full stop
                    return;
                }

                await submitRemixPrompt(nextPrompt);
                log("submitRemixPrompt (direct) finished.");

                // CRITICAL: NO AUTOMATIC RESCHEDULING HERE FOR THE DIRECT PATH.
                // If this was a direct call, it processes one prompt and stops.
                // If looping is desired for direct calls (fallback mode), it must be handled by startRemixLoop/startManualRemixLoop's non-worker paths.
                // For worker mode, worker handles rescheduling.

                // If it was a single manual remix trigger, and not part of a loop:
                if (!isLooping && promptQueue.length === 0 && !isWorkerRemixActive()) {
                    log("processNextRemixPrompt (direct): Single prompt processed, queue empty, not looping. Stopping.");
                    handleStop();
                }
            }

            function isWorkerRemixActive() {
                // Helper to check if the worker is supposed to be managing the remix loop
                // This can be more sophisticated, e.g., by checking a specific state variable
                // that is set when worker successfully starts for remix mode.
                return remixModeWorker && isRunning && isRemixMode;
            }

            function startRemixLoop() { // Auto Remix Loop (uses worker)
                if (!isRunning) {
                    log("startRemixLoop: Aborted, isRunning is false.");
                    return;
                }
                if (promptQueue.length === 0 && !isLooping) {
                    log("startRemixLoop: Queue empty and not looping. Stopping.");
                    handleStop(); // Full stop, will also tell worker if active
                    return;
                }

                if (!remixModeWorker) {
                    log("Attempting to initialize remix worker for Auto Remix loop...");
                    initializeRemixWorker();
                    if (!remixModeWorker) {
                        log("ERROR: Remix worker initialization failed. Cannot start Auto Remix loop. UI alert shown by init func.");
                        handleStop(); // Full stop
                        return;
                    }
                }

                const autoSubmitIntervalElement = document.getElementById('sora-auto-submit-interval');
                let intervalMs = 60000; // Default to 60 seconds
                if (autoSubmitIntervalElement) {
                    const parsedInterval = parseInt(autoSubmitIntervalElement.value, 10);
                    if (!isNaN(parsedInterval) && parsedInterval >= 1) {
                        intervalMs = parsedInterval * 1000;
                    } else {
                        log(`Invalid auto-remix interval: ${autoSubmitIntervalElement.value}. Using default ${intervalMs / 1000}s.`);
                    }
                } else {
                    log(`Auto-remix interval input not found. Using default ${intervalMs / 1000}s.`);
                }

                log(`Requesting AUTO REMIX start from WORKER. Loop: ${isLooping}, Interval: ${intervalMs}ms, Queue: ${promptQueue.length}`);
                remixModeWorker.postMessage({
                    command: 'start',
                    prompts: [...promptQueue],
                    originalPrompts: [...originalPromptList],
                    isLooping: isLooping,
                    interval: intervalMs
                });
                // Visual countdown and UI updates are now primarily driven by messages from the worker
                // via handleRemixWorkerMessage and updateProgress calls within it.
            }

            function startManualRemixLoop(intervalSeconds) { // Manual Remix Loop (uses worker)
                if (!isRunning) {
                    log("startManualRemixLoop: Aborted, isRunning is false.");
                    return;
                }
                if (promptQueue.length === 0 && !isLooping) {
                    log("startManualRemixLoop: Queue empty and not looping. Stopping.");
                    handleStop();
                    return;
                }

                if (!remixModeWorker) {
                    log("Attempting to initialize remix worker for Manual Remix loop...");
                    initializeRemixWorker();
                    if (!remixModeWorker) {
                        log("ERROR: Remix worker initialization failed. Cannot start Manual Remix loop. UI alert shown by init func.");
                        handleStop();
                        return;
                    }
                }

                const intervalMs = intervalSeconds * 1000;
                log(`Requesting MANUAL REMIX start from WORKER. Interval: ${intervalSeconds}s, Loop: ${isLooping}, Queue: ${promptQueue.length}`);

                // Stop any old-style manual timers from the non-worker version
                if (manualTimerTimeoutId) { clearTimeout(manualTimerTimeoutId); manualTimerTimeoutId = null; }
                if (visualCountdownInterval) { clearInterval(visualCountdownInterval); visualCountdownInterval = null; }

                // Start visual countdown for the first prompt. Subsequent updates might be linked to worker messages.
                startVisualCountdown(intervalSeconds);

                remixModeWorker.postMessage({
                    command: 'start',
                    prompts: [...promptQueue],
                    originalPrompts: [...originalPromptList],
                    isLooping: isLooping,
                    interval: intervalMs
                });
            }

            // The old `startManualRemixLoop` and its `manualRemixTick` are now fully replaced by the worker-driven approach above.
            // Any direct calls to an old `manualRemixTick` should be gone or refactored.
            // The visual countdown (`startVisualCountdown`) is still managed in the main thread but should be 
            // triggered appropriately, perhaps when the worker signals `process_prompt_in_main` for manual mode.
            // For now, `startManualRemixLoop` kicks it off for the first prompt.
            // And `handleRemixWorkerMessage` for `process_prompt_in_main` might need to restart it if in manual mode.


            // Ensure `handleRemixWorkerMessage` correctly handles visual countdown for manual mode.
            // Modify `handleRemixWorkerMessage` for 'process_prompt_in_main' case:
            // ... inside handleRemixWorkerMessage ...
            // case 'process_prompt_in_main':
            // ... (existing logic to get prompt and call DOM functions) ...
            // After `await submitRemixPrompt(data.prompt);`
            // if (isRunning && !document.getElementById('sora-auto-submit-checkbox')?.checked) { // If manual mode
            //    const cooldownInput = document.getElementById('sora-cooldown-time');
            //    let currentCooldown = parseInt(cooldownInput?.value, 10) || 5;
            //    startVisualCountdown(currentCooldown);
            // }
            // This logic will be added in the next edit refinement for handleRemixWorkerMessage.


            // Ensure the original `startManualRemixLoop` (the one with `manualRemixTick` inside) is fully removed or commented out
            // to avoid confusion and conflicts. The search results showed it from line 3179.
            // For this edit, I am assuming the new worker-based `startRemixLoop` and `startManualRemixLoop` replace prior versions.
            // If there are remnants of old loop mechanisms, they should be cleaned.

            // Keyboard shortcut 'E' for manual remix of current prompt (single shot, not loop)
            async function handleManualRemix() { // This is for single manual remix, NOT the loop.
                log("Handling manual remix trigger (e.g., 'E' key).");
                if (isRunning) {
                    alert("A process is already running. Please stop it before starting a new manual remix.");
                    log("Manual remix aborted: Process already running.");
                    return;
                }

                const soraInput = document.getElementById('sora-input');
                let promptToUse = soraInput?.value.trim();

                if (!promptToUse) {
                    alert("Prompt input is empty. Cannot start manual remix.");
                    log("Manual remix aborted: Prompt input empty.");
                    return;
                }

                // This is a single action, does not use the worker loop.
                // It uses the direct call path of processNextRemixPrompt (or rather, its constituent parts).
                log(`Starting single manual remix for prompt: "${promptToUse}"`);
                isRunning = true; // Set running for this single operation
                isRemixMode = true; // It is a remix operation
                isLooping = false;  // Not a loop
                promptQueue = [promptToUse]; // Queue with one prompt
                originalPromptList = [promptToUse];
                totalPromptCount = 1;
                totalPromptsSentLoop = 0;
                updateProgress(); // Show it's starting

                // Directly call the DOM interaction sequence for a single prompt
                // This bypasses the worker as it's a one-off.
                try {
                    log("Manual Remix (single): Waiting for remix button...");
                    const remixAvailable = await waitForRemixButton();
                    if (!remixAvailable || !isRunning) { // Check isRunning again in case of quick stop
                        log("Manual remix (single): Remix button not available or stopped.");
                        handleStop(); return;
                    }

                    const remixClicked = await clickRemixButton();
                    if (!remixClicked || !isRunning) {
                        log("Manual remix (single): Failed to click remix button or stopped.");
                        handleStop(); return;
                    }

                    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for UI
                    if (!isRunning) { log("Manual remix (single): Stopped waiting for UI."); handleStop(); return; }

                    await submitRemixPrompt(promptToUse);
                    log("Manual remix (single) prompt submitted.");

                } catch (error) {
                    log(`ERROR during single manual remix: ${error.message}`);
                    console.error("Single Manual Remix Error:", error);
                    alert(`Manual remix failed: ${error.message}`);
                } finally {
                    log("Single manual remix attempt finished. Resetting state.");
                    // Ensure state is reset after this single operation, regardless of success/failure.
                    // isRunning = false; // handleStop will do this
                    // isRemixMode might be toggled by user, so don't reset it here unless intended.
                    handleStop(); // Cleans up isRunning, timers, etc.
                    // promptQueue = []; // handleStop and subsequent starts should manage queue
                    // updateProgress(); // handleStop calls updateProgress
                }
            }

            // Remove or comment out the old startManualRemixLoop (around line 3179)
            // The edit should find the old version and effectively replace it.
            // For example:
            /*
            function startManualRemixLoop(intervalSeconds) { // OLD VERSION - TO BE REMOVED/COMMENTED
                log(`OLD Starting MANUAL Remix Loop with ${intervalSeconds}s interval. Loop: ${isLooping}`);
                // ... old code using manualTimerTimeoutId and manualRemixTick ...
            }
            */

            // The handleKeyboardShortcuts function (around line 3110) calls handleManualRemix.
            // This seems fine as handleManualRemix is for a single prompt.

            (async function main() {
                // ... existing code ...
            })();
        })();