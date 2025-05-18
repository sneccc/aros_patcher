// ==UserScript==
// @name         🧠 Aros Patcher
// @namespace    http://tampermonkey.net/
// @version      6.0
// @description  Enhanced Aros video generation tool with prompt queueing and image management
// @author       ArosPatcher
// @match        *://sora.com/*
// @match        *://www.sora.com/*
// @match        *://www.sora.*.com/*
// @match        *://sora.*.com/*
// @match        https://sora.chatgpt.com/*
// @grant        GM_info
// @require      https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js
// @require      https://raw.githubusercontent.com/sneccc/aros_patcher/refs/heads/main/modules/aros_core.js
// @require      https://raw.githubusercontent.com/sneccc/aros_patcher/refs/heads/main/modules/aros_ui.js
// @require      https://raw.githubusercontent.com/sneccc/aros_patcher/refs/heads/main/modules/aros_prompt.js
// @require      https://raw.githubusercontent.com/sneccc/aros_patcher/refs/heads/main/modules/aros_image.js
// @require      https://raw.githubusercontent.com/sneccc/aros_patcher/refs/heads/main/modules/wildcards.js
// ==/UserScript==

console.log('[aros_main.js] Script start (top level).');
window.Aros = window.Aros || {};
console.log('[aros_main.js] Aros namespace ensured (top level). Initial Aros object keys:', window.Aros ? Object.keys(window.Aros).join(', ') : 'Aros undefined');

(function() {
    'use strict';
    console.log('[aros_main.js] Main IIFE executing.');
    
    // Define a simple logging function
    function log(message) {
        console.log(`[Aros Patcher v6.0 Main] ${message}`);
    }
    
    // Log startup
    log('Initializing...');
    
    // Function to check if all modules are loaded
    function areModulesLoaded() {
        const modules = [
            { name: 'Core', obj: Aros.Core },
            { name: 'UI', obj: Aros.UI },
            { name: 'Prompt', obj: Aros.Prompt },
            { name: 'Image', obj: Aros.Image },
            { name: 'Wildcards', obj: Aros.Wildcards }
        ];
        
        let allLoaded = true;
        modules.forEach(module => {
            if (!module.obj) {
                log(`❌ Module not loaded: ${module.name}`);
                allLoaded = false;
            } else {
                log(`✅ Module loaded: ${module.name}`);
            }
        });
        
        return allLoaded;
    }
    
    // Function to run the main application logic
    function runArosPatcher() {
        log('DOM ready, checking modules...');
        console.log('[aros_main.js] Current Aros object keys at DOM ready:', window.Aros ? Object.keys(window.Aros).join(', ') : 'Aros undefined');
        
        // Check if all required modules are loaded
        if (!areModulesLoaded()) {
            log('❌ Some modules failed to load. Check the console for more details.');
            alert('Aros Patcher: Some modules failed to load. The script may not work correctly.');
            // Optionally, do not return here to allow Core to at least try to init if available
        }
        
        // Only proceed if Core module is available
        if (!Aros.Core) {
            log('❌ Critical error: Core module (Aros.Core) not loaded. Script cannot initialize.');
            alert('Aros Patcher Error: Core module failed to load. Please check your connection to GitHub and reload the page. Open console (F12) for details.');
            return;
        }
        
        try {
            // Initialize core module
            Aros.Core.init();
            log('✅ Core module initialized');
            
            // Wait for necessary elements to be available
            Aros.Core.waitForElement('main, div[role="dialog"]', function() {
                log('✅ Required page elements found');
                console.log('[aros_main.js] Aros.Core.waitForElement callback. Aros object keys:', window.Aros ? Object.keys(window.Aros).join(', ') : 'Aros undefined');
                
                try {
                    // Initialize UI
                    if (Aros.UI) {
                        Aros.UI.init();
                        log('✅ UI initialized');
                    }
                    
                    // Initialize Prompt module
                    if (Aros.Prompt) {
                        Aros.Prompt.init();
                        log('✅ Prompt module initialized');
                    }
                    
                    // Initialize image handling
                    if (Aros.Image) {
                        Aros.Image.init();
                        log('✅ Image module initialized');
                        
                        // Add document click listener for the "Find Similar" feature
                        document.addEventListener('click', Aros.Image.handleDocumentClickForSimilar, true);
                    }
                    
                    // Initialize wildcards
                    if (Aros.Wildcards) {
                        Aros.Wildcards.init();
                        log('✅ Wildcards module initialized');
                    }
                    
                    // Initialize complete
                    log("✅ Aros Patcher initialization complete");
                } catch(e) {
                    log(`❌ Error during module initialization: ${e.message}`);
                    console.error(e);
                    alert(`Aros Patcher Error: ${e.message}. Check console for details.`);
                }
            });
        } catch(e) {
            log(`❌ Critical error initializing core module: ${e.message}`);
            console.error(e);
            alert(`Aros Patcher Critical Error: ${e.message}. Check console for details.`);
        }
    }

    // Initialize the application
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        log('DOM already interactive/complete. Running Aros Patcher directly.');
        runArosPatcher();
    } else {
        log('DOM not yet loaded. Adding DOMContentLoaded listener for Aros Patcher.');
        document.addEventListener('DOMContentLoaded', runArosPatcher);
    }
})(); 