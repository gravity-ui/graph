import { batch } from "@preact/signals-core";
import cloneDeep from "lodash/cloneDeep";

import { Graph, TGraphConfig } from "../graph";
import { SelectionService } from "../services/selection/SelectionService";

import { BlockListStore } from "./block/BlocksList";
import { ConnectionsStore } from "./connection/ConnectionList";
import { PortsStore } from "./connection/port/PortList";
import { GroupsListStore } from "./group/GroupsList";
import { GraphEditorSettings } from "./settings";

export class RootStore {
  public blocksList: BlockListStore;

  public connectionsList: ConnectionsStore;

  public settings: GraphEditorSettings;

  public groupsList: GroupsListStore;

  public portsList: PortsStore;

  public selectionService: SelectionService;

  constructor(graph: Graph) {
    this.selectionService = new SelectionService();
    this.blocksList = new BlockListStore(this, graph);
    this.connectionsList = new ConnectionsStore(this, graph);
    this.settings = new GraphEditorSettings(this);
    this.groupsList = new GroupsListStore(this, graph);
  }

  public getAsConfig(): TGraphConfig {
    return cloneDeep({
      blocks: this.blocksList.toJSON(),
      connections: this.connectionsList.toJSON(),
      settings: this.settings.toJSON(),
    });
  }

  public reset() {
    batch(() => {
      this.blocksList.reset();
      this.connectionsList.reset();
      this.settings.reset();
      this.groupsList.reset();
    });
  }
}

export type { TGraphSettingsConfig } from "./settings";
