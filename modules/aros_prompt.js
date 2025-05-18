/**
 * Aros Patcher - Prompt Module
 * Handles prompt submission, queueing, and processing
 */

console.log('[aros_prompt.js] Script start (top level).');
window.Aros = window.Aros || {};
console.log('[aros_prompt.js] Aros namespace ensured (top level). Current Aros keys:', window.Aros ? Object.keys(window.Aros).join(', ') : 'Aros undefined');

console.log('[aros_prompt.js] Attempting to define Aros.Prompt...');
Aros.Prompt = (function() {
    'use strict';
    console.log('[aros_prompt.js] IIFE for Aros.Prompt executing.');
    
    // --- Core Prompt Functions ---
    async function submitPrompt(promptText, isAutoMode = true) {
        if (!Aros.Core.isRunning()) {
            Aros.Core.log("submitPrompt cancelled: Not running.", 'info', 'Prompt');
            return;
        }

        // Find Aros's textarea
        const arosTextarea = document.querySelector('textarea[placeholder*="Describe"], textarea.flex.w-full');
        if (!arosTextarea) {
            Aros.Core.error("Aros page's main prompt textarea not found. Stopping.", 'Prompt');
            if (Aros.Core.stopProcessing) Aros.Core.stopProcessing();
            return;
        }
        Aros.Core.log(`Submitting prompt: ${promptText.substring(0,50)}...`, 'info', 'Prompt');
        Aros.Core.setReactTextareaValue(arosTextarea, promptText);

        // Find submit button
        const submitButton = document.querySelector('button[class*="bottom-center"]');
         if (!submitButton || submitButton.disabled) {
            Aros.Core.error("Submit button not found or disabled. Cannot submit prompt.", 'Prompt');
            if (Aros.Core.stopProcessing) Aros.Core.stopProcessing();
            return;
        }
        submitButton.click();
        Aros.Core.log("Prompt submitted.", 'info', 'Prompt');
        Aros.Core.setGenerating(true); // Indicate that generation has started

        // Set up generation timeout
        Aros.Core.clearGenerationTimeoutId(); 
        const timeoutId = setTimeout(() => {
            if (Aros.Core.isGenerating() && Aros.Core.isRunning()) {
                Aros.Core.error("Generation timed out. Moving to next prompt if available.", 'Prompt');
                Aros.Core.setGenerating(false);
                handleGenerationComplete(true); // true for timeout
            }
        }, Aros.Core.GENERATION_TIMEOUT_MS);
        Aros.Core.setGenerationTimeoutId(timeoutId);
    }
    
    async function pasteSinglePersistedImage() {
        // Implementation for pasting a single persisted image
    }
    
    async function handleSimulatedImagePaste(event) {
        // Implementation for handling simulated image paste
    }
    
    async function handlePasteAllImages() {
        // Implementation for pasting all persisted images
    }
    
    function stopSequentialPaste() {
        // Implementation for stopping sequential paste
    }
    
    function saveRemainingPromptsToFile() {
        // Implementation for saving remaining prompts to file
    }
    
    // --- Mode-Specific Functions ---
    function handleGenerationComplete(timeoutOccurred = false) {
        Aros.Core.log(`Handling generation complete. Timeout: ${timeoutOccurred}`, 'info', 'Prompt');
        Aros.Core.setGenerating(false);
        Aros.Core.clearGenerationTimeoutId();

        if (!Aros.Core.isRunning()) {
            Aros.Core.log("Generation complete acknowledged, but processing is stopped.", 'warn', 'Prompt');
            return;
        }
        
        // Aros.Core.incrementTotalPromptsSentLoop(); // Increment after successful processing or timeout

        if (Aros.Core.getPromptQueueSize() > 0 || Aros.Core.isLooping()) {
            Aros.Core.log("Cooldown initiated via Aros.Core.startCooldownTimer.", 'info', 'Prompt');
            Aros.Core.startCooldownTimer(); // Core now handles the timer and calling processNextPrompt
        } else {
            Aros.Core.log("Prompt queue empty and not looping. Processing finished.", 'info', 'Prompt');
            if (Aros.Core.stopProcessing) Aros.Core.stopProcessing(); // Gracefully stop
        }
    }
    
    async function processNextPrompt() {
        Aros.Core.log("Attempting to process next prompt...", 'info', 'Prompt');
        if (!Aros.Core.isRunning()) {
            Aros.Core.log("processNextPrompt: Not running, aborting.", 'warn', 'Prompt');
            return;
        }

        if (Aros.Core.isGenerating()) {
            Aros.Core.log("processNextPrompt: Already generating, aborting to prevent overlap.", 'warn', 'Prompt');
            return;
        }

        let promptText = Aros.Core.shiftPromptQueue();

        if (promptText) {
            Aros.Core.log(`Processing prompt: ${promptText.substring(0, 50)}...`, 'info', 'Prompt');
            Aros.Core.incrementTotalPromptsSentLoop();
            if (Aros.UI && Aros.UI.updateProgress) {
                Aros.UI.updateProgress(Aros.Core.getTotalPromptsSentLoop(), Aros.Core.getTotalPromptCount());
            }
            await submitPrompt(promptText);
            // Cooldown and next prompt are handled by handleGenerationComplete via Core.startCooldownTimer
        } else if (Aros.Core.isLooping()) {
            Aros.Core.log("Prompt queue empty, but looping is enabled. Resetting queue.", 'info', 'Prompt');
            const originalPrompts = Aros.Core.getOriginalPromptList();
            if (originalPrompts && originalPrompts.length > 0) {
                Aros.Core.setPromptQueue(originalPrompts.slice()); // Reset with a copy
                Aros.Core.setTotalPromptsSentLoop(0); // Reset loop counter
                // Call processNextPrompt again to pick up from the reset queue.
                // A small delay might be good to prevent super-fast re-loop if submit fails instantly
                setTimeout(() => processNextPrompt(), 100); 
            } else {
                Aros.Core.error("Looping enabled, but original prompt list is empty. Stopping.", 'Prompt');
                if (Aros.Core.stopProcessing) Aros.Core.stopProcessing();
            }
        } else {
            Aros.Core.log("No more prompts in queue and not looping. Processing complete.", 'info', 'Prompt');
            if (Aros.Core.stopProcessing) Aros.Core.stopProcessing();
            if (Aros.UI && Aros.UI.updateProgress) { // Ensure progress shows 100%
                 Aros.UI.updateProgress(Aros.Core.getTotalPromptCount(), Aros.Core.getTotalPromptCount());
            }
        }
    }
    
    function startAutoLoop() {
        // Implementation for starting auto loop
    }
    
    function startManualTimerLoop(intervalSeconds) {
        // Implementation for starting manual timer loop
    }
    
    function simulateTyping(element, text) {
        // Implementation for simulating typing
    }
    
    // --- Wildcard Functions ---
    function generateWildcardPrompts(tag, valuesArray) {
        Aros.Core.log(`Generating wildcard prompts with tag: '${tag}' and ${valuesArray.length} values.`, 'info', 'Prompt');
        if (!tag || valuesArray.length === 0) {
            Aros.Core.warn("Tag or values array is empty for wildcard generation.", 'Prompt');
            return [];
        }
        if (Aros.Wildcards && Aros.Wildcards.generate) {
            // Assuming Aros.Wildcards.generate expects a template string (like "prompt with __tag__") 
            // and an object/map of values for tags, or adapts to this structure.
            // For simplicity, if `tag` is e.g., "__color__" and valuesArray is ["red", "blue"],
            // we might need a placeholder prompt template like "My prompt with __placeholder__".
            // This part depends heavily on wildcards.js implementation.
            // Let's assume a simple scenario: wildcards.js can take the tag and values directly.
            // Or, more likely, it takes a base prompt string containing the tag.

            // This is a placeholder. The actual call to Aros.Wildcards.generate will depend on its API.
            // For now, let's assume a hypothetical structure in Aros.Wildcards that can take this.
            // Example: Aros.Wildcards.generate(basePromptTemplate, { tagName: valuesArray })
            // Since UI doesn't provide a base prompt template with the tag, we create one.
            const basePromptTemplate = `__${tag.replace(/^__+|__+$/g, '')}__`; // e.g., __color__
            const generated = Aros.Wildcards.generate(basePromptTemplate, valuesArray, tag.replace(/^__+|__+$/g, ''));
            Aros.Core.log(`Generated ${generated.length} prompts via Aros.Wildcards.`, 'info', 'Prompt');
            return generated;
        } else {
            Aros.Core.error("Aros.Wildcards module or its 'generate' function not found.", 'Prompt');
            return [];
        }
    }
    
    function handleLoadExample() {
        // Implementation for loading example wildcard template
    }
    
    // --- Module Initialization ---
    function init() {
        if (Aros.Core && Aros.Core.log) {
            Aros.Core.log("Initializing Prompt Module...");
            Aros.Core.log("Prompt Module Initialized.");
        } else {
            console.log("[Aros Prompt Internal] Initializing Prompt Module... (Aros.Core.log not available)");
            console.log("[Aros Prompt Internal] Prompt Module Initialized. (Aros.Core.log not available)");
        }
    }
    
    // --- Public API ---
    console.log('[aros_prompt.js] IIFE for Aros.Prompt executed, returning object.');
    return {
        submitPrompt,
        pasteSinglePersistedImage,
        handleSimulatedImagePaste,
        handlePasteAllImages,
        stopSequentialPaste,
        saveRemainingPromptsToFile,
        handleGenerationComplete,
        processNextPrompt,
        startAutoLoop,
        startManualTimerLoop,
        simulateTyping,
        generateWildcardPrompts,
        handleLoadExample,
        init
    };
})();
console.log('[aros_prompt.js] Script end (top level). Aros.Prompt type:', typeof Aros.Prompt, '; Aros.Prompt defined:', Aros.Prompt ? 'Yes' : 'No');
if (window.Aros && Aros.Prompt) {
    console.log('[aros_prompt.js] Aros.Prompt defined. Keys:', Object.keys(Aros.Prompt).join(', '));
} else {
    console.error('[aros_prompt.js] Aros.Prompt is NOT defined after execution.');
} 