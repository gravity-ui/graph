import { defineSceneEffect, hoveredTag } from "@gravity-ui/graph";
import type { TStyleRule } from "@gravity-ui/graph";

import { createEtlConnection } from "../webglConnections/etl";

export const EtlScaleConnection = createEtlConnection(() => "comets");

/** Keep the original target class for hover rules while bounding the running line's effect. */
export function createEtlScaleConnection(minScale: number): typeof EtlScaleConnection {
  const bounded = createEtlConnection(() => "comets", { minScale });
  return class extends EtlScaleConnection {
    public static override line = bounded.line;
  };
}

const hoverHighlight = defineSceneEffect({
  kind: "path",
  animated: true,
  fragment: /* glsl */ `
    vec4 effect(PathFragment f, vec4 color) {
      float phase = fract(f.along * f.scale / 72.0 - f.time * 1.6);
      float crest = 1.0 - smoothstep(0.0, 0.24, abs(phase - 0.75));
      vec3 base = f.selected > 0.5 ? f.selectionColor.rgb : color.rgb;
      vec3 rgb = mix(base, vec3(0.72, 0.95, 1.0), crest * 0.55);
      return vec4(rgb, 1.0);
    }`,
});

export const etlFlowRules: readonly TStyleRule<typeof EtlScaleConnection>[] = [
  {
    target: EtlScaleConnection,
    tags: [hoveredTag],
    style: {
      parts: {
        line: { width: { px: 3.5, minWorld: 8, maxWorld: 96 }, effect: hoverHighlight.use([]) },
      },
    },
  },
];
