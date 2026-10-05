import { Graph } from "@gravity-ui/graph";
import { act, renderHook } from "@testing-library/react";

import { useGraphEvent, useGraphEvents } from "./useGraphEvents";

test("React event subscriptions follow callbacks and graph replacement and stop on unmount", () => {
  const first = new Graph({});
  const second = new Graph({});
  const initial = jest.fn();
  const replacement = jest.fn();
  const single = jest.fn();
  const { rerender, unmount } = renderHook(
    ({ graph, callback }) => {
      useGraphEvents(graph, { onStateChanged: callback });
      useGraphEvent(graph, "state-change", single);
    },
    { initialProps: { graph: first, callback: initial } }
  );
  const firstEvent = first.emit("state-change", { state: first.state });
  expect(initial).toHaveBeenCalledWith(firstEvent.detail, firstEvent);
  expect(single).toHaveBeenCalledWith(firstEvent.detail, firstEvent);
  rerender({ graph: second, callback: replacement });
  first.emit("state-change", { state: first.state });
  act(() => {
    second.emit("state-change", { state: second.state });
  });
  expect(initial).toHaveBeenCalledTimes(1);
  expect(replacement).toHaveBeenCalledTimes(1);
  expect(single).toHaveBeenCalledTimes(2);
  unmount();
  second.emit("state-change", { state: second.state });
  expect(replacement).toHaveBeenCalledTimes(1);
  expect(single).toHaveBeenCalledTimes(2);
  first.unmount();
  second.unmount();
});
