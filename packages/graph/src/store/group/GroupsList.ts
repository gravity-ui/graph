import { batch, computed, signal } from "@preact/signals-core";
import groupBy from "lodash/groupBy";

import { Graph } from "../../graph";
import { ESelectionStrategy } from "../../utils/types/types";
import { RootStore } from "../index";

import { GroupState, TGroup, TGroupId } from "./Group";

declare module "../../graphEvents" {
  interface GraphEventsDefinitions {
    "groups-selection-change": (event: SelectionEvent<TGroupId>) => void;
  }
}

export class GroupsListStore {
  public $groupsMap = signal<Map<GroupState["id"], GroupState>>(new Map());

  public $groups = computed(() => {
    return Array.from(this.$groupsMap.value.values());
  });

  public $blockGroups = computed(() => {
    return groupBy(this.rootStore.blocksList.$blocks.value, (item) => item.$state.value.group);
  });

  public $selectedGroups = computed(() => {
    return this.$groups.value.filter((group) => group.selected);
  });

  constructor(
    public rootStore: RootStore,
    protected graph: Graph
  ) {}

  protected updateGroupsMap(groups: Map<GroupState["id"], GroupState> | [GroupState["id"], GroupState][]) {
    this.$groupsMap.value = new Map(groups);
  }

  public addGroup(group: TGroup) {
    this.$groupsMap.value.set(group.id, this.getOrCreateGroupState(group));

    this.updateGroupsMap(this.$groupsMap.value);

    return group.id;
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

  public setGroupSelection(
    group: GroupState | GroupState["id"],
    selected: boolean,
    params?: { ignoreChanges?: boolean }
  ): boolean {
    const groupState = group instanceof GroupState ? group : this.$groupsMap.value.get(group);
    if (!groupState) {
      return false;
    }
    if (selected !== Boolean(groupState.selected)) {
      if (!params?.ignoreChanges) {
        groupState.updateGroup({ selected });
      }
      return true;
    }
    return false;
  }

  protected computeSelectionChange(
    ids: TGroupId[],
    selected: boolean,
    strategy: ESelectionStrategy = ESelectionStrategy.REPLACE
  ) {
    const list = new Set(this.$selectedGroups.value);
    let add: Set<GroupState>;
    let removed: Set<GroupState>;

    if (!selected) {
      removed = new Set(
        this.getGroupStates(ids).filter((group: GroupState) => {
          if (this.setGroupSelection(group.id, false, { ignoreChanges: true })) {
            list.delete(group);
            return true;
          }
          return false;
        })
      );
    } else {
      if (strategy === ESelectionStrategy.REPLACE) {
        removed = new Set(
          this.$selectedGroups.value.filter((group) => {
            return this.setGroupSelection(group.id, false, { ignoreChanges: true });
          })
        );
        list.clear();
      }
      add = new Set(
        this.getGroupStates(ids).filter((group: GroupState) => {
          if (
            this.setGroupSelection(group.id, true, { ignoreChanges: true }) ||
            strategy === ESelectionStrategy.REPLACE
          ) {
            removed?.delete(group);
            list.add(group);
            return true;
          }
          return false;
        })
      );
    }
    return { add: Array.from(add || []), removed: Array.from(removed || []), list: Array.from(list) };
  }

  public updateGroupsSelection(
    ids: TGroupId[],
    selected: boolean,
    strategy: ESelectionStrategy = ESelectionStrategy.REPLACE
  ) {
    const { add, removed, list } = this.computeSelectionChange(ids, selected, strategy);

    if (add.length || removed.length) {
      this.graph.executеDefaultEventAction(
        "groups-selection-change",
        {
          list: list.map((group) => group.id),
          changes: {
            add: add.map((group) => group.id),
            removed: removed.map((group) => group.id),
          },
        },
        () => {
          batch(() => {
            removed.forEach((group) => {
              this.setGroupSelection(group.id, false);
            });
            add.forEach((group) => {
              this.setGroupSelection(group.id, true);
            });
          });
        }
      );
    }
  }

  public resetSelection() {
    this.updateGroupsSelection(
      this.$selectedGroups.value.map((group) => group.id),
      false
    );
  }

  protected getGroupStates(ids: GroupState["id"][]) {
    return ids.map((id) => this.getGroupState(id)).filter(Boolean);
  }
}
