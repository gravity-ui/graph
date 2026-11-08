/** Main-thread work of WebGL connection drawing since the last reset. Experimental, for benchmarks. */
export type TWebGLConnectionsStats = {
  /** Milliseconds spent in frame draws: chunk builds, uploads and draw calls, in the graph layer's frame or the loop. */
  drawMs: number;
  /** Frame draws, in the graph layer's frame or the animation loop. */
  draws: number;
  /**
   * Draw calls: per drawn chunk and effect group, one instanced call for its straight segments and one for its curve
   * pieces; one per chunk for its closed-arrow fills.
   */
  drawCalls: number;
  /** Instances (cubic pieces) drawn: `lineInstances` plus `curveInstances`. */
  instances: number;
  /** Instances of straight segments, drawn with the 4-vertex line template. */
  lineInstances: number;
  /** Instances of curve pieces, drawn with the curve template. */
  curveInstances: number;
  /** Connection items with a WebGL shape in drawn chunks, summed per draw. */
  items: number;
  /** Vertices drawn: instances times their template's vertices, plus closed-arrow fill vertices. */
  vertices: number;
};

/** Accumulated by every WebGL connections surface of the page. */
export const webglConnectionsStats: TWebGLConnectionsStats = {
  drawMs: 0,
  draws: 0,
  drawCalls: 0,
  instances: 0,
  lineInstances: 0,
  curveInstances: 0,
  items: 0,
  vertices: 0,
};

/** Experimental: a copy of the accumulated WebGL connections stats. */
export function getWebGLConnectionsStats(): TWebGLConnectionsStats {
  return { ...webglConnectionsStats };
}

/** Experimental: starts accumulating the WebGL connections stats from zero. */
export function resetWebGLConnectionsStats(): void {
  webglConnectionsStats.drawMs = 0;
  webglConnectionsStats.draws = 0;
  webglConnectionsStats.drawCalls = 0;
  webglConnectionsStats.instances = 0;
  webglConnectionsStats.lineInstances = 0;
  webglConnectionsStats.curveInstances = 0;
  webglConnectionsStats.items = 0;
  webglConnectionsStats.vertices = 0;
}
