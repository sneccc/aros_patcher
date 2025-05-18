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
        Aros.Core.log("Image download process started.", 'info', 'Image');
        const urlsToDownload = Aros.Core.getSelectedImageUrls(); // Get URLs from Core

        if (!urlsToDownload || urlsToDownload.size === 0) {
            Aros.Core.log("No images selected for download.", 'warn', 'Image');
            if (Aros.UI && Aros.UI.logToUIPanel) {
                Aros.UI.logToUIPanel("No images selected to download.", "warn");
            }
            return;
        }

        Aros.Core.log(`Attempting to download ${urlsToDownload.size} selected images.`, 'info', 'Image');
        if (Aros.UI && Aros.UI.logToUIPanel) {
            Aros.UI.logToUIPanel(`Starting download of ${urlsToDownload.size} image(s)...`, "info");
        }
        if (Aros.UI && Aros.UI.showOverlay) Aros.UI.showOverlay(`Downloading ${urlsToDownload.size} images...`);
        
        Aros.Core.setDownloading(true);
        let successCount = 0;
        let errorCount = 0;

        for (const url of urlsToDownload) {
            if (!Aros.Core.isDownloading()) { // Check if stop was requested
                Aros.Core.log("Download process was stopped prematurely.", 'warn', 'Image');
                break;
            }
            try {
                // Extract filename - basic version, might need improvement for complex URLs
                let filename = url.substring(url.lastIndexOf('/') + 1).split('?')[0];
                if (!filename.match(/\.(png|jpg|jpeg|webp|gif)$/i)) {
                    filename += '.png'; // Default to png if no extension
                }

                // Fetch and convert/download logic (simplified)
                // Assuming convertWebpToPngBlob handles fetching and conversion if needed
                const blob = await convertWebpToPngBlob(url); // convertWebpToPngBlob should handle non-WebP passthrough or conversion
                if (blob) {
                    Aros.Core.triggerDownload(blob, filename); // Use Core's triggerDownload
                    successCount++;
                    Aros.Core.log(`Successfully downloaded: ${filename}`, 'info', 'Image');
                } else {
                    errorCount++;
                    Aros.Core.error(`Failed to process blob for: ${filename}`, 'Image');
                }
            } catch (err) {
                errorCount++;
                Aros.Core.error(`Error downloading ${url}: ${err.message}`, 'Image');
                console.error(err);
            }
            // Optional: Small delay between downloads
            // await new Promise(resolve => setTimeout(resolve, 200)); 
        }
        
        Aros.Core.setDownloading(false);
        if (Aros.UI && Aros.UI.hideOverlay) Aros.UI.hideOverlay();

        const summaryMessage = `Download complete. Success: ${successCount}, Failed: ${errorCount}.`;
        Aros.Core.log(summaryMessage, 'info', 'Image');
        if (Aros.UI && Aros.UI.logToUIPanel) {
            Aros.UI.logToUIPanel(summaryMessage, errorCount > 0 ? "warn" : "success");
        }

        // Clear selections after download? (Optional - based on desired behavior)
        // if (successCount > 0 && Aros.Core.clearSelectedImages) Aros.Core.clearSelectedImages(); 
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