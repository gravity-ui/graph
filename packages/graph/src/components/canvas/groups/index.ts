import { BlockState } from "../../../store/block/Block";
import { TGroup } from "../../../store/group/Group";
import { TRect } from "../../../utils/types/shapes";

import { BlockGroups } from "./BlockGroups";
import { BlockGroupsTransferLayer } from "./BlockGroupsTransferLayer";
import { Group } from "./Group";

// Export components
export { BlockGroups, Group, BlockGroupsTransferLayer };

// Export types from BlockGroups
export type { BlockGroupsProps, BlockGroupsContext, BlockGroupsState } from "./BlockGroups";

// Export types from Group
export type { TGroupProps, TGroupStyle, TGroupGeometry } from "./Group";

// Export types from TransferableBlockGroups
export type {
  BlockGroupsTransferLayerProps,
  OnTransferStart,
  OnTransferEnd,
  OnBlockGroupChange,
  TBlockGroupsTransferGroupChange,
} from "./BlockGroupsTransferLayer";

// Export utility types for withBlockGrouping
export type { BlockState } from "../../../store/block/Block";
export type { TGroup, TGroupId } from "../../../store/group/Group";
export type { TRect } from "../../../utils/types/shapes";

/**
 * Function type for grouping blocks in withBlockGrouping
 */
export type GroupingFn = (blocks: BlockState[]) => Record<string, BlockState[]>;

/**
 * Function type for mapping grouped blocks to TGroup objects in withBlockGrouping
 */
export type MapToGroupsFn = (key: string, params: { blocks: BlockState[]; rect: TRect }) => TGroup;
