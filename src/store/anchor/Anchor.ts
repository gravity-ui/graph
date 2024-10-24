import { signal } from "@preact/signals-core";

import { TAnchor } from "../../components/canvas/anchors";
import { BlockState } from "../block/Block";

export enum EAnchorType {
  IN = "IN",
  OUT = "OUT",
}

export class AnchorState {
  protected $state = signal<TAnchor>(undefined);

  public $selected = signal(false);

  public get id() {
    return this.$state.value.id;
  }
  public get blockId() {
    return this.$state.value.blockId;
  }

  public get state() {
    return this.$state.value;
  }

  constructor(
    public readonly block: BlockState,
    anchor: TAnchor
  ) {
    this.$state.value = anchor;
  }

  public update(anchor: TAnchor) {
    this.$state.value = anchor;
  }

  public setSelection(selected: boolean, silent?: boolean) {
    if (silent) {
      this.$selected.value = selected;
      return;
    }
    this.block.onAnchorSelected(this.id, selected);
  }

  public asTAnchor(): TAnchor {
    return this.$state.value;
  }
}
