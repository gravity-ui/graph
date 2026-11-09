// scripts/bench/culling/scene/sizes.check.ts — prints scene sizes; run through esbuild (see the plan, Task 4).
import { buildScene } from "./scenes";

for (const kind of ["median", "guarantee", "stress"] as const) {
  const scene = buildScene(kind);
  const anchors = scene.blocks.reduce((sum, block) => sum + block.anchors.length, 0);
  console.log(kind, {
    blocks: scene.blocks.length,
    anchors,
    connections: scene.connections.length,
    groups: scene.groups.length,
  });
}
