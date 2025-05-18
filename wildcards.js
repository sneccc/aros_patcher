// Wildcards for Aros Patcher
const arosWildcards = {
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

// Utility functions for processing wildcards
const wildcardUtils = {
    // Get a random value from an array
    getRandomValue: (array) => {
        return array[Math.floor(Math.random() * array.length)];
    },

    // Process wildcards in a string format __category__
    processWildcards: (prompt) => {
        const wildcardRegex = /__(\w+)__/g;
        let processedPrompt = prompt;
        let match;

        while ((match = wildcardRegex.exec(prompt)) !== null) {
            const wildcardName = match[1];
            if (arosWildcards[wildcardName] && arosWildcards[wildcardName].values) {
                const randomValue = wildcardUtils.getRandomValue(arosWildcards[wildcardName].values);
                processedPrompt = processedPrompt.replace(match[0], randomValue);
            }
        }

        return processedPrompt;
    },

    // Process template with variables and wildcards
    // Variables format: [option1, option2, option3]
    processPromptTemplate: (promptTemplate) => {
        const processedPrompts = [];
        const variableRegex = /\[(.*?)\]/g;
        const matches = [...promptTemplate.matchAll(variableRegex)];

        if (matches.length === 0) {
            // If no variables, just process wildcards
            processedPrompts.push(wildcardUtils.processWildcards(promptTemplate));
            return processedPrompts;
        }

        let currentPrompts = [promptTemplate];
        matches.forEach(match => {
            const variableOptions = match[1].split(',').map(option => option.trim());
            const newPrompts = [];

            currentPrompts.forEach(prompt => {
                variableOptions.forEach(option => {
                    const newPrompt = prompt.replace(match[0], option);
                    newPrompts.push(newPrompt);
                });
            });

            currentPrompts = newPrompts;
        });

        // Process wildcards after all variable substitutions
        return currentPrompts.map(prompt => wildcardUtils.processWildcards(prompt));
    },

    // Generate multiple prompts from a template with variables and wildcards
    generatePrompts: (promptTemplate, count = 1) => {
        // First, process the template to get all possible combinations
        const allVariations = wildcardUtils.processPromptTemplate(promptTemplate);
        
        // If there are fewer variations than requested count, repeat variations
        if (allVariations.length < count) {
            const result = [];
            for (let i = 0; i < count; i++) {
                result.push(allVariations[i % allVariations.length]);
            }
            return result;
        }
        
        // If there are more variations than requested, select random subset
        if (allVariations.length > count) {
            const shuffled = [...allVariations];
            for (let i = shuffled.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
            }
            return shuffled.slice(0, count);
        }
        
        // If exactly the right number, return all
        return allVariations;
    },

    // Example of how to use the wildcards with Aros
    arosExamples: [
        "A __animal__ in a __location__ during __weather__ conditions, __camera__ shot, __lighting__ lighting, __style__ style",
        "A __color__ __object__ made of __material__, __emotion__ mood, shot during __time__ with __lighting__ lighting",
        "A __animal__ playing with a __color__ __object__ in a __location__ at __time__, __camera__ perspective, __style__ rendering",
        "[Close-up, Wide shot, Aerial view] of a __animal__ in a __location__ during __weather__ weather, __style__ aesthetic",
        "A [happy, sad, excited, thoughtful] person holding a __color__ __object__ in a __location__ with __lighting__ lighting"
    ],
    
    // Get a random example template
    getRandomExample: () => {
        return wildcardUtils.getRandomValue(wildcardUtils.arosExamples);
    }
}; 