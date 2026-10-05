# Public graph API

Use `graph.api` to update entities, selection, configuration and camera state. Entity operations work before canvas mounting. Missing entities or endpoints do not themselves cause these APIs to throw. Inputs use the consumer-declared TypeScript data shape; these APIs do not validate arbitrary runtime payloads.

| Method                                                     | Contract                                                                                                                                                                                                    |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getBlockById(id)`                                         | Returns a block snapshot, or `undefined` when absent.                                                                                                                                                       |
| `updateBlock({id, ...patch})`                              | Missing ID: no-op. Omitted fields are preserved.                                                                                                                                                            |
| `addBlock(block, selectionOptions?)`                       | Adds or updates by ID and returns that ID. An absent ID is generated. `0` and `""` are valid IDs.                                                                                                           |
| `updateConnection(id, patch)`                              | Missing ID: no-op. Omitted fields are preserved; the stored ID stays unchanged. Endpoint changes release old observations.                                                                                  |
| `addConnection(connection)`                                | Adds or updates and returns the resolved ID. An absent ID uses endpoint identity where available, otherwise a generated ID. Missing endpoints are accepted; endpoint-derived geometry waits for resolution. |
| `setAnchorSelection(blockId, anchorId, selected)`          | Missing block or anchor: no-op. Does not require a mounted anchor view.                                                                                                                                     |
| `selectBlocks(ids, selected, strategy?)`                   | Stores requested selection IDs, including unresolved IDs. Resolved entity and component lists omit unavailable entries.                                                                                     |
| `selectConnections(ids, selected, strategy?)`              | Same selection contract as blocks.                                                                                                                                                                          |
| `deleteSelected()`                                         | Deletes resolved selected blocks and connections; unavailable IDs are ignored.                                                                                                                              |
| `unsetSelection()`                                         | Clears all selection buckets, including unresolved IDs; empty selection is a no-op.                                                                                                                         |
| `zoomToBlocks(ids, config?)`                               | Ignores missing IDs. Returns `false` and leaves the camera unchanged when no blocks resolve; otherwise returns `true`.                                                                                      |
| `zoomToElements(elements, config?)`                        | Empty list: returns `false` without moving the camera. Otherwise zooms to supplied component geometry and returns `true`.                                                                                   |
| `zoomToRect(rect, config?)`                                | Fits the rectangle using camera scale limits. Zero extent remains finite.                                                                                                                                   |
| `zoomToViewPort(config?)`                                  | Schedules zoom after the usable rectangle updates; returns `void`. Empty graph uses the configured usable-rectangle gap.                                                                                    |
| `getUsableRect()`                                          | Returns current usable rectangle; an empty graph can have zero extent.                                                                                                                                      |
| `isGraphEmpty()`                                           | Reports whether there are no blocks.                                                                                                                                                                        |
| `getGraphColors()` / `getGraphConstants()`                 | Returns current resolved configuration.                                                                                                                                                                     |
| `updateGraphColors(patch)` / `updateGraphConstants(patch)` | Applies a partial configuration update.                                                                                                                                                                     |
| `setSetting(key, value)`                                   | Updates a typed setting.                                                                                                                                                                                    |
| `setCurrentConfigurationName(name)`                        | Changes the active configuration name.                                                                                                                                                                      |

Selection strategies use `ESelectionStrategy`; the default is `REPLACE`. Camera configuration is `ZoomConfig` (`transition?: number`, `padding?: number`).

Endpoint-derived connection geometry has no visible path or hitbox while endpoints are unavailable; it resumes when both endpoints resolve. Multipoint connections with at least two explicit points can render independently of endpoints. A deleted state handle cannot select or move a replacement entity with the same ID. Directly constructing a block, anchor, connection or group view for a missing entity throws a binding error; look up the state first when authoring custom components.

```typescript
const id = graph.api.addBlock({ is: "Block", name: "Example", x: 0, y: 0, width: 100, height: 100 });
graph.api.updateBlock({ id, name: "Updated" });
const snapshot = graph.api.getBlockById(id); // TBlock | undefined
graph.api.addConnection({ sourceBlockId: id, targetBlockId: "pending" });
graph.api.zoomToBlocks([id, "missing"], { transition: 1000, padding: 50 });
```
