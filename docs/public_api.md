## Update graph state with Public api.

List of methods in your disposition:

```typescript
  public zoomToRect(rect: TGeometry, transition?: number): void;

  public zoomToBlocks(blockIds: TBlockId[], transition?: number): void;

  public zoomToViewPort(transition?: number): void;

  public getCurrentConfiguration(): TGraphConfig;

  public setBlockName(blockId: TBlockId, newName: string): void;

  public setSetting(flagPath: keyof TGraphSettingsConfig, value: boolean | number | ECanChangeBlockGeometry): void;

  public setCurrentConfigurationName(newName: string): void;

  public deleteSelected(): void;

  public selectBlocks(blockIds: TBlockId[], selected: boolean): void;

  public getBlockById(blockId: TBlockId): TBlock;

  public getUsableRect(): TGeometry;

  public addBlock(geometry: TGeometry, name: string: void): TBlockId;

  public addConnection(connection: TConnection): TConnectionId

  public updateConnection(id: TConnectionId, connection: TConnection): void;

  public selectConnections(connectionIds: TConnectionId[], selected: boolean): void;
```

## API-Example. Entities set/update

```typescript
const {graph, setEntities, updateEntities} = useGraph({});
useEffect(() => {
    // set connections
    setEntities({
      blocks: [{...block}, {...anotherBlock}],
      connections: [{...connection}, {...connection}]
    });
}, []);

const update = useCallback(() => {
  updateEntities({
    blocks: [{...block, name: 'Updated Name'}],
  });
})
```