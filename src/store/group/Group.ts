import { signal } from "@preact/signals-core";

import { Group } from "../../components/canvas/groups";
import { TRect } from "../../utils/types/shapes";

import { GroupsListStore } from "./GroupsList";
import { ESelectionStrategy } from "../../utils/types/types";
export type TGroupId = string;

export interface TGroup {
  id: TGroupId;
  name: string;
  rect: TRect;
  selected?: boolean;
  component?: typeof Group;
}

export class GroupState {
  public $state = signal<TGroup>({
    id: "" as TGroupId,
    name: "",
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
    state: TGroup
  ) {
    this.$state.value = state;
  }

  public get id() {
    return this.$state.value.id;
  }

  public get selected() {
    return Boolean(this.$state.value.selected);
  }

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
    return new GroupState(store, group);
  }
}
