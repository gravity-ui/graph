import { Signal, computed, signal } from "@preact/signals-core";

import { Anchor, TAnchor } from "../../components/canvas/anchors";
import { BlockState } from "../block/Block";

import { anchorEntityId } from "./anchorEntityId";

export enum EAnchorType {
  IN = "IN",
  OUT = "OUT",
}

export class AnchorState {
  protected $state: Signal<TAnchor>;

  /**
   * The anchor's entity id, `anchorEntityId(blockId, id)`: its id in the anchor selection bucket and its tag address.
   * Fixed at creation: a block's anchor states are matched by id, and a block keeps its id.
   */
  public readonly entityId: string;

  public $selected = computed(() => this.block.store.anchorSelectionBucket.isSelected(this.entityId));

  public $viewComponentReady = signal<boolean>(false);

  private anchorView?: Anchor;

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
    this.$state = signal(anchor);
    // The owning block's id, not `anchor.blockId`: the anchor belongs to this block whatever its data says.
    this.entityId = anchorEntityId(block.$state.peek().id, anchor.id);
  }

  public update(anchor: TAnchor) {
    this.$state.value = anchor;
  }

  /** Whether this state is still the entity registered under its ID. */
  public isAttached(): boolean {
    return this.block.isAttached() && this.block.getAnchorById(this.id) === this;
  }

  public setSelection(selected: boolean) {
    if (!this.isAttached()) return;
    this.block.onAnchorSelected(this.id, selected);
  }

  public setViewComponent(anchorComponent: Anchor) {
    this.anchorView = anchorComponent;
    this.$viewComponentReady.value = true;
  }

  public unsetViewComponent() {
    this.anchorView = undefined;
    this.$viewComponentReady.value = false;
  }

  /**
   * The anchor's canvas component, or undefined: a block creates its anchor components lazily, once the camera shows
   * it at the schematic or detailed level. Reads `$viewComponentReady`, so a computed or effect that calls it runs
   * again when the component is created or dropped. The anchor's position does not need it: read its port.
   */
  public getViewComponent(): Anchor | undefined {
    return this.$viewComponentReady.value ? this.anchorView : undefined;
  }

  public asTAnchor(): TAnchor {
    return this.$state.value;
  }
}
