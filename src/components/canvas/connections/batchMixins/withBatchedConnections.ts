import { Component } from "../../../../lib/Component";
import { TGraphLayerContext } from "../../layers/graphLayer/GraphLayer";

import { IWithBatchedConnection } from "./withBatchedConnection";

export interface IWithBatchedConnections {
  addInRenderOrder(comp: unknown, settings: TConnectionRenderSettings): void;
  removeFromRenderOrder(comp: unknown): void;
}

type ConnectionComponent = Component & IWithBatchedConnection;
export type TConnectionRenderSettings = Partial<
  Pick<CanvasRenderingContext2D, "fillStyle" | "lineWidth" | "strokeStyle">
> & { zIndex: number; lineDash?: number[] };

// default export because https://github.com/microsoft/TypeScript/issues/30355#issuecomment-671095933
export default <T extends Constructor<Component>>(superclass: T): T & Constructor<IWithBatchedConnections> =>
  class BatchedConnections extends superclass implements IWithBatchedConnections {
    public declare context: TGraphLayerContext;

    private mapKeyToComps = new Map<string, Set<ConnectionComponent>>();

    private mapKeyToSettings = new Map<string, TConnectionRenderSettings>();

    private mapCompToComps = new WeakMap<ConnectionComponent, Set<ConnectionComponent>>();

    private wasModified = false;

    private sortedCouplesKeySetting: [string, TConnectionRenderSettings][] = [];

    public addInRenderOrder(comp: ConnectionComponent, settings: TConnectionRenderSettings) {
      const key = JSON.stringify(settings);
      let comps = this.mapCompToComps.get(comp);

      if (comps && this.mapKeyToComps.get(key) !== comps) {
        comps.delete(comp);
      }

      comps = this.mapKeyToComps.get(key);

      if (!comps) {
        comps = new Set([comp]);

        this.mapKeyToSettings.set(key, settings);
        this.mapKeyToComps.set(key, comps);
      } else if (!comps.has(comp)) {
        comps.add(comp);
      }

      this.mapCompToComps.set(comp, comps);
      this.wasModified = true;
      this.performRender();
    }

    public removeFromRenderOrder(comp: ConnectionComponent) {
      if (this.mapCompToComps.has(comp)) {
        const comps = this.mapCompToComps.get(comp);
        comps.delete(comp);
        this.mapCompToComps.delete(comp);
      }
    }

    protected willIterate() {
      super.willIterate();

      if (this.wasModified) {
        this.wasModified = false;
        this.sortedCouplesKeySetting = Array.from(this.mapKeyToSettings.entries()).sort((item1, item2) => {
          return item2[1].zIndex - item1[1].zIndex;
        });
      }
    }

    protected render() {
      for (let i = 0; i < this.sortedCouplesKeySetting.length; i += 1) {
        const key = this.sortedCouplesKeySetting[i][0];
        const settings = this.sortedCouplesKeySetting[i][1];

        // because original will be changed during addInRenderOrder while ._iterate() below
        const comps = [...this.mapKeyToComps.get(key)];

        this.context.ctx.beginPath();

        for (let j = 0; j < comps.length; j += 1) {
          comps[j]._iterate();
        }

        if ("lineDash" in settings && settings.lineDash) {
          this.context.ctx.setLineDash(settings.lineDash);
        }
        Object.assign(this.context.ctx, settings);

        if (settings.strokeStyle) this.context.ctx.stroke();
        if (settings.fillStyle) this.context.ctx.fill();

        if ("lineDash" in settings) {
          this.context.ctx.setLineDash([]);
        }
      }
    }
  };
