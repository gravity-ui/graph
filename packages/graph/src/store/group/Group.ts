import { computed, signal } from "@preact/signals-core";

import { Group } from "../../components/canvas/groups";
import { ESelectionStrategy, ISelectionBucket } from "../../services/selection/types";
import { TRect } from "../../utils/types/shapes";

import { GroupsListStore } from "./GroupsList";
export type TGroupId = string;

export interface TGroup {
  id: TGroupId;
  rect: TRect;
  selected?: boolean;
  component?: typeof Group;
}

export class GroupState {
  public $state = signal<TGroup>({
    id: "" as TGroupId,
    selected: false,
    rect: {
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    },
    component: Group,
  });

  constructor(
    protected store: GroupsListStore,
    state: TGroup,
    private readonly groupSelectionBucket: ISelectionBucket<string | number>
  ) {
    this.$state.value = state;
  }

  public get id() {
    return this.$state.value.id;
  }

  /**
   * Computed signal that reactively determines if this group is selected
   * by checking if its ID exists in the selection bucket
   */
  public readonly $selected = computed(() => {
    return this.groupSelectionBucket.isSelected(this.id);
  });

  public updateGroup(group: Partial<TGroup>) {
    this.$state.value = {
      ...this.$state.value,
      ...group,
    };
  }

  public setSelection(selected: boolean, strategy: ESelectionStrategy = ESelectionStrategy.REPLACE) {
    this.store.updateGroupsSelection([this.id], selected, strategy);
  }

  public asTGroup(): TGroup {
    return this.$state.value;
  }

  public static fromTGroup(store: GroupsListStore, group: TGroup) {
    return new GroupState(store, group, store.groupSelectionBucket);
  }
}
