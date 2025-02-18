import { signal } from "@preact/signals-core";

import { GroupsListStore } from "./GroupsList";

export type TGroupId = string & { __brand: "GroupId" };

export interface TGroup {
  id: TGroupId;
  name: string;
  color?: string;
}

export class GroupState {
  public $state = signal<TGroup>({
    id: "" as TGroupId,
    name: "",
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

  public updateGroup(group: Partial<TGroup>) {
    this.$state.value = {
      ...this.$state.value,
      ...group,
    };
  }

  public asTGroup(): TGroup {
    return this.$state.value;
  }

  public static fromTGroup(store: GroupsListStore, group: TGroup) {
    return new GroupState(store, group);
  }
}
