// src/core_logic.js

function updateProgress() {
    // Uses globals: isRunning, isLooping, totalPromptsSentLoop, totalPromptCount, promptQueue
    // Calls: hideOverlay (ui.js), updateStartButtonPromptCount (ui.js)
    const progressEl = document.getElementById('sora-progress');
    const auxContainer = document.getElementById('sora-aux-controls-container');
    const cooldownEl = document.getElementById('sora-cooldown');
    const stopBtn = document.getElementById('sora-stop-button');
    const isAuto = document.getElementById('sora-auto-submit-checkbox')?.checked ?? false;
    if (!progressEl || !auxContainer) return;

    if (isRunning) {
        let statusText = isLooping ? `Sent: ${totalPromptsSentLoop} / ∞` : `Sent: ${(totalPromptCount > 0 ? (totalPromptCount - promptQueue.length) : 0)} / ${totalPromptCount}`;
        progressEl.textContent = statusText;
        if (auxContainer.style.display !== 'flex') auxContainer.style.display = 'flex';
        if (progressEl.style.display !== 'inline-block') progressEl.style.display = 'inline-block';
        if (cooldownEl) cooldownEl.style.display = (!isAuto) ? 'inline-block' : 'none';
        if (stopBtn && stopBtn.style.display !== 'inline-block') stopBtn.style.display = 'inline-block';
    } else {
        const done = totalPromptCount > 0 ? (totalPromptCount - promptQueue.length) : 0;
        const totalSentDisplay = totalPromptsSentLoop > 0 ? totalPromptsSentLoop : done;
        if (totalPromptCount > 0 && done === totalPromptCount && !isLooping) {
            progressEl.textContent = `Complete: ${done} / ${totalPromptCount}.`;
        } else if (progressEl.textContent.indexOf('Stopped') === -1 && progressEl.textContent.indexOf('Complete') === -1) {
            progressEl.textContent = `Stopped (Total: ${totalSentDisplay})`;
        } else if (totalPromptCount === 0 && progressEl.textContent.indexOf('Stopped') === -1) {
            progressEl.textContent = 'Idle/Stopped.';
        }
        if (!isLooping || totalPromptCount == 0) {
            setTimeout(() => {
                if (!isRunning) {
                    hideOverlay();
                    if (auxContainer) auxContainer.style.display = 'none';
                    if (cooldownEl) cooldownEl.style.display = 'none';
                    const mainUI = document.getElementById('sora-auto-ui');
                    const miniBtn = document.getElementById('sora-minibtn');
                    if (miniBtn && (!mainUI || mainUI.style.display === 'none')) miniBtn.style.display = 'block';
                    if (totalPromptCount > 0 && done === totalPromptCount && !isLooping) {
                        totalPromptCount = 0; totalPromptsSentLoop = 0;
                        updateStartButtonPromptCount();
                    }
                }
            }, 4000);
        }
    }
}

function handleGenerationComplete() {
    // Uses globals: isRunning, isGenerating, generationTimeoutId, autoSubmitTimeoutId, promptQueue, isLooping, originalPromptList
    // Calls: processNextPrompt (core_logic), updateProgress (core_logic)
    if (!isRunning || !isGenerating) return;
    if (generationTimeoutId) { clearTimeout(generationTimeoutId); generationTimeoutId = null; }
    log("Generation complete confirmed.");
    isGenerating = false;
    completionObserver?.disconnect(); // completionObserver from main scope
    if (autoSubmitTimeoutId) { clearTimeout(autoSubmitTimeoutId); autoSubmitTimeoutId = null; }
    const isAuto = document.getElementById('sora-auto-submit-checkbox')?.checked ?? false;
    if (!isAuto) return;

    if (promptQueue.length > 0 || (isLooping && originalPromptList.length > 0)) {
        autoSubmitTimeoutId = setTimeout(() => {
            autoSubmitTimeoutId = null;
            if (isRunning) processNextPrompt();
        }, 1000);
    } else {
        isRunning = false;
        updateProgress();
    }
}

async function processNextPrompt() {
    // Uses globals: isRunning, promptQueue, isLooping, originalPromptList, totalPromptCount, autoSubmitTimeoutId, generationTimeoutId, totalPromptsSentLoop
    // Calls: submitPrompt (sora_interaction), updateProgress (core_logic)
    if (!isRunning) { updateProgress(); return; }
    if (promptQueue.length === 0) {
        if (isLooping && originalPromptList.length > 0) {
            promptQueue = [...originalPromptList];
            totalPromptCount = originalPromptList.length;
        } else {
            isRunning = false; updateProgress(); return;
        }
    }
    if (autoSubmitTimeoutId) { clearTimeout(autoSubmitTimeoutId); autoSubmitTimeoutId = null; }
    if (generationTimeoutId) { clearTimeout(generationTimeoutId); generationTimeoutId = null; }
    totalPromptsSentLoop++;
    const nextPrompt = promptQueue.shift();
    updateProgress();
    await submitPrompt(nextPrompt, true);
}

function startAutoLoop() {
    // Uses globals: isRunning, promptQueue, isLooping
    // Calls: processNextPrompt, updateProgress
    if (!isRunning || (promptQueue.length === 0 && !isLooping)) {
        isRunning = false; updateProgress(); return;
    }
    log(`Starting AUTO loop. Loop: ${isLooping}`);
    processNextPrompt();
}

function startManualTimerLoop(intervalSeconds) {
    // Uses globals: isRunning, promptQueue, isLooping, originalPromptList, totalPromptCount, totalPromptsSentLoop, manualTimerTimeoutId, visualCountdownInterval
    // Calls: submitPrompt, updateProgress
    log(`Starting MANUAL Timer Loop with ${intervalSeconds}s interval. Loop: ${isLooping}.`);
    const intervalMs = intervalSeconds * 1000;
    const cooldownBtn = document.getElementById('sora-cooldown');

    const stopManualTimerInternal = () => {
        if (manualTimerTimeoutId) { clearTimeout(manualTimerTimeoutId); manualTimerTimeoutId = null; }
        if (visualCountdownInterval) { clearInterval(visualCountdownInterval); visualCountdownInterval = null; }
        if (cooldownBtn && !isRunning) cooldownBtn.textContent = `Cooldown: --s`;
    };

    const startVisualCountdownInternal = (totalSeconds) => {
        if (visualCountdownInterval) clearInterval(visualCountdownInterval);
        let timeRemaining = totalSeconds;
        if (cooldownBtn && cooldownBtn.style.display !== 'none') cooldownBtn.textContent = `Cooldown: ${timeRemaining}s`;
        visualCountdownInterval = setInterval(() => {
            timeRemaining--;
            if (cooldownBtn && cooldownBtn.style.display !== 'none') {
                if(isRunning) cooldownBtn.textContent = `Cooldown: ${Math.max(0, timeRemaining)}s`;
                else clearInterval(visualCountdownInterval);
            } else if (!isRunning) clearInterval(visualCountdownInterval);
            if (timeRemaining <= 0) clearInterval(visualCountdownInterval);
        }, 1000);
    };

    const manualTick = async () => {
        if (!isRunning) { stopManualTimerInternal(); updateProgress(); return; }
        if (promptQueue.length === 0) {
            if (isLooping && originalPromptList.length > 0) {
                promptQueue = [...originalPromptList]; totalPromptCount = originalPromptList.length;
            } else {
                stopManualTimerInternal(); isRunning = false; updateProgress(); return;
            }
        }
        totalPromptsSentLoop++;
        const nextPrompt = promptQueue.shift();
        updateProgress();
        startVisualCountdownInternal(intervalSeconds);
        await submitPrompt(nextPrompt, false);
        if (isRunning) {
            if (promptQueue.length > 0 || (isLooping && originalPromptList.length > 0)) {
                scheduleNextManualTickInternal(intervalMs);
            } else {
                stopManualTimerInternal(); isRunning = false; updateProgress();
            }
        } else { stopManualTimerInternal(); updateProgress(); }
    };
    const scheduleNextManualTickInternal = (delay) => {
        if (manualTimerTimeoutId) clearTimeout(manualTimerTimeoutId);
        manualTimerTimeoutId = setTimeout(async () => { await manualTick(); }, delay);
    };

    if (isRunning && promptQueue.length > 0) {
        (async () => {
            totalPromptsSentLoop++;
            const firstPrompt = promptQueue.shift();
            updateProgress();
            startVisualCountdownInternal(intervalSeconds);
            await submitPrompt(firstPrompt, false);
            if (isRunning) {
                if (promptQueue.length > 0 || (isLooping && originalPromptList.length > 0)) {
                    scheduleNextManualTickInternal(intervalMs);
                } else {
                    stopManualTimerInternal(); isRunning = false; updateProgress();
                }
            } else { stopManualTimerInternal(); updateProgress(); }
        })();
    } else if (isRunning && promptQueue.length === 0 && isLooping && originalPromptList.length > 0) {
        promptQueue = [...originalPromptList]; totalPromptCount = originalPromptList.length;
        scheduleNextManualTickInternal(0);
    } else if (isRunning) {
        isRunning = false; stopManualTimerInternal(); updateProgress();
    }
}

function saveRemainingPromptsToFile() {
    // Uses: promptQueue, PROMPT_DELIMITER
    // Calls: getTimestamp, triggerDownload (utils.js)
    if (!promptQueue || promptQueue.length === 0) return;
    log(`Saving ${promptQueue.length} remaining prompts...`);
    const content = promptQueue.join(`\n${PROMPT_DELIMITER}\n`);
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    triggerDownload(blob, `AutoSora_remaining_${getTimestamp()}.txt`);
} 