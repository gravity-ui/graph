# Working with Groups

Groups in the library provide a way to organize and manage collections of blocks. They support visual styling, behavior configuration, and geometric properties.

## How to Use Groups

There are two ways to work with groups:

### 1. Automatic Groups

Use this when you want groups to update automatically based on block properties. For example, you can group blocks by their color or type.

```typescript
import { BlockGroups, Graph, Group } from '@gravity-ui/graph';

const MyGroup = Group.define({
    style: {
        background: 'rgba(0, 200, 200, 0.2)',
        border: 'rgba(200, 200, 0, 0.2)',
    },
});

// Make groups automatically
const AutoGroups = BlockGroups.withBlockGrouping({
  // Put blocks in groups
  groupingFn: (blocks) => {
    const groups = {};
    blocks.forEach(block => {
      const groupId = block.type; // or any other property
      if (!groups[groupId]) groups[groupId] = [];
      groups[groupId].push(block);
    });
    return groups;
  },
  // Set how groups look
  mapToGroups: (groupId, { rect }) => ({
    id: groupId,
    rect,
    component: MyGroup,
  })
});

// Add groups to graph
graph.addLayer(AutoGroups, {
  draggable: true,  // groups can be moved
  updateBlocksOnDrag: true  // blocks move with group. Works only if group is draggable and used Automatic Groups 
});
```

### 2. Manual Groups

Use direct `BlockGroups` methods when you need manual control over groups. This approach is useful when:
- Groups are created/updated based on user actions
- You need custom group management logic
- Groups are independent of block properties

```typescript
import { Graph, BlockGroups } from '@gravity-ui/graph';

// Add groups to graph
const groups = graph.addLayer(BlockGroups, {
  draggable: true,
});

// Set groups
groups.setGroups([
  {
    id: "group1",
    rect: { x: 0, y: 0, width: 100, height: 100 },
    style: {
      background: "rgba(0, 100, 200, 0.1)"
    }
  }
]);

// Update specific groups
groups.updateGroups([
  {
    id: "group1",
    rect: { x: 50, y: 50, width: 100, height: 100 }
  }
]);
```

## Basic Usage

### Creating a Group

```typescript
import { Graph, BlockGroups } from '@gravity-ui/graph';

// Add fixed area groups to graph
const areas = graph.addLayer(BlockGroups, {
  draggable: false,  // areas cannot be moved
});

// Create fixed areas
areas.setGroups([
  {
    id: "area1",
    rect: { x: 0, y: 0, width: 800, height: 400 },
    style: {
      background: "rgba(100, 149, 237, 0.1)",
      border: "rgba(100, 149, 237, 0.3)"
    }
  },
  {
    id: "area2",
    rect: { x: 800, y: 0, width: 800, height: 400 },
    style: {
      background: "rgba(144, 238, 144, 0.1)",
      border: "rgba(144, 238, 144, 0.3)"
    }
  }
]);
```

Important: Dragging is not yet implemented properly for fixed area groups. Always set `draggable: false` for such groups. They should remain fixed while blocks can move freely between them.

## Group Settings

### Style
You can change how groups look:
```typescript
{
  background: "rgba(100, 100, 100, 0.1)",      // group color
  border: "rgba(100, 100, 100, 0.3)",         // border color
  borderWidth: 2,                             // border thickness
  selectedBackground: "rgba(100, 100, 100, 1)", // color when selected
  selectedBorder: "rgba(100, 100, 100, 1)",    // border when selected
  textColor: "rgba(0, 0, 0, 1)",              // text color
}
```

### Size and Space
You can set space around blocks in group:
```typescript
{
  padding: [20, 20, 20, 20]  // space at [top, right, bottom, left]
}
```

### Behavior
You can control how groups work:
```typescript
{
  draggable: true,           // can move group with mouse
  updateBlocksOnDrag: true   // blocks move with group. Works only if group is draggable and used Automatic Groups 
}
```

## API Reference

### BlockGroups Methods
```typescript
// Create or replace all groups
setGroups(groups: TGroup[]): void;

// Update some groups
updateGroups(groups: TGroup[]): void;
```

### Group Properties
```typescript
// What you can set in a group
{
  id: string;          // unique group ID
  rect: {             // where and how big
    x: number;
    y: number;
    width: number;
    height: number;
  };
  selected?: boolean;  // is it selected
  style?: {...};      // how it looks
}
```

## Advanced Usage

### Custom Group with Extended Properties

You can create your own group type with additional properties. The key is to pass your custom group component to `BlockGroups`. Here's a complete example:

```typescript
import { Graph, BlockGroups, Group } from '@gravity-ui/graph';

// 1. Define extended group type
interface ExtendedTGroup extends TGroup {
  description: string;
  priority: number;
}

// 2. Create custom group class
class CustomGroup extends Group<ExtendedTGroup> {
  protected override render() {
    super.render();
    const ctx = this.context.ctx;
    const rect = this.getRect();

    // Draw description
    if (this.state.description) {
      ctx.font = "12px Arial";
      ctx.fillStyle = this.style.textColor;
      ctx.fillText(this.state.description, rect.x + 10, rect.y + 25);
    }

    // Draw priority in top right corner
    if (this.state.priority) {
      ctx.font = "bold 14px Arial";
      const text = `P${this.state.priority}`;
      const textWidth = ctx.measureText(text).width;
      ctx.fillText(text, rect.x + rect.width - textWidth - 10, rect.y + 25);
    }
  }
}

// 3. Create groups with extended properties
const groups = graph.addLayer(BlockGroups, {
  draggable: false,
  groupComponent: CustomGroup, // Use our custom component
});

// 4. Set groups with extended properties
groups.setGroups([
  {
    id: "group1",
    description: "Contains critical blocks",
    priority: 1,
    rect: { x: 0, y: 0, width: 800, height: 400 }
  },
  {
    id: "group2",
    description: "Contains regular blocks",
    priority: 2,
    rect: { x: 850, y: 0, width: 800, height: 400 }
  }
]);
```

## Examples

You can find complete working examples in our Storybook stories:

1. **Basic Groups** ([`default.stories.tsx`](/src/stories/canvas/groups/default.stories.tsx))
   - Shows basic usage of automatic groups
   - Groups are created based on block properties
   - Demonstrates group styling and behavior

2. **Large Graph** ([`large.stories.tsx`](/src/stories/canvas/groups/large.stories.tsx))
   - Shows how to work with many blocks (225+)
   - Automatically groups every 10 blocks
   - Demonstrates performance with multiple groups

3. **Manual Groups** ([`manual.stories.tsx`](/src/stories/canvas/groups/manual.stories.tsx))
   - Shows how to create fixed area groups
   - Creates non-draggable zones with different colors
   - Demonstrates manual group management

4. **Extended Groups** ([`extended.stories.tsx`](/src/stories/canvas/groups/extended.stories.tsx))
   - Shows how to create custom groups with extended properties
   - Adds description and priority to groups
   - Demonstrates custom rendering and styling

Each example includes different styling approaches and group configurations that you can use as a reference for your own implementation.
