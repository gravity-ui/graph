import { ESelectionStrategy, GraphComponent } from "@gravity-ui/graph";
import type { TConnectionId } from "@gravity-ui/graph";

import type { WebGLConnectionsLayer } from "./WebGLConnectionsLayer";

type THitBoxData = Parameters<GraphComponent["onHitBox"]>[0];

export type TWebGLConnectionsHitTargetProps = {
  layer: WebGLConnectionsLayer;
};

/**
 * One hit-test entry standing in for all WebGL connections. Its hitbox covers the union of the
 * connections; `onHitBox` does the precise test through the layer, so the graph's usual target
 * resolution (blocks above connections, connections above groups) keeps working without a component
 * per connection.
 */
export class WebGLConnectionsHitTarget extends GraphComponent<
  TWebGLConnectionsHitTargetProps & { affectsUsableRect?: boolean }
> {
  public readonly cursor = "pointer";

  /** Connection found by the last hit test. */
  private lastHit: TConnectionId | undefined;

  public getEntityId(): string {
    return "webgl-connections";
  }

  /** Between groups (0) and blocks (1), like canvas connections that win over groups. */
  public get zIndex(): number {
    return 0.5;
  }

  protected willMount(): void {
    super.willMount();
    this.listenEvents(["click", "mouseleave"]);
  }

  /** Whether the hitbox is out of the hit test (initially, or after all connections became hidden). */
  private hitBoxRemoved = true;

  public updateBounds(bounds: [number, number, number, number] | undefined): void {
    if (!bounds) {
      if (!this.hitBoxRemoved) this.removeHitBox();
      this.hitBoxRemoved = true;
      return;
    }
    // unchanged bounds are skipped by HitBox unless the hitbox has to be re-added
    this.setHitBox(bounds[0], bounds[1], bounds[2], bounds[3], this.hitBoxRemoved);
    this.hitBoxRemoved = false;
  }

  public onHitBox(data: THitBoxData): boolean {
    if (!super.onHitBox(data)) return false;
    this.lastHit = this.props.layer.pick({ x: (data.minX + data.maxX) / 2, y: (data.minY + data.maxY) / 2 });
    return this.lastHit !== undefined;
  }

  /** GraphLayer calls this on every mousemove over the current target: move the hover between connections. */
  public _trackAreaHover(): void {
    super._trackAreaHover();
    this.props.layer.setHovered(this.lastHit);
  }

  public _clearAreaHover(scheduleRender = false): void {
    super._clearAreaHover(scheduleRender);
    this.props.layer.setHovered(undefined);
  }

  protected handleEvent(event: Event): void {
    if (event.type === "mouseleave") {
      this.props.layer.setHovered(undefined);
      return;
    }
    if (event.type !== "click" || !(event instanceof MouseEvent)) return;
    event.stopPropagation();
    const point = this.context.graph.getPointInCameraSpace(event);
    const id = this.props.layer.pick(point.world);
    if (id === undefined) return;
    const toggle = event.metaKey || event.ctrlKey;
    const selected = this.context.graph.rootStore.connectionsList.getConnectionState(id)?.$selected.value ?? false;
    this.context.graph.api.selectConnections(
      [id],
      toggle ? !selected : true,
      toggle ? ESelectionStrategy.APPEND : ESelectionStrategy.REPLACE
    );
  }

  protected isVisible(): boolean {
    // nothing to draw: rendering is done by the layer
    return false;
  }
}
