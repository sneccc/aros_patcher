// src/image_management.js

function handleImageError() { 
    log(`ERROR: Failed load for CB init: ${this.src.substring(0, 50)}...`); 
    this.removeEventListener('error', handleImageError); 
}

function insertCheckbox(img) {
    try {
        const libraryAnchor = img.closest('a');
        let containerElement;
        if (libraryAnchor && libraryAnchor.getAttribute('href')?.startsWith('/t/task_')) return;

        if (libraryAnchor) { containerElement = img.closest('div[data-index]'); }
        else { containerElement = img.closest('div[style*="top:"][style*="left:"]') ?? img.closest('.group\\/tile'); }
        if (!containerElement) return;

        const existingNativeCheckbox = containerElement.querySelector(`input.sora-image-checkbox:not([${SCRIPT_CHECKBOX_MARKER}])`);
        if (existingNativeCheckbox) { try { existingNativeCheckbox.remove(); } catch (e) {} }
        if (containerElement.querySelector(`input.sora-image-checkbox[${SCRIPT_CHECKBOX_MARKER}]`)) return;

        const checkbox = document.createElement("input"); checkbox.type = "checkbox"; checkbox.className = "sora-image-checkbox"; checkbox.setAttribute(SCRIPT_CHECKBOX_MARKER, 'true');
        Object.assign(checkbox.style, { position: "absolute", top: "8px", left: "8px", zIndex: "10", width: "18px", height: "18px", cursor: "pointer", transform: "scale(1.3)", accentColor: "#4a90e2", backgroundColor: "rgba(255,255,255,0.7)", border: "1px solid rgba(0,0,0,0.3)", borderRadius: "3px", opacity: '1' });
        checkbox.title = "Select/deselect this image";

        const setInitialCheckboxStateBasedOnFilters = () => {
            try {
                if (!img.complete || img.naturalWidth === 0 || img.naturalHeight === 0) return;
                const filterH = document.getElementById('sora-select-horizontal')?.checked ?? false;
                const filterV = document.getElementById('sora-select-vertical')?.checked ?? false;
                const filterS = document.getElementById('sora-select-square')?.checked ?? false;
                const imgW = img.naturalWidth; const imgH = img.naturalHeight;
                let shouldBe = false;
                const isH = imgW > imgH; const isV = imgH > imgW; const isS = Math.abs(imgW - imgH) <= 1;
                if (!filterH && !filterV && !filterS) { shouldBe = false; }
                else { shouldBe = (filterH && isH) || (filterV && isV) || (filterS && isS); }
                if (checkbox.checked !== shouldBe) {
                    checkbox.checked = shouldBe;
                    if (shouldBe) { selectedImageUrls.add(img.src); } else { selectedImageUrls.delete(img.src); }
                    updateSelectedCount(); // from ui.js (main scope)
                }
            } catch (e) { log(`ERROR setInitialCheckboxStateBasedOnFilters: ${e.message}`); }
        };

        checkbox.addEventListener("change", (e) => {
            if (e.target.checked) selectedImageUrls.add(img.src); // selectedImageUrls from main scope
            else selectedImageUrls.delete(img.src);
            updateSelectedCount(); // from ui.js (main scope)
        });

        const currentPos = window.getComputedStyle(containerElement).position;
        if (currentPos === 'static' || currentPos === '') containerElement.style.position = 'relative';
        containerElement.insertBefore(checkbox, containerElement.firstChild);

        if (img.complete && img.naturalWidth > 0) {
            setInitialCheckboxStateBasedOnFilters();
        } else {
            img.removeEventListener('load', setInitialCheckboxStateBasedOnFilters);
            img.removeEventListener('error', handleImageError);
            img.addEventListener('load', setInitialCheckboxStateBasedOnFilters, { once: true });
            img.addEventListener('error', handleImageError, { once: true });
            checkbox.checked = false;
        }
    } catch (e) { log(`ERROR inserting checkbox: ${e.message}`); console.error(e); }
}

async function handleDownload() {
    log("Download button clicked.");
    const btn = document.getElementById("sora-download-images");
    const btnText = document.getElementById("sora-download-text");
    const btnIcon = document.getElementById("sora-download-icon");
    const errorEl = document.getElementById("sora-download-error");
    if (!btn || !btnText || !btnIcon || !errorEl) { log("ERROR: Download UI elements not found."); return; }

    if (isDownloading) { log("Download stop requested."); isDownloading = false; btnText.textContent = `Stopping...`; return; } // isDownloading from main scope

    const urlsToDownload = Array.from(selectedImageUrls); // selectedImageUrls from main scope
    if (urlsToDownload.length === 0) { log("Download skipped: No images selected."); errorEl.textContent = "No images selected."; setTimeout(() => { if (!isDownloading && errorEl) errorEl.textContent = ''; }, 3000); return; }

    isDownloading = true;
    downloadErrors = 0; // downloadErrors from main scope
    let successfulCount = 0;
    const totalFiles = urlsToDownload.length;
    const selectedCropOption = document.querySelector('input[name="sora-crop-option"]:checked')?.value ?? 'none';
    btn.disabled = true;
    btnIcon.style.display = 'none';
    btnText.textContent = `Preparing... (0/${totalFiles})`;
    errorEl.textContent = '';

    if (totalFiles === 1) {
        const url = urlsToDownload[0];
        btnText.textContent = `Processing 1 image...`;
        try {
            const blob = await convertWebpToPngBlob(url, selectedCropOption); // from image_processing.js
            if (blob && isDownloading) {
                const timestamp = getTimestamp(); // from utils.js
                const filename = `AutoAros_${selectedCropOption}_${timestamp}.png`;
                triggerDownload(blob, filename); // from utils.js
                btnText.textContent = `Downloaded 1 image`;
                successfulCount = 1;
            } else if (!blob && isDownloading) {
                downloadErrors = 1;
                errorEl.textContent = `Error processing image. Check Console.`;
                btnText.textContent = `Download error`;
            }
        } catch (err) { /* ... */ } 
        finally {
            const wasDownloading = isDownloading;
            isDownloading = false;
            if (btnIcon) btnIcon.style.display = 'inline';
            setTimeout(() => { if (!isDownloading) updateSelectedCount(); }, 3000); // updateSelectedCount from ui.js
        }
        return;
    }

    let processedImageCount = 0;
    btnText.textContent = `Processing images: 0/${totalFiles} (0%)`;
    const conversionPromises = urlsToDownload.map((url, index) => {
        return convertWebpToPngBlob(url, selectedCropOption)
            .then(blob => {
                if (isDownloading) {
                    processedImageCount++;
                    const percentage = ((processedImageCount / totalFiles) * 100).toFixed(0);
                    btnText.textContent = `Processing images: ${processedImageCount}/${totalFiles} (${percentage}%)`;
                }
                return blob;
            })
            .catch(error => {
                if (isDownloading) { processedImageCount++; }
                return null;
            });
    });
    const results = await Promise.allSettled(conversionPromises);
    if (!isDownloading) { /* ... */ return; }

    const zip = new JSZip();
    results.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value) {
            const blob = result.value;
            zip.file(`image_${index + 1}.png`, blob);
            successfulCount++;
        } else { downloadErrors++; }
    });

    if (!isDownloading) { /* ... */ return; }
    if (successfulCount > 0) {
        try {
            btnText.textContent = 'Creating ZIP file...';
            const zipBlob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } }, 
                (metadata) => { if (!isDownloading) throw new Error("Zip generation cancelled."); btnText.textContent = `Compressing ZIP: ${metadata.percent.toFixed(0)}%`; }
            );
            if (isDownloading) {
                triggerDownload(zipBlob, `AutoAros_Bulk_${getTimestamp()}.zip`);
                btnText.textContent = `Downloaded ${successfulCount}/${totalFiles} images`;
                if (downloadErrors > 0) errorEl.textContent = `${downloadErrors} errors occurred.`;
            }
        } catch (error) { /* ... */ }
    } else if (isDownloading) {
        btnText.textContent = "Image processing error";
        errorEl.textContent = `Could not process any images (${downloadErrors} errors).`;
    }
    isDownloading = false;
    if (btnIcon) btnIcon.style.display = 'inline';
    setTimeout(() => { if (!isDownloading) updateSelectedCount(); }, 5000);
} 