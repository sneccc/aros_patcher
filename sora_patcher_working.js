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
    // @require      https://cdn.jsdelivr.net/gh/YourUsername/aros_patcher@main/wildcards.js
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
        const SCRIPT_VERSION = "5.9"; // Updated version
        const SCRIPT_CHECKBOX_MARKER = 'data-auto-sora-cb'; // From 5.5.5
        const NATIVE_INDICATOR_SELECTOR = 'div.absolute.left-2.top-2'; // From 5.5.5
        const PROMPT_DELIMITER = '@@@@@'; // <<< ADDED: Define the delimiter

        // --- NEW: Wildcard Variables ---
        let isWildcardMode = false;     // Toggle for wildcard mode
        let wildcardTemplate = "";      // Store the current wildcard template
        let generatedPromptCount = 10;  // Default number of prompts to generate

        // --- NEW: Image Persistence Globals ---
        let persistedImages = []; // Array to store File objects for persistent pasting
        let isImagePersistenceEnabled = false; // Controlled by a checkbox
        const IMAGE_PASTE_DELAY_MS = 8000; // Delay between pasting multiple persisted images (ms) - INCREASED to match clipboard_paste_toy.js
        let isPastingSequence = false; // Flag to prevent multiple paste sequences
        let sequentialPasteTimeoutId = null; // For tracking sequential paste timeouts

        // Add a state variable to track which image we're currently using
        let currentPersistentImageIndex = 0;

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
                background-color: rgba(0, 0, 0, 0.45); z-index: 999990;
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
        }

        function handlePersistImagesToggle(event) {
            isImagePersistenceEnabled = event.target.checked;
            log(`Image persistence toggled to: ${isImagePersistenceEnabled}`);
            // User might want to keep images in memory if they accidentally toggle.
            // If they explicitly clear or stop, images will be cleared then.
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
            wrapper.style.cssText = `position: fixed; bottom: 15px; left: 20px; background: rgba(35, 35, 40, 0.65); backdrop-filter: blur(10px) saturate(180%); -webkit-backdrop-filter: blur(10px) saturate(180%); padding: 20px 20px 15px 20px; border-radius: 16px; z-index: 999999; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.37); width: 330px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; border: 1px solid rgba(255, 255, 255, 0.12); color: #e0e0e0; transition: opacity 0.3s ease, transform 0.3s ease; opacity: 1; transform: scale(1); display: block;`;

            // --- UPDATED textarea placeholder text ---
            const placeholderText = isWildcardMode ? 
                `Enter a template with wildcards like __color__ and variations like [option1, option2].\nExamples:\nA __animal__ in a __location__ at __time__\nA [red, blue, green] __object__ with __material__ texture` :
                `Enter prompts, separated by a line containing ${PROMPT_DELIMITER}\nExample:\nPrompt 1 Line 1\nPrompt 1 Line 2\n${PROMPT_DELIMITER}\nPrompt 2\n${PROMPT_DELIMITER}\nPrompt 3...\nEnable 'Loop' to repeat.\nPaste images here (enable 'Persist Images' to reuse).`;

            // --- UPDATED wrapper innerHTML to include wildcard mode switch ---
            wrapper.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;"> <h3 style="margin: 0; font-size: 17px; display: flex; align-items: center; gap: 10px; color: #ffffff; font-weight: 500;"> <img src="https://www.svgrepo.com/show/306500/openai.svg" width="22" height="22" style="filter: invert(1);" alt="OpenAI Logo"/> Aros Patcher <span style="font-size: 9px; opacity: 0.6; font-weight: 300; margin-left: -5px;">build ${SCRIPT_VERSION}</span> </h3> <button id="sora-close" style=" background: rgba(80, 80, 80, 0.4); backdrop-filter: blur(5px) saturate(150%); -webkit-backdrop-filter: blur(5px) saturate(150%); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; padding: 2px 6px; font-size: 16px; color: rgba(255, 255, 255, 0.7); cursor: pointer; transition: background-color 0.2s ease, color 0.2s ease, border-color 0.2s ease; " onmouseover="this.style.backgroundColor='rgba(100, 100, 100, 0.6)'; this.style.color='rgba(255, 255, 255, 0.9)'; this.style.borderColor='rgba(255, 255, 255, 0.15)'" onmouseout="this.style.backgroundColor='rgba(80, 80, 80, 0.4)'; this.style.color='rgba(255, 255, 255, 0.7)'; this.style.borderColor='rgba(255, 255, 255, 0.1)'" title="Close Panel">✕</button> </div>
                
                <!-- Mode Switch -->
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                    <label style="font-size: 13px; color: #bdbdbd; font-weight: 400; white-space: nowrap;">Input Mode:</label>
                    <div style="display: flex; background: rgba(0, 0, 0, 0.25); border-radius: 10px; overflow: hidden; border: 1px solid rgba(255, 255, 255, 0.1);">
                        <button id="sora-mode-normal" class="mode-button mode-active" style="padding: 6px 10px; font-size: 12px; border: none; cursor: pointer; background: transparent; color: #e0e0e0; transition: background-color 0.2s ease;">Normal</button>
                        <button id="sora-mode-wildcard" class="mode-button" style="padding: 6px 10px; font-size: 12px; border: none; cursor: pointer; background: transparent; color: #e0e0e0; transition: background-color 0.2s ease;">Wildcard</button>
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
                <div id="sora-persistence-controls" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; margin-top: -5px; gap: 15px;">
                    <label title="If checked, any images you paste into the prompt list will be re-pasted for every subsequent prompt in the current run." style="display: flex; align-items: center; gap: 7px; font-size: 13px; color: #d0d0d0; cursor: pointer;">
                        <input type="checkbox" id="sora-persist-images-checkbox" style="transform: scale(1.1); cursor: pointer; accent-color: #4a90e2;"/> 📷 Persist Images
                    </label>
                    <button id="sora-paste-all-images" title="Paste all persisted images into the current Aros prompt" style="background: rgba(60, 130, 250, 0.5); color: white; padding: 4px 10px; border: 1px solid rgba(60, 130, 250, 0.6); border-radius: 8px; cursor: pointer; font-size: 12px; white-space: nowrap;">Paste All Images</button>
                    <span id="sora-persisted-count" style="font-size: 12px; color: #bdbdbd; white-space: nowrap;">(0 persisted)</span>
                </div>
                <!-- === END Image Persistence Row === -->

                <div style="display: flex; gap: 10px; margin-bottom: 20px;"> <button id="sora-start" style=" flex: 1; background: rgba(60, 130, 250, 0.5); backdrop-filter: blur(5px) saturate(150%); -webkit-backdrop-filter: blur(5px) saturate(150%); color: white; padding: 10px; border: 1px solid rgba(60, 130, 250, 0.6); border-radius: 10px; cursor: pointer; font-weight: 500; transition: background-color 0.2s ease, border-color 0.2s ease; ">▶ Start (0)</button> <button id="sora-clear" style=" flex: 1; background: rgba(80, 80, 80, 0.5); backdrop-filter: blur(5px) saturate(150%); -webkit-backdrop-filter: blur(5px) saturate(150%); color: #d0d0d0; padding: 10px; border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 10px; cursor: pointer; transition: background-color 0.2s ease, border-color 0.2s ease; " onmouseover="this.style.backgroundColor='rgba(100, 100, 100, 0.6)'; this.style.borderColor='rgba(255, 255, 255, 0.2)'" onmouseout="this.style.backgroundColor='rgba(80, 80, 80, 0.5)'; this.style.borderColor='rgba(255, 255, 255, 0.15)'">🗑️ Clear</button> </div>
                <hr style="border: none; border-top: 1px solid rgba(255, 255, 255, 0.1); margin: 18px 0;" />
                <div style="font-size: 13px; color: #bdbdbd; margin-bottom: 12px; font-weight: 400;">Select images to download:</div> <div style="display: flex; gap: 18px; margin-bottom: 15px; flex-wrap: wrap; justify-content: flex-start; align-items: center;"> <label title="Select images wider than tall" style="display: flex; align-items: center; gap: 7px; font-size: 13px; color: #d0d0d0; cursor: pointer;"> <input type="checkbox" id="sora-select-horizontal" style="transform: scale(1.1); cursor: pointer; accent-color: #4a90e2;" /> Landscape </label> <label title="Select images taller than wide" style="display: flex; align-items: center; gap: 7px; font-size: 13px; color: #d0d0d0; cursor: pointer;"> <input type="checkbox" id="sora-select-vertical" style="transform: scale(1.1); cursor: pointer; accent-color: #4a90e2;" /> Portrait </label> <label title="Select images with equal width and height" style="display: flex; align-items: center; gap: 7px; font-size: 13px; color: #d0d0d0; cursor: pointer;"> <input type="checkbox" id="sora-select-square" style="transform: scale(1.1); cursor: pointer; accent-color: #4a90e2;" /> Square </label> </div>
                <hr style="border: none; border-top: 1px solid rgba(255, 255, 255, 0.08); margin: 18px 0;" />
                <div style="font-size: 13px; color: #bdbdbd; margin-bottom: 10px; font-weight: 400;">Crop option for download:</div> <div id="sora-crop-options" style="display: flex; flex-direction: row; flex-wrap: wrap; gap: 15px; margin-bottom: 15px;"> <label style="display: flex; align-items: center; gap: 5px; font-size: 13px; color: #d0d0d0; cursor: pointer;"> <input type="radio" name="sora-crop-option" value="none" checked style="cursor: pointer; accent-color: #4a90e2; transform: scale(1.1);" /> Original </label> <label style="display: flex; align-items: center; gap: 5px; font-size: 13px; color: #d0d0d0; cursor: pointer;"> <input type="radio" name="sora-crop-option" value="16:9" style="cursor: pointer; accent-color: #4a90e2; transform: scale(1.1);" /> 16:9 </label> <label style="display: flex; align-items: center; gap: 5px; font-size: 13px; color: #d0d0d0; cursor: pointer;"> <input type="radio" name="sora-crop-option" value="9:16" style="cursor: pointer; accent-color: #4a90e2; transform: scale(1.1);" /> 9:16 </label> <label style="display: flex; align-items: center; gap: 5px; font-size: 13px; color: #d0d0d0; cursor: pointer;"> <input type="radio" name="sora-crop-option" value="1:1" style="cursor: pointer; accent-color: #4a90e2; transform: scale(1.1);" /> 1:1 </label> </div>
                <div style="display: flex; gap: 10px; margin-top: 20px; align-items: stretch;"> <button id="sora-download-images" style=" flex-grow: 1; background: rgba(46, 160, 67, 0.5); backdrop-filter: blur(5px) saturate(150%); -webkit-backdrop-filter: blur(5px) saturate(150%); color: white; padding: 11px; border: 1px solid rgba(46, 160, 67, 0.6); border-radius: 10px; cursor: pointer; font-size: 14px; display: flex; align-items: center; justify-content: center; gap: 8px; transition: background-color 0.2s ease, border-color 0.2s ease, opacity 0.2s ease; font-weight: 500; " onmouseover="if(!this.disabled) { this.style.backgroundColor='rgba(46, 160, 67, 0.7)'; this.style.borderColor='rgba(46, 160, 67, 0.8)'; }" onmouseout="if(!this.disabled) { this.style.backgroundColor='rgba(46, 160, 67, 0.5)'; this.style.borderColor='rgba(46, 160, 67, 0.6)'; }"> <svg id="sora-download-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-download" viewBox="0 0 16 16" style="display: inline;"> <path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5"/> <path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708z"/> </svg> <span id="sora-download-text">Download (0)</span> </button> <button id="sora-find-similar-button" title="Activate find similar image mode" style=" flex-shrink: 0; background: rgba(80, 80, 90, 0.5); backdrop-filter: blur(5px) saturate(150%); -webkit-backdrop-filter: blur(5px) saturate(150%); color: white; padding: 11px 14px; border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 10px; cursor: pointer; font-size: 14px; display: flex; align-items: center; justify-content: center; transition: background-color 0.2s ease, border-color 0.2s ease; " onmouseover="if(!this.classList.contains('active')) { this.style.backgroundColor='rgba(100, 100, 110, 0.6)'; this.style.borderColor='rgba(255, 255, 255, 0.2)'; }" onmouseout="if(!this.classList.contains('active')) { this.style.backgroundColor='rgba(80, 80, 90, 0.5)'; this.style.borderColor='rgba(255, 255, 255, 0.15)'; }"> <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-cursor-fill" viewBox="0 0 16 16"> <path d="M14.082 2.182a.5.5 0 0 1 .103.557L8.528 15.467a.5.5 0 0 1-.917-.007L5.57 10.694.803 8.652a.5.5 0 0 1-.006-.916l12.728-5.657a.5.5 0 0 1 .556.103z"/> </svg> </button> </div>
                <style> #sora-download-images:disabled { background: rgba(80, 80, 80, 0.3) !important; border-color: rgba(255, 255, 255, 0.08) !important; color: rgba(255, 255, 255, 0.4) !important; backdrop-filter: blur(2px) saturate(100%); -webkit-backdrop-filter: blur(2px) saturate(100%); opacity: 0.6; cursor: not-allowed; } #sora-find-similar-button.active { background-color: rgba(60, 130, 250, 0.65) !important; border-color: rgba(60, 130, 250, 0.8) !important; } </style>
                <div id="sora-download-progress" style="display: none;"></div>
                <div id="sora-download-error" style="font-size: 11px; color: #ff8a8a; text-align: center; margin-top: 5px; font-weight: 400;"></div>
            `;
            
            document.body.appendChild(wrapper);
            log("Main UI elements appended to body.");

            // Add event listeners for wildcard mode
            document.getElementById('sora-mode-normal').addEventListener('click', () => {
                toggleInputMode(false);
            });
            
            document.getElementById('sora-mode-wildcard').addEventListener('click', () => {
                toggleInputMode(true);
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
            createAuxiliaryUI(); // Creates aux UI and overlay placeholder
            log("Auxiliary UI and Overlay created.");
        }

        // Use 5.7 version - identical
        function createAuxiliaryUI() {
            log("Creating auxiliary UI (progress, cooldown, stop)...");
            const auxContainer = document.createElement('div'); auxContainer.id = 'sora-aux-controls-container';
            auxContainer.style.cssText = `position: fixed; bottom: 15px; left: 20px; z-index: 999998; display: none; align-items: center; gap: 10px; transition: opacity 0.3s ease; opacity: 1;`;
            const glassItemStyle = `background: rgba(45, 45, 50, 0.7); backdrop-filter: blur(8px) saturate(150%); -webkit-backdrop-filter: blur(8px) saturate(150%); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 10px; padding: 8px 14px; font-size: 13px; color: #d5d5d5; display: none; white-space: nowrap; box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2); transition: background-color 0.2s ease, border-color 0.2s ease;`; const progress = document.createElement('div'); progress.id = 'sora-progress'; progress.style.cssText = glassItemStyle; progress.textContent = 'Processing...'; auxContainer.appendChild(progress); const cooldownBtn = document.createElement('button'); cooldownBtn.id = 'sora-cooldown'; cooldownBtn.style.cssText = glassItemStyle + `cursor: default;`; cooldownBtn.textContent = `⏱ Cooldown: --s`; auxContainer.appendChild(cooldownBtn); const stopBtn = document.createElement('button'); stopBtn.id = 'sora-stop-button'; stopBtn.style.cssText = glassItemStyle + `background: rgba(200, 50, 60, 0.7); border-color: rgba(255, 99, 132, 0.4); color: white; cursor: pointer; font-weight: 500;`; stopBtn.textContent = '🛑 Stop'; stopBtn.title = 'Stop sending prompts and save remaining ones'; stopBtn.onclick = handleStop; stopBtn.onmouseover = function () { this.style.backgroundColor = 'rgba(220, 53, 69, 0.8)'; this.style.borderColor = 'rgba(255, 99, 132, 0.6)'; }; stopBtn.onmouseout = function () { this.style.backgroundColor = 'rgba(200, 50, 60, 0.7)'; this.style.borderColor = 'rgba(255, 99, 132, 0.4)'; }; auxContainer.appendChild(stopBtn); document.body.appendChild(auxContainer);
            const miniBtn = document.createElement('div'); miniBtn.id = 'sora-minibtn'; miniBtn.style.cssText = `position: fixed; bottom: 15px; left: 20px; width: 16px; height: 16px; background: rgba(255, 255, 255, 0.8); border-radius: 50%; cursor: pointer; z-index: 999999; box-shadow: 0 0 8px rgba(255, 255, 255, 0.5); display: none; border: 1px solid rgba(255, 255, 255, 0.3); transition: background-color 0.2s ease;`; miniBtn.onmouseover = function () { this.style.backgroundColor = 'rgba(255, 255, 255, 1)'; }; miniBtn.onmouseout = function () { this.style.backgroundColor = 'rgba(255, 255, 255, 0.8)'; }; miniBtn.title = 'Reopen Aros Patcher'; miniBtn.onclick = handleMiniButtonClick; document.body.appendChild(miniBtn);
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

            if (isAuto) {
                startAutoLoop();
            } else {
                startManualTimerLoop(currentCooldown);
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
            updatePersistedImageCountUI();
            log("Persisted images cleared.");
        }

        // Use 5.7 version - identical
        function handleClose() { log("Close button clicked."); const wrapper = document.getElementById('sora-auto-ui'); if (!wrapper) return; wrapper.style.opacity = '0'; wrapper.style.transform = 'scale(0.95)'; setTimeout(() => { wrapper.style.display = 'none'; if (!isRunning) { const miniBtn = document.getElementById('sora-minibtn'); if (miniBtn) miniBtn.style.display = 'block'; log("Main UI hidden, mini button shown."); } }, 300); }
        // Use 5.7 version - identical
        function handleMiniButtonClick() { log("Mini button clicked."); if (!isRunning) { const wrapper = document.getElementById('sora-auto-ui'); const miniBtn = document.getElementById('sora-minibtn'); if (wrapper) { wrapper.style.display = 'block'; void wrapper.offsetWidth; wrapper.style.opacity = '1'; wrapper.style.transform = 'scale(1)'; log("Main UI restored."); } if (miniBtn) miniBtn.style.display = 'none'; const auxContainer = document.getElementById('sora-aux-controls-container'); if (auxContainer) auxContainer.style.display = 'none'; hideOverlay(); /* Hide overlay & unlock scroll */ } else { log("Cannot open UI while process is running."); } }

        // Modify handleStop using 5.7 logic
        function handleStop() {
            log("Stop button clicked.");
            // Reset the current persistent image index when stopping
            currentPersistentImageIndex = 0;
            log(`PERSISTENCE: Reset current image index to 0 on stop.`);

            if (!isRunning) { log("Process is not running, stop ignored."); return; }

            isRunning = false;
            isGenerating = false;
            isLooping = false; // << Reset loop state (from 5.7)
            _generationIndicatorRemoved = false;
            _newImagesAppeared = false;
            
            // Stop any ongoing sequential paste process
            if (sequentialPasteTimeoutId) {
                clearTimeout(sequentialPasteTimeoutId);
                sequentialPasteTimeoutId = null;
                isPastingSequence = false;
                log("Cleared sequential image paste timeout on stop.");
            }

            completionObserver?.disconnect();
            log("Completion observer disconnected on stop.");

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
            soraTextarea.value = promptText;
            soraTextarea.dispatchEvent(new Event('input', { bubbles: true }));
            soraTextarea.dispatchEvent(new Event('change', { bubbles: true }));

            // Try to trigger React's onChange handler directly
            const reactKey = Object.keys(soraTextarea).find(k => k.startsWith("__reactProps$"));
            if (reactKey && soraTextarea[reactKey]?.onChange) {
                try {
                    log("Triggering React onChange handler directly for text...");
                    soraTextarea[reactKey].onChange({ target: soraTextarea });
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
            log(`Current textarea value after both text and image: "${soraTextarea.value.substring(0, 70).replace(/\n/g, '\\n')}..."`);

            // 4. One more check to ensure text is still there
            if (!soraTextarea.value.includes(promptText)) {
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
                    soraTextarea.dispatchEvent(textPasteEvent);
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

            const startVisualCountdown = (totalSeconds) => {
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
                log(`Manual visual countdown started (${totalSeconds}s). ID: ${visualCountdownInterval}`); // Corrected log placement
            };

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
                log("Initialization complete."); // Log from 5.7

            } catch (e) { // Use more robust error handling from 5.7
                log("FATAL ERROR during script initialization after core element found:");
                console.error(e);
                alert("A critical error occurred during Aros Patcher initialization. Check Console (F12).");
            }
        });

        // --- NEW: Toggle Input Mode Function ---
        function toggleInputMode(isWildcard) {
            isWildcardMode = isWildcard;
            const normalModeBtn = document.getElementById('sora-mode-normal');
            const wildcardModeBtn = document.getElementById('sora-mode-wildcard');
            const wildcardControls = document.getElementById('sora-wildcard-controls');
            const textareaLabel = document.getElementById('textarea-label');
            const textarea = document.getElementById('sora-input');
            
            // Update button styles
            if (isWildcardMode) {
                normalModeBtn.classList.remove('mode-active');
                normalModeBtn.style.backgroundColor = 'transparent';
                wildcardModeBtn.classList.add('mode-active');
                wildcardModeBtn.style.backgroundColor = 'rgba(60, 130, 250, 0.3)';
                wildcardControls.style.display = 'block';
                textareaLabel.textContent = 'Enter prompt template with wildcards:';
                textarea.placeholder = 'Enter a template with wildcards like __color__ and variations like [option1, option2].\nExamples:\nA __animal__ in a __location__ at __time__\nA [red, blue, green] __object__ with __material__ texture';
            } else {
                wildcardModeBtn.classList.remove('mode-active');
                wildcardModeBtn.style.backgroundColor = 'transparent';
                normalModeBtn.classList.add('mode-active');
                normalModeBtn.style.backgroundColor = 'rgba(60, 130, 250, 0.3)';
                wildcardControls.style.display = 'none';
                textareaLabel.textContent = `Enter prompt list (separated by ${PROMPT_DELIMITER}):`;
                textarea.placeholder = `Enter prompts, separated by a line containing ${PROMPT_DELIMITER}\nExample:\nPrompt 1 Line 1\nPrompt 1 Line 2\n${PROMPT_DELIMITER}\nPrompt 2\n${PROMPT_DELIMITER}\nPrompt 3...\nEnable 'Loop' to repeat.\nPaste images here (enable 'Persist Images' to reuse).`;
            }
            
            log(`Input mode switched to ${isWildcardMode ? 'wildcard' : 'normal'} mode`);
        }

        // --- NEW: Handle Generate Prompts Function ---
        function handleGeneratePrompts() {
            const template = document.getElementById('sora-input').value.trim();
            if (!template) {
                log("Generate prompts cancelled: No template entered.");
                return alert('Please enter a prompt template with wildcards.');
            }
            
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
                
                // Join prompts with the delimiter for display
                const formattedResult = generatedPrompts.join(`\n${PROMPT_DELIMITER}\n`);
                
                // Switch back to normal mode to display generated prompts
                toggleInputMode(false);
                
                // Display the generated prompts
                document.getElementById('sora-input').value = formattedResult;
                updateStartButtonPromptCount();
                
                log(`Successfully generated ${generatedPrompts.length} prompts from template.`);
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
                
                // Get a random example template
                const exampleTemplate = wildcardUtils.getRandomExample();
                
                // Set it in the textarea
                document.getElementById('sora-input').value = exampleTemplate;
                
                log(`Loaded example template: "${exampleTemplate}"`);
            } catch (error) {
                log(`ERROR loading example: ${error.message}`);
                alert(`Error loading example: ${error.message}`);
            }
        }

    })();
