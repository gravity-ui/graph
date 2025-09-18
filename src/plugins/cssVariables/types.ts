import type { LayerProps } from "../../services/Layer";
import type { TGraphColors, TGraphConstants } from "../../graphConfig";
import type { TComponentState } from "../../lib/Component";
import { RecursivePartial } from "@/utils/types/helpers";

/**
 * Describes a change to a CSS variable
 */
export interface CSSVariableChange {
  /** The CSS variable name (e.g., '--graph-block-background') */
  name: string;
  /** The new value of the CSS variable */
  value: string;
  /** The previous value of the CSS variable (if any) */
  oldValue?: string;
}

/**
 * Props for CSSVariablesLayer
 */
export interface CSSVariablesLayerProps extends LayerProps {
  /** CSS class name to apply to the container div */
  containerClass: string;
  /** Optional callback for CSS variable changes */
  onChange?: (changes: CSSVariableChange[]) => void;
  /** Whether to enable debug logging */
  debug?: boolean;
}

/**
 * State for CSSVariablesLayer
 */
export interface CSSVariablesLayerState extends TComponentState {
  /** Whether the layer is actively observing changes */
  isObserving: boolean;
  colors: RecursivePartial<TGraphColors>;
  constants: RecursivePartial<TGraphConstants>;
}

/**
 * Supported value types for CSS variables
 */
export enum CSSVariableType {
  COLOR = "color",
  FLOAT = "float",
  INT = "int",
  STRING = "string",
  BOOLEAN = "boolean",
}

/**
 * Type converter functions for CSS variable values
 */
export const CSS_VALUE_CONVERTERS = {
  [CSSVariableType.COLOR]: (value: string): string => value.trim(),
  [CSSVariableType.FLOAT]: (value: string): number => {
    const parsed = parseFloat(value);
    return isNaN(parsed) ? 0 : parsed;
  },
  [CSSVariableType.INT]: (value: string): number => {
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? 0 : parsed;
  },
  [CSSVariableType.STRING]: (value: string): string => value.trim(),
  [CSSVariableType.BOOLEAN]: (value: string): boolean => {
    const trimmed = value.trim().toLowerCase();
    return trimmed === "true" || trimmed === "1" || trimmed === "yes";
  },
} as const;

/**
 * Mapping configuration for CSS variables to graph properties
 */
export interface CSSVariableMapping {
  /** CSS variable name */
  cssVariable: string;
  /** Path in TGraphColors or TGraphConstants (e.g., 'block.background') */
  graphPath: string;
  /** Type converter for the CSS variable value */
  typeConverter: CSSVariableType;
}

/**
 * Collection of all supported CSS variable mappings
 */
export type CSSVariableMappings = CSSVariableMapping[];
