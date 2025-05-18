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
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @require      https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js
// @require      https://raw.githubusercontent.com/sneccc/aros_patcher/refs/heads/main/modules/aros_core.js
// @require      https://raw.githubusercontent.com/sneccc/aros_patcher/refs/heads/main/modules/aros_ui.js
// @require      https://raw.githubusercontent.com/sneccc/aros_patcher/refs/heads/main/modules/aros_prompt.js
// @require      https://raw.githubusercontent.com/sneccc/aros_patcher/refs/heads/main/modules/aros_image.js
// @require      https://raw.githubusercontent.com/sneccc/aros_patcher/refs/heads/main/modules/wildcards.js
// ==/UserScript==

(function() {
    'use strict';
    
    // Create global object to track module loading
    window.ArosPatcherLoading = {
        modules: {
            core: false,
            ui: false,
            prompt: false,
            image: false,
            wildcards: false
        },
        startTime: Date.now()
    };
    
    // Log initialization
    console.log('🧠 Aros Patcher initializing...');
    
    // Define module URLs for potential manual loading
    const moduleUrls = {
        core: 'https://raw.githubusercontent.com/sneccc/aros_patcher/refs/heads/main/modules/aros_core.js',
        ui: 'https://raw.githubusercontent.com/sneccc/aros_patcher/refs/heads/main/modules/aros_ui.js',
        prompt: 'https://raw.githubusercontent.com/sneccc/aros_patcher/refs/heads/main/modules/aros_prompt.js',
        image: 'https://raw.githubusercontent.com/sneccc/aros_patcher/refs/heads/main/modules/aros_image.js',
        wildcards: 'https://raw.githubusercontent.com/sneccc/aros_patcher/refs/heads/main/modules/wildcards.js'
    };
    
    // Check if modules are loaded
    function checkModuleLoaded(moduleName, globalVarName) {
        if (window[globalVarName]) {
            console.log(`✅ Module loaded: ${moduleName}`);
            window.ArosPatcherLoading.modules[moduleName] = true;
            return true;
        } else {
            console.error(`❌ Module not loaded: ${moduleName}`);
            return false;
        }
    }
    
    // Attempt to manually load a module if it failed to load via @require
    function attemptManualModuleLoad(moduleName, url) {
        console.log(`🔄 Attempting to manually load ${moduleName} module from ${url}`);
        
        try {
            // Only proceed if GM_xmlhttpRequest is available
            if (typeof GM_xmlhttpRequest !== 'function') {
                console.error('❌ GM_xmlhttpRequest not available. Cannot manually load modules.');
                return Promise.reject(new Error('GM_xmlhttpRequest not available'));
            }
            
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: url,
                    onload: function(response) {
                        if (response.status === 200) {
                            try {
                                // Create script element and append to document
                                const script = document.createElement('script');
                                script.textContent = response.responseText;
                                document.head.appendChild(script);
                                console.log(`✅ Successfully manually loaded ${moduleName} module`);
                                resolve(true);
                            } catch (e) {
                                console.error(`❌ Error evaluating ${moduleName} module:`, e);
                                reject(e);
                            }
                        } else {
                            console.error(`❌ Failed to load ${moduleName} module: ${response.status}`);
                            reject(new Error(`HTTP ${response.status}`));
                        }
                    },
                    onerror: function(error) {
                        console.error(`❌ Network error loading ${moduleName} module:`, error);
                        reject(error);
                    },
                    ontimeout: function() {
                        console.error(`❌ Timeout loading ${moduleName} module`);
                        reject(new Error('Timeout'));
                    }
                });
            });
        } catch (e) {
            console.error(`❌ Error in manual module loading attempt:`, e);
            return Promise.reject(e);
        }
    }
    
    // Initialize the application when the DOM is fully loaded
    document.addEventListener('DOMContentLoaded', function() {
        console.log('🧠 Aros Patcher: DOM content loaded, checking modules...');
        
        const loadTime = (Date.now() - window.ArosPatcherLoading.startTime) / 1000;
        console.log(`Module loading took approximately ${loadTime.toFixed(2)} seconds`);
        
        // Check if all required modules are loaded
        const coreLoaded = checkModuleLoaded('core', 'ArosCore');
        const uiLoaded = checkModuleLoaded('ui', 'ArosUI');
        const promptLoaded = checkModuleLoaded('prompt', 'ArosPrompt');
        const imageLoaded = checkModuleLoaded('image', 'ArosImage');
        const wildcardsLoaded = checkModuleLoaded('wildcards', 'ArosWildcards');
        
        // If core module isn't loaded, try manual loading
        if (!coreLoaded) {
            console.warn('⚠️ Core module not loaded via @require, attempting manual load...');
            
            // Create a basic status display for user
            const statusDiv = document.createElement('div');
            statusDiv.style.position = 'fixed';
            statusDiv.style.top = '10px';
            statusDiv.style.right = '10px';
            statusDiv.style.backgroundColor = 'rgba(0,0,0,0.8)';
            statusDiv.style.color = 'white';
            statusDiv.style.padding = '10px';
            statusDiv.style.borderRadius = '5px';
            statusDiv.style.zIndex = '10000';
            statusDiv.style.maxWidth = '300px';
            statusDiv.innerHTML = '<strong>🧠 Aros Patcher</strong><br>Attempting to load modules...<br>Please wait...';
            document.body.appendChild(statusDiv);
            
            // Attempt manual loading of core module
            attemptManualModuleLoad('core', moduleUrls.core)
                .then(() => {
                    // Recheck if core module is now available
                    if (window.ArosCore) {
                        console.log('✅ Core module successfully loaded manually');
                        statusDiv.innerHTML += '<br>✅ Core module loaded';
                        
                        // Attempt to load other missing modules
                        const loadPromises = [];
                        
                        if (!uiLoaded) {
                            loadPromises.push(attemptManualModuleLoad('ui', moduleUrls.ui));
                        }
                        if (!promptLoaded) {
                            loadPromises.push(attemptManualModuleLoad('prompt', moduleUrls.prompt));
                        }
                        if (!imageLoaded) {
                            loadPromises.push(attemptManualModuleLoad('image', moduleUrls.image));
                        }
                        if (!wildcardsLoaded) {
                            loadPromises.push(attemptManualModuleLoad('wildcards', moduleUrls.wildcards));
                        }
                        
                        // Wait for all manual loading attempts to complete
                        Promise.allSettled(loadPromises)
                            .then(() => {
                                // Recheck modules after manual loading
                                checkModuleLoaded('ui', 'ArosUI');
                                checkModuleLoaded('prompt', 'ArosPrompt');
                                checkModuleLoaded('image', 'ArosImage');
                                checkModuleLoaded('wildcards', 'ArosWildcards');
                                
                                // Try to initialize with what we have
                                statusDiv.innerHTML += '<br>Initializing with available modules...';
                                initializeWithAvailableModules();
                                
                                // Remove status div after 5 seconds
                                setTimeout(() => {
                                    statusDiv.remove();
                                }, 5000);
                            });
                    } else {
                        console.error('❌ Core module still not available after manual loading attempt');
                        statusDiv.innerHTML = '<strong>🧠 Aros Patcher Error</strong><br>Failed to load core module.<br>Please check console (F12) for details.';
                        
                        // Change status div to red for error
                        statusDiv.style.backgroundColor = 'rgba(220,0,0,0.9)';
                    }
                })
                .catch(error => {
                    console.error('❌ Failed to manually load core module:', error);
                    statusDiv.innerHTML = '<strong>🧠 Aros Patcher Error</strong><br>Failed to load modules.<br>Please check console (F12) for details.';
                    statusDiv.style.backgroundColor = 'rgba(220,0,0,0.9)';
                });
        } else {
            // Core module is already loaded, proceed normally
            initializeWithAvailableModules();
        }
    });
    
    // Initialize with whatever modules are available
    function initializeWithAvailableModules() {
        try {
            if (!window.ArosCore) {
                console.error('❌ Critical error: Core module not available. Cannot initialize.');
                alert('Aros Patcher Error: Core module not available. Please check console (F12) for details.');
                return;
            }
            
            // Initialize core module
            ArosCore.init();
            console.log('✅ Core module initialized');
            
            // Wait for necessary elements to be available
            ArosCore.waitForElement('main, div[role="dialog"]', function() {
                console.log('✅ Required page elements found');
                
                try {
                    // Initialize UI if module loaded
                    if (window.ArosUI) {
                        ArosUI.createUI();
                        console.log('✅ UI initialized');
                    } else {
                        console.error('❌ UI module not available - UI features disabled');
                    }
                    
                    // Initialize image handling if module loaded
                    if (window.ArosImage) {
                        ArosImage.init();
                        console.log('✅ Image module initialized');
                        
                        // Add document click listener for the "Find Similar" feature
                        document.addEventListener('click', ArosImage.handleDocumentClickForSimilar, true);
                    } else {
                        console.error('❌ Image module not available - Image features disabled');
                    }
                    
                    // Initialize wildcards if module loaded
                    if (window.ArosWildcards) {
                        ArosWildcards.init();
                        console.log('✅ Wildcards module initialized');
                    } else {
                        console.error('❌ Wildcards module not available - Wildcard features disabled');
                    }
                    
                    // Initialize complete
                    console.log("✅ Aros Patcher initialization complete.");
                } catch(e) {
                    console.error("❌ Error during module initialization:", e);
                    alert(`Aros Patcher Error: ${e.message}. Check console for details.`);
                }
            }, 30000); // Increased timeout to 30 seconds
        } catch(e) {
            console.error("❌ Critical error initializing:", e);
            alert(`Aros Patcher Critical Error: ${e.message}. Check console for details.`);
        }
    }
})(); 