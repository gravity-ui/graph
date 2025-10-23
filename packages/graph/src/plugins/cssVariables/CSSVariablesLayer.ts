import merge from "lodash/merge";
import StyleObserver from "style-observer";

import { Layer, LayerContext } from "../../services/Layer";

import { DEFAULT_CSS_VARIABLES_LAYER_PROPS, SUPPORTED_CSS_VARIABLES } from "./constants";
import { filterSupportedCSSChanges, mapCSSChangesToGraphColors, mapCSSChangesToGraphConstants } from "./mapping";
import type { CSSVariableChange, CSSVariablesLayerProps, CSSVariablesLayerState } from "./types";

/**
 * CSSVariablesLayer: Synchronizes CSS variables with graph colors and constants
 *
 * Creates an empty HTML div with specified CSS class and monitors CSS variable changes
 * using style-observer package. Automatically maps CSS variables to TGraphColors and
 * TGraphConstants and applies changes via graph.setColors() and graph.setConstants().
 */
/* eslint-disable no-console */
export class CSSVariablesLayer extends Layer<CSSVariablesLayerProps, LayerContext, CSSVariablesLayerState> {
  public state: CSSVariablesLayerState = {
    isObserving: false,
    colors: {},
    constants: {},
  };

  private containerElement: HTMLDivElement | null = null;
  private styleObserver: StyleObserver | null = null;

  constructor(props: CSSVariablesLayerProps) {
    const finalProps = { ...DEFAULT_CSS_VARIABLES_LAYER_PROPS, ...props };
    super(finalProps);
  }

  protected propsChanged(nextProps: CSSVariablesLayerProps): void {
    super.propsChanged(nextProps);

    // If containerClass changed, we need to recreate the container and restart observing
    if (this.props.containerClass !== nextProps.containerClass) {
      if (this.props.debug) {
        console.log(
          "CSSVariablesLayer: Container class changed from",
          this.props.containerClass,
          "to",
          nextProps.containerClass
        );
      }

      this.stopObserving();
      this.removeContainerElement();
      this.createContainerElement();
      this.startObserving();
    }
  }

  protected afterInit(): void {
    this.createContainerElement();
    this.startObserving();
    super.afterInit();
  }

  protected unmount(): void {
    this.stopObserving();
    this.removeContainerElement();
    super.unmount();
  }

  /**
   * Creates the container HTML element with specified CSS class
   */
  private createContainerElement(): void {
    if (!this.getHTML()) {
      if (this.props.debug) {
        console.warn("CSSVariablesLayer: HTML element not available");
      }
      return;
    }

    this.containerElement = document.createElement("div");
    this.containerElement.className = this.props.containerClass;

    // Make the container invisible and non-interactive
    this.containerElement.style.cssText = `
      position: absolute;
      top: -1px;
      left: -1px;
      width: 1px;
      height: 1px;
      opacity: 0;
      pointer-events: none;
      visibility: hidden;
    `;

    this.getHTML()?.appendChild(this.containerElement);

    if (this.props.debug) {
      console.log("CSSVariablesLayer: Container element created with class", this.props.containerClass);
      console.log("CSSVariablesLayer: Container element:", this.containerElement);
      console.log("CSSVariablesLayer: Container in DOM:", document.contains(this.containerElement));
    }
  }

  /**
   * Removes the container element from DOM
   */
  private removeContainerElement(): void {
    if (this.containerElement && this.containerElement.parentNode) {
      this.containerElement.parentNode.removeChild(this.containerElement);
    }
    this.containerElement = null;
  }

  protected createStyleObserver(): StyleObserver {
    return new StyleObserver(
      (records) => {
        // Convert StyleObserver records to our CSSVariableChange format
        const changes: CSSVariableChange[] = records.map((record) => ({
          name: record.property,
          value: record.value,
          oldValue: record.oldValue,
        }));

        if (this.props.debug) {
          console.log("CSSVariablesLayer: CSS variable changes detected:", changes);
        }

        this.handleCSSVariableChanges(changes);
      },
      {
        targets: [this.containerElement],
        properties: Array.from(SUPPORTED_CSS_VARIABLES),
      }
    );
  }

  /**
   * Starts observing CSS variable changes using style-observer
   */
  private startObserving(): void {
    if (!this.containerElement) {
      if (this.props.debug) {
        console.warn("CSSVariablesLayer: Cannot start observing - container element not available");
      }
      return;
    }

    if (this.state.isObserving) {
      return;
    }

    try {
      // Convert Set to Array for style-observer
      const variablesToObserve = Array.from(SUPPORTED_CSS_VARIABLES);

      this.styleObserver = this.createStyleObserver();

      this.setState({ isObserving: true });

      if (this.props.debug) {
        console.log("CSSVariablesLayer: Started observing", variablesToObserve.length, "CSS variables");
        console.log("CSSVariablesLayer: Observing element:", this.containerElement);
        console.log("CSSVariablesLayer: Variables to observe:", variablesToObserve);
      }
    } catch (error) {
      console.error("CSSVariablesLayer: Failed to start observing CSS variables:", error);
    }
  }

  /**
   * Stops observing CSS variable changes
   */
  private stopObserving(): void {
    if (this.styleObserver) {
      this.styleObserver.unobserve(this.containerElement);
      this.styleObserver = null;
    }

    this.setState({ isObserving: false });

    if (this.props.debug) {
      console.log("CSSVariablesLayer: Stopped observing CSS variables");
    }
  }

  /**
   * Handles CSS variable changes from style-observer
   */
  private handleCSSVariableChanges(changes: CSSVariableChange[]): void {
    // Filter to only supported variables
    const supportedChanges = filterSupportedCSSChanges(changes);

    if (supportedChanges.length === 0) {
      return;
    }

    if (this.props.debug) {
      console.log("CSSVariablesLayer: CSS variable changes detected:", supportedChanges);
    }

    // Apply changes to graph
    this.applyChangesToGraph(supportedChanges);

    // Call user callback if provided
    if (this.props.onChange) {
      this.props.onChange(supportedChanges);
    }
  }

  /**
   * Applies CSS variable changes to graph colors and constants
   */
  private applyChangesToGraph(changes: CSSVariableChange[]): void {
    try {
      // Map changes to graph colors
      const colorChanges = mapCSSChangesToGraphColors(changes);
      const constantChanges = mapCSSChangesToGraphConstants(changes);

      if (Object.keys(colorChanges).length === 0 && Object.keys(constantChanges).length === 0) {
        return;
      }

      const colors = merge({}, this.state.colors, colorChanges);
      const constants = merge({}, this.state.constants, constantChanges);

      this.setState({ colors, constants });

      this.props.graph.setColors(colors);
      if (this.props.debug) {
        console.log("CSSVariablesLayer: Applied color changes:", colorChanges);
      }

      this.props.graph.setConstants(constants);
      if (this.props.debug) {
        console.log("CSSVariablesLayer: Applied constant changes:", constantChanges);
      }
    } catch (error) {
      console.error("CSSVariablesLayer: Failed to apply changes to graph:", error);
    }
  }
}
