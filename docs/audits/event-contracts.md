# Event names, payloads and listener variance

Issue: #359. Base: v2 after #358. Compiler: TypeScript 5.9.2.

Graph subscription and emission derive their types from the event name, rather
than a separately inferred callback subtype. Graph supports both functions and
objects with handleEvent. React callback types derive from GraphCallbacksMap,
retaining the same name/detail/event relationship through registration.
React's GraphEvent alias now denotes the event (second callback argument);
GraphEventDetail denotes the first argument. The mousemove graph event is part
of the typed map, matching the existing native-event name guard.

EventedComponent uses native DOM event types for clicks and other DOM events.
Component hover callbacks accept native MouseEvent or graph CustomEvent because
both are dispatched by existing code. Area enter/leave callbacks receive native
synthetic MouseEvents. Unknown component event names retain the Event fallback.
Component instance listeners retain their protected handleEvent dispatch; plain
object listeners are also supported. Bubbling preserves the original event.

The sole DOM listener erasure lives in utils/eventListener.ts, preserving function
and object identity, function this, once, passive and AbortSignal semantics.
Unsubscription snapshots capture at registration, including when the caller later
mutates options. Explicit Graph.off accepts matching capture options.
Graph's mousedown default-action branch has one local assertion correlating the
checked runtime name with its indexed generic payload; event identity, ordering
and preventDefault behavior are covered by runtime regression tests.

Emitter accepts specific callback parameter tuples without requiring callbacks
to accept arbitrary unknown arguments. Its private wrapper retains each callback's
parameter tuple and removes once listeners before invocation, including nested
emission. Layers, HitTest and drag listeners specify actual event maps. Drag
cleanup aborts all session DOM subscriptions, including pending start/end/leave
listeners. A new mousedown ends an active drag, notifying its owner and releasing
graph resources before removing listeners.

Runtime tests cover functions/objects, capture, mutated capture options, once,
recursive emit, abort, explicit unsubscribe/off, component bubbling and cleanup,
native/graph hover events, drag cancellation and React graph/callback replacement.
Strict consumer fixtures compile against source and packed declarations and
reject wrong payloads/listeners for graph, components, typed emitters and React.
The strict gate protects the completed event files and graph/block TS2345 errors;
remaining graph/component initialization, optional state and rendering debt stays
assigned to the later #353 work items.

Strict diagnostics: core 249 -> 223; React 30 -> 25; minimap 2; devtools 21;
Storybook 188; E2E 0. The baseline update contains only removed diagnostic
identities/counts.
