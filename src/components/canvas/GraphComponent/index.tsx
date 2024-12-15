import { Signal } from "@preact/signals-core";

import { Graph } from "../../../graph";
import { Component } from "../../../lib";
import { TComponentContext, TComponentProps, TComponentState } from "../../../lib/Component";
import { HitBox, HitBoxData } from "../../../services/HitTest";
import { EventedComponent } from "../EventedComponent/EventedComponent";
import { TGraphLayerContext } from "../layers/graphLayer/GraphLayer";

export type GraphComponentContext = TComponentContext &
  TGraphLayerContext & {
    graph: Graph;
  };

export class GraphComponent<
  Props extends TComponentProps = TComponentProps,
  State extends TComponentState = TComponentState,
  Context extends GraphComponentContext = GraphComponentContext,
> extends EventedComponent<Props, State, Context> {
  public hitBox: HitBox;

  private unsubscribe: (() => void)[] = [];

  constructor(props: Props, parent: Component) {
    super(props, parent);
    this.hitBox = new HitBox(this, this.context.graph.hitTest);
  }

  protected subscribeSignal<T>(signal: Signal<T>, cb: (v: T) => void) {
    this.unsubscribe.push(signal.subscribe(cb));
  }

  protected unmount() {
    super.unmount();
    this.unsubscribe.forEach((cb) => cb());
    this.destroyHitBox();
  }

  public setHitBox(minX: number, minY: number, maxX: number, maxY: number, force?: boolean) {
    this.hitBox.update(minX, minY, maxX, maxY, force);
  }

  protected willIterate(): void {
    super.willIterate();
    if (!this.firstIterate) {
      this.shouldRender = this.isVisible();
    }
  }

  protected isVisible() {
    return this.context.camera.isRectVisible(...this.getHitBox());
  }

  public getHitBox() {
    return this.hitBox.getRect();
  }

  public removeHitBox() {
    this.hitBox.remove();
  }

  public destroyHitBox() {
    this.hitBox.destroy();
  }

  public onHitBox(_: HitBoxData) {
    return this.isIterated();
  }
}
