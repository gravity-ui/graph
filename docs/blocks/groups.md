# Groups: cookbook

Groups draw a **frame** behind (or around) blocks: swimlanes, clusters by type, or collapsible regions. This page is organized by **what you want to do**; implementation details appear where they help you wire the behavior.

## Quick pick


| I want to…                                                                     | Start here                                                                |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| Paint fixed zones (swimlanes) that don’t move                                  | [Fixed zones](#recipe-fixed-zones-swimlanes)                              |
| Wrap blocks that share a field (e.g. `type`, `group`) in a live-updating frame | [Automatic grouping](#recipe-automatic-grouping-frame-follows-blocks)     |
| Drag the frame and move inner blocks together                                  | [Drag frame + blocks](#recipe-drag-the-frame-and-move-inner-blocks)       |
| Collapse a group to a compact header and keep connections sensible             | [Collapsible groups](#recipe-collapsible-groups)                          |
| Shift other nodes when collapse changes height/width                           | [Reflow on collapse](#recipe-reflow-the-graph-when-collapse-changes-size) |
| Control where the collapsed header sits or its size                            | [Custom collapse rect](#recipe-custom-collapsed-header-position-and-size) |
| Draw extra labels or chrome on the frame                                       | [Custom group component](#recipe-custom-group-rendering)                  |


---

## Recipe: fixed zones (swimlanes)

**Goal:** Background areas with borders (e.g. “Team A / Team B”), while blocks move freely inside.

**Do this:**

1. Add `BlockGroups` with `draggable: false`.
2. Call `setGroups` with explicit `rect` and `style`.

```typescript
import { Graph, BlockGroups } from "@gravity-ui/graph";

const areas = graph.addLayer(BlockGroups, {
  draggable: false,
});

areas.setGroups([
  {
    id: "area1",
    rect: { x: 0, y: 0, width: 800, height: 400 },
    style: {
      background: "rgba(100, 149, 237, 0.1)",
      border: "rgba(100, 149, 237, 0.3)",
    },
  },
]);
```

**Why:** Manual `rect` means **you** own position and size. Automatic grouping (below) recomputes rects from blocks; for static lanes you usually want full control.

**See also:** [Manual Groups story](/src/stories/canvas/groups/manual.stories.tsx) — fixed colored zones.

---

## Recipe: automatic grouping (frame follows blocks)

**Goal:** Whenever blocks move, the group border **tight-wraps** a set of blocks (with optional padding), e.g. all blocks with `group: "cluster-1"`.

**Do this:**

1. Call the **static** helper `BlockGroups.withBlockGrouping({ groupingFn, mapToGroups })`. It returns a **layer constructor** (a new subclass of `BlockGroups`); pass that constructor to `graph.addLayer(...)`, not `BlockGroups` itself.
2. `groupingFn(blocks)` receives **all** `BlockState[]` from the store and must return `Record<string, BlockState[]>` — one entry per group id, values are the member blocks.
3. For each entry, the library computes `rect` with `getBlocksRect` from the blocks in that bucket, then calls `mapToGroups(key, { blocks, rect })`. You usually pass `rect` through (or inflate it with padding); use `blocks` when your group metadata depends on membership.

```typescript
import { BlockGroups, Group } from "@gravity-ui/graph";
import type { BlockState } from "@gravity-ui/graph";

const MyGroup = Group.define({
  style: {
    background: "rgba(0, 200, 200, 0.2)",
    border: "rgba(200, 200, 0, 0.2)",
  },
});

const AutoGroups = BlockGroups.withBlockGrouping({
  groupingFn: (blocks: BlockState[]) => {
    const byGroup: Record<string, BlockState[]> = {};
    for (const block of blocks) {
      const groupId = block.$state.value.group;
      if (!groupId) {
        continue;
      }
      if (!byGroup[groupId]) {
        byGroup[groupId] = [];
      }
      byGroup[groupId].push(block);
    }
    return byGroup;
  },
  mapToGroups: (groupId, { rect }) => ({
    id: groupId,
    // `rect` is already the axis-aligned bounds of that bucket’s blocks (getBlocksRect in the layer).
    // Add padding here if needed, e.g. { x: rect.x - 8, y: rect.y - 8, ... }.
    rect,
    component: MyGroup,
  }),
});

graph.addLayer(AutoGroups, { draggable: true });
```

**Why:** A computed signal runs `mapToGroups` whenever blocks change, then calls `setGroups` on the layer — the frame stays aligned with data.

**See also:** [Basic Groups](/src/stories/canvas/groups/default.stories.tsx), [Large graph](/src/stories/canvas/groups/large.stories.tsx).

---

## Recipe: drag the frame and move inner blocks

**Goal:** User drags the group border; blocks inside move by the same delta (not only when dragging each block).

**Do this:**

- Use **automatic grouping** (`withBlockGrouping`) so the layer knows which blocks belong to which group.
- Enable both:

```typescript
graph.addLayer(AutoGroups, {
  draggable: true,
  updateBlocksOnDrag: true,
});
```

**Why:** `updateBlocksOnDrag` only applies when the layer can resolve group membership from the automatic grouping pipeline.

---

## Recipe: collapsible groups

**Goal:** A group can **collapse** to a small header: inner blocks are hidden visually, but stay in the store; connections can **attach to the group edges** instead of hidden block ports (via port delegation — see [Connection system](../connections/canvas-connection-system.md)).

**Do this:**

1. Use `CollapsibleGroup` as the group `component` in `mapToGroups` (or in manual `setGroups`).
2. Put `group: "<groupId>"` on each `TBlock` that belongs to that frame.
3. **There is no built-in collapse button.** Subscribe to an interaction (commonly `dblclick` on the group) and call `collapse()` / `expand()` on the `CollapsibleGroup` instance.

```typescript
import { CollapsibleGroup } from "@gravity-ui/graph";
// inside mapToGroups, or manual group object:
{
  id: "my-group",
  rect: { /* ... */ },
  component: CollapsibleGroup,
  collapseDirection: { x: "center", y: "center" },
}
```

```typescript
// React: toggle on double-click
useGraphEvent(graph, "dblclick", ({ target }) => {
  if (target instanceof CollapsibleGroup) {
    if (target.isCollapsed()) {
      target.expand();
    } else {
      target.collapse();
    }
  }
});
```

**Why:** Collapse state lives on the group; programmatic API keeps the same behavior whether you use a toolbar, keyboard shortcut, or canvas double-click.

**See also:** [Collapsible Groups story](/src/stories/canvas/groups/collapsible.stories.tsx).

---

## Recipe: reflow the graph when collapse changes size

**Goal:** When a group collapses or expands, **something else** on the canvas should move (e.g. nodes below shift up, or side panels reflow).

**Do this:**

Listen for the `**group-collapse-change`** event. It fires **before** the rect change is applied; you can `**preventDefault()`** to cancel the transition.

Payload includes `groupId`, `collapsed`, `currentRect`, and `nextRect` — use the delta between `currentRect` and `nextRect` to update other block positions or run your layout.

```typescript
useGraphEvent(graph, "group-collapse-change", (detail, event) => {
  const { groupId, currentRect, nextRect } = detail;
  // Example: nudge other blocks by (nextRect.height - currentRect.height) on Y
});
```

**Why:** The graph does not auto-layout unrelated nodes; you decide what “reflow” means for your app.

---

## Recipe: custom collapsed header position and size

**Goal:** Control where the collapsed strip appears (e.g. centered title bar) or exact width/height.

**Do this:**

- `**collapseDirection`** — pins the default 200×48 header to `start` | `center` | `end` on each axis (see `TCollapsibleGroup` in source).
- `**getCollapseRect(group, expandedRect)`** — full control: return any `TRect` for the collapsed hit-test and draw area.

**Why:** Default behavior is a small header; custom `getCollapseRect` is for branded headers or wide title bars.

---

## Recipe: custom group rendering

**Goal:** Extra text, badges, or drawing beyond the default fill/stroke.

**Do this:**

1. Extend `Group` (or `CollapsibleGroup`) and override `render()` (after `super.render()` if you keep base chrome).
2. Pass `groupComponent: YourGroup` to `graph.addLayer(BlockGroups, { groupComponent: YourGroup, ... })`.
3. For typed extra fields, extend `TGroup` / `TCollapsibleGroup` and pass those fields from `setGroups` / `mapToGroups`.

**See also:** [Extended Groups story](/src/stories/canvas/groups/extended.stories.tsx).

Example shape (abbreviated):

```typescript
import { Graph, BlockGroups, Group } from "@gravity-ui/graph";
import type { TGroup } from "@gravity-ui/graph";

interface ExtendedTGroup extends TGroup {
  description?: string;
}

class CustomGroup extends Group<ExtendedTGroup> {
  protected override render(): void {
    super.render();
    const ctx = this.context.ctx;
    const rect = this.getRect();
    if (this.state.description) {
      ctx.font = "12px Arial";
      ctx.fillStyle = this.style.textColor;
      ctx.fillText(this.state.description, rect.x + 10, rect.y + 25);
    }
  }
}

const groups = graph.addLayer(BlockGroups, {
  draggable: false,
  groupComponent: CustomGroup,
});

groups.setGroups([
  {
    id: "group1",
    description: "Contains critical blocks",
    rect: { x: 0, y: 0, width: 800, height: 400 },
  },
]);
```

---

## Style and layout knobs

Common fields on group data / `Group.define`:

```typescript
// Visuals
{
  background: "rgba(100, 100, 100, 0.1)",
  border: "rgba(100, 100, 100, 0.3)",
  borderWidth: 2,
  selectedBackground: "rgba(100, 100, 100, 1)",
  selectedBorder: "rgba(100, 100, 100, 1)",
  textColor: "rgba(0, 0, 0, 1)",
}

// Padding inside the frame (top, right, bottom, left)
{
  padding: [20, 20, 20, 20],
}
```

Layer props:

```typescript
{
  draggable: true,           // user can drag the group frame
  updateBlocksOnDrag: true,  // move member blocks with the frame (automatic grouping)
}
```

---

## API cheat sheet

```typescript
// Replace all groups
groups.setGroups(groups: TGroup[]): void;

// Patch by id
groups.updateGroups(groups: Partial<TGroup> & { id: string }[]): void;
```

`TGroup` always includes `id` and `rect`; optional `selected`, `style`, and component-specific fields (e.g. `collapsed` on `TCollapsibleGroup`).

---

## Storybook index


| Story                                                             | What it demonstrates                                  |
| ----------------------------------------------------------------- | ----------------------------------------------------- |
| [default](/src/stories/canvas/groups/default.stories.tsx)         | Automatic groups from block properties                |
| [large](/src/stories/canvas/groups/large.stories.tsx)             | Many blocks / groups                                  |
| [manual](/src/stories/canvas/groups/manual.stories.tsx)           | Fixed non-draggable zones                             |
| [extended](/src/stories/canvas/groups/extended.stories.tsx)       | Custom group class + extra fields                     |
| [collapsible](/src/stories/canvas/groups/collapsible.stories.tsx) | `CollapsibleGroup`, dblclick, `group-collapse-change` |


---

## Related docs

- [Connection system](../connections/canvas-connection-system.md) — ports, and **port delegation** when groups collapse.

