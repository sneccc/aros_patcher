// sora_patcher_modules/sora_interaction.js

async function submitPrompt(promptText, isAutoMode = true) {
    // Uses globals: isRunning, isImagePersistenceEnabled, persistedImages, currentPersistentImageIndex, 
    // IMAGE_PASTE_DELAY_MS, isGenerating, _generationIndicatorRemoved, _newImagesAppeared, 
    // completionObserver, generationTimeoutId, GENERATION_TIMEOUT_MS, promptQueue, isLooping, originalPromptList
    // Calls: handleStop (core_logic), pasteSinglePersistedImage (image_persistence), processNextPrompt (core_logic)
    if (!isRunning) {
        log("submitPrompt cancelled: Not running.");
        return;
    }

    const soraTextarea = document.querySelector('textarea[placeholder*="Describe"], textarea.flex.w-full');
    if (!soraTextarea) {
        log("ERROR: Sora page's main prompt textarea not found. Stopping.");
        handleStop(); // Assumes handleStop is global or passed
        return;
    }

    stopSequentialPaste(); // Assumes stopSequentialPaste is global or passed

    log(`Setting text prompt first: "${promptText.substring(0, 50)}..."`);
    // Using setReactTextareaValue which is more robust for React fields
    setReactTextareaValue(soraTextarea, promptText); // from dom_utils.js
    await new Promise(resolve => setTimeout(resolve, 500)); // Wait for React to process

    if (isImagePersistenceEnabled && persistedImages.length > 0) {
        currentPersistentImageIndex = 0;
        if (persistedImages.length === 1) {
            await pasteSinglePersistedImage();
        } else {
            log(`Pasting ${persistedImages.length} images sequentially...`);
            await pasteSinglePersistedImage();
            for (let i = 1; i < persistedImages.length; i++) {
                if (!isRunning) break;
                log(`Waiting ${IMAGE_PASTE_DELAY_MS}ms before pasting image ${i+1}/${persistedImages.length}...`);
                await new Promise(resolve => setTimeout(resolve, IMAGE_PASTE_DELAY_MS));
                if (!isRunning) break;
                await pasteSinglePersistedImage();
            }
            log(`Completed pasting ${persistedImages.length} images sequentially`);
        }
    }

    if (!soraTextarea.value.includes(promptText) && !isImagePersistenceEnabled && persistedImages.length === 0) {
         // If only text was supposed to be there and it's not, or was wiped by an unintentional image paste simulation
        log("WARNING: Text prompt not found or wiped. Re-setting text prompt.");
        setReactTextareaValue(soraTextarea, promptText);
        await new Promise(resolve => setTimeout(resolve, 500));
    } else if (!soraTextarea.value.includes(promptText) && (isImagePersistenceEnabled && persistedImages.length > 0)) {
        log("WARNING: Text prompt might have been cleared by image paste. Re-adding text component.");
        // This case is tricky. If images are present, we might not want to overwrite them.
        // A more robust solution might involve checking for image placeholders and inserting text around them.
        // For now, let's try to prepend if the prompt is missing.
        if (!soraTextarea.value.startsWith(promptText)) {
             setReactTextareaValue(soraTextarea, promptText + "\n" + soraTextarea.value);
             await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    const waitTime = (isImagePersistenceEnabled && persistedImages.length > 1) ? 5000 : 2000;
    log(`Waiting ${waitTime/1000} seconds for submit button to enable...`);
    await new Promise(resolve => setTimeout(resolve, waitTime));

    if (!isRunning) return;

    let submitBtn = document.querySelector('button[data-disabled="false"][class*="bg-token-bg-inverse"]');
    if (!submitBtn) {
        const alternatives = [
            'button[class*="bg-token-bg-inverse"]:not([disabled])',
            'button.text-token-text-primary[class*="bg-token-bg-inverse"]',
            'form button[type="submit"]:not([disabled])',
            'button:not([disabled])[class*="bg-black"]',
            'button:not([disabled]):not([aria-hidden="true"])'
        ];
        for (const selector of alternatives) {
            const buttons = Array.from(document.querySelectorAll(selector));
            const possibleBtn = buttons.find(btn => {
                const text = btn.textContent.toLowerCase();
                return text.includes("generat") || text.includes("creat") || text.includes("submit") || text.includes("send");
            });
            if (possibleBtn) { submitBtn = possibleBtn; break; }
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
                try { completionObserver.observe(gridContainer, { childList: true, subtree: true }); }
                catch (e) { log(`ERROR starting completion observer: ${e.message}`); }
            }
            if (generationTimeoutId) clearTimeout(generationTimeoutId);
            generationTimeoutId = setTimeout(() => {
                if (!isRunning || !isGenerating) return;
                log(`ERROR: Generation TIMEOUT reached.`);
                isGenerating = false;
                completionObserver?.disconnect();
                _generationIndicatorRemoved = false; _newImagesAppeared = false; generationTimeoutId = null;
                updateProgress(); // from core_logic.js
                if (promptQueue.length > 0 || (isLooping && originalPromptList.length > 0)) processNextPrompt(); // from core_logic.js
                else handleStop(); // from core_logic.js
            }, GENERATION_TIMEOUT_MS);
        }

        const btnKey = Object.keys(submitBtn).find(k => k.startsWith("__reactProps$"));
        if (btnKey && submitBtn[btnKey]?.onClick) {
            try { submitBtn[btnKey].onClick({ bubbles: true, cancelable: true }); log("React onClick triggered."); }
            catch (e) { submitBtn.click(); log("Standard click() after React error."); }
        } else { submitBtn.click(); log("Standard click() used."); }
    } else {
        log("ERROR: Submit button not found after delay. Stopping.");
        handleStop();
    }
} 