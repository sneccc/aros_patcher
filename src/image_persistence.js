// src/image_persistence.js

async function pasteSinglePersistedImage() {
    // Uses persistedImages, currentPersistentImageIndex, isPastingSequence (from main scope)
    if (isPastingSequence) {
        log("Already pasting, please wait");
        return;
    }
    if (persistedImages.length === 0) {
        alert('No persisted images available.');
        return;
    }
    if (currentPersistentImageIndex >= persistedImages.length) {
        currentPersistentImageIndex = 0;
    }
    isPastingSequence = true;
    try {
        const textarea = document.querySelector('textarea[placeholder*="Describe"], textarea.flex.w-full');
        if (!textarea) {
            alert('Aros textarea not found.');
            isPastingSequence = false;
            return;
        }
        textarea.focus();
        await new Promise(resolve => setTimeout(resolve, 500));
        const imageFile = persistedImages[currentPersistentImageIndex];
        log(`Pasting single image ${currentPersistentImageIndex + 1}/${persistedImages.length}: ${imageFile.name}`);
        const dt = new DataTransfer();
        dt.items.add(imageFile);
        const pasteEvent = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt });
        textarea.dispatchEvent(pasteEvent);
        log(`Pasted image ${currentPersistentImageIndex + 1}/${persistedImages.length}`);
        currentPersistentImageIndex = (currentPersistentImageIndex + 1) % persistedImages.length;
    } catch (e) {
        log(`ERROR: Failed to paste image: ${e.message}`);
    } finally {
        setTimeout(() => { isPastingSequence = false; }, 1000);
    }
}

function stopSequentialPaste() {
    // Uses sequentialPasteTimeoutId (from main scope)
    if (sequentialPasteTimeoutId) {
        clearTimeout(sequentialPasteTimeoutId);
        sequentialPasteTimeoutId = null;
        log("Sequential paste stopped");
    }
}

async function handlePasteAllImages() {
    // Uses persistedImages, isPastingSequence, IMAGE_PASTE_DELAY_MS (from main scope/constants)
    log("Paste All Images button clicked");
    if (persistedImages.length === 0) {
        alert("No images have been persisted.");
        return;
    }
    if (isPastingSequence) {
        alert("Already pasting images.");
        return;
    }
    stopSequentialPaste();
    const pasteAllButton = document.getElementById('sora-paste-all-images');
    if (pasteAllButton) { pasteAllButton.disabled = true; pasteAllButton.style.opacity = '0.6'; }
    try {
        currentPersistentImageIndex = 0;
        if (persistedImages.length === 1) {
            await pasteSinglePersistedImage();
        } else {
            log(`Manually pasting ${persistedImages.length} images sequentially...`);
            await pasteSinglePersistedImage();
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
        if (pasteAllButton) { pasteAllButton.disabled = false; pasteAllButton.style.opacity = '1'; }
    }
}

async function handleSimulatedImagePaste(event) {
    // Uses isImagePersistenceEnabled, persistedImages, currentPersistentImageIndex (main scope)
    log("Paste event detected on script's input textarea.");
    const items = (event.clipboardData || event.originalEvent?.clipboardData)?.items;
    if (!items) return;

    let imageFile = null;
    for (let i = 0; i < items.length; i++) {
        if (items[i].kind === 'file' && items[i].type.startsWith('image/')) {
            imageFile = items[i].getAsFile();
            break;
        }
    }
    if (imageFile) {
        log(`Image file found: ${imageFile.name}`);
        event.preventDefault();
        const scriptTextarea = event.target;
        const originalValue = scriptTextarea.value;
        const selectionStart = scriptTextarea.selectionStart;
        const selectionEnd = scriptTextarea.selectionEnd;
        scriptTextarea.value = originalValue.substring(0, selectionStart) + originalValue.substring(selectionEnd);
        scriptTextarea.selectionStart = scriptTextarea.selectionEnd = selectionStart;
        scriptTextarea.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));

        if (isImagePersistenceEnabled) {
            persistedImages.push(imageFile);
            updatePersistedImageCountUI(); // from ui.js
            currentPersistentImageIndex = 0;
            log("Persistence ON: Image stored.");
        } else {
            log("Persistence OFF: Attempting immediate paste.");
            persistedImages.push(imageFile);
            currentPersistentImageIndex = persistedImages.length - 1;
            await pasteSinglePersistedImage();
            persistedImages.pop();
            currentPersistentImageIndex = 0;
            log(`Persistence OFF: Single-use paste complete`);
        }
    }
} 