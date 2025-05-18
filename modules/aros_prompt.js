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
        Aros.Core.log(`Generating specific prompts for tag: '${tag}' with ${valuesArray.length} values.`, 'info', 'Prompt');
        if (!tag || !valuesArray || valuesArray.length === 0) {
            Aros.Core.warn("Tag or values array is empty for prompt generation.", 'Prompt');
            return [];
        }

        const cleanTag = tag.replace(/^__+|__+$/g, ''); // Remove leading/trailing double underscores if present
        const prompts = [];

        for (const value of valuesArray) {
            // Create a prompt where the placeholder __tag__ is replaced by the value.
            // We assume the user wants the raw value inserted.
            // If the UI always provides the tag as, e.g., "__color__", and expects that literal string to be replaced,
            // then the base prompt template would be the tag itself.
            // Example: if tag is "__theme__" and value is "vintage", prompt becomes "vintage"
            // This interpretation seems most direct given the UI structure.
            // The UI is asking: for the placeholder identified by `tag`, generate prompts using each of these `valuesArray` entries.
            
            // If the intention was to use the `tag` as a key into Aros.Wildcards.wildcards definitions
            // and then replace a placeholder *in a different user-provided template string* (not available here),
            // the logic would be different. But UI passes the values directly.

            // For the UI's current structure (providing a tag name and a list of values for that tag):
            // It wants to generate a list of prompts, where each prompt is effectively one of the values,
            // assuming the `tag` was just a label for the input field.
            // OR, it implies a base template like "[value]"
            // OR, more likely, it implies a template string like "__tag__" that gets replaced.

            // Let's refine based on the UI's intention: the UI collects a `wildcardTag` (e.g. __myTag__)
            // and `wildcardValues`. It wants prompts where `__myTag__` is replaced by each value.
            // So, the `tag` parameter IS the placeholder string itself.

            // const prompt = value; // Simplest interpretation: each value is a prompt.
            // More robust: ensure the tag is treated as a placeholder to be replaced.
            // If the UI gives `tag = "__color__"`, and a value is `"red"`, the prompt should be `"red"`.
            // If the user *also* typed other text around the tag in a *main* prompt area that used this specific wildcard tag,
            // that would be more complex. But the UI has separate areas.

            // The most straightforward interpretation for the UI's current `aros-wildcard-tag-input` and `aros-wildcard-values-input`:
            // The `tag` is the placeholder string e.g., "__custom_element__".
            // The `valuesArray` contains things that should replace this placeholder.
            // However, the UI is designed to generate *a list of complete prompts from these values*,
            // not to modify a *different, existing* prompt template using these values.

            // So, if tag is "__character__" and values are ["wizard", "warrior"],
            // it should produce prompts: ["wizard", "warrior"].
            // This means the `generateWildcardPrompts` function is effectively returning the `valuesArray`
            // if the `tag` is just a label. But the UI calls it `wildcardTagInput` implying it *is* a tag.

            // Let's assume the `tag` is a placeholder like `__myitem__` and the user wants to generate prompts
            // where `__myitem__` is replaced by each value in `valuesArray`.
            // And the output prompt is *just* that replacement.
            // Example: tag = `__artist__`, values = [`"Van Gogh"`, `"Monet"`] -> prompts = [`"Van Gogh"`, `"Monet"`]
            // This seems to be the most direct mapping from the UI fields.
            // The `tag` from `wildcardTagInput` is the placeholder.
            // The `valuesArray` from `wildcardValuesInput` are the replacements.
            // Each replacement forms a new, complete prompt.
            prompts.push(String(value)); 
        }

        Aros.Core.log(`Generated ${prompts.length} prompts from specific tag/values.`, 'info', 'Prompt');
        return prompts;
        
        /* Original attempt that was trying to use Aros.Wildcards.generate:
        if (Aros.Wildcards && Aros.Wildcards.generate) {
            // This was based on the assumption Aros.Wildcards.generate could fit this model directly.
            // The basePromptTemplate here IS the tag itself, which will be replaced by each value.
            // Aros.Wildcards.generate(template, values, tagName) was the hypothetical signature.
            // Here, `tag` is the placeholder string, e.g., "__myPlaceholder__".
            // `valuesArray` is the list of strings to substitute for it.
            // The third param `tagName` to `Aros.Wildcards.generate` is redundant if `tag` is the template.

            let generatedPrompts = [];
            for (const val of valuesArray) {
                // Aros.Wildcards.generate expects a template. If tag is "__color__", 
                // and value is "red", processSingleWildcard within wildcards.js would turn "__color__" to a random color.
                // This is not what we want. We want "__color__" to become "red" (the specific value from the list).
                
                // So, Aros.Wildcards.processSingleWildcard(tag) won't work as it picks a random value for `tag`.
                // Aros.Wildcards.processPromptTemplate(tag) also won't work for the same reason after bracket expansion.

                // We need a direct substitution.
                // The `tag` from UI is the placeholder string. e.g. __MY_TAG__
                // Each item in `valuesArray` replaces this placeholder.
                 generatedPrompts.push(val); // Each value becomes a prompt directly.
            }
            Aros.Core.log(`Generated ${generatedPrompts.length} prompts via direct value usage.`, 'info', 'Prompt');
            return generatedPrompts;
        } else {
            Aros.Core.error("Aros.Wildcards module or its 'generate' function not found. Returning raw values.", 'Prompt');
            return valuesArray; // Fallback to just returning the values as prompts
        }
        */
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