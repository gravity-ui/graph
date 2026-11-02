/* eslint-disable no-console */
import cloneDeep from "lodash/cloneDeep";
import get from "lodash/get";
import isEqual from "lodash/isEqual";
import merge from "lodash/merge";
import set from "lodash/set";
import StyleObserver from "style-observer";

import type { TGraphColors, TGraphConstants } from "../../graphConfig";
import { Layer, LayerContext } from "../../services/Layer";
import type { RecursivePartial } from "../../utils/types/helpers";

import { CSS_VARIABLE_MAPPINGS, DEFAULT_CSS_VARIABLES_LAYER_PROPS, SUPPORTED_CSS_VARIABLES } from "./constants";
import { mapCSSChangesToGraphColors, mapCSSChangesToGraphConstants } from "./mapping";
import { CSSVariableType } from "./types";
import type { CSSVariableChange, CSSVariablesLayerProps, CSSVariablesLayerState } from "./types";

/**
 * CSSVariablesLayer: Synchronizes CSS variables with graph colors and constants
 *
 * Creates an empty HTML div with specified CSS class and monitors CSS variable changes
 * using style-observer package. Automatically maps CSS variables to TGraphColors and
 * TGraphConstants and applies changes via graph.setColors() and graph.setConstants().
 */
export class CSSVariablesLayer extends Layer<CSSVariablesLayerProps, LayerContext, CSSVariablesLayerState> {
  public state: CSSVariablesLayerState = {
    isObserving: false,
    colors: {},
    constants: {},
  };

  private containerElement: HTMLDivElement | null = null;
  private styleObserver: StyleObserver | null = null;
  private observerNeedsRestart = false;
  /** Last known value of each observed variable, used to detect variables that disappear */
  private observedValues = new Map<string, string>();
  /** Graph colors and constants before this layer applied CSS values, restored for removed variables */
  private graphDefaults: { colors: TGraphColors; constants: TGraphConstants } | null = null;

  constructor(props: CSSVariablesLayerProps) {
    const finalProps = { ...DEFAULT_CSS_VARIABLES_LAYER_PROPS, ...props };
    super(finalProps);
  }

  protected propsChanged(nextProps: CSSVariablesLayerProps): void {
    super.propsChanged(nextProps);

    this.observerNeedsRestart =
      this.props.containerClass !== nextProps.containerClass ||
      !isEqual(this.props.additionalCSSVariables ?? [], nextProps.additionalCSSVariables ?? []);
  }

  protected willRender(): void {
    super.willRender();

    // Restart after the new props have been committed by Component.checkData().
    if (this.observerNeedsRestart && this.containerElement) {
      this.stopObserving();
      this.removeContainerElement();
      this.createContainerElement();
      this.readInitialCSSVariables();
      this.startObserving();
    }
    this.observerNeedsRestart = false;
  }

  private getObservedCSSVariables(): Set<string> {
    return new Set([...SUPPORTED_CSS_VARIABLES, ...(this.props.additionalCSSVariables ?? [])]);
  }

  protected afterInit(): void {
    if (!this.graphDefaults) {
      this.graphDefaults = {
        colors: cloneDeep(this.props.graph.graphColors),
        constants: cloneDeep(this.props.graph.graphConstants),
      };
    }
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
        properties: Array.from(this.getObservedCSSVariables()),
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
      const previousValues = this.observedValues;
      this.observedValues = new Map();

      // Read all observed CSS variables and report the ones that differ from the last known values,
      // including variables a new container class no longer defines (reported with an empty value)
      for (const cssVariable of this.getObservedCSSVariables()) {
        const value = computedStyle.getPropertyValue(cssVariable).trim();
        const oldValue = previousValues.get(cssVariable) ?? "";

        this.observedValues.set(cssVariable, value);
        if (value !== oldValue) {
          changes.push({
            name: cssVariable,
            value,
            oldValue,
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

    if (this.getState().isObserving) {
      return;
    }

    try {
      // Convert Set to Array for style-observer
      const variablesToObserve = Array.from(this.getObservedCSSVariables());

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
    const observedVariables = this.getObservedCSSVariables();
    const supportedChanges = changes.filter((change) => observedVariables.has(change.name));

    if (supportedChanges.length === 0) {
      return;
    }

    for (const change of supportedChanges) {
      this.observedValues.set(change.name, change.value.trim());
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
      const definedChanges = changes.filter((change) => change.value.trim() !== "");
      const removedChanges = changes.filter((change) => change.value.trim() === "");
      const defaults = this.getGraphDefaults(removedChanges);

      // Map changes to graph colors
      const colorChanges = merge(mapCSSChangesToGraphColors(definedChanges), defaults.colors);
      const constantChanges = merge(mapCSSChangesToGraphConstants(definedChanges), defaults.constants);

      if (Object.keys(colorChanges).length === 0 && Object.keys(constantChanges).length === 0) {
        return;
      }

      // getState() includes values applied earlier in this frame that are not committed yet
      const state = this.getState();
      const colors = merge({}, state.colors, colorChanges);
      const constants = merge({}, state.constants, constantChanges);

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

  /**
   * Picks the graph values that removed CSS variables had overridden
   */
  private getGraphDefaults(removedChanges: CSSVariableChange[]): {
    colors: RecursivePartial<TGraphColors>;
    constants: RecursivePartial<TGraphConstants>;
  } {
    const colors: RecursivePartial<TGraphColors> = {};
    const constants: RecursivePartial<TGraphConstants> = {};

    for (const change of removedChanges) {
      const mapping = CSS_VARIABLE_MAPPINGS.find((m) => m.cssVariable === change.name);
      if (!mapping || !this.graphDefaults) {
        continue;
      }

      if (mapping.typeConverter === CSSVariableType.COLOR) {
        set(colors, mapping.graphPath, get(this.graphDefaults.colors, mapping.graphPath));
      } else {
        set(constants, mapping.graphPath, get(this.graphDefaults.constants, mapping.graphPath));
      }
    }

    return { colors, constants };
  }
}
