import { ReadonlySignal, Signal, computed } from "@preact/signals-core";

import { TBlock } from "../../..";
import { Graph } from "../../../graph";
import { CoreComponent } from "../../../lib";
import { TComponentState } from "../../../lib/Component";
import { Layer, LayerContext, LayerProps } from "../../../services/Layer";
import { BlockState } from "../../../store/block/Block";
import { GroupState, TGroup, TGroupId } from "../../../store/group/Group";
import { getBlocksRect } from "../../../utils/functions";
import { TRect } from "../../../utils/types/shapes";

import { Group } from "./Group";

export type TDefinitionGroup<T extends TGroup = TGroup> = Omit<T, "rect"> & { blocksIds: BlockState["id"][] };

export type BlockGroupsProps<T extends TGroup = TGroup> = LayerProps & {
  // Some specific props
  mapBlockGroups?: (blocks: BlockState[]) => GroupState[];
  groupComponent?: typeof Group<T>;
  draggable?: boolean;
  updateBlocksOnDrag?: boolean;
};

export type BlockGroupsContext = LayerContext & {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  root?: HTMLElement;
  ownerDocument: Document | HTMLElement;
  graph: Graph;
};

export type BlockGroupsState = TComponentState & {
  groups: GroupState[];
};

export class BlockGroups<P extends BlockGroupsProps = BlockGroupsProps> extends Layer<
  P,
  BlockGroupsContext,
  BlockGroupsState
> {
  public static withBlockGrouping<P extends BlockGroupsProps, Instance extends BlockGroups<P>>(
    this: new (props: P) => Instance,
    {
      groupingFn,
      mapToGroups,
    }: {
      groupingFn: (blocks: BlockState[]) => Record<string, BlockState[]>;
      mapToGroups: (key: string, params: { blocks: BlockState[]; rect: TRect }) => TGroup;
    }
  ): new (props: P) => Instance & { $groupsBlocksMap: ReadonlySignal<Record<string, BlockState[]>> } {
    const Base = this as new (props: P) => BlockGroups<P>;
    /**
     * We use `as any` here because TypeScript has trouble inferring the correct type
     * for an anonymous class extending a generic base with protected members.
     * The public method signature ensures strict type safety for consumers.
     */
    return class BlockGroupWithGrouping extends Base {
      public $groupsBlocksMap = computed(() => {
        const blocks = this.props.graph.rootStore.blocksList.$blocks.value;
        return groupingFn(blocks);
      });

      protected afterInit(): void {
        this.onSignal(
          computed<TGroup[]>(() => {
            const groupedBlocks = this.$groupsBlocksMap.value;
            return Object.entries(groupedBlocks).map(([key, blocks]) =>
              mapToGroups(key, {
                blocks,
                rect: getBlocksRect(blocks.map((block) => block.asTBlock())),
              })
            );
          }),
          (groups: TGroup[]) => {
            this.setGroups(groups);
          }
        );
        super.afterInit();
      }
    } as any;
  }

  public static withPredefinedGroups<
    T extends TGroup,
    P extends TDefinitionGroup<T> = TDefinitionGroup<T>,
    Props extends BlockGroupsProps<T> = BlockGroupsProps<T>,
    Instance extends BlockGroups<Props> = BlockGroups<Props>,
  >(
    this: new (props: Props) => Instance
  ): new (props: Props) => Instance & {
    $groupsBlocksMap: ReadonlySignal<Record<string, BlockState[]>>;
    defineGroups(groups: P[]): void;
  } {
    const Base = this as new (props: Props) => BlockGroups<Props>;
    /**
     * We use `as any` here because TypeScript has trouble inferring the correct type
     * for an anonymous class extending a generic base with protected members.
     * The public method signature ensures strict type safety for consumers.
     */
    return class BlockGroupWithPredefinedGroups extends Base {
      private $predefinedGroups = new Signal<P[]>([]);

      public $groupsBlocksMap = computed(() => {
        const groups = this.$predefinedGroups.value;
        const blocksMap: Record<string, BlockState[]> = {};
        const blocksListStore = this.props.graph.rootStore.blocksList;

        groups.forEach((group) => {
          const blocks = blocksListStore.getBlockStates(group.blocksIds);
          blocksMap[group.id] = blocks;
        });

        return blocksMap;
      });

      public defineGroups(groups: P[]): void {
        this.$predefinedGroups.value = groups;
      }

      protected afterInit(): void {
        this.onSignal(
          computed<TGroup[]>(() => {
            const groups = this.$predefinedGroups.value;
            const groupsBlocksMap = this.$groupsBlocksMap.value;

            return groups.map((group) => {
              const blocks = groupsBlocksMap[group.id] || [];
              const rect = getBlocksRect(blocks.map((block) => block.asTBlock()));

              return {
                ...group,
                rect,
              } as TGroup;
            });
          }),
          (groups: TGroup[]) => {
            this.setGroups(groups);
          }
        );
        super.afterInit();
      }
    } as any;
  }

  /**
   * Map of groups to blocks
   * Used to quickly find the blocks of a group
   */
  protected $groupsBlocksMap = new Signal<Record<string, BlockState[]>>({});

  /**
   * Source of groups
   */
  protected $groupsSource = this.props.graph.rootStore.groupsList.$groups;

  /**
   * Map of blocks to groups
   * Used to quickly find the group of a block
   */
  protected $blockGroupsMap = computed(() => {
    return Object.entries(this.$groupsBlocksMap.value).reduce((acc, [key, blocks]) => {
      blocks.forEach((block) => {
        acc.set(block.id, key);
      });
      return acc;
    }, new Map<TBlock["id"], TGroup["id"]>());
  });

  constructor(props: P) {
    super({
      canvas: {
        zIndex: 1,
        classNames: ["no-user-select"],
        transformByCameraPosition: true,
        ...props.canvas,
      },
      ...props,
    });

    const canvas = this.getCanvas();

    this.setContext({
      canvas,
      ctx: canvas.getContext("2d"),
      root: this.props.root,
      camera: this.props.camera,
      constants: this.props.graph.graphConstants,
      colors: this.props.graph.graphColors,
      graph: this.props.graph,
      ownerDocument: this.props.root,
    });
  }

  protected afterInit(): void {
    this.onSignal(this.$groupsSource, (groups) => {
      this.shouldUpdateChildren = true;
      this.shouldRenderChildren = true;
      this.setState({ groups });
    });
    super.afterInit();
  }

  public getParent(): CoreComponent | undefined {
    /*
     * Override parent to delegate click events to camera.
     * This allows camera movement when mouse button is held down.
     */
    return this.props.graph.getGraphLayer().$.camera as CoreComponent;
  }

  public updateBlocks = (groupId: TGroupId, { deltaX, deltaY }: { deltaX: number; deltaY: number }) => {
    if (this.props.updateBlocksOnDrag) {
      const blocks = this.$groupsBlocksMap.value[groupId];
      if (blocks) {
        blocks.forEach((block) => {
          block.updateXY(block.x + deltaX, block.y + deltaY, true);
        });
      }
    }
  };

  public setGroups<T extends TGroup>(groups: T[]) {
    const groupsToUpdate = groups.map((group) => {
      const existingGroupState = this.props.graph.rootStore.groupsList.getGroupState(group.id);
      if (existingGroupState?.isSizeLocked()) {
        // Keep the existing rect when size is locked
        return { ...group, rect: existingGroupState.$state.value.rect };
      }
      return group;
    });
    this.props.graph.rootStore.groupsList.setGroups(groupsToUpdate);
  }

  public updateGroups<T extends TGroup>(groups: T[]) {
    this.props.graph.rootStore.groupsList.updateGroups(groups);
  }

  protected unmountLayer(): void {
    this.props.graph.rootStore.groupsList.reset();
    super.unmountLayer();
  }

  protected getGroupComponent(group: GroupState) {
    return group.$state.value.component || this.props.groupComponent || Group;
  }

  protected updateChildren() {
    return this.state.groups?.map((group) => {
      return this.getGroupComponent(group).create(
        {
          id: group.id,
          onDragUpdate: this.updateBlocks,
          draggable: this.props.draggable || false,
        },
        { key: group.id, ref: group.id }
      );
    });
  }

  /**
   * Find a Group component by its ID
   */
  public getGroupById(groupId: string): Group | null {
    return this.$?.[groupId];
  }
}
