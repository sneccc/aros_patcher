/**
 * Aros Patcher - Image Module
 * Handles image selection, download, and find similar functionality
 */

const ArosImage = (function() {
    'use strict';
    
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
        ArosCore.log("Initializing Image Module...");
        
        // Initial image scan
        ArosCore.log("Performing initial image scan...");
        let initialImages = 0;
        document.querySelectorAll('div[data-index] a > img, div[style*="top:"][style*="left:"] img, .group\\/tile img').forEach(img => {
            insertCheckbox(img);
            initialImages++;
        });
        ArosCore.log(`Initial image scan complete. Processed ${initialImages} images.`);
        
        // Setup image observer
        setupImageObserver();
        
        ArosCore.log("Image Module Initialized.");
    }
    
    // --- Public API ---
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