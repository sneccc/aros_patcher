// src/find_similar.js

function toggleFindSimilarMode() {
    // isFindSimilarModeActive is a global in main.js
    isFindSimilarModeActive = !isFindSimilarModeActive;
    const button = document.getElementById('sora-find-similar-button');
    if (button) {
        if (isFindSimilarModeActive) {
            button.classList.add('active');
            button.title = 'Deactivate find similar mode (Click an image to find similar)';
            log("Find Similar mode ACTIVATED.");
            document.body.style.cursor = 'crosshair';
        } else {
            button.classList.remove('active');
            button.title = 'Activate find similar image mode';
            log("Find Similar mode DEACTIVATED.");
            document.body.style.cursor = 'default';
        }
    }
}

function handleDocumentClickForSimilar(event) {
    // isFindSimilarModeActive is a global in main.js
    if (!isFindSimilarModeActive) return;
    const link = event.target.closest('a');
    if (!link || !link.href) return;

    const soraGenRegex = /^https?:\/\/(?:www\.)?sora(?:\.\w+)*\.com\/g\/(gen_[a-zA-Z0-9]+)/;
    const match = link.href.match(soraGenRegex);

    if (match && match[1]) {
        const genId = match[1];
        const exploreUrl = `${window.location.origin}/explore?query=${genId}`;
        log(`Find Similar Mode: Match found (${genId}). Opening: ${exploreUrl}`);
        event.preventDefault();
        event.stopPropagation();
        window.open(exploreUrl, '_blank');
    }
} 