// src/utils.js

// Logging Function (accessible globally via main script's IIFE)
function log(msg) {
    const now = new Date();
    const timestamp = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(3, '0')}.${now.getMilliseconds().toString().padStart(3, '0')}`;
    console.log(`[Aros Patcher v${SCRIPT_VERSION} ${timestamp}] ${msg}`);
}

function getTimestamp() { 
    const now = new Date(); 
    const pad = n => String(n).padStart(2, '0'); 
    return `${pad(now.getDate())}${pad(now.getMonth() + 1)}${String(now.getFullYear()).slice(2)}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`; 
}

function triggerDownload(blob, filename) { 
    const link = document.createElement("a"); 
    link.href = URL.createObjectURL(blob); 
    link.download = filename; 
    document.body.appendChild(link); 
    link.click(); 
    document.body.removeChild(link); 
    URL.revokeObjectURL(link.href); 
    log(`Download triggered: ${filename} (Size: ${(blob.size / 1024).toFixed(1)} KB)`); 
}

// Helper function for simulating keyboard typing
function simulateTyping(element, text) {
    const perCharDelay = 10; // ms between characters
    let index = 0;

    element.focus();

    function typeNextChar() {
        if (index >= text.length) return;
        const char = text.charAt(index);
        const keyDown = new KeyboardEvent('keydown', { key: char, code: `Key${char.toUpperCase()}`, bubbles: true, cancelable: true });
        const keyPress = new KeyboardEvent('keypress', { key: char, code: `Key${char.toUpperCase()}`, bubbles: true, cancelable: true });
        const keyUp = new KeyboardEvent('keyup', { key: char, code: `Key${char.toUpperCase()}`, bubbles: true, cancelable: true });
        element.dispatchEvent(keyDown);
        element.dispatchEvent(keyPress);
        element.value += char;
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(keyUp);
        index++;
        setTimeout(typeNextChar, perCharDelay);
    }
    setTimeout(typeNextChar, 0);
    return new Promise(resolve => {
        setTimeout(resolve, text.length * perCharDelay + 100);
    });
} 