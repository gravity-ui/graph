import { Signal, computed } from "@preact/signals-core";

import { Graph } from "../../../graph";
import { CoreComponent } from "../../../lib";
import { TComponentState } from "../../../lib/Component";
import { Layer, LayerContext, LayerProps } from "../../../services/Layer";
import { BlockState } from "../../../store/block/Block";
import { GroupState, TGroup, TGroupId } from "../../../store/group/Group";
import { getUsableRectByBlockIds } from "../../../utils/functions";
import { TRect } from "../../../utils/types/shapes";

import { Group } from "./Group";

export type BlockGroupsProps<T extends TGroup = TGroup> = LayerProps & {
  // Some specific props
  mapBlockGroups?: (blocks: BlockState[]) => GroupState[];
  groupComponent?: typeof Group<T>;
  draggable?: boolean;
};

export type BlockGroupsContext = LayerContext & {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  htmlCtx: HTMLDivElement;
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
  public static withBlockGrouping({
    groupingFn,
    mapToGroups,
  }: {
    groupingFn: (blocks: BlockState[]) => Record<string, BlockState[]>;
    mapToGroups: (key: string, params: { blocks: BlockState[]; rect: TRect }) => TGroup;
  }): typeof BlockGroups<BlockGroupsProps & { updateBlocksOnDrag?: boolean }> {
    return class BlockGroupWithGrouping extends BlockGroups<BlockGroupsProps & { updateBlocksOnDrag?: boolean }> {
      public $groupsBlocksMap = computed(() => {
        const blocks = this.props.graph.rootStore.blocksList.$blocks.value;
        return groupingFn(blocks);
      });

      constructor(props: BlockGroupsProps & { updateBlocksOnDrag?: boolean }) {
        super(props);
        this.unsubscribe.push(
          computed(() => {
            const groupedBlocks = this.$groupsBlocksMap.value;
            return Object.entries(groupedBlocks).map(([key, blocks]) =>
              mapToGroups(key, { blocks, rect: getUsableRectByBlockIds(blocks) })
            );
          }).subscribe((groups: TGroup[]) => {
            this.setGroups(groups);
          })
        );
      }
    };
  }

  private unsubscribe: (() => void)[] = [];

  protected $groupsBlocksMap = new Signal<Record<string, BlockState[]>>({});

  protected $groupsSource = this.props.graph.rootStore.groupsList.$groups;

  constructor(props: P) {
    super({
      canvas: {
        zIndex: 1,
        classNames: ["no-user-select"],
        transformByCameraPosition: true,
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
      ownerDocument: this.props.root!,
    });

    this.unsubscribe.push(
      this.$groupsSource.subscribe((groups) => {
        this.shouldUpdateChildren = true;
        this.shouldRenderChildren = true;
        this.setState({ groups });
      })
    );

    this.performRender = this.performRender.bind(this);
  }

  /**
   * Called after initialization and when the layer is reattached.
   * This is where we set up event subscriptions to ensure they work properly
   * after the layer is unmounted and reattached.
   */
  protected afterInit(): void {
    // Register event listener with the graphOn wrapper method for automatic cleanup when unmounted
    this.graphOn("camera-change", this.performRender);

    // Call parent afterInit to ensure proper initialization
    super.afterInit();
  }

  public getParent(): CoreComponent | undefined {
    /*
     * Override parent to delegate click events to camera.
     * This allows camera movement when mouse button is held down.
     */
    return this.props.graph.getGraphLayer().$.camera as CoreComponent;
  }

  public updateBlocks = (groupId: TGroupId, { diffX, diffY }: { diffX: number; diffY: number }) => {
    if ((this.props as BlockGroupsProps & { updateBlocksOnDrag?: boolean }).updateBlocksOnDrag) {
      const blocks = this.$groupsBlocksMap.value[groupId];
      if (blocks) {
        blocks.forEach((block) => {
          block.updateXY(block.x - diffX, block.y - diffY, true);
        });
      }
    }
  };

  public setGroups<T extends TGroup>(groups: T[]) {
    this.props.graph.rootStore.groupsList.setGroups(groups);
  }

  public updateGroups<T extends TGroup>(groups: T[]) {
    this.props.graph.rootStore.groupsList.updateGroups(groups);
  }

  protected unmountLayer(): void {
    this.props.graph.rootStore.groupsList.reset();
  }

  protected unmount(): void {
    this.unsubscribe.forEach((unsubscribe) => unsubscribe());
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
        { key: group.id }
      );
    });
  }

  public render() {
    this.resetTransform();
  }
}
