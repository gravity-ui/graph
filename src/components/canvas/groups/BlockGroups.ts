import { Signal, computed } from "@preact/signals-core";

import { Graph } from "../../../graph";
import { TComponentState } from "../../../lib/Component";
import { Layer, LayerContext, LayerProps } from "../../../services/Layer";
import { BlockState } from "../../../store/block/Block";
import { GroupState, TGroup, TGroupId } from "../../../store/group/Group";

import { Group } from "./Group";

export type BlockGroupsProps = LayerProps & {
  // Some specific props
  mapBlockGroups?: (blocks: BlockState[]) => GroupState[];
  groupComponent?: typeof Group;
  draggable?: boolean;
  updateBlocksOnDrag?: boolean;
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

export class BlockGroups extends Layer<BlockGroupsProps, BlockGroupsContext, BlockGroupsState> {
  public static withBlockGrouping({
    groupingFn,
    mapToGroups,
  }: {
    groupingFn: (blocks: BlockState[]) => Record<string, BlockState[]>;
    mapToGroups: (key: string, blocks: BlockState[]) => TGroup;
  }) {
    return class extends BlockGroups {
      public $groupsBlocksMap = computed(() => {
        const blocks = this.props.graph.rootStore.blocksList.$blocks.value;
        return groupingFn(blocks);
      });

      constructor(props: BlockGroupsProps) {
        super(props);
        this.unsubscribe.push(
          computed(() => {
            const groupedBlocks = this.$groupsBlocksMap.value;
            return Object.entries(groupedBlocks).map(([key, blocks]) => mapToGroups(key, blocks));
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

  constructor(props: BlockGroupsProps) {
    super({
      canvas: {
        zIndex: 1,
        respectPixelRatio: true,
        classNames: ["no-user-select"],
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

    this.context.camera.on("update", this.requestRender);

    this.unsubscribe.push(
      this.$groupsSource.subscribe((groups) => {
        this.shouldUpdateChildren = true;
        this.shouldRenderChildren = true;
        this.setState({ groups });
      })
    );
  }

  public updateBlocks = (groupId: TGroupId, { diffX, diffY }: { diffX: number; diffY: number }) => {
    const blocks = this.$groupsBlocksMap.value[groupId];
    if (blocks) {
      blocks.forEach((block) => {
        block.updateXY(block.x - diffX, block.y - diffY);
      });
    }
  };

  public setGroups(groups: TGroup[]) {
    this.props.graph.rootStore.groupsList.setGroups(groups);
  }

  public updateGroups(groups: TGroup[]) {
    this.props.graph.rootStore.groupsList.updateGroups(groups);
  }

  protected unmountLayer(): void {
    this.context.camera.off("update", this.requestRender);
  }

  protected requestRender = () => {
    this.performRender();
  };

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
          updateBlocksOnDrag: this.props.updateBlocksOnDrag || false,
        },
        { key: group.id }
      );
    });
  }

  public render() {
    const dpr = this.context.constants.system.PIXEL_RATIO;
    this.context.ctx.setTransform(1, 0, 0, 1, 0, 0);

    const cameraState = this.context.camera.getCameraState();
    this.context.ctx.clearRect(0, 0, cameraState.width * dpr, cameraState.height * dpr);

    this.context.ctx.setTransform(
      cameraState.scale * dpr,
      0,
      0,
      cameraState.scale * dpr,
      cameraState.x * dpr,
      cameraState.y * dpr
    );
  }
}
