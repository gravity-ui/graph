import { batch } from "@preact/signals-core";
import cloneDeep from "lodash/cloneDeep";

import { Graph, TGraphConfig } from "../graph";

import { BlockListStore } from "./block/BlocksList";
import { ConnectionsStore } from "./connection/ConnectionList";
import { GroupsListStore } from "./group/GroupsList";
import { GraphEditorSettings } from "./settings";

export class RootStore {
  public blocksList: BlockListStore;

  public configurationName: string;

  public connectionsList: ConnectionsStore;

  public settings: GraphEditorSettings;

  public groupsList: GroupsListStore;

  constructor(graph: Graph) {
    this.blocksList = new BlockListStore(this, graph);
    this.connectionsList = new ConnectionsStore(this, graph);
    this.settings = new GraphEditorSettings(this);
    this.groupsList = new GroupsListStore(this, graph);
  }

  public getAsConfig(): TGraphConfig {
    return cloneDeep({
      configurationName: this.configurationName,
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
