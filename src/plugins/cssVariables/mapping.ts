import get from "lodash/get";
import set from "lodash/set";

import type { TGraphColors, TGraphConstants } from "../../graphConfig";
import {CSSVariableType, type CSSVariableChange } from "./types";
import { CSS_VALUE_CONVERTERS } from "./types";
import { CSS_VARIABLE_MAPPINGS, SUPPORTED_CSS_VARIABLES } from "./constants";
import { RecursivePartial } from "@/utils/types/helpers";

/**
 * Converts CSS variable changes to TGraphColors partial update
 * @param changes - Array of CSS variable changes
 * @returns Partial TGraphColors object with changes
 */
export function mapCSSChangesToGraphColors(changes: CSSVariableChange[]): RecursivePartial<TGraphColors> {
  const result: RecursivePartial<TGraphColors> = {};
  
  for (const change of changes) {
    if (!SUPPORTED_CSS_VARIABLES.has(change.name)) {
      continue;
    }
    
    const mapping = CSS_VARIABLE_MAPPINGS.find(m => m.cssVariable === change.name);
    if (!mapping || mapping.typeConverter !== CSSVariableType.COLOR) {
      continue;
    }
    
    const convertedValue = CSS_VALUE_CONVERTERS[mapping.typeConverter](change.value);
    set(result, mapping.graphPath, convertedValue);
  }
  
  return result;
}

/**
 * Converts CSS variable changes to TGraphConstants partial update
 * @param changes - Array of CSS variable changes
 * @returns Partial TGraphConstants object with changes
 */
export function mapCSSChangesToGraphConstants(changes: CSSVariableChange[]): RecursivePartial<TGraphConstants> {
  const result: RecursivePartial<TGraphConstants> = {};
  
  for (const change of changes) {
    if (!SUPPORTED_CSS_VARIABLES.has(change.name)) {
      continue;
    }
    
    const mapping = CSS_VARIABLE_MAPPINGS.find(m => m.cssVariable === change.name);
    if (!mapping || mapping.typeConverter === CSSVariableType.COLOR) {
      continue;
    }
    
    const convertedValue = CSS_VALUE_CONVERTERS[mapping.typeConverter](change.value);
    set(result, mapping.graphPath, convertedValue);
  }
  
  return result;
}

/**
 * Converts current graph colors to CSS variables object
 * @param colors - Current graph colors
 * @returns Object with CSS variable names as keys and color values as values
 */
export function mapGraphColorsToCSSVariables(colors: TGraphColors): Record<string, string> {
  const result: Record<string, string> = {};
  
  for (const mapping of CSS_VARIABLE_MAPPINGS) {
    if (mapping.typeConverter !== CSSVariableType.COLOR) {
      continue;
    }
    
    const value = get(colors, mapping.graphPath);
    if (value !== undefined) {
      result[mapping.cssVariable] = String(value);
    }
  }
  
  return result;
}

/**
 * Converts current graph constants to CSS variables object
 * @param constants - Current graph constants
 * @returns Object with CSS variable names as keys and constant values as values
 */
export function mapGraphConstantsToCSSVariables(constants: TGraphConstants): Record<string, string> {
  const result: Record<string, string> = {};
  
  for (const mapping of CSS_VARIABLE_MAPPINGS) {
    if (mapping.typeConverter === CSSVariableType.COLOR) {
      continue;
    }
    
    const value = get(constants, mapping.graphPath);
    if (value !== undefined) {
      result[mapping.cssVariable] = String(value);
    }
  }
  
  return result;
}

/**
 * Filters CSS variable changes to only include supported variables
 * @param changes - Array of CSS variable changes
 * @returns Filtered array containing only supported CSS variables
 */
export function filterSupportedCSSChanges(changes: CSSVariableChange[]): CSSVariableChange[] {
  return changes.filter(change => SUPPORTED_CSS_VARIABLES.has(change.name));
}
