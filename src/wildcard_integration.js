// src/wildcard_integration.js

function handleGeneratePrompts() {
    // Uses wildcardTemplate, generatedPromptCount (globals from main.js)
    // Uses PROMPT_DELIMITER (from constants.js)
    // Calls toggleInputMode, updateStartButtonPromptCount (from ui.js)
    const template = document.getElementById('sora-input').value.trim();
    if (!template) {
        alert('Please enter a prompt template with wildcards.');
        return;
    }
    wildcardTemplate = template;
    const countInput = document.getElementById('sora-prompt-count');
    const count = parseInt(countInput.value);
    if (isNaN(count) || count < 1 || count > 100) {
        generatedPromptCount = 10;
        countInput.value = 10;
    } else {
        generatedPromptCount = count;
    }
    log(`Generating ${generatedPromptCount} prompts from template: "${template.substring(0, 50)}..."`);
    try {
        if (typeof wildcardUtils === 'undefined') {
            throw new Error('Wildcard utilities not loaded.');
        }
        const generatedPrompts = wildcardUtils.generatePrompts(template, generatedPromptCount);
        const formattedResult = generatedPrompts.join(`\n${PROMPT_DELIMITER}\n`);
        toggleInputMode(false); // Switch to normal mode to display
        document.getElementById('sora-input').value = formattedResult;
        updateStartButtonPromptCount();
        log(`Successfully generated ${generatedPrompts.length} prompts.`);
    } catch (error) {
        log(`ERROR generating prompts: ${error.message}`);
        alert(`Error generating prompts: ${error.message}`);
    }
}

function handleLoadExample() {
    try {
        if (typeof wildcardUtils === 'undefined' || !wildcardUtils.getRandomExample) {
            throw new Error('Wildcard utilities not loaded correctly.');
        }
        const exampleTemplate = wildcardUtils.getRandomExample();
        document.getElementById('sora-input').value = exampleTemplate;
        log(`Loaded example template: "${exampleTemplate}"`);
    } catch (error) {
        log(`ERROR loading example: ${error.message}`);
        alert(`Error loading example: ${error.message}`);
    }
} 