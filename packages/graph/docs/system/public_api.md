## Update graph state with Public api.

List of methods in your disposition:

```typescript
  public zoomToRect(rect: TGeometry, transition?: number): void;

  public zoomToBlocks(blockIds: TBlockId[], transition?: number): void;

  public zoomToViewPort(transition?: number): void;

  public getGraphColors(): TGraphColors;

  public updateGraphColors(colors: TGraphColors): void;

  public getGraphConstants(): TGraphConstants;

  public updateGraphConstants(constants: TGraphConstants): void;

  public isGraphEmpty(): boolean;

  public setSetting(flagPath: keyof TGraphSettingsConfig, value: boolean | number | ECanChangeBlockGeometry): void;

  public setCurrentConfigurationName(newName: string): void;

  public deleteSelected(): void;

  public selectBlocks(blockIds: TBlockId[], selected: boolean, strategy: ESelectionStrategy = ESelectionStrategy.REPLACE): void;

  public updateBlock(block: { id: TBlockId } & Partial<Omit<TBlock, "id">>): void;

  public setAnchorSelection(blockId: TBlockId, anchorId: string, selected: boolean): void;

  public getBlockById(blockId: TBlockId): TBlock;

  public getUsableRect(): TGeometry;

  public unsetSelection(): void;

  public addBlock(block: Omit<TBlock, "id"> & { id?: TBlockId }, selectionOptions?: { selected?: boolean; strategy?: ESelectionStrategy }): TBlockId;

  public addConnection(connection: TConnection): TConnectionId

  public updateConnection(id: TConnectionId, connection: Partial<TConnection>): void;

  public selectConnections(connectionIds: TConnectionId[], selected: boolean, strategy: ESelectionStrategy = ESelectionStrategy.REPLACE): void;
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
