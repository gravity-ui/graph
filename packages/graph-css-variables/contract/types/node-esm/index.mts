import { Graph, Layer, layerConfig, type LayerPublicProps, type TGraphColors } from "@gravity-ui/graph";
import {
  CSSVariablesLayer,
  CSS_VARIABLE_MAPPINGS,
  DEFAULT_CSS_VARIABLES_LAYER_PROPS,
  SUPPORTED_CSS_VARIABLES,
  filterSupportedCSSChanges,
  mapCSSChangesToGraphColors,
  mapCSSChangesToGraphConstants,
  mapGraphColorsToCSSVariables,
  mapGraphConstantsToCSSVariables,
  type CSSVariableChange,
  type CSSVariableMapping,
  type CSSVariableMappings,
  type CSSVariablesLayerProps,
  type CSSVariablesLayerState,
} from "@gravity-ui/graph-css-variables";

const options: LayerPublicProps<typeof CSSVariablesLayer> = {
  containerClass: "graph-theme",
  debug: false,
  onChange: (changes: CSSVariableChange[]) => void changes,
};
const graph = new Graph({});
const cssVariables = graph.addLayer(CSSVariablesLayer, options);
const layer: Layer = cssVariables;
const props: CSSVariablesLayerProps = cssVariables.props;
const state: CSSVariablesLayerState = cssVariables.state;
cssVariables.setProps({ containerClass: "other-theme" });
graph.removeLayer(cssVariables);
void [layer, props, state];

const configured = new Graph({ layers: [layerConfig(CSSVariablesLayer, { containerClass: "graph-theme" })] });
// @ts-expect-error containerClass is required
graph.addLayer(CSSVariablesLayer, {});
// @ts-expect-error containerClass is a CSS class name
layerConfig(CSSVariablesLayer, { containerClass: 1 });

const mapping: CSSVariableMapping = CSS_VARIABLE_MAPPINGS[0];
const mappings: CSSVariableMappings = CSS_VARIABLE_MAPPINGS;
const supported: boolean = SUPPORTED_CSS_VARIABLES.has(mapping.cssVariable);
const debugDefault: boolean | undefined = DEFAULT_CSS_VARIABLES_LAYER_PROPS.debug;
const changes = filterSupportedCSSChanges([{ name: "--graph-block-background", value: "red" }]);
const colorsPatch = mapCSSChangesToGraphColors(changes);
const constantsPatch = mapCSSChangesToGraphConstants(changes);
graph.setColors(colorsPatch);
graph.setConstants(constantsPatch);
const colors: TGraphColors = graph.graphColors;
const colorVariables: Record<string, string> = mapGraphColorsToCSSVariables(colors);
const constantVariables: Record<string, string> = mapGraphConstantsToCSSVariables(graph.graphConstants);
void [configured, mappings, supported, debugDefault, colorVariables, constantVariables];
