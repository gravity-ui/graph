# Component Usage Rules

## CoreComponent Usage
The `CoreComponent` class provides the foundation for all components in the system. When extending CoreComponent:

1. **Type Parameters**:
   - Define proper type parameters for Props, State, and Context
   - Use appropriate type constraints and defaults
   - Ensure type safety throughout the component

2. **Proper Inheritance**:
   - Create a clear inheritance chain with specific responsibilities
   - Import Component directly from the lib directory
   - Extend the appropriate base class for your component's needs

3. **Constructor Implementation**:
   - Always call super with props and parent
   - Initialize component-specific properties in constructor
   - Set up initial state and context if needed

4. **Resource Management**:
   - Track resources that need cleanup (event listeners, subscriptions)
   - Properly clean up in unmount method
   - Always call super.unmount() when overriding

## Component Usage
The `Component` class provides state management and lifecycle methods. When using Component:

1. **Signal Subscription**:
   - Create helper methods for subscribing to signals
   - Store unsubscribe functions for later cleanup
   - Ensure all subscriptions are properly removed on unmount

2. **Lifecycle Method Override**:
   - Always call super when overriding lifecycle methods
   - Add component-specific logic after super call
   - Respect the component lifecycle flow

3. **Event Handling**:
   - Implement reusable event handling patterns
   - Use method chaining for event listeners when appropriate
   - Properly clean up event listeners

4. **Rendering Optimization**:
   - Implement methods to check component visibility
   - Only render components that are visible
   - Use shouldRender flag to control rendering

5. **Public API Design**:
   - Provide clear public methods for component interaction
   - Use proper access modifiers (public, protected, private)
   - Document the component's public API

## Component Lifecycle
When extending the Component class, respect the following lifecycle methods:

1. `willMount` - Called before the first render
2. `willRender` - Called before each render
3. `render` - Define your component's rendering logic here
4. `didRender` - Called after each render
5. `willUpdateChildren` - Called before updating children
6. `didUpdateChildren` - Called after updating children
7. `willIterate` - Called at the beginning of each iteration
8. `didIterate` - Called at the end of each iteration

## State Management
Use the provided state management methods:

- `setState<K extends keyof State>(state: Pick<State, K>)` - Update component state
- `setProps<K extends keyof Props>(props?: Pick<Props, K>)` - Update component props
- `setContext<K extends keyof Context>(context: Pick<Context, K>)` - Update component context 