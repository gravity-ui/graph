import type { Graph } from "../../../../graph";
import { LEVEL_BIT, unionLevelMasks } from "../../../../lib/scene/levels";
import { Anchor } from "../index";
import type { TAnchor, TAnchorClass, TAnchorId } from "../index";

export type TAnchorLook = {
  readonly levels: number;
  readonly reach: number;
  readonly hasCustomClass: boolean;
};

export type TResolvedAnchorClasses = TAnchorLook & {
  readonly list: readonly TAnchorClass[];
  readonly byId: ReadonlyMap<TAnchorId, TAnchorClass>;
};

export const STOCK_ANCHORS: TAnchorLook = {
  levels: LEVEL_BIT.schematic + LEVEL_BIT.detailed,
  // Anchor and Block can import each other through the component tree.
  get reach() {
    return Anchor.LOOK_EXTENT;
  },
  hasCustomClass: false,
};

/** Cache which classes the block selected. Their public LOOK_EXTENT can change between camera or export queries. */
export function describeAnchorClasses(
  anchors: readonly TAnchor[],
  list: readonly TAnchorClass[]
): TResolvedAnchorClasses {
  const classes = new Set(list);
  let byId: ReadonlyMap<TAnchorId, TAnchorClass> | undefined;
  let levels = 0;
  let hasCustomClass = false;
  for (const klass of classes) {
    levels = unionLevelMasks(levels, Anchor.creationLevelsOf(klass));
    hasCustomClass ||= klass !== Anchor;
  }
  return {
    list,
    get byId() {
      return (byId ??= new Map(anchors.map(({ id }, i) => [id, list[i]])));
    },
    levels,
    hasCustomClass,
    get reach() {
      let reach = 0;
      for (const klass of classes) {
        const extent = klass.LOOK_EXTENT;
        if (extent > reach) reach = extent;
      }
      return reach;
    },
  };
}

type TAnchorLimits = { overflow: number; reach: number; levels: number };
const graphLimits = new WeakMap<Graph, TAnchorLimits>();

/** Blocks widen the camera search as their anchors change. The block list resets it when a block leaves. */
export function anchorLimitsOf(graph: Graph): TAnchorLimits {
  let limits = graphLimits.get(graph);
  if (!limits) {
    limits = { overflow: 0, reach: STOCK_ANCHORS.reach, levels: STOCK_ANCHORS.levels };
    graphLimits.set(graph, limits);
  }
  return limits;
}
