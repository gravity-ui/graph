import { Graph } from "@gravity-ui/graph";
import { act, renderHook } from "@testing-library/react";

import { useGraph } from "./useGraph";

test("setViewConfiguration applies its argument and preserves resolved neighbors", () => {
  const graph = new Graph({});
  const { result, unmount } = renderHook(() =>
    useGraph({
      graph,
      viewConfiguration: { colors: { block: { border: "#111111" } }, constants: { camera: { SPEED: 1 } } },
    })
  );
  act(() =>
    result.current.setViewConfiguration({
      colors: { block: { border: "#222222" } },
      constants: { camera: { SPEED: 2 } },
    })
  );
  expect(graph.graphColors.block.border).toBe("#222222");
  expect(graph.graphColors.block.background).toBeDefined();
  expect(graph.graphConstants.camera.SPEED).toBe(2);
  expect(graph.graphConstants.camera.PAN_SPEED).toBe(1);
  unmount();
  graph.unmount();
});
