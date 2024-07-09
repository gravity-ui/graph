import { BlockListStore } from "./block/BlocksList";
import { ConnectionsStore } from "./connection/ConnectionList";
import { Graph, TGraphConfig } from "../graph";
import { CameraService } from "../services/camera/CameraService";
import { GraphEditorSettings } from "./settings";
import { batch } from "@preact/signals-core";

export class RootStore {
  public blocksList: BlockListStore;

  public configurationName: string;

  public connectionsList: ConnectionsStore;

  public settings: GraphEditorSettings;

  public constructor(graph: Graph) {
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
