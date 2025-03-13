# Cursor Rules for Using GraphComponent

## Overview

This document outlines the rules and best practices for using the `GraphComponent` class in your graph applications. The `GraphComponent` serves as the base component for elements that need to be drawn on the graph or layers.

## When to Use GraphComponent

- Use `GraphComponent` when you need to create visual elements that:
  - Need to be drawn on the graph canvas
  - Require hit testing for interaction
  - Need to respond to user events
  - Should be visible only when in the camera viewport

- Common use cases:
  - Custom blocks or nodes
  - Connection lines or edges
  - Decorations and visual indicators
  - Interactive controls on the graph

## How to Use GraphComponent

### 1. Creating a New Component

When creating a new visual component for your graph:

```typescript
import { GraphComponent } from "../path/to/GraphComponent";

// Extend GraphComponent for your custom element
export class MyCustomNode extends GraphComponent {
  // Your implementation
}
```

### 2. Defining Component Properties

Define the properties your component needs:

```typescript
// Define the props your component accepts
type MyNodeProps = {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
};

// Define the state your component maintains
type MyNodeState = {
  isHovered: boolean;
  isSelected: boolean;
};

// Create your component with typed props and state
export class MyCustomNode extends GraphComponent<MyNodeProps, MyNodeState> {
  // Implementation
}
```

### 3. Initializing Your Component

Properly initialize your component in the constructor:

```typescript
constructor(props: MyNodeProps, parent: Component) {
  // Always call super with props and parent
  super(props, parent);
  
  // Initialize your component's state
  this.state = {
    isHovered: false,
    isSelected: false,
  };
  
  // Set up the hit box for interaction
  this.setHitBox(
    props.x, 
    props.y, 
    props.x + props.width, 
    props.y + props.height
  );
}
```

### 4. Implementing Visual Rendering

Implement the `render` method to draw your component:

```typescript
protected render() {
  const ctx = this.context.ctx;
  const { x, y, width, height, label, color } = this.props;
  
  // The camera automatically handles all transformations
  // Just use your component's coordinates directly
  
  // Draw your component
  ctx.fillStyle = color || 'blue';
  ctx.fillRect(x, y, width, height);
  
  // Draw label
  ctx.fillStyle = 'white';
  ctx.font = '12px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + width/2, y + height/2);
}
```

### 5. Handling User Interaction

Set up event handling for your component:

```typescript
constructor(props: MyNodeProps, parent: Component) {
  super(props, parent);
  
  // Register for events you want to handle
  this.addEventListener('mouseenter', this);
  this.addEventListener('mouseleave', this);
  this.addEventListener('click', this);
}

// Implement the handleEvent method
public handleEvent(event: Event) {
  switch (event.type) {
    case 'mouseenter':
      // Use setState to update state, never mutate directly
      this.setState({ isHovered: true });
      break;
    case 'mouseleave':
      this.setState({ isHovered: false });
      break;
    case 'click':
      this.setState({ isSelected: !this.state.isSelected });
      break;
  }
}
```

### 6. Cleaning Up Resources

Always clean up resources when your component is unmounted:

```typescript
protected unmount() {
  // Clean up any subscriptions or timers
  this.unsubscribe.forEach(unsub => unsub());
  
  // Clean up the hit box
  this.destroyHitBox();
  
  // Always call super.unmount() last
  super.unmount();
}
```

## Best Practices

### 1. Hit Box Management

- Always set up a hit box for your component to enable interaction:

```typescript
// Set up hit box in constructor or when geometry changes
this.setHitBox(x, y, x + width, y + height);
```

- Update the hit box whenever your component's position or size changes:

```typescript
public updatePosition(x: number, y: number) {
  // Use setProps to update props, never mutate directly
  this.setProps({
    x: x,
    y: y
  });
  
  // Update hit box with new position
  this.setHitBox(
    this.props.x, 
    this.props.y, 
    this.props.x + this.props.width, 
    this.props.y + this.props.height
  );
}
```

### 2. State and Props Management

- Never mutate state or props directly:

```typescript
// INCORRECT - Direct mutation
this.state.isSelected = true; // ❌ Don't do this
this.props.x = 100; // ❌ Don't do this

// CORRECT - Use setState and setProps
this.setState({ isSelected: true }); // ✅ Do this
this.setProps({ x: 100 }); // ✅ Do this
```

- Use partial updates when needed:

```typescript
// Only update the properties that changed
this.setState({
  isHovered: true
  // Other state properties remain unchanged
});

this.setProps({
  x: newX,
  y: newY
  // Other props remain unchanged
});
```

- State and props updates trigger rendering automatically:

```typescript
// No need to call performRender() after setState or setProps
this.setState({ isSelected: true });
// The component will re-render automatically
```

### 3. Efficient Rendering

- Only render when necessary:

```typescript
// Only update state and render when needed
if (newValue !== this.state.currentValue) {
  this.setState({ currentValue: newValue });
  // No need to call performRender() - setState handles this
}
```

### 4. Working with Coordinates

- Use graph coordinates directly in your component:

```typescript
protected render() {
  const ctx = this.context.ctx;
  
  // Use graph coordinates directly
  // The camera system automatically handles transformations
  ctx.fillRect(this.props.x, this.props.y, this.props.width, this.props.height);
}
```

- For converting screen coordinates to graph coordinates, use the camera's transformation methods:

```typescript
// Transform a point from screen coordinates to graph coordinates
const graphPoint = this.context.camera.applyToPoint(screenX, screenY);

// Use the transformed coordinates
const [x, y] = graphPoint;
```

### 5. Event Handling

- Register for only the events you need:

```typescript
// Only register for events you actually handle
this.addEventListener('click', this);
this.addEventListener('mousedown', this);
```

- Use event delegation when appropriate:

```typescript
// For components with many child elements, handle events at the parent level
public handleEvent(event: Event) {
  // Determine which child was clicked
  const target = event.target;
  
  // Handle the event accordingly
  if (target === this.headerElement) {
    this.handleHeaderClick(event);
  } else if (target === this.bodyElement) {
    this.handleBodyClick(event);
  }
}
```

## Common Patterns

### 1. Draggable Component

```typescript
import { GraphComponent } from "../path/to/GraphComponent";

export class DraggableNode extends GraphComponent {
  private initialX: number;
  private initialY: number;
  
  constructor(props, parent) {
    super(props, parent);
    
    // Set up hit box
    this.setHitBox(
      props.x, 
      props.y, 
      props.x + props.width, 
      props.y + props.height
    );
    
    // Set up drag handling using the onDrag method
    this.onDrag({
      onDragStart: (event) => {
        // Store initial position when drag starts
        this.initialX = this.props.x;
        this.initialY = this.props.y;
      },
      onDragUpdate: (diff, event) => {
        // Calculate new position based on the drag difference
        const newX = this.initialX - diff.diffX;
        const newY = this.initialY - diff.diffY;
        
        // Update component position using setProps
        this.setProps({
          x: newX,
          y: newY
        });
        
        // Update hit box with new position
        this.setHitBox(
          this.props.x, 
          this.props.y, 
          this.props.x + this.props.width, 
          this.props.y + this.props.height
        );
      },
      onDrop: (event) => {
        // Optional: Handle any cleanup or finalization when drag ends
        console.log("Drag ended at position:", this.props.x, this.props.y);
      }
    });
  }
  
  protected render() {
    const ctx = this.context.ctx;
    const { x, y, width, height } = this.props;
    
    // Draw the node
    ctx.fillStyle = 'blue';
    ctx.fillRect(x, y, width, height);
  }
}
```

### 2. Selectable Component

```typescript
import { GraphComponent } from "../path/to/GraphComponent";

export class SelectableNode extends GraphComponent {
  constructor(props, parent) {
    super(props, parent);
    
    this.state = {
      isSelected: false
    };
    
    // Register for selection events
    this.addEventListener('click', (event: Event) => {
        // Use setState to update state
        this.setState({
            isSelected: !this.state.isSelected
        });
    });
    
    // Set up hit box
    this.setHitBox(
      props.x, 
      props.y, 
      props.x + props.width, 
      props.y + props.height
    );
  }
  
  protected render() {
    const ctx = this.context.ctx;
    const { x, y, width, height } = this.props;
    
    // Draw differently based on selection state
    if (this.state.isSelected) {
      // Draw selection indicator
      ctx.strokeStyle = 'red';
      ctx.lineWidth = 2;
      ctx.strokeRect(x - 2, y - 2, width + 4, height + 4);
    }
    
    // Draw the node
    ctx.fillStyle = 'blue';
    ctx.fillRect(x, y, width, height);
  }
}
```

## Common Mistakes to Avoid

1. **Not Setting Up Hit Box**: Always set up a hit box for your component to enable interaction.

2. **Manually Managing Transformations**: Don't try to manage camera transformations yourself. The system handles this automatically.

3. **Not Cleaning Up Resources**: Always clean up resources (hit boxes, event listeners) when your component is unmounted.

4. **Direct DOM Manipulation**: Avoid direct DOM manipulation; use the canvas rendering context instead.

5. **Inefficient Rendering**: Avoid unnecessary renders by only updating when state actually changes.

6. **Not Handling Component Lifecycle**: Properly handle component lifecycle events (mount, unmount, etc.).

7. **Ignoring Type Safety**: Use TypeScript types for props and state to catch errors early.

8. **Overriding Critical Methods**: Be careful when overriding critical methods like `willIterate` or `isVisible`.

9. **Directly Mutating State or Props**: Never modify state or props directly. Always use setState() and setProps() methods.

## When Not to Use GraphComponent

- **Static UI Elements**: For static UI elements that don't need to be drawn on the graph canvas, use regular React components instead.

- **Complex Forms**: For complex forms or inputs, use HTML/React components rendered in a portal.

- **Text Editing**: For text editing functionality, consider using HTML inputs positioned over the canvas.

- **Heavy Computations**: For components that require heavy computations, consider using a worker thread and only using GraphComponent for rendering the results. 