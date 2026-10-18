/* eslint-disable no-console */
import { Layer, LayerContext } from "@gravity-ui/graph";
import merge from "lodash/merge";
import StyleObserver from "style-observer";

import { DEFAULT_CSS_VARIABLES_LAYER_PROPS, SUPPORTED_CSS_VARIABLES } from "./constants";
import { filterSupportedCSSChanges, mapCSSChangesToGraphColors, mapCSSChangesToGraphConstants } from "./mapping";
import type { CSSVariableChange, CSSVariablesLayerProps, CSSVariablesLayerState } from "./types";

interface CSSVariablesObserver {
  unobserve(target: Element): void;
}

// style-observer reports changes through transitions, and an unregistered custom property does not
// transition from its initial (guaranteed-invalid) value. So the container observes proxies that
// always have a value: `--proxy: var(--graph-*, <unset marker>)`. Proxies are local inline styles,
// so nothing is registered globally and fallbacks such as `var(--graph-*, red)` keep working.
const PROXY_PREFIX = "--css-variables-layer-observed-";
const UNSET_VALUE = "--css-variables-layer-unset";

function toProxyName(cssVariable: string): string {
  return PROXY_PREFIX + cssVariable.slice(2);
}

function fromProxyName(proxy: string): string {
  return proxy.startsWith(PROXY_PREFIX) ? "--" + proxy.slice(PROXY_PREFIX.length) : proxy;
}

function fromProxyValue(value: string): string {
  return value.trim() === UNSET_VALUE ? "" : value;
}

/**
 * CSSVariablesLayer: Synchronizes CSS variables with graph colors and constants
 *
 * Creates an empty HTML div with specified CSS class and monitors CSS variable changes
 * using style-observer package. Automatically maps CSS variables to TGraphColorsPatch and
 * TGraphConstantsPatch and applies changes via graph.setColors() and graph.setConstants().
 */
export class CSSVariablesLayer extends Layer<CSSVariablesLayerProps, LayerContext, CSSVariablesLayerState> {
  public state: CSSVariablesLayerState = {
    isObserving: false,
    colors: {},
    constants: {},
  };

  private containerElement: HTMLDivElement | null = null;
  private styleObserver: CSSVariablesObserver | null = null;
  // Kept outside state: setState() is applied on the next render, so a stop followed by a start in
  // the same call would still see the old value.
  private observing = false;
  // Last value passed on per variable. Unset records are skipped, so the observer's own oldValue may
  // be the unset marker while the graph still holds this value.
  private appliedValues = new Map<string, string>();

  constructor(props: CSSVariablesLayerProps) {
    const finalProps = { ...DEFAULT_CSS_VARIABLES_LAYER_PROPS, ...props };
    super(finalProps);
  }

  protected propsChanged(nextProps: CSSVariablesLayerProps): void {
    super.propsChanged(nextProps);

    // If containerClass changed, we need to recreate the container and restart observing.
    // this.props still holds the previous props here: they are assigned after propsChanged().
    // Before afterInit() there is no container yet; afterInit() then uses the updated class.
    if (this.containerElement && this.props.containerClass !== nextProps.containerClass) {
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
      this.createContainerElement(nextProps.containerClass);
      this.readInitialCSSVariables();
      this.startObserving();
    }
  }

  protected afterInit(): void {
    this.createContainerElement();
    this.readInitialCSSVariables();
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
  private createContainerElement(containerClass: string = this.props.containerClass): void {
    if (!this.getHTML()) {
      if (this.props.debug) {
        console.warn("CSSVariablesLayer: HTML element not available");
      }
      return;
    }

    this.containerElement = document.createElement("div");
    this.containerElement.className = containerClass;

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

    for (const cssVariable of SUPPORTED_CSS_VARIABLES) {
      this.containerElement.style.setProperty(toProxyName(cssVariable), `var(${cssVariable}, ${UNSET_VALUE})`);
    }

    this.getHTML()?.appendChild(this.containerElement);

    if (this.props.debug) {
      console.log("CSSVariablesLayer: Container element created with class", containerClass);
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

  protected createStyleObserver(): CSSVariablesObserver {
    if (!this.containerElement) throw new Error("Cannot observe CSS variables before creating the container");
    return new StyleObserver(
      (records) => {
        // Convert proxy records back to the observed variables. A variable that becomes unset is
        // skipped: the graph keeps the value applied last.
        const changes: CSSVariableChange[] = records
          .map((record) => {
            const name = fromProxyName(record.property);
            return {
              name,
              value: fromProxyValue(record.value),
              oldValue: this.appliedValues.get(name) ?? fromProxyValue(record.oldValue),
            };
          })
          .filter((change) => change.value !== "");

        if (changes.length === 0) {
          return;
        }

        if (this.props.debug) {
          console.log("CSSVariablesLayer: CSS variable changes detected:", changes);
        }

        this.handleCSSVariableChanges(changes);
      },
      {
        targets: [this.containerElement],
        properties: Array.from(SUPPORTED_CSS_VARIABLES, toProxyName),
      }
    );
  }

  /**
   * Reads initial CSS variable values and applies them to the graph
   * This ensures that CSS variables set before the observer starts are applied
   */
  private readInitialCSSVariables(): void {
    if (!this.containerElement) {
      if (this.props.debug) {
        console.warn("CSSVariablesLayer: Cannot read initial CSS variables - container element not available");
      }
      return;
    }

    try {
      const computedStyle = window.getComputedStyle(this.containerElement);
      const changes: CSSVariableChange[] = [];

      // Read all supported CSS variables
      for (const cssVariable of SUPPORTED_CSS_VARIABLES) {
        const value = computedStyle.getPropertyValue(cssVariable).trim();

        // Only include variables that have non-empty values
        if (value) {
          changes.push({
            name: cssVariable,
            value,
            oldValue: "",
          });
        }
      }

      if (this.props.debug) {
        console.log("CSSVariablesLayer: Initial CSS variables read:", changes);
      }

      // Apply initial values to graph
      if (changes.length > 0) {
        this.handleCSSVariableChanges(changes);
      }
    } catch (error) {
      console.error("CSSVariablesLayer: Failed to read initial CSS variables:", error);
    }
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

    if (this.observing) {
      return;
    }

    try {
      // Convert Set to Array for style-observer
      const variablesToObserve = Array.from(SUPPORTED_CSS_VARIABLES);

      this.styleObserver = this.createStyleObserver();
      this.observing = true;

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
    if (this.styleObserver && this.containerElement) {
      this.styleObserver.unobserve(this.containerElement);
    }

    this.styleObserver = null;
    this.observing = false;

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

    for (const change of supportedChanges) {
      this.appliedValues.set(change.name, change.value);
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

      this.context.graph.setColors(colors);
      if (this.props.debug) {
        console.log("CSSVariablesLayer: Applied color changes:", colorChanges);
      }

      this.context.graph.setConstants(constants);
      if (this.props.debug) {
        console.log("CSSVariablesLayer: Applied constant changes:", constantChanges);
      }
    } catch (error) {
      console.error("CSSVariablesLayer: Failed to apply changes to graph:", error);
    }
  }
}
