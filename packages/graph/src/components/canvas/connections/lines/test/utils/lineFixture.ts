import type { TBatchParams } from "../../../../../../lib/batch/types";
import type { TConnection } from "../../../../../../store/connection/ConnectionState";
import type { BlockConnection } from "../../../BlockConnection";
import type { IConnectionBatch, IConnectionBatchItem } from "../../../batch";
import { blockGeometry, multipointGeometry } from "../../../geometry";
import type { TConnectionGeometry } from "../../../geometry";

class RecordingBatch implements IConnectionBatch {
  public readonly items = new Map<IConnectionBatchItem, TBatchParams>();
  public readonly dirty: IConnectionBatchItem[] = [];
  public add(item: IConnectionBatchItem, params: TBatchParams): void {
    this.update(item, params);
  }
  public update(item: IConnectionBatchItem, params: TBatchParams): void {
    const previous = this.items.get(item);
    if (previous && previous.zIndex === params.zIndex && previous.group === params.group) this.dirty.push(item);
    this.items.set(item, { ...params });
  }
  public delete(item: IConnectionBatchItem): void {
    this.items.delete(item);
  }
  public has(item: IConnectionBatchItem): boolean {
    return this.items.has(item);
  }
  public markDirty(item: IConnectionBatchItem): void {
    this.dirty.push(item);
  }
  public markBoundsDirty(): void {}
}

export type TStubState = Partial<TConnection & { hovered: boolean; selected: boolean }>;

/** The members of BlockConnection a line reads. */
export function stubConnection(
  geometry: TConnectionGeometry | undefined,
  state: TStubState = {},
  props: { showConnectionArrows: boolean; useTightBezierBounds?: boolean } = {
    showConnectionArrows: true,
    useTightBezierBounds: true,
  }
): { connection: BlockConnection<TConnection>; batch: RecordingBatch; ctx: CanvasRenderingContext2D } {
  const batch = new RecordingBatch();
  const ctx = document.createElement("canvas").getContext("2d") as CanvasRenderingContext2D;
  const connection = {
    context: {
      batch,
      ctx,
      colors: { connection: { background: "#aaa", selectedBackground: "#fc0" } },
      camera: { getCameraScale: () => 1 },
    },
    state: { id: "c", ...state },
    props,
    getSceneKey: () => undefined,
    getGeometry: () => geometry,
    getBatchZIndex: () => 0,
    isPathVisible: () => true,
    getPathBounds: () => undefined,
    isInViewport: () => true,
  };
  return { connection: connection as unknown as BlockConnection<TConnection>, batch, ctx };
}

export const straight = blockGeometry({
  source: { x: 0, y: 0 },
  target: { x: 100, y: 0 },
  points: [],
  useBezier: false,
  bezierDirection: "horizontal",
  connection: { id: "c" } as TConnection,
}) as TConnectionGeometry;

export const closedArrowGeometry = multipointGeometry({
  source: { x: 0, y: 0 },
  target: { x: 100, y: 100 },
  points: [
    { x: 0, y: 0 },
    { x: 50, y: 0 },
    { x: 100, y: 100 },
  ],
  useBezier: false,
  bezierDirection: "horizontal",
  connection: { id: "c" } as TConnection,
}) as TConnectionGeometry;
