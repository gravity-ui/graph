import { Component } from "ya-nirvana-renderer";
import { Graph } from "../graph";
import { HitBox, HitBoxData, IHitBox } from "../services/HitTest";

export interface GraphComponent extends Component {
  context: {
    graph: Graph;
  };
}

export interface IWithHitTest {
  hitBox: IHitBox;
  zIndex: number;
  setHitBox(minX: number, minY: number, maxX: number, maxY: number, force?: boolean): void;
  onHitBox(shape: HitBoxData): boolean;
  removeHitBox(): void;
}

export function debugHitBox(ctx: CanvasRenderingContext2D, component: IWithHitTest) {
  ctx.save();
  ctx.strokeStyle = "red";
  const hitBox = component.hitBox;
  ctx.strokeRect(hitBox.minX, hitBox.minY, hitBox.maxX - hitBox.minX, hitBox.maxY - hitBox.minY);
  ctx.restore();
}

export function withHitTest<T extends Constructor<GraphComponent>>(superclass: T): T & Constructor<IWithHitTest> {
  return class WithHitTest extends superclass implements IWithHitTest {
    public declare context: {
      graph: Graph;
    };

    public declare zIndex: number;

    public hitBox: HitBox;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public constructor(...args: any[]) {
      super(...args);
      this.hitBox = new HitBox(this, this.context.graph.hitTest);
    }

    protected unmount() {
      super.unmount();

      this.destroyHitBox();
    }

    public setHitBox(minX: number, minY: number, maxX: number, maxY: number, force: boolean) {
      this.hitBox.update(minX, minY, maxX, maxY, force);
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

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public onHitBox(shape: HitBoxData) {
      return this.isIterated();
    }
  };
}
