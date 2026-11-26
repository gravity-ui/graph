import { Graph } from "../../../graph";
import { globalScheduler } from "../../../lib/Scheduler";

describe("pointer activation", () => {
  let graph: Graph;
  let root: HTMLDivElement;
  let events: string[];

  beforeEach(() => {
    jest.useFakeTimers();
    root = document.body.appendChild(document.createElement("div"));
    Object.defineProperties(root, { clientWidth: { value: 600 }, clientHeight: { value: 400 } });
    graph = new Graph(
      { settings: { doubleClickInterval: 700, doubleClickDistance: 8, clickTolerance: 3, dragThreshold: 8 } },
      root
    );
    graph.start();
    graph.setEntities({
      blocks: [
        { id: "a", is: "Block", name: "A", x: 10, y: 10, width: 100, height: 80 },
        { id: "b", is: "Block", name: "B", x: 110, y: 10, width: 100, height: 80 },
      ],
      connections: [],
    });
    graph.cameraService.set({ width: 600, height: 400, x: 0, y: 0, scale: 1 });
    for (let i = 0; i < 3; i++) globalScheduler.performUpdate();
    events = [];
    const observe = (event: { type: string; preventDefault(): void }) => {
      events.push(event.type);
      event.preventDefault();
    };
    graph.on("click", observe);
    graph.on("dblclick", observe);
  });

  afterEach(() => {
    graph.unmount();
    root.remove();
    jest.useRealTimers();
  });

  function send(type: string, x: number, init: PointerEventInit = {}, time = performance.now()) {
    const event = new PointerEvent(type, {
      pointerType: "mouse",
      pointerId: 1,
      clientX: x,
      clientY: 50,
      button: 0,
      buttons: type === "pointerup" ? 0 : 1,
      bubbles: true,
      cancelable: true,
      ...init,
    });
    Object.defineProperty(event, "timeStamp", { value: time });
    root.dispatchEvent(event);
  }
  function click(x: number, init: PointerEventInit = {}) {
    send("pointerdown", x, init);
    send("pointerup", x, init);
  }

  it.each([
    [700, 8, true],
    [701, 8, false],
    [700, 9, false],
  ] as const)("pairs clicks with %i ms and %i CSS px separation", (interval, distance, matches) => {
    click(50);
    expect(events).toEqual(["click"]);
    jest.advanceTimersByTime(interval);
    click(50 + distance);
    expect(events).toEqual(matches ? ["click", "click", "dblclick"] : ["click", "click"]);
  });

  it("uses the physical interval when a busy main thread delivers two clicks together", () => {
    send("pointerdown", 50, {}, 1);
    send("pointerup", 50, {}, 5);
    send("pointerdown", 50, {}, 900);
    send("pointerup", 50, {}, 910);
    expect(events).toEqual(["click", "click"]);
  });

  describe("exclusive clicks", () => {
    beforeEach(() => graph.updateSettings({ clickPolicy: "exclusive" }));

    it("delays the single including its default, using the original route and coordinates", () => {
      const a = graph.blocks.getBlockState("a");
      const view = a?.getViewComponent();
      if (!view || !a) throw new Error("Missing block A");
      const seen: string[] = [];
      graph.on("click", () => seen.push("capture"), { capture: true });
      view.on("click", ({ point, event, target }) => {
        expect(target).toBe(view);
        expect(event.type).toBe("pointerup");
        expect(point.world.x).toBe(50);
        seen.push("block");
      });
      graph.on("click", () => seen.push("bubble"));
      click(50);
      graph.cameraService.move(40, 0);
      jest.advanceTimersByTime(699);
      expect(seen).toEqual([]);
      expect(a.selected).toBe(false);
      jest.advanceTimersByTime(1);
      expect(seen).toEqual(["capture", "block", "bubble"]);
      expect(events).toEqual(["click"]);
      // The graph listener's preventDefault still vetoes selection at delivery.
      expect(a.selected).toBe(false);
    });

    it.each(["mouse", "touch"])(
      "pairs %s releases exactly once and starts a fresh window for a third click",
      (type) => {
        graph.on("press", ({ type }) => events.push(type));
        graph.on("release", ({ type }) => events.push(type));
        click(50, { pointerType: type, pointerId: 1 });
        jest.advanceTimersByTime(600);
        click(52, { pointerType: type, pointerId: type === "touch" ? 2 : 1 });
        expect(events).toEqual(["press", "release", "press", "release", "dblclick"]);
        click(52, { pointerType: type, pointerId: type === "touch" ? 3 : 1 });
        jest.advanceTimersByTime(701);
        expect(events.slice(5)).toEqual(["press", "release", "click"]);
      }
    );

    it("delivers successive targets in order before pairing another block's double click", () => {
      const a = graph.blocks.getBlockState("a")?.getViewComponent();
      const b = graph.blocks.getBlockState("b")?.getViewComponent();
      const targets: unknown[] = [];
      graph.on("click", ({ target }) => targets.push(target));
      graph.on("dblclick", ({ target }) => targets.push(target));
      click(108);
      click(112);
      click(112);
      jest.advanceTimersByTime(701);
      expect(events).toEqual(["click", "dblclick"]);
      expect(targets).toHaveLength(2);
      expect(targets[0]).toBe(a);
      expect(targets[1]).toBe(b);
    });

    it("retains a completed single when a subsequent pair of contacts becomes a pinch", () => {
      graph.updateSettings({ touchPolicy: "editor" });
      const finger = { pointerType: "touch", pointerId: 3 };
      click(50, finger);
      send("pointerdown", 50, finger);
      send("pointerdown", 140, { ...finger, pointerId: 4 });
      send("pointerup", 140, { ...finger, pointerId: 4 });
      send("pointerup", 50, finger);
      jest.advanceTimersByTime(701);
      expect(events).toEqual(["click"]);
    });

    it("starts a new sequence after switching click policy", () => {
      click(50);
      graph.updateSettings({ clickPolicy: "immediate" });
      click(50);
      expect(events).toEqual(["click", "click"]);
      jest.advanceTimersByTime(701);
      expect(events).toEqual(["click", "click"]);
    });

    it("drops delayed work when the target is removed or the graph is detached", () => {
      click(50);
      graph.blocks.deleteBlocks(["a"]);
      for (let i = 0; i < 3; i++) globalScheduler.performUpdate();
      jest.advanceTimersByTime(701);
      expect(events).toEqual([]);
      click(400);
      graph.detach();
      jest.advanceTimersByTime(701);
      expect(events).toEqual([]);
    });
  });

  it("requires the same live component, even for adjacent blocks", () => {
    click(108);
    click(112);
    expect(events).toEqual(["click", "click"]);
    graph.updateSettings({ clickTolerance: 4 });
    send("pointerdown", 108);
    send("pointerup", 112);
    expect(events).toEqual(["click", "click"]);
  });

  it("starts a fresh click pair after a target is replaced with the same block ID", () => {
    click(50);
    const first = graph.blocks.getBlockState("a")!.getViewComponent();
    graph.setEntities({ blocks: [], connections: [] });
    globalScheduler.performUpdate();
    graph.setEntities({
      blocks: [{ id: "a", is: "Block", name: "A", x: 10, y: 10, width: 100, height: 80 }],
      connections: [],
    });
    for (let i = 0; i < 3; i++) globalScheduler.performUpdate();
    expect(graph.blocks.getBlockState("a")!.getViewComponent() !== first).toBe(true);
    click(50);
    expect(events).toEqual(["click", "click"]);
  });

  it("borrows the host touch-action only while editor navigation is enabled", () => {
    root.style.touchAction = "pan-y";
    graph.updateSettings({ clickTolerance: 7 });
    expect(root.style.touchAction).toBe("pan-y");
    graph.updateSettings({ touchPolicy: "editor" });
    expect(root.style.touchAction).toBe("none");
    graph.updateSettings({ touchPolicy: "page" });
    expect(root.style.touchAction).toBe("pan-y");
    root.style.touchAction = "pan-x";
    graph.stop();
    expect(root.style.touchAction).toBe("pan-x");
  });

  it("interrupts a pending hold when a second touch lands on a native control", () => {
    graph.on("longpress", ({ type }) => events.push(type));
    const finger = { pointerType: "touch", pointerId: 3 };
    send("pointerdown", 50, finger);
    const input = root.appendChild(document.createElement("input"));
    input.addEventListener("pointerdown", (event) => event.stopPropagation());
    input.dispatchEvent(new PointerEvent("pointerdown", { ...finger, pointerId: 4, bubbles: true }));
    jest.advanceTimersByTime(500);
    send("pointerup", 50, finger);
    expect(events).toEqual([]);
  });

  it.each([
    [4, false],
    [15, true],
  ] as const)("accounts for a coalesced pen excursion of %i CSS px", (distance, drags) => {
    const pen = { pointerId: 3, pointerType: "pen", buttons: 1, clientY: 50 };
    graph.on("longpress", ({ type }) => events.push(type));
    graph.on("dragstart", ({ point, preventDefault }) => {
      events.push(`drag at ${point.canvas.x}`);
      preventDefault();
    });
    send("pointerdown", 50, pen);
    const move = new PointerEvent("pointermove", { ...pen, clientX: 50, bubbles: true });
    Object.defineProperty(move, "getCoalescedEvents", {
      value: () => [new PointerEvent("pointermove", { ...pen, clientX: 50 + distance }), move],
    });
    root.dispatchEvent(move);
    jest.advanceTimersByTime(500);
    send("pointerup", 50, { ...pen, buttons: 0 });
    expect(events).toEqual(drags ? ["drag at 65"] : []);
  });

  it("checks the entire press excursion, including a return before release", () => {
    send("pointerdown", 50);
    send("pointermove", 54);
    send("pointerup", 50);
    send("pointerdown", 50);
    send("pointerup", 53);
    expect(events).toEqual(["click"]);
  });

  it("keeps dismissing a handled Escape inside an HTML control local to that control", () => {
    const input = root.appendChild(document.createElement("input"));
    input.addEventListener("keydown", (event) => event.preventDefault());
    send("pointerdown", 50);
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    send("pointerup", 50);
    expect(events).toEqual(["click"]);
  });

  it.each(["before threshold", "during dragstart"])("cancels a pending drag %s", (when) => {
    const start = jest.fn();
    graph.on("dragstart", (event) => {
      event.claim({ owner: "port", start });
      if (when === "during dragstart") graph.dragService.cancel();
    });
    send("pointerdown", 50);
    if (when === "before threshold") graph.dragService.cancel();
    send("pointermove", 65);
    send("pointerup", 65);
    expect(start).not.toHaveBeenCalled();
    expect(events).toEqual([]);
  });

  it("cancels the owner's drop if a release handler removes its source", () => {
    const end = jest.fn();
    const cancel = jest.fn();
    graph.on("dragstart", ({ claim }) => claim({ owner: "port", end, cancel }));
    graph.on("release", () => {
      graph.setEntities({ blocks: [], connections: [] });
      for (let i = 0; i < 3; i++) globalScheduler.performUpdate();
    });
    send("pointerdown", 50);
    send("pointermove", 65);
    send("pointerup", 65);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(end).not.toHaveBeenCalled();
  });

  it("reports a late claim and leaves the accepted owner in control", () => {
    const warning = jest.spyOn(console, "warn").mockImplementation(() => {});
    const end = jest.fn();
    const late = jest.fn();
    let claimAfterDelivery = () => {};
    try {
      graph.on("dragstart", ({ claim }) => {
        claim({ owner: "port", end });
        claimAfterDelivery = () => claim({ owner: "late", start: late });
      });
      send("pointerdown", 50);
      send("pointermove", 60);
      claimAfterDelivery();
      send("pointerup", 60);
      expect(warning).toHaveBeenCalledWith(expect.stringContaining("during event delivery"), "late");
      expect(end).toHaveBeenCalledTimes(1);
      expect(late).not.toHaveBeenCalled();
      expect(events).toEqual([]);
    } finally {
      warning.mockRestore();
    }
  });

  it.each(["touch", "pen"])("recognizes two %s taps with different contact IDs", (pointerType) => {
    click(50, { pointerType, pointerId: 7 });
    jest.advanceTimersByTime(350);
    click(53, { pointerType, pointerId: 9 });
    expect(events).toEqual(["click", "click", "dblclick"]);
  });

  it.each(["touch", "pen"])("delivers one %s longpress to the original target at the deadline", (pointerType) => {
    const contact = { pointerType, pointerId: 4 };
    const target = graph.blocks.getBlockState("a")!.getViewComponent()!;
    const held = jest.fn();
    target.on("longpress", held);
    graph.on("longpress", ({ type }) => events.push(type));
    graph.on("dragstart", ({ type }) => events.push(type));
    send("pointerdown", 50, contact);
    send("pointermove", 53, contact);
    jest.advanceTimersByTime(499);
    expect(held).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(held).toHaveBeenCalledTimes(1);
    expect(held.mock.calls[0][0].target).toBe(target);
    expect(held.mock.calls[0][0].event.type).toBe("pointerdown");
    expect(held.mock.calls[0][0].event.clientX).toBe(50);
    send("pointermove", 70, contact);
    jest.advanceTimersByTime(600);
    send("pointerup", 50, contact);
    expect(events).toEqual(["longpress"]);
  });

  it.each(["up", "move", "second", "cancel", "unmount", "stop"])("cancels the hold timer on %s", (reason) => {
    const contact = { pointerType: "touch", pointerId: 4 };
    const held = jest.fn();
    graph.on("longpress", held);
    send("pointerdown", 50, contact);
    jest.advanceTimersByTime(499);
    if (reason === "up") send("pointerup", 50, contact);
    if (reason === "move") send("pointermove", 54, contact);
    if (reason === "second") send("pointerdown", 150, { ...contact, pointerId: 5 });
    if (reason === "cancel") send("pointercancel", 50, contact);
    if (reason === "unmount") {
      graph.setEntities({ blocks: [], connections: [] });
      globalScheduler.performUpdate();
    }
    if (reason === "stop") graph.stop();
    jest.advanceTimersByTime(100);
    expect(held).not.toHaveBeenCalled();
  });

  it("uses the nearest shared interactive target and pins its scale and veto through pinch end", () => {
    graph.updateSettings({ touchPolicy: "editor" });
    const block = graph.blocks.getBlockState("a")!.getViewComponent()!;
    const phases: string[] = [];
    const target = jest.fn();
    block.on(
      "pinch",
      (event) => {
        target(event.target);
        phases.push(event.phase);
        if (event.phase === "start") event.preventDefault();
      },
      { inScale: [graph.scene.$level.peek()] }
    );
    const first = { pointerType: "touch", pointerId: 2 };
    const second = { pointerType: "touch", pointerId: 4 };
    send("pointerdown", 20, first);
    send("pointerdown", 80, second);
    graph.cameraService.set({ scale: 0.05 });
    const camera = graph.$camera.peek();
    send("pointermove", 100, second);
    send("pointerup", 100, second);
    send("pointermove", 22, first);
    send("pointerup", 22, first);
    expect(phases).toEqual(["start", "update", "end"]);
    expect(target.mock.calls.every(([node]) => node === block)).toBe(true);
    expect(graph.$camera.peek()).toBe(camera);
    expect(events).toEqual([]);
  });

  it("lets two fingers navigate after a block declines a drag", () => {
    graph.updateSettings({ touchPolicy: "editor" });
    const pinch = jest.fn();
    graph.on("pinch", pinch);
    graph.on("dragstart", ({ preventDefault }) => preventDefault());
    const finger = { pointerType: "touch", pointerId: 5 };
    send("pointerdown", 50, finger);
    send("pointermove", 65, finger);
    send("pointerdown", 150, { ...finger, pointerId: 8 });
    expect(pinch).toHaveBeenCalledTimes(1);
    send("pointercancel", 150, { ...finger, pointerId: 8 });
  });

  it("keeps an ignored pen out of hit testing until its own release", () => {
    graph.updateSettings({ touchPolicy: "editor" });
    const finger = { pointerType: "touch", pointerId: 5 };
    const pen = { pointerType: "pen", pointerId: 8 };
    graph.on("dragstart", ({ claim }) => claim({ owner: "port" }));
    send("pointerdown", 50, finger);
    send("pointermove", 65, finger);
    send("pointerdown", 110, pen);
    send("pointerup", 65, finger);
    const hit = jest.spyOn(graph, "getElementOverPoint");
    send("pointermove", 140, pen);
    globalScheduler.performUpdate();
    expect(hit).not.toHaveBeenCalled();
    send("pointerup", 140, pen);
    send("pointermove", 142, { ...pen, buttons: 0 });
    jest.advanceTimersByTime(100);
    globalScheduler.performUpdate();
    expect(hit).toHaveBeenCalledTimes(1);
  });

  it("lets a native control break a pending double click", () => {
    click(50);
    const button = root.appendChild(document.createElement("button"));
    button.addEventListener("pointerdown", (event) => event.stopPropagation());
    button.dispatchEvent(new PointerEvent("pointerdown", { pointerType: "mouse", button: 0, bubbles: true }));
    click(50);
    expect(events).toEqual(["click", "click"]);
  });

  it("ignores a third finger and pen with no lookup and cancels pinch exactly once", () => {
    graph.updateSettings({ touchPolicy: "editor" });
    const snapshots: { phase: string; onGraph: boolean; ids: number[] }[] = [];
    graph.on("pinch", (event) => {
      snapshots.push({
        phase: event.phase,
        onGraph: event.target === graph,
        ids: event.pointers.map((p) => p.pointerId),
      });
    });
    const first = { pointerType: "touch", pointerId: 2 };
    const second = { pointerType: "touch", pointerId: 3 };
    send("pointerdown", 50, first);
    send("pointerdown", 150, second);
    const hit = jest.spyOn(graph, "getElementOverPoint");
    for (const other of [
      { ...first, pointerId: 4 },
      { pointerType: "pen", pointerId: 5 },
    ]) {
      send("pointerdown", 152, other);
      send("pointermove", 180, other);
      send("pointerup", 180, other);
    }
    send("pointercancel", 150, second);
    send("lostpointercapture", 150, second);
    send("pointermove", 70, first);
    send("pointerup", 70, first);
    expect(snapshots).toEqual([
      { phase: "start", onGraph: true, ids: [2, 3] },
      { phase: "cancel", onGraph: true, ids: [2, 3] },
    ]);
    expect(hit).not.toHaveBeenCalled();
    expect(events).toEqual([]);
  });

  it("accepts tap without passive touch hover and rejects compatibility mouse clicks", () => {
    const enter = jest.fn();
    graph.on("pointerenter", enter);
    const touch = { pointerType: "touch", pointerId: 3 };
    send("pointerenter", 50, touch);
    click(50, touch);
    for (const type of ["mousedown", "mouseup", "click", "dblclick", "mouseenter"]) {
      root.dispatchEvent(new MouseEvent(type, { clientX: 50, clientY: 50, bubbles: true }));
    }
    expect(enter).not.toHaveBeenCalled();
    expect(events).toEqual(["click"]);
    send("pointerenter", 50, { pointerType: "pen" });
    globalScheduler.performUpdate();
    expect(enter).toHaveBeenCalledTimes(1);
  });
});
