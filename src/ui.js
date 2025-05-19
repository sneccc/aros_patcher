let stylesInjected = false;
let pageOverlayElement = null;
let originalBodyOverflow = '';
let originalHtmlOverflow = '';

function injectOverlayStyles() {
    if (stylesInjected) return;
    log("Injecting CSS...");
    const style = document.createElement('style');
    style.textContent = `
        @keyframes sora-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        .sora-overlay-spinner { border: 4px solid rgba(255, 255, 255, 0.2); border-top-color: #fff; border-radius: 50%; width: 40px; height: 40px; animation: sora-spin 1s linear infinite; margin-bottom: 25px; }
        .sora-overlay-text-main { color: #ffffff; font-size: 1.4em; font-weight: 500; text-shadow: 0 1px 3px rgba(0,0,0,0.4); margin-bottom: 8px; }
        .sora-overlay-text-sub { color: #e0e0e0; font-size: 0.9em; text-shadow: 0 1px 2px rgba(0,0,0,0.3); max-width: 80%; text-align: center; line-height: 1.4; }
        input.sora-image-checkbox[${SCRIPT_CHECKBOX_MARKER}] { opacity: 1 !important; }
        .mode-button.mode-active { background-color: rgba(60, 130, 250, 0.3) !important; color: white !important; font-weight: 500; }
        .mode-button:hover { background-color: rgba(80, 80, 90, 0.4) !important; }
        .mode-button.mode-active:hover { background-color: rgba(60, 130, 250, 0.4) !important; }
        code { background: rgba(0, 0, 0, 0.3); padding: 2px 4px; border-radius: 3px; font-family: monospace; font-size: 11px; }
        #sora-wildcard-controls details { user-select: none; }
        #sora-wildcard-controls ul { margin-top: 8px; margin-bottom: 8px; }
        #sora-wildcard-controls p { margin: 8px 0; }
    `;
    document.head.appendChild(style);
    stylesInjected = true;
    log("CSS injected.");
}

function createOverlay() {
    if (pageOverlayElement) return;
    injectOverlayStyles();
    log("Creating page lock overlay element...");
    pageOverlayElement = document.createElement('div');
    pageOverlayElement.id = 'sora-page-overlay';
    pageOverlayElement.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
        background-color: rgba(0, 0, 0, 0.45); z-index: 999990;
        opacity: 0; transition: opacity 0.3s ease;
        backdrop-filter: blur(3px); -webkit-backdrop-filter: blur(3px);
        display: flex; flex-direction: column; justify-content: center;
        align-items: center; text-align: center; color: white;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        display: none;
    `;
    pageOverlayElement.innerHTML = `
        <div class="sora-overlay-spinner"></div>
        <div class="sora-overlay-text-main">Aros Patcher is running</div>
        <div class="sora-overlay-text-sub">Please use Aros in another tab to continue.</div>
    `;
    document.body.appendChild(pageOverlayElement);
    log("Page lock overlay appended to body with content.");
}

function showOverlay() {
    if (!pageOverlayElement) createOverlay();
    if (pageOverlayElement && pageOverlayElement.style.opacity !== '1') {
        log("Showing page lock overlay and locking scroll.");
        originalBodyOverflow = document.body.style.overflow;
        originalHtmlOverflow = document.documentElement.style.overflow;
        document.body.style.overflow = 'hidden';
        document.documentElement.style.overflow = 'hidden';
        pageOverlayElement.style.display = 'flex';
        void pageOverlayElement.offsetWidth;
        pageOverlayElement.style.opacity = '1';
    }
}

function hideOverlay() {
    if (pageOverlayElement && pageOverlayElement.style.display !== 'none') {
        const bodyLocked = document.body.style.overflow === 'hidden';
        const htmlLocked = document.documentElement.style.overflow === 'hidden';
        if (pageOverlayElement.style.opacity !== '0') {
            log("Hiding page lock overlay.");
            pageOverlayElement.style.opacity = '0';
        }
        if (bodyLocked) document.body.style.overflow = originalBodyOverflow;
        if (htmlLocked) document.documentElement.style.overflow = originalHtmlOverflow;
        originalBodyOverflow = '';
        originalHtmlOverflow = '';
        setTimeout(() => {
            if (pageOverlayElement && pageOverlayElement.style.opacity === '0') {
                pageOverlayElement.style.display = 'none';
                log("Overlay display set to none.");
            }
        }, 300);
    } else {
        if (document.body.style.overflow === 'hidden') {
            document.body.style.overflow = originalBodyOverflow;
            originalBodyOverflow = '';
        }
        if (document.documentElement.style.overflow === 'hidden') {
            document.documentElement.style.overflow = originalHtmlOverflow;
            originalHtmlOverflow = '';
        }
    }
}

function updateImageSelection() {
    log("Updating image selections (Library/Task compatible)...");
    let changedCount = 0;
    try {
        const filterHorizState = document.getElementById('sora-select-horizontal')?.checked ?? false;
        const filterVertState = document.getElementById('sora-select-vertical')?.checked ?? false;
        const filterSquareState = document.getElementById('sora-select-square')?.checked ?? false;
        const deselectAll = !filterHorizState && !filterVertState && !filterSquareState;
        document.querySelectorAll(`div[data-index], div[style*="top:"][style*="left:"], .group\\/tile`).forEach(gridItem => {
            const checkbox = gridItem.querySelector(`input.sora-image-checkbox[${SCRIPT_CHECKBOX_MARKER}]`);
            const img = gridItem.querySelector("img");
            if (!checkbox || !img) return;
            const anchor = gridItem.querySelector('a');
            if (anchor && anchor.getAttribute('href')?.startsWith('/t/task_')) return;

            let shouldBeChecked = checkbox.checked;
            const imgSrc = img.src;
            if (img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
                const imgWidth = img.naturalWidth;
                const imgHeight = img.naturalHeight;
                const isHoriz = imgWidth > imgHeight;
                const isVert = imgHeight > imgWidth;
                const isSquare = Math.abs(imgWidth - imgHeight) <= 1;
                if (deselectAll) shouldBeChecked = false;
                else shouldBeChecked = (filterHorizState && isHoriz) || (filterVertState && isVert) || (filterSquareState && isSquare);
                if (checkbox.checked !== shouldBeChecked) {
                    checkbox.checked = shouldBeChecked;
                    changedCount++;
                }
                if (shouldBeChecked) selectedImageUrls.add(imgSrc); else selectedImageUrls.delete(imgSrc);
            } else if (!img.complete) {
                if (checkbox.checked) selectedImageUrls.add(imgSrc); else selectedImageUrls.delete(imgSrc);
            } else {
                if (checkbox.checked) { checkbox.checked = false; changedCount++; }
                selectedImageUrls.delete(imgSrc);
            }
        });
        updateSelectedCount();
        log(`Selection updated via filters. Changed: ${changedCount}, Total: ${selectedImageUrls.size}.`);
    } catch (e) {
        log("ERROR updating image selection:"); console.error(e);
    }
}

function toggleCooldownInputState() { 
    const autoCheckbox = document.getElementById('sora-auto-submit-checkbox'); 
    const cooldownInput = document.getElementById('sora-cooldown-time'); 
    const cooldownLabel = cooldownInput?.closest('div')?.querySelector('label'); 
    if (!autoCheckbox || !cooldownInput) return; 
    const isAuto = autoCheckbox.checked; 
    if (isAuto) { 
        cooldownInput.disabled = true; 
        cooldownInput.style.opacity = '0.5'; 
        cooldownInput.style.cursor = 'not-allowed'; 
        if (cooldownLabel) cooldownLabel.style.opacity = '0.5'; 
    } else { 
        cooldownInput.disabled = false; 
        cooldownInput.style.opacity = '1'; 
        cooldownInput.style.cursor = 'auto'; 
        if (cooldownLabel) cooldownLabel.style.opacity = '1'; 
    } 
}

function updateStartButtonPromptCount() {
    const textarea = document.getElementById('sora-input');
    const startButton = document.getElementById('sora-start');
    const loopCheckbox = document.getElementById('sora-loop-checkbox');
    if (!textarea || !startButton || !loopCheckbox) return;
    const isLoopChecked = loopCheckbox.checked;
    if (isLoopChecked) {
        startButton.textContent = `▶ Start (∞)`;
    } else {
        const prompts = textarea.value.split(PROMPT_DELIMITER).map(x => x.trim()).filter(Boolean);
        const count = prompts.length;
        startButton.textContent = `▶ Start (${count})`;
    }
}

function updateSelectedCount() { 
    const count = selectedImageUrls.size; 
    try { 
        const btnText = document.getElementById("sora-download-text"); 
        const btn = document.getElementById("sora-download-images"); 
        const icon = document.getElementById("sora-download-icon"); 
        const errorEl = document.getElementById("sora-download-error"); 
        if (btnText && btn && !isDownloading) { 
            btnText.textContent = `Download (${count})`; 
            btn.disabled = (count === 0); 
            if (icon) icon.style.display = 'inline'; 
            if (errorEl) errorEl.textContent = ''; 
        } else if (btn) { 
            btn.disabled = true; 
        } 
    } catch (e) { log("ERROR updating selected count UI:"); console.error(e); } 
    const btn = document.getElementById("sora-download-images"); 
    if (btn && !isDownloading) { 
        btn.disabled = (selectedImageUrls.size === 0); 
    } 
}

function updatePersistedImageCountUI() {
    const countEl = document.getElementById('sora-persisted-count');
    if (countEl) {
        countEl.textContent = `(${persistedImages.length} persisted)`;
    }
}

function toggleInputMode(isWildcard) {
    isWildcardMode = isWildcard; // This global variable will be in main.js
    const normalModeBtn = document.getElementById('sora-mode-normal');
    const wildcardModeBtn = document.getElementById('sora-mode-wildcard');
    const wildcardControls = document.getElementById('sora-wildcard-controls');
    const textareaLabel = document.getElementById('textarea-label');
    const textarea = document.getElementById('sora-input');
    
    if (isWildcardMode) {
        normalModeBtn.classList.remove('mode-active');
        normalModeBtn.style.backgroundColor = 'transparent';
        wildcardModeBtn.classList.add('mode-active');
        wildcardModeBtn.style.backgroundColor = 'rgba(60, 130, 250, 0.3)';
        wildcardControls.style.display = 'block';
        textareaLabel.textContent = 'Enter prompt template with wildcards:';
        textarea.placeholder = 'Enter a template with wildcards like __color__ and variations like [option1, option2].\nExamples:\nA __animal__ in a __location__ at __time__\nA [red, blue, green] __object__ with __material__ texture';
    } else {
        wildcardModeBtn.classList.remove('mode-active');
        wildcardModeBtn.style.backgroundColor = 'transparent';
        normalModeBtn.classList.add('mode-active');
        normalModeBtn.style.backgroundColor = 'rgba(60, 130, 250, 0.3)';
        wildcardControls.style.display = 'none';
        textareaLabel.textContent = `Enter prompt list (separated by ${PROMPT_DELIMITER}):`;
        textarea.placeholder = `Enter prompts, separated by a line containing ${PROMPT_DELIMITER}\nExample:\nPrompt 1 Line 1\nPrompt 1 Line 2\n${PROMPT_DELIMITER}\nPrompt 2\n${PROMPT_DELIMITER}\nPrompt 3...\nEnable 'Loop' to repeat.\nPaste images here (enable 'Persist Images' to reuse).`;
    }
    log(`Input mode switched to ${isWildcardMode ? 'wildcard' : 'normal'} mode`);
}

function createUI() {
    log("Creating main UI...");
    const wrapper = document.createElement('div'); wrapper.id = 'sora-auto-ui';
    wrapper.style.cssText = `position: fixed; bottom: 15px; left: 20px; background: rgba(35, 35, 40, 0.65); backdrop-filter: blur(10px) saturate(180%); -webkit-backdrop-filter: blur(10px) saturate(180%); padding: 20px 20px 15px 20px; border-radius: 16px; z-index: 999999; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.37); width: 330px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; border: 1px solid rgba(255, 255, 255, 0.12); color: #e0e0e0; transition: opacity 0.3s ease, transform 0.3s ease; opacity: 1; transform: scale(1); display: block;`;

    const placeholderText = isWildcardMode ? 
        `Enter a template with wildcards like __color__ and variations like [option1, option2].\nExamples:\nA __animal__ in a __location__ at __time__\nA [red, blue, green] __object__ with __material__ texture` :
        `Enter prompts, separated by a line containing ${PROMPT_DELIMITER}\nExample:\nPrompt 1 Line 1\nPrompt 1 Line 2\n${PROMPT_DELIMITER}\nPrompt 2\n${PROMPT_DELIMITER}\nPrompt 3...\nEnable 'Loop' to repeat.\nPaste images here (enable 'Persist Images' to reuse).`;

    wrapper.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;"> <h3 style="margin: 0; font-size: 17px; display: flex; align-items: center; gap: 10px; color: #ffffff; font-weight: 500;"> <img src="https://www.svgrepo.com/show/306500/openai.svg" width="22" height="22" style="filter: invert(1);" alt="OpenAI Logo"/> Aros Patcher <span style="font-size: 9px; opacity: 0.6; font-weight: 300; margin-left: -5px;">build ${SCRIPT_VERSION}</span> </h3> <button id="sora-close" style=" background: rgba(80, 80, 80, 0.4); backdrop-filter: blur(5px) saturate(150%); -webkit-backdrop-filter: blur(5px) saturate(150%); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; padding: 2px 6px; font-size: 16px; color: rgba(255, 255, 255, 0.7); cursor: pointer; transition: background-color 0.2s ease, color 0.2s ease, border-color 0.2s ease; " onmouseover="this.style.backgroundColor='rgba(100, 100, 100, 0.6)'; this.style.color='rgba(255, 255, 255, 0.9)'; this.style.borderColor='rgba(255, 255, 255, 0.15)'" onmouseout="this.style.backgroundColor='rgba(80, 80, 80, 0.4)'; this.style.color='rgba(255, 255, 255, 0.7)'; this.style.borderColor='rgba(255, 255, 255, 0.1)'" title="Close Panel">✕</button> </div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <label style="font-size: 13px; color: #bdbdbd; font-weight: 400; white-space: nowrap;">Input Mode:</label>
            <div style="display: flex; background: rgba(0, 0, 0, 0.25); border-radius: 10px; overflow: hidden; border: 1px solid rgba(255, 255, 255, 0.1);">
                <button id="sora-mode-normal" class="mode-button mode-active" style="padding: 6px 10px; font-size: 12px; border: none; cursor: pointer; background: transparent; color: #e0e0e0; transition: background-color 0.2s ease;">Normal</button>
                <button id="sora-mode-wildcard" class="mode-button" style="padding: 6px 10px; font-size: 12px; border: none; cursor: pointer; background: transparent; color: #e0e0e0; transition: background-color 0.2s ease;">Wildcard</button>
            </div>
        </div>
        <label id="textarea-label" style="font-size: 13px; color: #bdbdbd; font-weight: 400; margin-bottom: 5px; display: block;">Enter prompt list (separated by ${PROMPT_DELIMITER}):</label> 
        <textarea rows="5" id="sora-input" placeholder="${placeholderText}" style="width: 100%; padding: 12px; border: 1px solid rgba(255, 255, 255, 0.1); background: rgba(0, 0, 0, 0.25); border-radius: 10px; resize: vertical; font-size: 12px; color: #e0e0e0; margin-top: 0px; margin-bottom: 12px; box-sizing: border-box; min-height: 80px; overflow-y: hidden;"></textarea>
        <div id="sora-wildcard-controls" style="display: none; margin-bottom: 15px;">
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px;">
                <label style="font-size: 13px; color: #bdbdbd; font-weight: 400; white-space: nowrap;">Generate:</label>
                <input id="sora-prompt-count" type="number" min="1" max="100" value="${generatedPromptCount}" style="width: 60px; padding: 8px 10px; border: 1px solid rgba(255, 255, 255, 0.1); background: rgba(0, 0, 0, 0.25); color: #e0e0e0; border-radius: 10px; font-size: 14px; box-sizing: border-box;" title="Number of prompts to generate"/>
                <label style="font-size: 13px; color: #bdbdbd; font-weight: 400; white-space: nowrap;">prompts</label>
                <button id="sora-load-example" style="background: rgba(80, 80, 80, 0.5); color: white; padding: 6px 12px; border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 10px; cursor: pointer; margin-left: auto; font-size: 12px; margin-right: 8px;">Load Example</button>
                <button id="sora-generate-prompts" style="background: rgba(60, 130, 250, 0.5); color: white; padding: 6px 12px; border: 1px solid rgba(60, 130, 250, 0.6); border-radius: 10px; cursor: pointer; font-size: 12px;">Generate</button>
            </div>
            <div style="background: rgba(60, 130, 250, 0.15); padding: 10px; border-radius: 10px; margin-bottom: 12px; border: 1px solid rgba(60, 130, 250, 0.3);">
                <p style="margin: 0 0 8px 0; font-size: 12px; color: #e0e0e0;"><b>How wildcards work:</b> Each <code>__wildcard__</code> is replaced with a random value from its category.</p>
                <p style="margin: 0; font-size: 12px; color: #e0e0e0;"><b>How variations work:</b> Each <code>[option1, option2]</code> creates multiple prompts with each option.</p>
            </div>
            <details style="margin-bottom: 10px; color: #bdbdbd; font-size: 12px;">
                <summary style="cursor: pointer; padding: 5px 0;">Available Wildcards</summary>
                <div style="background: rgba(0, 0, 0, 0.2); padding: 8px; border-radius: 8px; margin-top: 5px; max-height: 120px; overflow-y: auto;">
                    <p>Use the format <code>__category__</code> for wildcards:</p>
                    <ul style="margin: 5px 0; padding-left: 20px; columns: 2;">
                        <li>__color__</li><li>__animal__</li><li>__object__</li><li>__material__</li><li>__emotion__</li><li>__weather__</li><li>__time__</li><li>__location__</li><li>__style__</li><li>__lighting__</li><li>__camera__</li>
                    </ul>
                    <p>Use brackets for variations: <code>[option1, option2]</code></p>
                    <p>Example: "A __animal__ in a __location__ during __time__"</p>
                </div>
            </details>
        </div>
        <div id="sora-mode-controls" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; gap: 15px;">
            <div style="display: flex; align-items: center; gap: 5px;">
                <label style="font-size: 13px; color: #bdbdbd; font-weight: 400; white-space: nowrap; transition: opacity 0.3s ease;">⏱ Cooldown:</label>
                <input id="sora-cooldown-time" type="number" min="1" value="${cooldownTime}" style="width: 77px; padding: 8px 10px; border: 1px solid rgba(255, 255, 255, 0.1); background: rgba(0, 0, 0, 0.25); color: #e0e0e0; border-radius: 10px; font-size: 14px; box-sizing: border-box; transition: opacity 0.3s ease, cursor 0.3s ease;" title="Wait time between prompts when 'Auto' is off"/>
            </div>
            <div style="display: flex; align-items: center; gap: 15px;">
                <label title="Repeat the entire prompt list indefinitely" style="display: flex; align-items: center; gap: 7px; font-size: 13px; color: #d0d0d0; cursor: pointer;"><input type="checkbox" id="sora-loop-checkbox" style="transform: scale(1.1); cursor: pointer; accent-color: #4a90e2;"/> Loop</label>
                <label title="Automatically submit next prompt 1 second after generation finishes (or after 5 minutes if stuck)" style="display: flex; align-items: center; gap: 7px; font-size: 13px; color: #d0d0d0; cursor: pointer;"><input type="checkbox" id="sora-auto-submit-checkbox" style="transform: scale(1.1); cursor: pointer; accent-color: #4a90e2;"/> Auto</label>
            </div>
        </div>
        <div id="sora-persistence-controls" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; margin-top: -5px; gap: 15px;">
            <label title="If checked, any images you paste into the prompt list will be re-pasted for every subsequent prompt in the current run." style="display: flex; align-items: center; gap: 7px; font-size: 13px; color: #d0d0d0; cursor: pointer;"><input type="checkbox" id="sora-persist-images-checkbox" style="transform: scale(1.1); cursor: pointer; accent-color: #4a90e2;"/> 📷 Persist Images</label>
            <button id="sora-paste-all-images" title="Paste all persisted images into the current Aros prompt" style="background: rgba(60, 130, 250, 0.5); color: white; padding: 4px 10px; border: 1px solid rgba(60, 130, 250, 0.6); border-radius: 8px; cursor: pointer; font-size: 12px; white-space: nowrap;">Paste All Images</button>
            <span id="sora-persisted-count" style="font-size: 12px; color: #bdbdbd; white-space: nowrap;">(0 persisted)</span>
        </div>
        <div style="display: flex; gap: 10px; margin-bottom: 20px;"> <button id="sora-start" style=" flex: 1; background: rgba(60, 130, 250, 0.5); backdrop-filter: blur(5px) saturate(150%); -webkit-backdrop-filter: blur(5px) saturate(150%); color: white; padding: 10px; border: 1px solid rgba(60, 130, 250, 0.6); border-radius: 10px; cursor: pointer; font-weight: 500; transition: background-color 0.2s ease, border-color 0.2s ease; ">▶ Start (0)</button> <button id="sora-clear" style=" flex: 1; background: rgba(80, 80, 80, 0.5); backdrop-filter: blur(5px) saturate(150%); -webkit-backdrop-filter: blur(5px) saturate(150%); color: #d0d0d0; padding: 10px; border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 10px; cursor: pointer; transition: background-color 0.2s ease, border-color 0.2s ease; " onmouseover="this.style.backgroundColor='rgba(100, 100, 100, 0.6)'; this.style.borderColor='rgba(255, 255, 255, 0.2)'" onmouseout="this.style.backgroundColor='rgba(80, 80, 80, 0.5)'; this.style.borderColor='rgba(255, 255, 255, 0.15)'">🗑️ Clear</button> </div>
        <hr style="border: none; border-top: 1px solid rgba(255, 255, 255, 0.1); margin: 18px 0;" />
        <div style="font-size: 13px; color: #bdbdbd; margin-bottom: 12px; font-weight: 400;">Select images to download:</div> <div style="display: flex; gap: 18px; margin-bottom: 15px; flex-wrap: wrap; justify-content: flex-start; align-items: center;"> <label title="Select images wider than tall" style="display: flex; align-items: center; gap: 7px; font-size: 13px; color: #d0d0d0; cursor: pointer;"> <input type="checkbox" id="sora-select-horizontal" style="transform: scale(1.1); cursor: pointer; accent-color: #4a90e2;" /> Landscape </label> <label title="Select images taller than wide" style="display: flex; align-items: center; gap: 7px; font-size: 13px; color: #d0d0d0; cursor: pointer;"> <input type="checkbox" id="sora-select-vertical" style="transform: scale(1.1); cursor: pointer; accent-color: #4a90e2;" /> Portrait </label> <label title="Select images with equal width and height" style="display: flex; align-items: center; gap: 7px; font-size: 13px; color: #d0d0d0; cursor: pointer;"> <input type="checkbox" id="sora-select-square" style="transform: scale(1.1); cursor: pointer; accent-color: #4a90e2;" /> Square </label> </div>
        <hr style="border: none; border-top: 1px solid rgba(255, 255, 255, 0.08); margin: 18px 0;" />
        <div style="font-size: 13px; color: #bdbdbd; margin-bottom: 10px; font-weight: 400;">Crop option for download:</div> <div id="sora-crop-options" style="display: flex; flex-direction: row; flex-wrap: wrap; gap: 15px; margin-bottom: 15px;"> <label style="display: flex; align-items: center; gap: 5px; font-size: 13px; color: #d0d0d0; cursor: pointer;"> <input type="radio" name="sora-crop-option" value="none" checked style="cursor: pointer; accent-color: #4a90e2; transform: scale(1.1);" /> Original </label> <label style="display: flex; align-items: center; gap: 5px; font-size: 13px; color: #d0d0d0; cursor: pointer;"> <input type="radio" name="sora-crop-option" value="16:9" style="cursor: pointer; accent-color: #4a90e2; transform: scale(1.1);" /> 16:9 </label> <label style="display: flex; align-items: center; gap: 5px; font-size: 13px; color: #d0d0d0; cursor: pointer;"> <input type="radio" name="sora-crop-option" value="9:16" style="cursor: pointer; accent-color: #4a90e2; transform: scale(1.1);" /> 9:16 </label> <label style="display: flex; align-items: center; gap: 5px; font-size: 13px; color: #d0d0d0; cursor: pointer;"> <input type="radio" name="sora-crop-option" value="1:1" style="cursor: pointer; accent-color: #4a90e2; transform: scale(1.1);" /> 1:1 </label> </div>
        <div style="display: flex; gap: 10px; margin-top: 20px; align-items: stretch;"> <button id="sora-download-images" style=" flex-grow: 1; background: rgba(46, 160, 67, 0.5); backdrop-filter: blur(5px) saturate(150%); -webkit-backdrop-filter: blur(5px) saturate(150%); color: white; padding: 11px; border: 1px solid rgba(46, 160, 67, 0.6); border-radius: 10px; cursor: pointer; font-size: 14px; display: flex; align-items: center; justify-content: center; gap: 8px; transition: background-color 0.2s ease, border-color 0.2s ease, opacity 0.2s ease; font-weight: 500; " onmouseover="if(!this.disabled) { this.style.backgroundColor='rgba(46, 160, 67, 0.7)'; this.style.borderColor='rgba(46, 160, 67, 0.8)'; }" onmouseout="if(!this.disabled) { this.style.backgroundColor='rgba(46, 160, 67, 0.5)'; this.style.borderColor='rgba(46, 160, 67, 0.6)'; }"> <svg id="sora-download-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-download" viewBox="0 0 16 16" style="display: inline;"> <path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5"/> <path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708z"/> </svg> <span id="sora-download-text">Download (0)</span> </button> <button id="sora-find-similar-button" title="Activate find similar image mode" style=" flex-shrink: 0; background: rgba(80, 80, 90, 0.5); backdrop-filter: blur(5px) saturate(150%); -webkit-backdrop-filter: blur(5px) saturate(150%); color: white; padding: 11px 14px; border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 10px; cursor: pointer; font-size: 14px; display: flex; align-items: center; justify-content: center; transition: background-color 0.2s ease, border-color 0.2s ease; " onmouseover="if(!this.classList.contains('active')) { this.style.backgroundColor='rgba(100, 100, 110, 0.6)'; this.style.borderColor='rgba(255, 255, 255, 0.2)'; }" onmouseout="if(!this.classList.contains('active')) { this.style.backgroundColor='rgba(80, 80, 90, 0.5)'; this.style.borderColor='rgba(255, 255, 255, 0.15)'; }"> <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-cursor-fill" viewBox="0 0 16 16"> <path d="M14.082 2.182a.5.5 0 0 1 .103.557L8.528 15.467a.5.5 0 0 1-.917-.007L5.57 10.694.803 8.652a.5.5 0 0 1-.006-.916l12.728-5.657a.5.5 0 0 1 .556.103z"/> </svg> </button> </div>
        <style> #sora-download-images:disabled { background: rgba(80, 80, 80, 0.3) !important; border-color: rgba(255, 255, 255, 0.08) !important; color: rgba(255, 255, 255, 0.4) !important; backdrop-filter: blur(2px) saturate(100%); -webkit-backdrop-filter: blur(2px) saturate(100%); opacity: 0.6; cursor: not-allowed; } #sora-find-similar-button.active { background-color: rgba(60, 130, 250, 0.65) !important; border-color: rgba(60, 130, 250, 0.8) !important; } </style>
        <div id="sora-download-progress" style="display: none;"></div>
        <div id="sora-download-error" style="font-size: 11px; color: #ff8a8a; text-align: center; margin-top: 5px; font-weight: 400;"></div>
    `;
    
    document.body.appendChild(wrapper);
    log("Main UI elements appended to body.");

    // Event listeners will be attached in the main script after UI creation
    // Example of how they would be attached:
    // document.getElementById('sora-mode-normal').addEventListener('click', () => toggleInputMode(false));
    // etc. for all buttons and inputs

    // Drag Logic (to be called from main script after wrapper is created)
    // wrapper.addEventListener('mousedown', dragMouseDown);
    // wrapper.style.cursor = 'grab';

    log("Event listeners need to be attached by the main script.");
}

function createAuxiliaryUI() {
    log("Creating auxiliary UI (progress, cooldown, stop)...");
    const auxContainer = document.createElement('div'); auxContainer.id = 'sora-aux-controls-container';
    auxContainer.style.cssText = `position: fixed; bottom: 15px; left: 20px; z-index: 999998; display: none; align-items: center; gap: 10px; transition: opacity 0.3s ease; opacity: 1;`;
    const glassItemStyle = `background: rgba(45, 45, 50, 0.7); backdrop-filter: blur(8px) saturate(150%); -webkit-backdrop-filter: blur(8px) saturate(150%); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 10px; padding: 8px 14px; font-size: 13px; color: #d5d5d5; display: none; white-space: nowrap; box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2); transition: background-color 0.2s ease, border-color 0.2s ease;`; 
    const progress = document.createElement('div'); progress.id = 'sora-progress'; progress.style.cssText = glassItemStyle; progress.textContent = 'Processing...'; auxContainer.appendChild(progress); 
    const cooldownBtn = document.createElement('button'); cooldownBtn.id = 'sora-cooldown'; cooldownBtn.style.cssText = glassItemStyle + `cursor: default;`; cooldownBtn.textContent = `⏱ Cooldown: --s`; auxContainer.appendChild(cooldownBtn); 
    const stopBtn = document.createElement('button'); stopBtn.id = 'sora-stop-button'; stopBtn.style.cssText = glassItemStyle + `background: rgba(200, 50, 60, 0.7); border-color: rgba(255, 99, 132, 0.4); color: white; cursor: pointer; font-weight: 500;`; stopBtn.textContent = '🛑 Stop'; stopBtn.title = 'Stop sending prompts and save remaining ones'; 
    // stopBtn.onclick = handleStop; // To be attached in main script
    stopBtn.onmouseover = function () { this.style.backgroundColor = 'rgba(220, 53, 69, 0.8)'; this.style.borderColor = 'rgba(255, 99, 132, 0.6)'; }; 
    stopBtn.onmouseout = function () { this.style.backgroundColor = 'rgba(200, 50, 60, 0.7)'; this.style.borderColor = 'rgba(255, 99, 132, 0.4)'; }; 
    auxContainer.appendChild(stopBtn); 
    document.body.appendChild(auxContainer);
    
    const miniBtn = document.createElement('div'); miniBtn.id = 'sora-minibtn'; 
    miniBtn.style.cssText = `position: fixed; bottom: 15px; left: 20px; width: 16px; height: 16px; background: rgba(255, 255, 255, 0.8); border-radius: 50%; cursor: pointer; z-index: 999999; box-shadow: 0 0 8px rgba(255, 255, 255, 0.5); display: none; border: 1px solid rgba(255, 255, 255, 0.3); transition: background-color 0.2s ease;`; 
    miniBtn.onmouseover = function () { this.style.backgroundColor = 'rgba(255, 255, 255, 1)'; }; 
    miniBtn.onmouseout = function () { this.style.backgroundColor = 'rgba(255, 255, 255, 0.8)'; }; 
    miniBtn.title = 'Reopen Aros Patcher'; 
    // miniBtn.onclick = handleMiniButtonClick; // To be attached in main script
    document.body.appendChild(miniBtn);
    log("Auxiliary UI appended to body. Event listeners to be attached by main script.");
    createOverlay();
}

// Drag and drop utility for the main panel (to be called by main script)
function makeUIDraggable() {
    const wrapper = document.getElementById('sora-auto-ui');
    if (!wrapper) return;

    let isDragging = false; 
    let offsetX, offsetY;

    function dragMouseDown(e) { 
        if (pageOverlayElement && pageOverlayElement.style.display !== 'none') return; 
        if (e.button !== 0) return; 
        const targetTagName = e.target.tagName.toLowerCase(); 
        const isInteractive = ['input', 'button', 'textarea', 'svg', 'span', 'label', 'img'].includes(targetTagName) || e.target.closest('button, input, textarea, a, label[style*="cursor: pointer"], img'); 
        if (isInteractive) return;
        isDragging = true; 
        wrapper.style.cursor = 'grabbing'; 
        const rect = wrapper.getBoundingClientRect(); 
        offsetX = e.clientX - rect.left; 
        offsetY = e.clientY - rect.top; 
        wrapper.style.bottom = 'auto'; 
        wrapper.style.top = `${rect.top}px`; 
        wrapper.style.left = `${rect.left}px`; 
        document.addEventListener('mousemove', elementDrag); 
        document.addEventListener('mouseup', closeDragElement); 
        e.preventDefault(); 
    }

    function elementDrag(e) { 
        if (isDragging) { 
            e.preventDefault(); 
            const newTop = e.clientY - offsetY; 
            const newLeft = e.clientX - offsetX; 
            wrapper.style.top = `${newTop}px`; 
            wrapper.style.left = `${newLeft}px`; 
        } 
    }

    function closeDragElement() { 
        if (isDragging) { 
            isDragging = false; 
            wrapper.style.cursor = 'grab'; 
            document.removeEventListener('mousemove', elementDrag); 
            document.removeEventListener('mouseup', closeDragElement); 
        } 
    }
    wrapper.addEventListener('mousedown', dragMouseDown);
    wrapper.style.cursor = 'grab';
    log("Drag listeners added to UI panel.");
} 