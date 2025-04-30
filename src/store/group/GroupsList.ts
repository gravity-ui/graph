import { computed, signal } from "@preact/signals-core";
import groupBy from "lodash/groupBy";

import { Graph } from "../../graph";
import { MultipleSelectionBucket } from "../../services/selection/MultipleSelectionBucket";
import { ESelectionStrategy, ISelectionBucket } from "../../services/selection/types";
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

  /**
   * Bucket for managing group selection state
   */
  public readonly groupSelectionBucket: ISelectionBucket<string | number>;

  public $selectedGroups = computed(() => {
    const selectedIds = this.groupSelectionBucket.$selectedIds.value;
    return this.$groups.value.filter((group) => {
      const id = group.id;
      return typeof id === "string" || typeof id === "number" ? selectedIds.has(id) : false;
    });
  });

  constructor(
    public rootStore: RootStore,
    protected graph: Graph
  ) {
    // Create and register a selection bucket for groups
    this.groupSelectionBucket = new MultipleSelectionBucket<GroupState["id"]>("group", (payload, defaultAction) => {
      this.graph.executеDefaultEventAction("groups-selection-change", payload, defaultAction);
    });

    this.rootStore.selectionService.registerBucket(this.groupSelectionBucket);
  }

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

  /**
   * Updates group selection using the SelectionService
   * @param ids Group IDs to update selection for
   * @param selected Whether to select or deselect
   * @param strategy The selection strategy to apply
   */
  public updateGroupsSelection(
    ids: TGroupId[],
    selected: boolean,
    strategy: ESelectionStrategy = ESelectionStrategy.REPLACE
  ) {
    // Filter out symbol ids since SelectionService only supports string and number ids
    const validIds = ids.filter((id) => typeof id === "string" || typeof id === "number") as (string | number)[];

    if (selected) {
      this.rootStore.selectionService.select("group", validIds, strategy);
    } else {
      this.rootStore.selectionService.deselect("group", validIds);
    }
  }

  /**
   * Resets the selection for groups
   */
  public resetSelection() {
    this.rootStore.selectionService.resetSelection("group");
  }

  protected getGroupStates(ids: GroupState["id"][]) {
    return ids.map((id) => this.getGroupState(id)).filter(Boolean);
  }
}
