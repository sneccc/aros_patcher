/**
 * Aros Patcher - Wildcards Module
 * Contains wildcard definitions and utility functions for random generation
 */

// Initialize the global Aros namespace if it doesn't exist
console.log('[wildcards.js] Script start (top level).');
window.Aros = window.Aros || {};
console.log('[wildcards.js] Aros namespace ensured (top level). Current Aros keys:', window.Aros ? Object.keys(window.Aros).join(', ') : 'Aros undefined');

// Create the Wildcards module within the Aros namespace
console.log('[wildcards.js] Attempting to define Aros.Wildcards...');
Aros.Wildcards = (function() {
    'use strict';
    console.log('[wildcards.js] IIFE for Aros.Wildcards executing.');
    
    // Wildcards for Aros Patcher
    const wildcards = {
        "color": {
            "name": "Colors",
            "description": "A collection of color names",
            "values": [
                "red", "blue", "green", "yellow", "purple", "orange", "pink", "brown", "black", "white",
                "gold", "silver", "bronze", "crimson", "navy", "emerald", "amber", "violet", "coral", "gray",
                "azure", "scarlet", "olive", "indigo", "maroon", "teal", "lime", "magenta", "cyan", "beige"
            ]
        },
        "material": {
            "name": "Materials",
            "description": "A collection of material types",
            "values": [
                "wood", "metal", "glass", "plastic", "stone", "leather", "fabric", "ceramic", "crystal", "paper",
                "gold", "silver", "bronze", "copper", "steel", "marble", "granite", "silk", "cotton", "wool"
            ]
        },
        "emotion": {
            "name": "Emotions",
            "description": "A collection of emotional states",
            "values": [
                "happy", "sad", "angry", "excited", "peaceful", "anxious", "confident", "confused", "proud", "shy",
                "joyful", "melancholic", "furious", "ecstatic", "serene", "worried", "brave", "perplexed", "satisfied", "nervous"
            ]
        },
        "weather": {
            "name": "Weather Conditions",
            "description": "A collection of weather conditions",
            "values": [
                "sunny", "rainy", "cloudy", "stormy", "foggy", "windy", "snowy", "misty", "clear", "overcast",
                "scorching", "drizzling", "partly cloudy", "thunderous", "hazy", "breezy", "blizzard", "humid", "bright", "gloomy"
            ]
        },
        "time": {
            "name": "Time Periods",
            "description": "A collection of time periods and moments",
            "values": [
                "dawn", "morning", "noon", "afternoon", "dusk", "night", "midnight", "sunrise", "sunset", "twilight",
                "early morning", "late morning", "early afternoon", "late afternoon", "early evening", "late evening", "early night", "late night", "pre-dawn", "post-dusk"
            ]
        },
        "location": {
            "name": "Locations",
            "description": "A collection of location types",
            "values": [
                "forest", "beach", "mountain", "city", "desert", "ocean", "river", "lake", "cave", "garden",
                "jungle", "tundra", "valley", "island", "volcano", "canyon", "meadow", "swamp", "reef", "glacier"
            ]
        },
        "style": {
            "name": "Artistic Styles",
            "description": "A collection of artistic and visual styles",
            "values": [
                "realistic", "cartoon", "anime", "pixel art", "watercolor", "oil painting", "digital art", "sketch", "3D", "vector",
                "impressionist", "surreal", "abstract", "minimalist", "cyberpunk", "steampunk", "fantasy", "sci-fi", "gothic", "art nouveau"
            ]
        },
        "lighting": {
            "name": "Lighting Conditions",
            "description": "A collection of lighting conditions and effects",
            "values": [
                "natural", "artificial", "ambient", "dramatic", "soft", "harsh", "backlit", "rim light", "spotlight", "diffused",
                "sunlight", "moonlight", "starlight", "neon", "candlelight", "firelight", "daylight", "twilight", "overcast", "shadowy"
            ]
        },
        "camera": {
            "name": "Camera Angles and Shots",
            "description": "A collection of camera angles and shot types",
            "values": [
                "close-up", "wide shot", "medium shot", "bird's eye", "worm's eye", "dutch angle", "over the shoulder", "point of view", "establishing shot", "aerial",
                "extreme close-up", "long shot", "two-shot", "high angle", "low angle", "canted angle", "reverse angle", "first person", "master shot", "drone shot"
            ]
        },
        "animal": {
            "name": "Animals",
            "description": "A collection of animal species",
            "values": [
                "lion", "tiger", "elephant", "giraffe", "zebra", "penguin", "dolphin", "whale", "kangaroo", "koala",
                "panda", "gorilla", "chimpanzee", "rhinoceros", "hippopotamus", "cheetah", "leopard", "wolf", "fox", "bear"
            ]
        },
        "object": {
            "name": "Objects",
            "description": "A collection of common objects",
            "values": [
                "table", "chair", "lamp", "book", "computer", "phone", "key", "cup", "plate", "fork",
                "knife", "spoon", "bottle", "vase", "clock", "mirror", "picture frame", "candle", "plant", "sofa"
            ]
        }
    };

    const examples = [
        "A __animal__ in a __location__ during __weather__ conditions, __camera__ shot, __lighting__ lighting, __style__ style",
        "A __color__ __object__ made of __material__, __emotion__ mood, shot during __time__ with __lighting__ lighting",
        "A __animal__ playing with a __color__ __object__ in a __location__ at __time__, __camera__ perspective, __style__ rendering",
        "[Close-up, Wide shot, Aerial view] of a __animal__ in a __location__ during __weather__ weather, __style__ aesthetic",
        "A [happy, sad, excited, thoughtful] person holding a __color__ __object__ in a __location__ with __lighting__ lighting"
    ];

    function _log(message) {
        if (Aros.Core && Aros.Core.log) {
            Aros.Core.log(message); // Prefer Core logger
        } else {
            console.log(`[Aros Wildcards Internal] ${message}`); // Fallback
        }
    }

    function getRandomValue(array) {
        if (!array || array.length === 0) return "";
        return array[Math.floor(Math.random() * array.length)];
    }

    function processSingleWildcard(prompt) {
        const wildcardRegex = /__(\w+)__/g;
        let processedPrompt = prompt;
        let match;
        while ((match = wildcardRegex.exec(prompt)) !== null) {
            const wildcardName = match[1].toLowerCase(); // Ensure case-insensitivity for wildcard lookup
            if (wildcards[wildcardName] && wildcards[wildcardName].values) {
                const randomValue = getRandomValue(wildcards[wildcardName].values);
                processedPrompt = processedPrompt.replace(match[0], randomValue);
            }
        }
        return processedPrompt;
    }

    function processPromptTemplate(template) {
        const variableRegex = /\[(.*?)\]/g;
        let prompts = [template];
        let match;

        // Iteratively expand bracketed variations
        // This loop handles multiple sets of brackets correctly
        while(true) {
            let nextPrompts = [];
            let processedThisIteration = false;
            for (const currentPrompt of prompts) {
                match = variableRegex.exec(currentPrompt);
                if (match) {
                    processedThisIteration = true;
                    const options = match[1].split(',').map(opt => opt.trim());
                    options.forEach(option => {
                        nextPrompts.push(currentPrompt.replace(match[0], option));
                    });
                } else {
                    nextPrompts.push(currentPrompt); // No more variations in this prompt string
                }
            }
            prompts = nextPrompts;
            if (!processedThisIteration) break; // No more variations found in any prompt string
             variableRegex.lastIndex = 0; // Reset regex index for next iteration on modified prompts
        }
        
        // After all bracket variations are expanded, process wildcards in each resulting prompt
        return prompts.map(p => processSingleWildcard(p));
    }

    function generatePrompts(promptTemplate, count = 1) {
        _log(`Generating ${count} prompts from template: "${promptTemplate.substring(0, 70)}..."`);
        
        const allVariations = processPromptTemplate(promptTemplate);
        _log(`Generated ${allVariations.length} unique variations from template.`);

        if (allVariations.length === 0) {
            _log("Warning: Prompt template resulted in zero variations. Returning empty array.");
            return [];
        }
        
        let result = [];
        if (allVariations.length < count) {
            _log(`Fewer variations (${allVariations.length}) than requested (${count}). Repeating variations.`);
            for (let i = 0; i < count; i++) {
                result.push(allVariations[i % allVariations.length]);
            }
        } else if (allVariations.length > count) {
            _log(`More variations (${allVariations.length}) than requested (${count}). Selecting random subset.`);
            // Fisher-Yates shuffle to get a random subset
            let shuffled = [...allVariations];
            for (let i = shuffled.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
            }
            result = shuffled.slice(0, count);
        } else {
            result = allVariations; // Exactly the right number
        }
        _log(`Final generated prompt count: ${result.length}`);
        return result;
    }

    function getRandomExample() {
        return getRandomValue(examples);
    }
    
    function init() {
        _log("Wildcards Module Initialized");
    }
    
    console.log('[wildcards.js] IIFE for Aros.Wildcards executed, returning object.');
    return {
        wildcards, // Expose definitions if needed by UI for display
        examples,  // Expose examples for UI
        getRandomValue, // General utility, might be useful
        processSingleWildcard, // Renamed from processWildcards for clarity
        processPromptTemplate,
        generatePrompts,
        getRandomExample,
        init
    };
})();
console.log('[wildcards.js] Script end (top level). Aros.Wildcards type:', typeof Aros.Wildcards, '; Aros.Wildcards defined:', Aros.Wildcards ? 'Yes' : 'No');
if (window.Aros && Aros.Wildcards) {
    console.log('[wildcards.js] Aros.Wildcards defined. Keys:', Object.keys(Aros.Wildcards).join(', '));
} else {
    console.error('[wildcards.js] Aros.Wildcards is NOT defined after execution.');
}