import { batch } from "@preact/signals-core";

import { Graph, TGraphConfig } from "../graph";

import { BlockListStore } from "./block/BlocksList";
import { ConnectionsStore } from "./connection/ConnectionList";
import { GraphEditorSettings } from "./settings";

export class RootStore {
  public blocksList: BlockListStore;

  public configurationName: string;

  public connectionsList: ConnectionsStore;

  public settings: GraphEditorSettings;

  constructor(graph: Graph) {
    this.blocksList = new BlockListStore(this, graph);
    this.connectionsList = new ConnectionsStore(this, graph);
    this.settings = new GraphEditorSettings(this);
  }

  public getAsConfig(): TGraphConfig {
    const blocks = this.blocksList.$blocks.value.map((block) => block.asTBlock());
    const connections = this.connectionsList.$connections.value.map((connection) => connection.asTConnection());

    return {
      configurationName: this.configurationName,
      blocks,
      connections,
      settings: this.settings.asConfig,
    };
  }

  public reset() {
    batch(() => {
      this.blocksList.reset();
      this.connectionsList.reset();
      this.settings.reset();
    });
  }
}

export type { TGraphSettingsConfig } from "./settings";
