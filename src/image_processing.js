// src/image_processing.js

async function convertWebpToPngBlob(url, cropOption = 'none') {
    const start = performance.now();
    try {
        if (!isDownloading) throw new Error("Download cancelled before fetching."); // isDownloading from main scope
        const response = await fetch(url, { cache: "no-store"});
        if (!response.ok) throw new Error(`Fetch failed: ${response.status} ${response.statusText} for ${url.substring(url.length - 50)}`);
        const webpBlob = await response.blob();
        if (webpBlob.size === 0) throw new Error(`Fetched blob is empty for ${url.substring(url.length - 50)}`);
        if (!isDownloading) throw new Error("Download cancelled after fetching.");

        const imgBitmap = await createImageBitmap(webpBlob);
        let sourceX = 0, sourceY = 0;
        let sourceWidth = imgBitmap.width;
        let sourceHeight = imgBitmap.height;
        let targetWidth = imgBitmap.width;
        let targetHeight = imgBitmap.height;
        const targetCanvas = document.createElement("canvas");

        if (cropOption !== 'none' && sourceWidth > 0 && sourceHeight > 0) {
            let targetRatio = 1;
            let canvasTargetWidth = sourceWidth;
            let canvasTargetHeight = sourceHeight;
            switch (cropOption) {
                case '16:9': targetRatio = 16 / 9; canvasTargetWidth = 1920; canvasTargetHeight = 1080; break;
                case '9:16': targetRatio = 9 / 16; canvasTargetWidth = 1080; canvasTargetHeight = 1920; break;
                case '1:1':  targetRatio = 1 / 1;  canvasTargetWidth = 1080; canvasTargetHeight = 1080; break;
            }
            const currentRatio = sourceWidth / sourceHeight;
            if (Math.abs(currentRatio - targetRatio) >= 0.01) {
                log(`Cropping image (${sourceWidth}x${sourceHeight}, ratio ${currentRatio.toFixed(2)}) to ${cropOption} (ratio ${targetRatio.toFixed(2)})`);
                if (currentRatio > targetRatio) {
                    const idealWidth = sourceHeight * targetRatio;
                    sourceX = (sourceWidth - idealWidth) / 2;
                    sourceWidth = idealWidth;
                } else {
                    const idealHeight = sourceWidth / targetRatio;
                    sourceY = (sourceHeight - idealHeight) / 2;
                    sourceHeight = idealHeight;
                }
            }
            targetWidth = canvasTargetWidth;
            targetHeight = canvasTargetHeight;
        } else {
            targetWidth = sourceWidth;
            targetHeight = sourceHeight;
        }

        if (targetWidth <= 0 || targetHeight <= 0 || sourceWidth <= 0 || sourceHeight <= 0 || sourceX < 0 || sourceY < 0) {
            throw new Error(`Invalid dimensions calculated (Src: ${sourceWidth}x${sourceHeight}@${sourceX},${sourceY} -> Target: ${targetWidth}x${targetHeight})`);
        }

        targetCanvas.width = targetWidth;
        targetCanvas.height = targetHeight;
        const ctx = targetCanvas.getContext("2d", { alpha: false });
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(imgBitmap, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, targetWidth, targetHeight);
        imgBitmap.close();

        return new Promise((resolve, reject) => {
            if (!isDownloading) return reject(new Error("Download cancelled before blob creation."));
            targetCanvas.toBlob(blob => {
                if (blob) {
                    if (!isDownloading) return reject(new Error("Download cancelled during blob creation."));
                    const duration = performance.now() - start;
                    log(`Image converted/cropped (${cropOption}) in ${duration.toFixed(0)}ms. Size: ${(blob.size / 1024).toFixed(1)} KB`);
                    resolve(blob);
                } else {
                    reject(new Error("Canvas toBlob returned null."));
                }
            }, "image/png", 0.95);
        });
    } catch (error) {
        const duration = performance.now() - start;
        if (error.message.includes("cancelled")) {
            log(`Conversion cancelled for ${url.substring(url.length - 50)}...: ${error.message}`);
        } else {
            log(`ERROR converting image ${url.substring(url.length - 50)}... in ${duration.toFixed(0)}ms: ${error.message}`);
            console.error(`Full error for ${url}:`, error);
        }
        throw error;
    }
} 