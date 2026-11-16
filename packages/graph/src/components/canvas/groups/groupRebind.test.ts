import { batch } from "@preact/signals-core";

import { Graph } from "../../../graph";
import { globalScheduler } from "../../../lib/Scheduler";
import type { BlockState } from "../../../store/block/Block";
import type { PortState } from "../../../store/connection/port/Port";
import { createBlockPointPortId } from "../../../store/connection/port/utils";
import type { GroupState, TGroup } from "../../../store/group/Group";
import { ECanDrag } from "../../../store/settings";
import { Block } from "../blocks/Block";
import type { TBlock } from "../blocks/Block";

import { BlockGroups } from "./BlockGroups";
import { CollapsibleGroup } from "./CollapsibleGroup";
import type { TCollapsibleGroup } from "./CollapsibleGroup";
import { Group } from "./Group";

/**
 * Task 3y: a group removed from the store and added back with the same id before a frame keeps its component (keyed
 * by id), but the store made a new group state. The kept component rebinds to it, and a collapsible group moves its
 * collapse from the old state to the new one.
 */

const block = (id: string, x: number, group?: string): TBlock => ({
  is: "Block",
  id,
  name: id,
  x,
  y: 100,
  width: 100,
  height: 50,
  anchors: [],
  ...(group === undefined ? {} : { group }),
});

/** The blocks' inner rect: a (100..200) and b (300..400), y 100..150. Padded by 20: 60..440 x 60..190. */
const RECT = { x: 80, y: 80, width: 340, height: 90 };
/** The re-added group's rect: 40 taller, padded 60..440 x 60..230. */
const TALL = { ...RECT, height: 130 };

function frames(count = 4): void {
  for (let i = 0; i < count; i++) globalScheduler.performUpdate();
}

type TGroupInternals = { groupState: GroupState };

/** A grouping layer that sets its groups again on every block change: one collapsible group per `group` value. */
const Grouping = BlockGroups.withBlockGrouping({
  groupingFn: (blocks) => {
    const groups: Record<string, BlockState[]> = {};
    blocks.forEach((each) => {
      const id = each.$state.value.group;
      if (id) (groups[id] ??= []).push(each);
    });
    return groups;
  },
  mapToGroups: (id, { rect }) => ({ id, rect, component: CollapsibleGroup }),
});

describe("a kept group rebinds to the new group state of a group added back in the same frame", () => {
  let graph: Graph;

  /** Blocks a and b in group g, block o outside it (700..800), connection c from a to o. */
  function start(group: TGroup | TCollapsibleGroup): void {
    const root = document.createElement("div");
    Object.defineProperties(root, { clientWidth: { value: 1000 }, clientHeight: { value: 800 } });
    graph = new Graph({ settings: { useBezierConnections: false, dragThreshold: 0, canDrag: ECanDrag.ALL } }, root);
    graph.setEntities({
      blocks: [block("a", 100, "g"), block("b", 300, "g"), block("o", 700)],
      connections: [{ id: "c", sourceBlockId: "a", targetBlockId: "o" }],
    });
    graph.cameraService.set({ width: 1000, height: 800, x: 0, y: 0, scale: 1 });
    graph.start();
    graph.addLayer(BlockGroups, { draggable: true });
    graph.rootStore.groupsList.setGroups([group]);
    frames();
  }

  const stateOf = (id = "g"): GroupState => {
    const state = graph.rootStore.groupsList.getGroupState(id);
    if (!state) throw new Error(`no group state ${id}`);
    return state;
  };
  const viewOf = (id = "g"): Group => {
    const view = stateOf(id).getViewComponent();
    if (!(view instanceof Group)) throw new Error(`no group component ${id}`);
    return view;
  };
  const boundState = (group: Group): GroupState => (group as unknown as TGroupInternals).groupState;
  const blockState = (id: string): BlockState => {
    const state = graph.rootStore.blocksList.getBlockState(id);
    if (!state) throw new Error(`no block state ${id}`);
    return state;
  };
  const outputPort = (id: string): PortState | undefined =>
    graph.rootStore.connectionsList.getPort(createBlockPointPortId(id, false));
  const inputPort = (id: string): PortState | undefined =>
    graph.rootStore.connectionsList.getPort(createBlockPointPortId(id, true));
  /** Removes group g and adds it back with the same id and this data, with no frame in between. */
  const readd = (group: TGroup | TCollapsibleGroup): void => {
    graph.rootStore.groupsList.deleteGroups(["g"]);
    graph.rootStore.groupsList.addGroup(group);
  };
  const click = (x: number, y: number): void => {
    const layer = graph.getGraphLayer();
    const at = { clientX: x, clientY: y };
    layer.handleEvent(new MouseEvent("mousemove", at));
    layer.handleEvent(new MouseEvent("mousedown", at));
    layer.handleEvent(new MouseEvent("mouseup", at));
    document.dispatchEvent(new MouseEvent("mouseup", at));
    layer.handleEvent(new MouseEvent("click", at));
    frames();
  };

  afterEach(() => {
    graph.unmount();
    jest.restoreAllMocks();
  });

  describe("Group", () => {
    it("binds the kept component to the new state, with its data, and unbinds the old one", () => {
      start({ id: "g", rect: RECT });
      const oldState = stateOf();
      const component = viewOf();
      readd({ id: "g", rect: TALL });
      frames();
      const newState = stateOf();
      expect(newState === oldState).toBe(false);
      expect(boundState(component) === newState).toBe(true);
      expect(newState.getViewComponent() === component).toBe(true);
      expect(oldState.getViewComponent()).toBeUndefined();
      expect(component.isEntityAvailable()).toBe(true);
      expect(component.state.rect).toEqual(TALL);
      // The hit box follows the new rect: (250, 215) is in its padding, below the old one.
      expect(graph.getElementOverPoint({ x: 250, y: 215 }) === component).toBe(true);
    });

    it("rebinds after setGroups replaced the list, and follows the new state only", () => {
      start({ id: "g", rect: RECT });
      const oldState = stateOf();
      const component = viewOf();
      graph.rootStore.groupsList.setGroups([]);
      graph.rootStore.groupsList.setGroups([{ id: "g", rect: RECT }]);
      frames();
      expect(boundState(component) === stateOf()).toBe(true);
      // The old state's subscriptions are gone: its writes reach nothing.
      oldState.updateGroup({ rect: TALL });
      frames();
      expect(component.state.rect).toEqual(RECT);
      stateOf().updateGroup({ rect: TALL });
      frames();
      expect(component.state.rect).toEqual(TALL);
    });

    it("selects the new state on a click through GraphLayer", () => {
      start({ id: "g", rect: RECT });
      const component = viewOf();
      readd({ id: "g", rect: RECT });
      frames();
      // Between the blocks, inside the group.
      click(250, 125);
      expect(stateOf().$selected.value).toBe(true);
      expect(component.state.selected).toBe(true);
    });

    it("accepts a drag that starts on it", () => {
      start({ id: "g", rect: RECT });
      const component = viewOf();
      readd({ id: "g", rect: RECT });
      frames();
      const layer = graph.getGraphLayer();
      layer.handleEvent(new MouseEvent("mousemove", { clientX: 250, clientY: 125 }));
      expect(layer.$hoveredComponent.value === component).toBe(true);
      layer.handleEvent(new MouseEvent("mousedown", { clientX: 250, clientY: 125 }));
      document.dispatchEvent(new MouseEvent("mousemove", { clientX: 250, clientY: 125 }));
      document.dispatchEvent(new MouseEvent("mousemove", { clientX: 270, clientY: 125 }));
      const drag = graph.dragService.$state.value;
      expect(drag.isDragging).toBe(true);
      expect(drag.components.includes(component)).toBe(true);
      document.dispatchEvent(new MouseEvent("mouseup", { clientX: 270, clientY: 125 }));
      frames();
    });

    it("rebinds nothing when its state is unchanged", () => {
      start({ id: "g", rect: RECT });
      const state = stateOf();
      const component = viewOf();
      const setView = jest.spyOn(state, "setViewComponent");
      // Another group joins: the layer reconciles g, and the store keeps its state.
      graph.rootStore.groupsList.addGroup({ id: "h", rect: { x: 0, y: 400, width: 100, height: 100 } });
      frames();
      expect(stateOf() === state).toBe(true);
      expect(viewOf() === component).toBe(true);
      expect(boundState(component) === state).toBe(true);
      expect(setView).not.toHaveBeenCalled();
    });
  });

  describe("CollapsibleGroup", () => {
    const collapsible = (collapsed: boolean, rect = RECT): TCollapsibleGroup => ({
      id: "g",
      rect,
      component: CollapsibleGroup,
      collapsed,
    });
    const collapse = (): CollapsibleGroup => {
      const component = viewOf();
      if (!(component instanceof CollapsibleGroup)) throw new Error("not a collapsible group");
      component.collapse();
      frames();
      return component;
    };
    const blockView = (id: string): ReturnType<BlockState["getViewComponent"]> => blockState(id).getViewComponent();

    it("shows the blocks and undelegates their ports when the group comes back expanded", () => {
      start(collapsible(false));
      const component = collapse();
      expect(blockState("a").$hidden.value).toBe(true);
      expect(outputPort("a")?.isDelegated).toBe(true);
      const oldState = stateOf();
      readd(collapsible(false));
      frames();
      expect(stateOf().getViewComponent() === component).toBe(true);
      expect(oldState.getViewComponent()).toBeUndefined();
      expect(component.isCollapsed()).toBe(false);
      for (const id of ["a", "b"]) {
        expect(blockState(id).$hidden.value).toBe(false);
        expect(blockView(id)?.isHiddenForOtherReason()).toBe(false);
        expect(outputPort(id)?.isDelegated ?? false).toBe(false);
        expect(inputPort(id)?.isDelegated ?? false).toBe(false);
      }
      // Hit and drawn where they are; the line starts at a's output port again.
      expect(graph.getElementOverPoint({ x: 150, y: 125 }) === blockView("a")).toBe(true);
      expect(graph.getElementOverPoint({ x: 350, y: 125 }) === blockView("b")).toBe(true);
      const source = graph.rootStore.connectionsList.getConnectionState("c")?.$geometry.value?.[0];
      expect(source).toEqual({ x: outputPort("a")?.$state.value.x, y: outputPort("a")?.$state.value.y });
      expect(component.state.collapsed).toBe(false);
    });

    it("keeps the collapse on the new state when it comes back collapsed, and expanding clears it", () => {
      start(collapsible(false));
      const component = collapse();
      const oldState = stateOf();
      readd(collapsible(true));
      frames();
      const newState = stateOf();
      expect(newState.getViewComponent() === component).toBe(true);
      expect((newState.$state.value as TCollapsibleGroup).collapsedRect).toBeDefined();
      expect(blockState("a").$hidden.value).toBe(true);
      expect(outputPort("a")?.isDelegated).toBe(true);
      component.expand();
      frames();
      expect((newState.$state.value as TCollapsibleGroup).collapsed).toBe(false);
      for (const id of ["a", "b"]) {
        expect(blockState(id).$hidden.value).toBe(false);
        expect(outputPort(id)?.isDelegated ?? false).toBe(false);
      }
      // The old state is no longer written.
      expect((oldState.$state.value as TCollapsibleGroup).collapsed).toBe(true);
    });

    it("ends a collapse made in the same frame when the new data names none", () => {
      start(collapsible(false));
      const component = viewOf();
      if (!(component instanceof CollapsibleGroup)) throw new Error("not a collapsible group");
      // No frame between the collapse, the removal and the re-add: the collapse is still pending in the component.
      component.collapse();
      readd({ id: "g", rect: RECT, component: CollapsibleGroup });
      frames();
      expect(component.isCollapsed()).toBe(false);
      expect(component.state.collapsed).toBeUndefined();
      expect(blockState("a").$hidden.value).toBe(false);
      expect(outputPort("a")?.isDelegated ?? false).toBe(false);
      // The expanded rect is hit, below the collapsed header.
      expect(graph.getElementOverPoint({ x: 250, y: 180 }) === component).toBe(true);
    });

    it("moves the collapse to a new state that comes back collapsed with data of its own", () => {
      start(collapsible(false));
      const component = collapse();
      readd({ ...collapsible(true, TALL), collapsedRect: { x: 80, y: 120, width: 200, height: 48 } });
      frames();
      // The new collapsed rect, padded: 60..300 x 100..188; the old one (60..300 x 60..148) is not hit at y 70.
      expect(graph.getElementOverPoint({ x: 150, y: 180 }) === component).toBe(true);
      expect(graph.getElementOverPoint({ x: 150, y: 70 }) === component).toBe(false);
      expect(outputPort("a")?.isDelegated).toBe(true);
      expect(blockState("b").$hidden.value).toBe(true);
    });

    it("rebinds a group that comes back collapsed in one batch: nothing reads its blocks shown in between", () => {
      start(collapsible(false));
      collapse();
      const port = outputPort("a");
      if (!port) throw new Error("no output port of a");
      const points: unknown[] = [];
      const hidden: boolean[] = [];
      const stops = [
        port.$point.subscribe((point) => points.push(point)),
        blockState("a").$hidden.subscribe((value) => hidden.push(value)),
      ];
      readd(collapsible(true));
      frames();
      stops.forEach((stop) => stop());
      // The port points at the group's edge before and after the rebind, and never at the block in between.
      expect(points).toHaveLength(1);
      expect(port.isDelegated).toBe(true);
      expect(hidden.every((value) => value)).toBe(true);
    });

    it("ends a collapse made in the same tick as its removal: the blocks are shown and their ports undelegated", () => {
      start(collapsible(false));
      const component = viewOf();
      if (!(component instanceof CollapsibleGroup)) throw new Error("not a collapsible group");
      // No frame between the collapse and the removal: the component's own state does not know of the collapse yet.
      component.collapse();
      graph.rootStore.groupsList.deleteGroups(["g"]);
      frames();
      expect(component.isMounted()).toBe(false);
      for (const id of ["a", "b"]) {
        expect(blockState(id).$hidden.value).toBe(false);
        expect(blockView(id)?.isHiddenForOtherReason()).toBe(false);
        expect(outputPort(id)?.isDelegated ?? false).toBe(false);
        expect(inputPort(id)?.isDelegated ?? false).toBe(false);
      }
    });

    describe.each([
      ["before a frame", false],
      ["with a frame between", true],
    ])("a member removed and added back with its membership %s, under a grouping layer", (_when, frameBetween) => {
      // The layer sets its groups again on every block change, so the collapsed group hides the new state again. Its
      // component binds in the frame (kept, or new after a frame), and the collapse delegates its ports then.
      it("stays hidden, and its ports stay delegated to the group's edge", () => {
        const root = document.createElement("div");
        Object.defineProperties(root, { clientWidth: { value: 1000 }, clientHeight: { value: 800 } });
        graph = new Graph({ settings: { useBezierConnections: false } }, root);
        graph.setEntities({
          blocks: [block("a", 100, "g"), block("b", 300, "g"), block("o", 700)],
          connections: [{ id: "c", sourceBlockId: "a", targetBlockId: "o" }],
        });
        graph.cameraService.set({ width: 1000, height: 800, x: 0, y: 0, scale: 1 });
        graph.start();
        graph.addLayer(Grouping, {});
        frames();
        collapse();
        const edge = outputPort("a")?.$point.value;
        expect(outputPort("a")?.isDelegated).toBe(true);
        graph.rootStore.blocksList.deleteBlocks(["a"]);
        if (frameBetween) frames();
        graph.rootStore.blocksList.addBlock(block("a", 100, "g"));
        frames();
        expect(blockState("a").$hidden.value).toBe(true);
        expect(blockView("a")?.isHiddenForOtherReason()).toBe(true);
        expect(outputPort("a")?.isDelegated).toBe(true);
        const source = graph.rootStore.connectionsList.getConnectionState("c")?.$geometry.value?.[0];
        expect(source).toEqual(edge);
        expect(source).not.toEqual({ x: 200, y: 125 });
      });
    });

    it("delegates each member of a bulk re-add once its component binds, not once per earlier bind", () => {
      /**
       * Calls of `delegateMemberPorts` while all `count` members of collapsed group g are removed and added back with
       * their membership in one batch, under the grouping layer, and their components bind in the next frames.
       */
      const bulkBindCalls = (count: number): number => {
        const root = document.createElement("div");
        Object.defineProperties(root, { clientWidth: { value: 1000 }, clientHeight: { value: 800 } });
        graph = new Graph({ settings: { useBezierConnections: false } }, root);
        const members = Array.from({ length: count }, (_, i) => block(`m${i}`, i * 120, "g"));
        graph.setEntities({ blocks: members, connections: [] });
        graph.cameraService.set({ width: 1000, height: 800, x: 0, y: 0, scale: 1 });
        graph.start();
        graph.addLayer(Grouping, {});
        frames();
        const component = collapse();
        const calls = jest.spyOn(
          component as unknown as { delegateMemberPorts(member: unknown): void },
          "delegateMemberPorts"
        );
        batch(() => {
          graph.rootStore.blocksList.deleteBlocks(members.map((each) => each.id));
          members.forEach((each) => graph.rootStore.blocksList.addBlock(each));
        });
        frames();
        // The outcome: every member is hidden again, with its output port delegated to the group's edge.
        expect(members.every((each) => blockState(String(each.id)).$hidden.value)).toBe(true);
        expect(members.every((each) => outputPort(String(each.id))?.isDelegated)).toBe(true);
        const made = calls.mock.calls.length;
        calls.mockRestore();
        graph.unmount();
        return made;
      };
      // About two calls per member: the collapse's own pass over its members, then the late bind of each. Quadratic
      // work would be about n² / 2: 55 for 10 members, 5,050 for 100.
      expect(bulkBindCalls(10)).toBeLessThanOrEqual(3 * 10);
      expect(bulkBindCalls(100)).toBeLessThanOrEqual(3 * 100);
      // afterEach unmounts the last graph again.
      start(collapsible(false));
    });

    describe("a block that leaves the collapsed group is shown, hit and owns its ports again", () => {
      /** a is shown and hit at its body, and the line c starts at a's own output port, not at the group's edge. */
      const expectLeft = (): void => {
        const view = blockView("a");
        expect(blockState("a").$hidden.value).toBe(false);
        expect(view?.isHiddenForOtherReason()).toBe(false);
        expect(graph.getElementOverPoint({ x: 150, y: 125 }, [Block]) === view).toBe(true);
        for (const port of [outputPort("a"), inputPort("a")]) expect(port?.isDelegated ?? false).toBe(false);
        const own = outputPort("a")?.$state.value;
        const source = graph.rootStore.connectionsList.getConnectionState("c")?.$geometry.value?.[0];
        expect(source).toEqual({ x: own?.x, y: own?.y });
        expect(source).toEqual({ x: 200, y: 125 });
        // b stays in the group: hidden, its ports delegated.
        expect(blockState("b").$hidden.value).toBe(true);
        expect(outputPort("b")?.isDelegated).toBe(true);
      };

      it("when it is removed and added back without its membership before a frame", () => {
        start(collapsible(false));
        collapse();
        expect(outputPort("a")?.isDelegated).toBe(true);
        graph.rootStore.blocksList.deleteBlocks(["a"]);
        graph.rootStore.blocksList.addBlock(block("a", 100));
        frames();
        expectLeft();
      });

      it("when it is removed and added back without its membership with a frame between", () => {
        start(collapsible(false));
        collapse();
        graph.rootStore.blocksList.deleteBlocks(["a"]);
        frames();
        graph.rootStore.blocksList.addBlock(block("a", 100));
        frames();
        expectLeft();
      });

      it("when its data leaves the group (updateBlock with no group)", () => {
        start(collapsible(false));
        collapse();
        graph.api.updateBlock({ id: "a", group: undefined });
        frames();
        expectLeft();
      });

      it("when its data moves it to another group", () => {
        start(collapsible(false));
        graph.rootStore.groupsList.addGroup({ id: "h", rect: { x: 80, y: 400, width: 140, height: 90 } });
        frames();
        collapse();
        graph.api.updateBlock({ id: "a", group: "h" });
        frames();
        expectLeft();
      });

      it("and the group's expand afterwards leaves it as it is", () => {
        start(collapsible(false));
        const component = collapse();
        graph.api.updateBlock({ id: "a", group: undefined });
        frames();
        component.expand();
        frames();
        expect(blockState("a").$hidden.value).toBe(false);
        expect(outputPort("a")?.isDelegated ?? false).toBe(false);
        expect(blockState("b").$hidden.value).toBe(false);
        expect(outputPort("b")?.isDelegated ?? false).toBe(false);
      });
    });
  });
});
