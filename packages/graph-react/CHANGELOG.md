# Changelog

## Unreleased (v2)

- Subscribe with `useGraphEvent(graph, name, handler)` for input and model events. The callback receives one typed event synchronously, including its target and any cancellation or drag controls. Read fields directly on the event. [React migration](../graph/docs/migration-guides/v1-to-v2.md#event-callbacks-and-payloads)
