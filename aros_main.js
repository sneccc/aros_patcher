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
// @grant        none
// @require      https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js
// @require      https://raw.githubusercontent.com/sneccc/aros_patcher/refs/heads/main/modules/aros_core.js
// @require      https://raw.githubusercontent.com/sneccc/aros_patcher/refs/heads/main/modules/aros_ui.js
// @require      https://raw.githubusercontent.com/sneccc/aros_patcher/refs/heads/main/modules/aros_prompt.js
// @require      https://raw.githubusercontent.com/sneccc/aros_patcher/refs/heads/main/modules/aros_image.js
// @require      https://raw.githubusercontent.com/sneccc/aros_patcher/refs/heads/main/modules/wildcards.js
// ==/UserScript==

(function() {
    'use strict';
    
    // Initialize the application when the DOM is fully loaded
    document.addEventListener('DOMContentLoaded', function() {
        // Initialize core module
        ArosCore.init();
        
        // Wait for necessary elements to be available
        ArosCore.waitForElement('main, div[role="dialog"]', function() {
            // Initialize UI
            ArosUI.createUI();
            
            // Initialize image handling
            ArosImage.init();
            
            // Add document click listener for the "Find Similar" feature
            document.addEventListener('click', ArosImage.handleDocumentClickForSimilar, true);
            
            // Initialize complete
            ArosCore.log("Aros Patcher initialization complete.");
        });
    });
})(); 