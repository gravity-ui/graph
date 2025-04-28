/**
 * StylesManager
 *
 * A singleton class that manages styles for both regular DOM and Shadow DOM contexts.
 *
 * WHY THIS EXISTS:
 * When using the library with web components that utilize Shadow DOM, regular CSS imports
 * don't work because styles from the main document don't penetrate into the shadow DOM.
 * This manager ensures styles are properly injected regardless of context.
 *
 * USAGE:
 * Instead of importing CSS files directly:
 *   import "./styles.css";  // DON'T DO THIS
 *
 * Use the StylesManager:
 *   StylesManager.getInstance().injectLayerStyles(this.root);
 */
export class StylesManager {
  private static instance: StylesManager;
  private styleCache: Map<string, boolean> = new Map();
  private globalStylesInjected = false;

  private constructor() {}

  public static getInstance(): StylesManager {
    if (!StylesManager.instance) {
      StylesManager.instance = new StylesManager();
    }
    return StylesManager.instance;
  }

  // Embedded Layer.css styles
  private static readonly LAYER_CSS = `
  .layer {
    position: absolute;
    top: 0;
    left: 0;
    bottom: 0;
    right: 0;
    width: 100%;
    height: 100%;
  }

  .no-user-select {
    -webkit-touch-callout: none;
    -webkit-user-select: none;
    -moz-user-select: none;
    -ms-user-select: none;
    user-select: none;
  }

  .no-pointer-events {
    pointer-events: none;
  }

  .layer-with-camera {
    isolation: isolate;
    transform-origin: 0 0;
    transform-style: preserve-3d;
    will-change: transform;
  }
  `;

  /**
   * Injects styles into DOM or shadow root depending on context
   */
  public injectLayerStyles(root: Element | null): void {
    if (!root) return;

    const rootNode = root.getRootNode();

    // Check if we're in shadow DOM
    if (rootNode instanceof ShadowRoot) {
      this.injectStylesIntoShadowRoot(rootNode);
    } else {
      this.injectStylesIntoDocument();
    }
  }

  /**
   * Injects styles into shadow root
   */
  private injectStylesIntoShadowRoot(shadowRoot: ShadowRoot): void {
    // Use a unique identifier for Layer styles
    const styleId = "gravity-ui-graph-layer-styles";

    // Check if styles have already been added to this shadow root
    const cacheKey = shadowRoot.host.toString() + styleId;
    if (this.styleCache.has(cacheKey)) {
      return; // Styles already added
    }

    // Check if there's already a style element with this ID
    if (!shadowRoot.getElementById(styleId)) {
      // Try to use Constructable Stylesheets if supported
      if (window.CSSStyleSheet && "adoptedStyleSheets" in shadowRoot) {
        try {
          const styleSheet = new CSSStyleSheet();
          styleSheet.replaceSync(StylesManager.LAYER_CSS);
          shadowRoot.adoptedStyleSheets = [...shadowRoot.adoptedStyleSheets, styleSheet];
          this.styleCache.set(cacheKey, true);
          return;
        } catch (e) {
          console.warn("Failed to use Constructable Stylesheets, falling back to style element");
        }
      }

      // Fallback to style element
      const style = document.createElement("style");
      style.id = styleId;
      style.textContent = StylesManager.LAYER_CSS;
      shadowRoot.appendChild(style);

      // Remember that styles have been added to this shadow root
      this.styleCache.set(cacheKey, true);
    }
  }

  /**
   * Injects styles into main document
   */
  private injectStylesIntoDocument(): void {
    // Check if global styles have already been added
    if (this.globalStylesInjected) {
      return;
    }

    const styleId = "gravity-ui-graph-layer-styles";

    // Check if there's already a style element with this ID
    if (!document.getElementById(styleId)) {
      const style = document.createElement("style");
      style.id = styleId;
      style.textContent = StylesManager.LAYER_CSS;
      document.head.appendChild(style);

      this.globalStylesInjected = true;
    }
  }
}
