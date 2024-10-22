## Graph editing hotkeys and mechanics

- **Create new connection** by pressing shift + left click on source block.
  Drag mouse in target block and unpress mouse.

### Events
`connection-create-start` Fires on start pulling new connection
Preventing this event will prevent the connection from being created
```typescript
graph.on("connection-create-start", (event) => {
  console.log('create new connection from block', event.detail.blockId);
  if(event.detail.anchorId) {
    console.log('from anchor', event.detail.anchorId);
  }
})
```
`connection-create-hover` Fires on new connection hover on block or anchor

```typescript
graph.on("connection-create-hover", (event) => {
  console.log('create connection from', event.detail.sourceBlockId, 'to', event.detail.targetBlockId);
  event.detail.sourceAnchorId && console.log('from source block\'s anchor', event.detail.sourceAnchorId)
  event.detail.targetAnchorId && console.log('to target block\'s anchor', event.detail.sourceAnchorId);

  // Prevent create connection to target block/anchor
  event.preventDefault();
})
```

`connection-created`: Fires on drop new connection to block/anchor

```typescript
graph.on("connection-created", (event) => {
  console.log('mouseup fires');
  console.log('create connection from', event.detail.sourceBlockId, 'to', event.detail.targetBlockId);
  event.detail.sourceAnchorId && console.log('from source block\'s anchor', event.detail.sourceAnchorId)
  event.detail.targetAnchorId && console.log('to target block\'s anchor', event.detail.sourceAnchorId);

  // Prevent create connection to target block/anchor
  event.preventDefault();
})
```


- **Select multiple blocks** by pressing cmd + left click.


- **Duplicate existing block** by pressing alt + left click. A so-called
  "shadow block" will appear. 
  Library won't create new block when button released. You should use graph api in order to create new block.

### Events
`block-add-start-from-shadow`: Fires on block start moving shadow block
```typescript
graph.on("block-add-start-from-shadow", (event) => {
 console.log('start creating and moving shadow block', event.detail.sourceBlockId);

  // Prevent creating shadow block
  event.preventDefault();
})
```
`block-added-from-shadow`: Fires on shadow block dropped
```typescript
graph.on("block-added-from-shadow", (event) => {
 console.log('drop shadow block', event.detail.sourceBlockId, 'to position', event.detail.coord);

  // Prevent creating shadow block
  event.preventDefault();
})
```