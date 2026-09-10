export type BlockLayoutGeometry = { x: number; y: number; width: number; height: number };
export type BlockLayoutLastState = { x: number; y: number; width: number; height: number; zIndex: number };

/**
 * Applies block geometry (position, size) and z-index to the container element,
 * updating only the properties that have changed. Shared between mount-time
 * (useLayoutEffect) and signal-driven (useSignalEffect) updates.
 *
 * @returns flags indicating which properties changed
 */
export function applyBlockContainerLayout(
  container: HTMLDivElement,
  geometry: BlockLayoutGeometry,
  viewState: { $viewState: { value: { zIndex?: number; order?: number } } },
  lastState: BlockLayoutLastState
): { hasPositionChange: boolean; hasSizeChange: boolean } {
  const hasPositionChange = lastState.x !== geometry.x || lastState.y !== geometry.y;
  const hasSizeChange = lastState.width !== geometry.width || lastState.height !== geometry.height;

  if (hasPositionChange) {
    container.style.setProperty("--graph-block-geometry-x", `${geometry.x}px`);
    container.style.setProperty("--graph-block-geometry-y", `${geometry.y}px`);
    lastState.x = geometry.x;
    lastState.y = geometry.y;
  }

  if (hasSizeChange) {
    container.style.setProperty("--graph-block-geometry-width", `${geometry.width}px`);
    container.style.setProperty("--graph-block-geometry-height", `${geometry.height}px`);
    lastState.width = geometry.width;
    lastState.height = geometry.height;
  }

  const { zIndex, order } = viewState.$viewState.value;
  const newZIndex = (zIndex || 0) + (order || 0);

  if (lastState.zIndex !== newZIndex) {
    container.style.zIndex = `${newZIndex}`;
    lastState.zIndex = newZIndex;
  }

  return { hasPositionChange, hasSizeChange };
}
