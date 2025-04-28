# @gravity-ui/graph Web Component Example

This example demonstrates how to use the `@gravity-ui/graph` library in a pure JavaScript environment with Web Components, without React or NodeJS, focusing on ESM compatibility.

## Overview

This example creates a custom web component (`<graph-editor>`) that wraps the `@gravity-ui/graph` library, allowing you to use it in any web application without requiring React or a complex build process.

## Features

- Uses ES Modules (ESM) for modern browser compatibility
- Implements a custom web component that encapsulates the graph functionality
- Provides a simple API for interacting with the graph
- Works without React or NodeJS dependencies
- Can be used in any web application or framework

## Project Structure

- `index.html` - Example usage of the web component
- `graph-editor.js` - The web component implementation
- `package.json` - Project configuration with ESM support
- `rollup.config.js` - Bundling configuration for browser compatibility

## Getting Started

### Installation

1. Clone this repository
2. Install dependencies:

```bash
npm install
```

This will install the following dependencies:
- `@gravity-ui/graph`: The graph visualization library
- `@rollup/plugin-commonjs`: Plugin for Rollup to convert CommonJS modules to ES6
- `@rollup/plugin-json`: Plugin for Rollup to import JSON files
- `@rollup/plugin-node-resolve`: Plugin for Rollup to resolve node modules
- `@rollup/plugin-terser`: Plugin for Rollup to minify the output
- `rollup`: The module bundler
- `rollup-plugin-postcss`: Plugin for Rollup to handle CSS files
- `serve`: A static file server for development

3. Build the project:

```bash
npm run build
```

This will bundle the web component and all its dependencies into a single file: `dist/graph-editor.js`

4. Start the development server:

```bash
npm start
```

5. Open your browser to the URL shown in the terminal (typically http://localhost:5000)

### Troubleshooting

If you encounter any issues:

- Make sure all dependencies are installed correctly
- Check that the build process completed successfully
- Look for any error messages in the browser console
- Try clearing your browser cache

### Usage in Your Project

To use this web component in your own project:

1. Copy the built `dist/graph-editor.js` file to your project
2. Import it in your HTML:

```html
<script type="module" src="path/to/graph-editor.js"></script>
```

3. Use the web component in your HTML:

```html
<graph-editor></graph-editor>
```

4. Interact with the component using JavaScript:

```javascript
// Get a reference to the component
const graphEditor = document.querySelector('graph-editor');

// Add a new block
graphEditor.addRandomBlock();

// Center the view
graphEditor.centerView();

// Toggle bezier connections
graphEditor.toggleBezierConnections();

// Listen for events
graphEditor.addEventListener('selection-change', (event) => {
  console.log('Selection changed:', event.detail);
});
```

## API Reference

### Methods

- `addRandomBlock()` - Adds a random block to the graph
- `centerView()` - Centers the view on all blocks
- `toggleBezierConnections()` - Toggles between bezier and straight connections
- `getGraph()` - Returns the underlying Graph instance for advanced usage

### Events

- `selection-change` - Fired when block selection changes
- `connection-created` - Fired when a new connection is created

## How It Works

The web component uses Shadow DOM to encapsulate the graph's DOM elements and provides a simple API for interacting with the graph. It wraps the `@gravity-ui/graph` library and exposes only the necessary functionality.

The component is built using ES Modules, which allows it to be used in modern browsers without requiring a bundler or transpiler. However, for maximum compatibility, we provide a bundled version using Rollup.

## Browser Compatibility

This example works in all modern browsers that support:

- Web Components (Custom Elements v1)
- Shadow DOM v1
- ES Modules

This includes:
- Chrome 67+
- Firefox 63+
- Safari 12.1+
- Edge 79+

## Advanced Usage

For more advanced usage, you can access the underlying Graph instance:

```javascript
const graphEditor = document.querySelector('graph-editor');
const graph = graphEditor.getGraph();

// Now you can use all the Graph API methods
graph.api.addBlock({
  id: 'custom-block',
  is: 'block-action',
  x: 100,
  y: 100,
  width: 150,
  height: 80,
  name: 'Custom Block',
  selected: false
});
```

## License

MIT
