# 🧠 Aros Patcher

A userscript for enhancing Aros video generation with prompt queueing and image management.

## Installation

1. Install a userscript manager extension in your browser:
   - [Tampermonkey](https://www.tampermonkey.net/) (recommended)
   - Greasemonkey
   - Violentmonkey

2. Click [here](#) to install the Aros Patcher script

3. Visit Sora's website and the script should automatically activate

## Module Loading

Aros Patcher uses a modular architecture where all components share a global `Aros` namespace:

```javascript
window.Aros = window.Aros || {};
```

Each module attaches itself to this namespace:
- `Aros.Core` - Core functionality
- `Aros.UI` - User interface
- `Aros.Prompt` - Prompt handling
- `Aros.Image` - Image management
- `Aros.Wildcards` - Wildcard system

## Troubleshooting

If you experience issues with the script not loading or functioning properly:

1. **Check browser console** (F12 or Ctrl+Shift+J) for error messages
2. Look for messages like `Module not loaded: Core` which indicate module loading failures
3. Ensure your userscript manager is configured to allow external scripts and resources
4. If you see CORS errors, check if your browser is blocking cross-origin requests

### Common Issues and Solutions

- **Modules not loading**: Make sure you have access to GitHub where the modules are hosted
- **UI not appearing**: The script might be having trouble finding the correct elements on the page
- **Features not working**: Check if all modules are successfully loaded in the console logs

## Features

- Prompt queueing with manual or auto submission
- Loop mode for continuous prompt generation
- Wildcard support for random elements in prompts
- Image downloading and batch selection
- "Find Similar" image feature

## Development

If you want to modify the script or contribute to its development:

1. Each module is a separate file in the `modules/` directory
2. All modules share the same `Aros` namespace
3. Modules should check for dependencies before using them:
   ```javascript
   if (Aros.Core && Aros.Core.log) {
       Aros.Core.log("My message");
   }
   ```

## Support

If you encounter any issues:

1. Check the browser console for error messages
2. Clear your browser cache and reload the page
3. Try using a different browser or userscript manager
4. Report issues with detailed information about what went wrong
