import React, { memo, startTransition, useEffect, useLayoutEffect, useRef, useState } from "react";

import { BlockState, CanvasBlock, Graph, GraphState, TBlock, entityKey } from "@gravity-ui/graph";

import { useSignal } from "./hooks";
import { useSceneChange } from "./hooks/useSceneChange";
import { useCompareState } from "./utils/hooks/useCompareState";
import { useFn } from "./utils/hooks/useFn";

export type TRenderBlockFn = <T extends TBlock>(graphObject: Graph, block: T) => React.JSX.Element;

export type TBlockListProps = {
  graphObject: Graph;
  renderBlock: TRenderBlockFn;
};

export type TBlockProps = {
  blockState: BlockState<TBlock>;
  graphObject: Graph;
  renderBlock: <T extends TBlock>(graphObject: Graph, block: T, blockState: BlockState<T>) => React.JSX.Element;
};

export const Block: React.FC<TBlockProps> = memo((props: TBlockProps) => {
  const block = useSignal(props.blockState.$state);

  if (!block) return null;

  return props.renderBlock(props.graphObject, block, props.blockState);
});

/**
 * Optimized comparison using Set instead of map.sort + lodash.isEqual
 * For proof that Set is faster than map.sort + lodash.isEqual run `node benchmarks/blocklist-comparison.bench.js`
 *
 * Note: lodash.isEqual is more memory-efficient for large lists, but we expect no more than 100 blocks
 * in detailed view, where Set-based comparison significantly outperforms map.sort + lodash.isEqual
 */
/** BlocksList's hold of the pointer's retarget (`GraphLayer.holdRetarget`) while the detailed level's views mount. */
type TRetargetHold = {
  /** Whether a list was asked for under it: it waits for that list's commit. */
  waitsForList: boolean;
  readonly release: () => void;
};

const hasBlockListChanged = (newStates: BlockState<TBlock>[], oldStates: BlockState<TBlock>[]): boolean => {
  if (newStates === oldStates) return false;
  if (newStates.length !== oldStates.length) return true;

  // A deleted block can return under the same id with a different state and subscriptions.
  const previous = new Set(oldStates);
  return newStates.some((state) => !previous.has(state));
};

export const BlocksList = memo(function BlocksList({ renderBlock, graphObject }: TBlockListProps) {
  const [blockStates, setBlockStates] = useState<BlockState<TBlock>[]>([]);
  const [graphState, setGraphState] = useCompareState(graphObject.state);
  /** The list last asked for: the scene change compares the blocks in view with it. */
  const requestedStates = useRef(blockStates);
  const committedStates = useRef(blockStates);
  /** The pointer's retarget, held from the level's change to detailed until the new views mounted. */
  const retargetHold = useRef<TRetargetHold | undefined>(undefined);

  const releaseViews = useFn((): void => {
    const hold = retargetHold.current;
    retargetHold.current = undefined;
    hold?.release();
  });

  // The views of the detailed level mount after React commits them, a frame or more after the level changed; their
  // blocks take their holds then (`GraphBlock`, `delegateRender`). Until then a still pointer's target waits, so an
  // anchor it is on is not dropped and taken back. The hold ends when the list it waits for commits, a newer list
  // replaces that one, the level leaves detailed, this list unmounts, or after a few graph frames (GraphLayer's bound):
  // a commit that never comes (a suspended transition) delays the pointer's target no longer than that.
  useLayoutEffect(() => {
    const unsubscribe = graphObject.scene.$level.subscribe((level) => {
      if (level !== "detailed") {
        releaseViews();
        return;
      }
      if (retargetHold.current) return;
      const hold: TRetargetHold = {
        waitsForList: false,
        release: graphObject.getGraphLayer().holdRetarget(() => {
          // Its bound released it: the list it waited for is given up on.
          if (retargetHold.current === hold) retargetHold.current = undefined;
        }),
      };
      retargetHold.current = hold;
    });
    return () => {
      unsubscribe();
      releaseViews();
    };
  }, [graphObject, releaseViews]);

  useSceneChange(graphObject, () => {
    // The blocks in view, whether or not the level hits them: a class's `hitLevels` decide targeting, not HTML.
    const next: BlockState<TBlock>[] = [];
    if (graphObject.scene.$level.value === "detailed") {
      const states = graphObject.rootStore.blocksList.$blocksMap.peek();
      for (const component of graphObject.getComponentsInViewport([CanvasBlock])) {
        const state = states.get(component.connectedState.id);
        if (state) next.push(state);
      }
    }
    const hold = retargetHold.current;
    if (!hasBlockListChanged(next, requestedStates.current)) {
      // A second entry can ask for the same list while the previous entry's render is still pending.
      if (hold && !hold.waitsForList) {
        hold.waitsForList = hasBlockListChanged(requestedStates.current, committedStates.current);
        if (!hold.waitsForList) releaseViews();
      }
      return;
    }
    // A newer list replaces the one the hold waited for; a hold that waited for none waits for this one.
    if (hold?.waitsForList) releaseViews();
    else if (hold) hold.waitsForList = true;
    requestedStates.current = next;
    // The scene still draws these blocks until their HTML commits. React can yield to camera and input
    // while preparing the first detailed list. Removing an old list stays urgent.
    if (hold && next.length) startTransition(() => setBlockStates(next));
    else setBlockStates(next);
  });

  // After a commit: the views' effects ran before this one (children first), so their holds are taken.
  useEffect(() => {
    committedStates.current = blockStates;
    if (retargetHold.current && !hasBlockListChanged(requestedStates.current, blockStates)) releaseViews();
  }, [blockStates, releaseViews]);

  useEffect(() => {
    setGraphState(graphObject.state);

    return graphObject.on("state-change", (event) => {
      setGraphState(event.detail.state);
    });
  }, [graphObject, setGraphState]);

  return (
    <div>
      {graphState === GraphState.READY &&
        blockStates.map((blockState) => {
          return (
            <Block
              key={entityKey("block", blockState.id)}
              renderBlock={renderBlock}
              graphObject={graphObject}
              blockState={blockState}
            />
          );
        })}
    </div>
  );
});
