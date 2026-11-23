# Anchors Documentation

Anchors are connection points on blocks that allow creating connections between blocks. This document describes the anchor structure, behavior, and how to properly configure them.

> **Note:** Anchors are optional in the graph system. You can create graphs without anchors by setting the `useBlocksAnchors` setting to `false`. With the setting off, blocks draw no anchor components. Connections that name no anchor (`sourceAnchorId` / `targetAnchorId` omitted) attach to the blocks' own connection points. A connection that does name an anchor keeps resolving to that anchor's port: it is drawn when the graph starts with the setting off, and hidden when the setting is turned off at runtime (see [below](#drawing-and-lazy-creation)).

## Drawing and lazy creation

An anchor's canvas component is `Anchor`, a retained [scene component](block-component.md#scene-components). It owns
a child element of its block's element (see [Scene](../system/scene.md#child-elements)):

- it draws right above its block, ordered among the block's anchors and children, and under the next block;
- it is hidden while its block is hidden (handed over to HTML, or in a collapsed group) and rises with its block when
  the block is selected or dragged;
- it takes its block's element `dim` and `opacity`, so a focus rule that dims a block dims its anchors;
- it is hit in its block's scene order: an upper block covers the anchors of a lower one, for the pointer too.

**Look.** The `anchor` part is the dot, the `border` part a ring around it. The theme colours the dot with
`colors.anchor.background` and the ring with `colors.anchor.selectedBorder`, hides the ring, and shows it while the
anchor is selected (`selectedTag`). While the anchor is hovered (`hoveredTag`) the theme scales both parts by
`Anchor.CANVAS_HOVER_FACTOR` (1.8). Restyle them with rules on `Anchor` (see
[Default block and anchor parts](../system/tags-and-styles.md#default-block-and-anchor-parts)).

**Hover and events.** An anchor puts `hoveredTag` on itself while it is the pointer's target. It stops its clicks and
presses: a click toggles its selection and does not reach its block. Its `mouseenter` and `mouseleave` go on to its
block, which stays hovered while the pointer is on the anchor (see
[Child components](block-component.md#child-components)).

**Levels.** The stock anchor is drawn on the schematic level only. It is hit there, and wherever its block is shown
outside the scene: at the detailed level while an HTML view holds its block (React draws anchors there, and a click on
that HTML is the graph's click on the anchor), and on every level after `setRenderDelegated(true)`. Elsewhere it is
not hit: the block under it is.

- On the minimalistic level it has no look and is not hit, so gestures that start on an anchor (connection creation,
  anchor selection, hover) start from the schematic level on.
- At the detailed level without an HTML view it draws nothing and is not hit.
- A subclass is hit on the levels its own look is drawn on, or on those its `static hitLevels` declares.
- The anchors of a block that a collapsed group hides take no hits on any level.

**Lazy creation.** A block creates its anchor components once the camera shows it (its rect, an anchor point outside
it, or an anchor's look within the `LOOK_EXTENT` of its class, as an export finds them) on the levels its anchor
class's `static CREATION_LEVELS` lists (schematic and detailed by default). A class whose look draws at the
minimalistic level declares that level there; development builds warn when it does not. The block keeps them until
its anchor list changes, `useBlocksAnchors` turns off or the block unmounts. A camera without a size (a graph not laid
out yet) counts as showing every block.
Until its anchors exist, the block owns their ports and positions them, so connections attach to anchors either way.
Consequences:

- `AnchorState.getViewComponent()` is `undefined` for a block the camera never showed on a level of its anchor
  classes' `CREATION_LEVELS`. It is reactive: it reads `$viewComponentReady`.
- Read an anchor's position from its port (`block.getAnchorPort(anchorId).getPoint()`), not from its component.
- An anchor port's `owner` is the `Block` until the anchor component exists.
- `graph.getElementsOverPoint()`, `graph.getElementsOverRect()` and the anchor selection bucket's
  `$selectedComponents` return created anchors only. The hit queries leave out the anchors the current level does not
  hit (see **Levels** above).
- Override the protected `Block.shouldCreateAnchors()` to create anchors on other terms. It is asked in the block's
  updates and after camera changes that show the block.
- `graph.scene.toImage()` creates the anchors an export needs and drops them after the draw (see
  [toImage](../system/scene.md#toimage)).

**`useBlocksAnchors` at runtime.** Turning it off unmounts the anchor components and hides the connections attached to
anchors; turning it on shows them again. A graph that starts with it off draws those connections.

**Custom anchors.** Override `Block.getAnchorClass(anchor)` to return another `Anchor` class, per anchor. The block
creates the component with the anchor's data, its port and the class's statics:

- `SIZE` (default 18): the dot's diameter, passed as the anchor's `size`;
- `LINE_WIDTH` (default 2): passed as its `lineWidth`;
- `LOOK_EXTENT` (default 11.5, the stock dot and ring): how far its look reaches from the anchor's point;
- `CREATION_LEVELS` (default schematic and detailed): the levels blocks create it on.

Creating anchors at the minimalistic level is costly at a far zoom, where the camera shows many blocks. Measured on an
Apple M3 Pro with 10,000 blocks and about 40,000 anchors, all of a class created at the minimalistic level, at scale
0.038: each Canvas 2D pan frame takes about 31 ms more (45 ms instead of 14 ms), and the page heap grows by about
200 MB. WebGL pan frames take no longer. Add the minimalistic level only to anchor classes that must show there.

A class describes its look with level methods declared on its prototype. A look that reaches farther than
`LOOK_EXTENT` from the anchor's point declares its own extent:
`public static override LOOK_EXTENT = 40;`. An anchor class has no props of its own. It reads what it needs from the
anchor (`this.props.type`, `this.props.index`) and from its block's data in a method of its own, and it shows states
with tags. The block can return a different anchor class as its own data changes.
If the same custom anchor draws from a parent field, read that field in the level method and call
`this.invalidateChildren()` in the block's `stateChanged(next)` when that field changes. This also updates an
anchor drawing from local block state that is absent from the model.

```typescript
import { Anchor, CanvasBlock } from "@gravity-ui/graph";
import type { TAnchor, TAnchorClass, TScenePrimitive } from "@gravity-ui/graph";

class SquareAnchor extends Anchor {
  public static override SIZE = 14;
  public static override LOOK_EXTENT = 10;

  protected override schematic(): readonly TScenePrimitive[] {
    return [{ kind: "rect", part: "anchor", x: -7, y: -7, width: 14, height: 14 }];
  }
}

class SquareOutBlock extends CanvasBlock {
  protected override getAnchorClass(anchor: TAnchor): TAnchorClass {
    return anchor.type === "OUT" ? SquareAnchor : Anchor;
  }
}
```

`getAnchorClass` is a pure function of the anchor and the block's data (`this.state`, `this.props`,
`this.connectedState`), without side effects. If it throws, the block keeps its last successful choice of classes
and reports the error in every build. It reports a new failure after the hook succeeds again.

## Anchor Structure

Anchors are defined using the `TAnchor` interface:

```typescript
export type TAnchor = {
  id: string;           // Unique identifier for the anchor
  blockId: TBlockId;    // ID of the block this anchor belongs to
  type: EAnchorType | string; // Conventionally IN or OUT; any string is accepted
  index?: number;       // Optional index for ordering anchors of the same type
};
```

### Key Properties

1. **id**: A unique identifier for the anchor within the block. This is used to reference the anchor in connections and for selection. Other blocks may use the same ID; selection and tags name an anchor by its block-qualified [entity ID](#anchor-entity-ids).

2. **blockId**: The ID of the block this anchor belongs to. This is critical for the anchor to be properly associated with its parent block and for the selection system to work correctly.

3. **type**: The type of anchor. The conventional values are the `EAnchorType` enum below (`IN` and `OUT`); the type accepts any string, and a type other than `OUT` is positioned on the input side:
   ```typescript
   export enum EAnchorType {
     IN = "IN",   // Input anchor (can receive connections)
     OUT = "OUT", // Output anchor (can initiate connections)
   }
   ```

4. **index**: An optional numeric value that determines the order of anchors of the same type. This affects the visual positioning of anchors on the block.

## Configuring Anchors and Connections

When defining blocks in your graph configuration, you can configure anchors and connections between them:

```typescript
const graphConfig = {
  blocks: [
    {
      id: "block1",
      is: "Block",
      x: 100,
      y: 100,
      width: 150,
      height: 80,
      name: "Source Block",
      anchors: [
        {
          id: "out1",
          blockId: "block1", // Must match the parent block's ID
          type: EAnchorType.OUT,
          index: 0
        }
      ]
    },
    {
      id: "block2",
      is: "Block",
      x: 400,
      y: 200,
      width: 150,
      height: 80,
      name: "Target Block",
      anchors: [
        {
          id: "in1",
          blockId: "block2", // Must match the parent block's ID
          type: EAnchorType.IN,
          index: 0
        }
      ]
    }
  ],
  connections: [
    {
      id: "conn1",
      sourceBlockId: "block1",
      sourceAnchorId: "out1", // Reference to the source anchor
      targetBlockId: "block2",
      targetAnchorId: "in1", // Reference to the target anchor
    }
  ]
};
```

## Dynamic Anchor Creation

When creating blocks dynamically, ensure you set the correct `blockId` for each anchor:

```typescript
// Create a new block with a unique ID
const newBlockId = `block-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

const blockId = graph.api.addBlock({
  id: newBlockId, // Explicitly set the block ID
  is: "Block",
  x: 100,
  y: 100,
  width: 150,
  height: 80,
  name: "New Block",
  anchors: [
    {
      id: "in",
      blockId: newBlockId, // Use the same ID as the block
      type: EAnchorType.IN,
      index: 0
    },
    {
      id: "out",
      blockId: newBlockId, // Use the same ID as the block
      type: EAnchorType.OUT,
      index: 0
    }
  ]
});
```

## Anchor Selection

Anchors can be selected programmatically or through user interaction. The selection state is managed by the `AnchorState` class:

```typescript
// Get the anchor state
const anchorState = block.getAnchorState("anchorId");

// Select the anchor
anchorState.setSelection(true);

// Deselect the anchor
anchorState.setSelection(false);

// Or by block and anchor ID
graph.api.setAnchorSelection("block1", "out1", true);
```

## Anchor entity IDs

An anchor ID is unique only within its block, so two blocks may both have an anchor `"out"`. Selection and tags name
an anchor by its **entity ID**, which includes the block ID:

```typescript
import { anchorEntityId, parseAnchorEntityId } from "@gravity-ui/graph";

anchorEntityId("block1", "out1"); // '["block1","out1"]'
parseAnchorEntityId('["block1","out1"]'); // { blockId: "block1", anchorId: "out1" }
```

The entity ID is `JSON.stringify([blockId, anchorId])`. JSON escaping keeps it unambiguous whatever characters the IDs
contain, and a number block or anchor ID stays a number (`[7,"out1"]`, `["block1",0]`). Build it with `anchorEntityId`
and read it with `parseAnchorEntityId` (it returns `undefined` for any other string) rather than assembling it by hand.

The entity ID is used by:

- the anchor selection bucket: `graph.selectionService.$selection.value.get("anchor")`,
  `blocksList.anchorSelectionBucket` and `graph.selectionService.select("anchor", [anchorEntityId(blockId, anchorId)])`;
- tags: `selectedTag` and `hoveredTag` members of type `"anchor"`, `graph.scene.tags.add(tag, { anchor: [id] })`,
  `graph.scene.tags.$of("anchor", id)` and `graph.scene.explain("anchor", id)`;
- `AnchorState.entityId` and the canvas `Anchor.getEntityId()` (the anchor's own ID stays in `AnchorState.id`,
  `Anchor.props.id` and `TAnchor.id`).

`graph.api.setAnchorSelection(blockId, anchorId, selected)`, `AnchorState.setSelection()`, `AnchorState.$selected`,
`BlockState.$selectedAnchors` and the `block-anchor-selection-change` event (its `detail.anchor` is the `TAnchor`, with
`blockId` and `id`) take or give the block and anchor IDs as before.

## Anchor Positioning

The position of anchors is determined by the block's geometry and the anchor's type and index. The `Block` class provides methods to get the position of an anchor:

```typescript
// Get the position of an anchor
const anchor = block.connectedState.$anchors.value.find((item) => item.id === anchorId);
const position = anchor && block.getAnchorPosition(anchor); // takes the TAnchor, not its id
```

## Anchor Positioning and Block Height

The vertical position of anchors is determined by the block's constants, specifically `HEAD_HEIGHT` and `BODY_PADDING`. These constants are defined in the graph configuration and affect where anchors are placed on blocks.

```typescript
// From Block.ts - getAnchorPosition method
const offset = this.context.constants.block.HEAD_HEIGHT + this.context.constants.block.BODY_PADDING;
return {
  x: anchor.type === EAnchorType.OUT ? this.state.width : 0,
  y: offset + index * this.context.constants.system.GRID_SIZE * 2,
};
```

### Important Considerations for Block Height

1. **Default Constants**: By default, `HEAD_HEIGHT` is 64px and `BODY_PADDING` is 24px, resulting in an 88px vertical offset for the first anchor.

2. **Small Blocks Warning**: If your blocks have a small height (e.g., less than 90px), the anchors may appear below the actual block. To fix this:
   - Set `HEAD_HEIGHT` to 0 or a smaller value
   - Reduce `BODY_PADDING` as needed

3. **Custom Configuration Example**:
   ```javascript
   const graph = new Graph({
     constants: {
       block: {
         HEAD_HEIGHT: 0,  // Remove header height for small blocks
         BODY_PADDING: 8  // Reduce padding for better anchor positioning
       }
     },
     // other configuration...
   }, container);
   ```

4. **Anchor Index Impact**: Each additional anchor is positioned with an offset of `GRID_SIZE * 2` (default 32px). Consider this when determining how many anchors can fit on a block of a given height.
