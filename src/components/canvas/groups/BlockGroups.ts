import { Component } from "../../../lib";
import { TGraphLayerContext } from "../layers/graphLayer/GraphLayer";

import { Group } from "./Group";

export class BlockGroups extends Component<{}, {}, TGraphLayerContext> {

  protected updateChildren() {
    return Object.keys(this.context.graph.rootStore.blocksList.$blockGroups.value)
      .filter((groupId) => groupId !== "undefined")
      .map((groupId) => Group.create({ id: groupId }, { key: `group-${groupId}` }));
  }
}
