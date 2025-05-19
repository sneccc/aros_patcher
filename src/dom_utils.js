// src/dom_utils.js

function removeNativeCheckboxes() {
    const nativeCheckboxes = document.querySelectorAll(`input.sora-image-checkbox:not([${SCRIPT_CHECKBOX_MARKER}])`);
    nativeCheckboxes.forEach(checkbox => { try { checkbox.remove(); } catch (e) {} });
}

function removeNativeSelectionIndicators() {
    const indicators = document.querySelectorAll(NATIVE_INDICATOR_SELECTOR);
    indicators.forEach(indicator => {
        if (indicator.querySelector('div.bg-black\\/25 div.border-2')) {
            try { indicator.remove(); } catch (e) { log(`Error removing native indicator: ${e.message}`); }
        }
    });
}

function setReactTextareaValue(element, value) {
    log(`Attempting to set React textarea value to: "${value.substring(0, 70).replace(/\n/g, '\\n')}..."`);
    const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
    const prototype = Object.getPrototypeOf(element);
    const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

    if (valueSetter && valueSetter !== prototypeValueSetter) {
        prototypeValueSetter?.call(element, value);
    } else {
        valueSetter?.call(element, value);
    }

    element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    element.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));

    const key = Object.keys(element).find(k => k.startsWith("__reactProps$"));
    if (key && element[key]?.onChange) {
        try {
            element[key].onChange({ target: element });
        } catch (e) {
            log("ERROR triggering React onChange on element:"); console.error(e);
        }
    }
    log(`Textarea value after attempting to set: "${element.value.substring(0, 70).replace(/\n/g, '\\n')}..."`);
} 