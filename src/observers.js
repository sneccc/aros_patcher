// src/observers.js

let imageObserver = null; // Will be initialized in main script
let completionObserver = null; // Will be initialized in main script

// Flags for completionObserver, will be managed by main script or core_logic
// let _generationIndicatorRemoved = false;
// let _newImagesAppeared = false;

function initializeImageObserver() {
    imageObserver = new MutationObserver((mutations) => {
        let imagesToCheck = new Set();
        let nativeElementsRemoved = false;
        for (const mutation of mutations) {
            if (mutation.type === 'childList') {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === 1) {
                        if (node.matches && node.matches(`input.sora-image-checkbox:not([${SCRIPT_CHECKBOX_MARKER}])`)) { try { node.remove(); nativeElementsRemoved = true; } catch (e) {} }
                        else if (node.querySelectorAll) { node.querySelectorAll(`input.sora-image-checkbox:not([${SCRIPT_CHECKBOX_MARKER}])`).forEach(cb => { try { cb.remove(); nativeElementsRemoved = true; } catch (e) {} }); }
                        if (node.matches && node.matches(NATIVE_INDICATOR_SELECTOR) && node.querySelector('div.bg-black\\/25')) { try { node.remove(); nativeElementsRemoved = true; } catch (e) {} }
                        else if (node.querySelectorAll) { node.querySelectorAll(NATIVE_INDICATOR_SELECTOR).forEach(indicator => { if (indicator.querySelector('div.bg-black\\/25')) { try { indicator.remove(); nativeElementsRemoved = true; } catch (e) {} } }); }
                        
                        let container = null; let img = null;
                        if (node.matches && (node.matches('div[data-index]') || node.matches('div[style*="top:"][style*="left:"]') || node.matches('.group\\/tile'))) {
                            container = node;
                            img = container.querySelector('img');
                        }
                        else if (node.querySelectorAll) {
                            node.querySelectorAll('div[data-index], div[style*="top:"][style*="left:"], .group\\/tile').forEach(item => {
                                const itemImg = item.querySelector('img');
                                if (itemImg) {
                                    const anchor = item.querySelector('a');
                                    if (!item.querySelector(`input.sora-image-checkbox[${SCRIPT_CHECKBOX_MARKER}]`) && !(anchor && anchor.getAttribute('href')?.startsWith('/t/task_'))) {
                                        imagesToCheck.add(itemImg);
                                    }
                                }
                            });
                        }
                        if (container && img) {
                            const anchor = container.querySelector('a');
                            if (!container.querySelector(`input.sora-image-checkbox[${SCRIPT_CHECKBOX_MARKER}]`) && !(anchor && anchor.getAttribute('href')?.startsWith('/t/task_'))) {
                                imagesToCheck.add(img);
                            }
                        }
                    }
                }
            }
        }
        if (imagesToCheck.size > 0) {
            imagesToCheck.forEach(img => insertCheckbox(img)); // insertCheckbox from image_management.js
        }
    });
}

function initializeCompletionObserver() {
    completionObserver = new MutationObserver((mutations) => {
        if (!isGenerating || !isRunning) return; // isGenerating, isRunning from main scope
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
        if (foundIndicatorRemoval) _generationIndicatorRemoved = true; // _generationIndicatorRemoved from main scope
        if (foundNewImage) _newImagesAppeared = true; // _newImagesAppeared from main scope

        if (isGenerating && isRunning && _generationIndicatorRemoved && _newImagesAppeared) {
            log("CompletionObserver: Both conditions met. Calling handleGenerationComplete.");
            _generationIndicatorRemoved = false;
            _newImagesAppeared = false;
            handleGenerationComplete(); // from core_logic.js
        }
    });
} 