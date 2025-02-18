import { computed, signal } from "@preact/signals-core";
import { Graph } from "../../graph";
import { RootStore } from "../index";
import { generateRandomId } from "../../components/canvas/blocks/generate";
import { GroupState, TGroup, TGroupId } from "./Group";

export class GroupsListStore {
  public $groupsMap = signal<Map<GroupState["id"], GroupState>>(new Map());

  public $groups = computed(() => {
    return Array.from(this.$groupsMap.value.values());
  });

  constructor(
    public rootStore: RootStore,
    protected graph: Graph
  ) {}

  protected updateGroupsMap(groups: Map<GroupState["id"], GroupState> | [GroupState["id"], GroupState][]) {
    this.$groupsMap.value = new Map(groups);
  }

  public addGroup(group: Omit<TGroup, "id"> & { id?: TGroupId }) {
    const id = group.id || (generateRandomId("group") as TGroupId);

    this.$groupsMap.value.set(
      id,
      this.getOrCreateGroupState({
        id,
        ...group,
      })
    );

    this.updateGroupsMap(this.$groupsMap.value);

    return id;
  }

  public deleteGroups(groups: (TGroup["id"] | TGroup)[]) {
    const map = new Map(this.$groupsMap.value);
    groups.forEach((gId) => {
      const id = typeof gId === "string" ? gId : gId.id;
      map.delete(id);
    });
    this.updateGroupsMap(map);
  }

  public updateGroups(groups: TGroup[]) {
    this.updateGroupsMap(
      groups.reduce((acc, group) => {
        const state = this.getOrCreateGroupState(group);
        acc.set(group.id, state);
        return acc;
      }, this.$groupsMap.value)
    );
  }

  public setGroups(groups: TGroup[]) {
    const groupStates = groups.map((group) => this.getOrCreateGroupState(group));
    this.applyGroupsState(groupStates);
  }

  protected getOrCreateGroupState(group: TGroup) {
    const groupState = this.$groupsMap.value.get(group.id);
    if (groupState) {
      groupState.updateGroup(group);
      return groupState;
    }
    return GroupState.fromTGroup(this, group);
  }

  protected applyGroupsState(groups: GroupState[]) {
    this.updateGroupsMap(groups.map((group) => [group.id, group]));
  }

  public getGroupState(id: TGroupId) {
    return this.$groupsMap.value.get(id);
  }

  public getGroup(id: TGroupId): TGroup | undefined {
    return this.getGroupState(id)?.asTGroup();
  }

  public reset() {
    this.applyGroupsState([]);
  }

  public toJSON() {
    return this.$groups.value.map((group) => group.asTGroup());
  }
}
