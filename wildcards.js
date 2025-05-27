const wildcardUtils = {
    categories: {
        color: ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'black', 'white', 'pink', 'brown', 'gray', 'gold', 'silver', 'rainbow'],
        animal: ['dog', 'cat', 'bird', 'fish', 'lion', 'tiger', 'bear', 'elephant', 'monkey', 'gorilla', 'zebra', 'giraffe', 'wolf', 'fox', 'deer', 'rabbit', 'squirrel', 'dragon', 'unicorn', 'phoenix', 'panda', 'koala', 'kangaroo', 'penguin', 'owl', 'eagle', 'shark', 'dolphin', 'whale', 'octopus', 'crab', 'butterfly', 'scorpion', 'snake', 'lizard', 'frog', 'crocodile', 'hippopotamus', 'rhinoceros', 'bat'],
        object: ['ball', 'cube', 'sphere', 'pyramid', 'car', 'house', 'tree', 'flower', 'book', 'computer', 'phone', 'chair', 'table', 'lamp', 'sword', 'shield', 'rocket', 'planet', 'orb', 'ring', 'amulet', 'staff', 'wand', 'potion', 'scroll', 'crystal ball', 'telescope', 'microscope', 'robot', 'drone', 'spaceship', 'portal', 'key', 'chest', 'crown', 'throne', 'artifact', 'relic'],
        material: ['wooden', 'metallic', 'glass', 'fabric', 'stone', 'plastic', 'glowing', 'crystal', 'velvet', 'silk', 'rusty', 'polished', 'matte', 'transparent', 'liquid'],
        emotion: ['happy', 'sad', 'angry', 'surprised', 'joyful', 'melancholic', 'fierce', 'calm', 'serene', 'anxious', 'excited', 'dreamy', 'nostalgic'],
        weather: ['sunny', 'rainy', 'cloudy', 'stormy', 'snowy', 'foggy', 'windy', 'twilight', 'dawn', 'dusk', 'starry night', 'aurora borealis'],
        time: ['ancient', 'futuristic', 'medieval', 'victorian era', 'stone age', 'digital age', 'morning', 'afternoon', 'evening', 'midnight', 'spring', 'summer', 'autumn', 'winter'],
        location: ['forest', 'mountain', 'beach', 'city', 'desert', 'space', 'underwater', 'castle', 'village', 'cyberpunk city', 'fantasy kingdom', 'haunted house', 'secret garden', 'volcano', 'arctic tundra', 'jungle', 'swamp', 'cave', 'canyon', 'valley', 'island', 'ruins', 'library', 'laboratory', 'observatory', 'spaceship', 'alien planet', 'waterfall', 'meadow', 'glacier', 'underground city', 'floating island', 'crystal cave', 'ancient temple'],
        style: ['photorealistic', 'impressionistic', 'surreal', 'abstract', 'minimalist', 'cartoonish', 'van gogh style', 'cubist', 'steampunk', 'gothic', 'art deco', 'pixel art', 'anime style', 'comic book style', 'watercolor'],
        lighting: ['dramatic lighting', 'soft lighting', 'backlighting', 'rim lighting', 'volumetric lighting', 'studio lighting', 'cinematic lighting', 'natural lighting', 'neon lighting', 'candlelight', 'moonlight', 'golden hour'],
        camera: ['close-up shot', 'wide shot', 'aerial view', 'fisheye lens', 'macro shot', 'long shot', 'Dutch angle', 'bokeh', 'time-lapse', 'slow motion', 'found footage style', 'drone shot']
    },

    exampleTemplates: [
        "A __animal__ in a __location__ during __time__",
        "A [photorealistic, cartoonish] __object__ made of __material__",
        "__weather__ in a __location__ with __lighting__, __style__",
        "The __emotion__ __animal__ finds a __object__.",
        "A [futuristic, ancient] __location__ with a giant __animal__, __camera__ view.",
        "__style__ painting of a __color__ __object__ under __lighting__.",
        "A __animal__ wearing a [hat, scarf, glasses] in a __location__.",
        "__time__ scene with a __weather__ effect and a __color__ __object__.",
        "Multiple [red, blue, green] __animal__s in a __style__ __location__.",
        "A __material__ __object__ showing a __emotion__, __camera__ shot with __lighting__.",
        "Generate a [delicate, ornate, minimalist, sculptural] __color__ __object__ made of shiny porcelain, with [floral, geometric, abstract, figurative] intricate details, __lighting__ enhancing the reflective surface, displayed in a __location__, photographed with __camera__ technique, __style__ aesthetic."
    ],

    getRandomElement: function(arr) {
        if (!arr || arr.length === 0) return '';
        return arr[Math.floor(Math.random() * arr.length)];
    },

    getRandomExample: function() {
        return this.getRandomElement(this.exampleTemplates);
    },

    // Function to parse and expand variations like [option1, option2, option3]
    _expandVariations: function(template) {
        const variationRegex = /\[([^\]]+)\]/g; // Fixed: removed escape characters
        let prompts = [template];
        let match;

        while ((match = variationRegex.exec(template)) !== null) {
            const fullVariation = match[0]; // e.g., [red, blue]
            const optionsString = match[1]; // e.g., red, blue
            const options = optionsString.split(',').map(opt => opt.trim());

            if (options.length > 0) {
                let newPrompts = [];
                for (const p of prompts) {
                    if (p.includes(fullVariation)) { // Only expand if this specific variation is still in the prompt
                        for (const option of options) {
                            newPrompts.push(p.replace(fullVariation, option));
                        }
                    } else {
                        newPrompts.push(p); // If variation was already replaced (e.g. nested or multiple passes)
                    }
                }
                prompts = newPrompts;
            }
        }
        return prompts;
    },

    generatePrompts: function(template, count) {
        if (!template || typeof template !== 'string') {
            console.error("Invalid template provided to generatePrompts.");
            return [];
        }
        if (typeof count !== 'number' || count < 1) {
            console.error("Invalid count provided to generatePrompts.");
            return [];
        }

        const generatedPrompts = new Set();
        let attempts = 0;
        const maxAttempts = count * 10; // Try to avoid infinite loops for very restrictive templates

        while (generatedPrompts.size < count && attempts < maxAttempts) {
            attempts++;

            // First, expand all bracketed variations. This can result in multiple base prompts.
            let basePromptsFromVariations = this._expandVariations(template);

            for (let basePrompt of basePromptsFromVariations) {
                if (generatedPrompts.size >= count) break;

                let currentPrompt = basePrompt;
                const wildcardRegex = /__([a-zA-Z0-9_]+)__/g; // Matches __wildcard__
                
                // Fixed: Use String.replace with callback to handle all wildcards at once
                currentPrompt = currentPrompt.replace(wildcardRegex, (match, categoryName) => {
                    categoryName = categoryName.toLowerCase();
                    if (this.categories[categoryName] && this.categories[categoryName].length > 0) {
                        return this.getRandomElement(this.categories[categoryName]);
                    }
                    // If category not found or empty, return the wildcard itself
                    console.warn(`Wildcard category "${categoryName}" not found or empty. Keeping placeholder.`);
                    return match;
                });
                
                generatedPrompts.add(currentPrompt.trim());
            }
        }

        if (attempts >= maxAttempts && generatedPrompts.size < count) {
            console.warn(`Could only generate ${generatedPrompts.size} unique prompts out of ${count} requested after ${maxAttempts} attempts. The template might be too restrictive or lead to many duplicates.`);
        }

        return Array.from(generatedPrompts).slice(0, count);
    }
};

// Self-test (optional, can be removed)
/*
if (typeof window !== 'undefined') { // Basic check if running in a browser-like environment for testing
    console.log("Wildcard Utilities Loaded");
    const exampleTemplate = "A [big, small] __animal__ [eating, sleeping] in a __location__ with __color__ fur.";
    const exampleTemplate2 = "A __color__ __object__ and a __material__ __animal__.";
    const exampleTemplate3 = "[Red,Blue,Green] __style__ __animal__";


    console.log("Example 1 (Variations & Wildcards):");
    let prompts1 = wildcardUtils.generatePrompts(exampleTemplate, 5);
    prompts1.forEach(p => console.log(p));

    console.log("\\nExample 2 (Simple Wildcards):");
    let prompts2 = wildcardUtils.generatePrompts(exampleTemplate2, 3);
    prompts2.forEach(p => console.log(p));

    console.log("\\nExample 3 (Variations Only):");
    let prompts3 = wildcardUtils.generatePrompts(exampleTemplate3, 3); // Will generate Red, Blue, Green ones
    prompts3.forEach(p => console.log(p));

    console.log("\\nRandom Example Template:");
    console.log(wildcardUtils.getRandomExample());
}
*/ 