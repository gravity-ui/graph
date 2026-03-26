import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { EventedComponent } from "../../components/canvas/EventedComponent/EventedComponent";
import { GraphComponent } from "../../components/canvas/GraphComponent";
import { Graph } from "../../graph";
import { ESchedulerPriority } from "../../lib";
import { TDebounceOptions } from "../../utils/utils/schedule";
import { useFn } from "../utils/hooks/useFn";

import { useSchedulerDebounce } from "./schedulerHooks";
import { useGraphEvent } from "./useGraphEvents";

export type THoverDebounceConfig = Pick<TDebounceOptions, "priority" | "frameInterval" | "frameTimeout">;

const DEFAULT_HOVER_ENTER_DEBOUNCE: THoverDebounceConfig = {
  priority: ESchedulerPriority.MEDIUM,
  frameInterval: 1,
  frameTimeout: 50,
};

const DEFAULT_HOVER_LEAVE_DEBOUNCE: THoverDebounceConfig = {
  priority: ESchedulerPriority.MEDIUM,
  frameInterval: 1,
  frameTimeout: 50,
};

export interface UseHoveredGraphComponentParams {
  graph: Graph | null;
  isHoverLockTarget?: (target: EventTarget | null) => boolean;
  enterDebounce?: THoverDebounceConfig;
  leaveDebounce?: THoverDebounceConfig;
}

export interface UseHoveredGraphComponentResult {
  hoveredComponent: EventedComponent | null;
}

export function useHoveredGraphComponent({
  graph,
  isHoverLockTarget,
  enterDebounce = DEFAULT_HOVER_ENTER_DEBOUNCE,
  leaveDebounce = DEFAULT_HOVER_LEAVE_DEBOUNCE,
}: UseHoveredGraphComponentParams): UseHoveredGraphComponentResult {
  const [hoveredComponent, setHoveredComponent] = useState<EventedComponent | null>(null);
  const hoveredComponentRef = useRef<EventedComponent | null>(null);
  const hoverLockedRef = useRef(false);

  const setHoverLock = useFn((component: EventedComponent | null, locked: boolean): void => {
    if (component instanceof GraphComponent) {
      component.lockHover(locked);
    }
  });

  const applyHoveredComponent = useFn((nextComponent: EventedComponent | null): void => {
    const prevComponent = hoveredComponentRef.current;
    if (prevComponent === nextComponent) {
      return;
    }

    setHoverLock(prevComponent, false);
    hoveredComponentRef.current = nextComponent;
    setHoveredComponent(nextComponent);
    if (hoverLockedRef.current) {
      setHoverLock(nextComponent, true);
    }
  });

  const applyHoverEnter = useSchedulerDebounce((nextComponent: EventedComponent | null): void => {
    applyHoveredComponent(nextComponent);
  }, enterDebounce);

  const applyHoverLeave = useSchedulerDebounce((): void => {
    applyHoveredComponent(null);
  }, leaveDebounce);

  const scheduleHoverChange = useFn((nextComponent: EventedComponent | null): void => {
    if (nextComponent) {
      applyHoverLeave.cancel();
      applyHoverEnter(nextComponent);
      return;
    }

    applyHoverEnter.cancel();
    applyHoverLeave();
  });

  const handleLockTargetChange = useFn((target: EventTarget | null): void => {
    if (!isHoverLockTarget) {
      return;
    }

    const overLockTarget = isHoverLockTarget(target);
    if (hoverLockedRef.current === overLockTarget) {
      return;
    }

    hoverLockedRef.current = overLockTarget;
    setHoverLock(hoveredComponentRef.current, overLockTarget);

    if (overLockTarget) {
      applyHoverLeave.cancel();
    } else {
      const cursorTarget = graph?.getCursorLayer().getCurrentTarget() ?? null;
      scheduleHoverChange(cursorTarget);
    }
  });

  useGraphEvent(graph, "mouseenter", ({ target, sourceEvent }) => {
    if (isHoverLockTarget?.(sourceEvent.target)) {
      return;
    }
    scheduleHoverChange(target ?? null);
  });

  useGraphEvent(graph, "mouseleave", ({ sourceEvent }) => {
    if (isHoverLockTarget?.(sourceEvent.target) || hoverLockedRef.current) {
      return;
    }
    scheduleHoverChange(null);
  });

  useLayoutEffect(() => {
    const root = graph?.layers.$root;
    if (!root) {
      return undefined;
    }

    const handleMouseLeave = (): void => {
      if (hoverLockedRef.current) {
        return;
      }
      scheduleHoverChange(null);
    };

    root.addEventListener("mouseleave", handleMouseLeave, { capture: true });
    return () => {
      root.removeEventListener("mouseleave", handleMouseLeave, { capture: true });
    };
  }, [graph, scheduleHoverChange]);

  useEffect(() => {
    if (!isHoverLockTarget) {
      return undefined;
    }

    const handleDocumentMouseMove = (event: MouseEvent): void => {
      handleLockTargetChange(event.target);
    };

    document.addEventListener("mousemove", handleDocumentMouseMove, { capture: true });
    return () => {
      document.removeEventListener("mousemove", handleDocumentMouseMove, { capture: true });
    };
  }, [handleLockTargetChange, isHoverLockTarget]);

  useEffect(() => {
    return () => {
      applyHoverEnter.cancel();
      applyHoverLeave.cancel();
      hoverLockedRef.current = false;
      setHoverLock(hoveredComponentRef.current, false);
      hoveredComponentRef.current = null;
    };
  }, [applyHoverEnter, applyHoverLeave, setHoverLock]);

  return {
    hoveredComponent,
  };
}
