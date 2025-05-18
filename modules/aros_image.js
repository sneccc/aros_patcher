/**
 * Aros Patcher - Image Module
 * Handles image selection, download, and find similar functionality
 */

console.log('[aros_image.js] Script start (top level).');
window.Aros = window.Aros || {};
console.log('[aros_image.js] Aros namespace ensured (top level). Current Aros keys:', window.Aros ? Object.keys(window.Aros).join(', ') : 'Aros undefined');

console.log('[aros_image.js] Attempting to define Aros.Image...');
Aros.Image = (function() {
    'use strict';
    console.log('[aros_image.js] IIFE for Aros.Image executing.');
    
    // Private variables
    let imageObserver = null;
    
    // --- Image Selection Functions ---
    function handleImageError() {
        ArosCore.log(`ERROR: Failed load for CB init: ${this.src.substring(0, 50)}...`);
        this.removeEventListener('error', handleImageError);
    }
    
    function insertCheckbox(img) {
        // Implementation for inserting checkbox to images
    }
    
    // --- Image Download Functions ---
    async function handleDownload() {
        // Implementation for handling image download
    }
    
    async function convertWebpToPngBlob(url, cropOption = 'none') {
        // Implementation for converting webp to png
    }
    
    // --- Find Similar Feature ---
    function toggleFindSimilarMode() {
        // Implementation for toggling find similar mode
    }
    
    function handleDocumentClickForSimilar(event) {
        // Implementation for handling document click for find similar feature
    }
    
    // --- Observer Setup ---
    function setupImageObserver() {
        imageObserver = new MutationObserver((mutations) => {
            // Implementation for image observer
        });
        
        const observerTarget = document.querySelector(
            '[data-testid="virtuoso-scroller"] > div, main div[class*="grid"], div[role="dialog"] div.flex.h-full.flex-col, body'
        ) ?? document.body;
        
        if (observerTarget) {
            imageObserver.observe(observerTarget, { childList: true, subtree: true });
            ArosCore.log(`Image Observer started observing ${observerTarget.tagName}.`);
        } else {
            ArosCore.log("WARNING: Could not find specific image grid container, observing document body. This might be less efficient.");
            imageObserver.observe(document.body, { childList: true, subtree: true });
        }
    }
    
    // --- Module Initialization ---
    function init() {
        if (Aros.Core && Aros.Core.log) {
            Aros.Core.log("Initializing Image Module...");
        } else {
            console.log("[Aros Image Internal] Initializing Image Module... (Aros.Core.log not available)");
        }
        
        // Initial image scan
        if (Aros.Core && Aros.Core.log) {
            Aros.Core.log("Performing initial image scan...");
        } else {
            console.log("[Aros Image Internal] Performing initial image scan... (Aros.Core.log not available)");
        }
        let initialImages = 0;
        document.querySelectorAll('div[data-index] a > img, div[style*="top:"][style*="left:"] img, .group\\/tile img').forEach(img => {
            insertCheckbox(img);
            initialImages++;
        });
        if (Aros.Core && Aros.Core.log) {
            Aros.Core.log(`Initial image scan complete. Processed ${initialImages} images.`);
        } else {
            console.log(`[Aros Image Internal] Initial image scan complete. Processed ${initialImages} images. (Aros.Core.log not available)`);
        }
        
        // Setup image observer
        setupImageObserver();
        
        if (Aros.Core && Aros.Core.log) {
            Aros.Core.log("Image Module Initialized.");
        } else {
            console.log("[Aros Image Internal] Image Module Initialized. (Aros.Core.log not available)");
        }
    }
    
    // --- Public API ---
    console.log('[aros_image.js] IIFE for Aros.Image executed, returning object.');
    return {
        handleImageError,
        insertCheckbox,
        handleDownload,
        convertWebpToPngBlob,
        toggleFindSimilarMode,
        handleDocumentClickForSimilar,
        init
    };
})();
console.log('[aros_image.js] Script end (top level). Aros.Image type:', typeof Aros.Image, '; Aros.Image defined:', Aros.Image ? 'Yes' : 'No');
if (window.Aros && Aros.Image) {
    console.log('[aros_image.js] Aros.Image defined. Keys:', Object.keys(Aros.Image).join(', '));
} else {
    console.error('[aros_image.js] Aros.Image is NOT defined after execution.');
} 