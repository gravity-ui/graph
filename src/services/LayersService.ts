import { ESchedulerPriority } from "../lib";
import { Component } from "../lib/Component";
import { Emitter } from "../utils/Emitter";
import { throttle } from "../utils/functions";

import { Layer } from "./Layer";

export class Layers extends Emitter {
  private attached = false;

  private rootSize: { width: number; height: number } = { width: 0, height: 0 };

  protected layers: Set<Layer> = new Set();

  constructor(public $root?: HTMLDivElement) {
    super();
    window.addEventListener("resize", this.handleRootResize);
  }

  public createLayer<T extends Constructor<Layer> = Constructor<Layer>>(
    layerCtor: T,
    props: T extends Constructor<Layer<infer Props>> ? Omit<Props, "root"> & { root?: Props["root"] } : never
  ): InstanceType<T> {
    const layer = Component.mount(layerCtor, {
      root: this.$root,
      ...props,
    }) as InstanceType<T>;
    this.layers.add(layer);
    if (this.attached) {
      const { width, height } = this.rootSize;
      layer.updateSize(width, height);
      layer.attachLayer(this.$root);
    }
    return layer;
  }

  public detachLayer(layer: Layer) {
    this.layers.delete(layer);
    layer.detachLayer();
  }

  public getRootSize() {
    return this.rootSize;
  }

  public getLayers(): Layer[] {
    return Array.from(this.layers);
  }

  public attach(root: HTMLDivElement = this.$root) {
    this.$root = root;
    this.layers.forEach((layer) => {
      layer.attachLayer(this.$root);
    });
  }

  public start(root: HTMLDivElement = this.$root) {
    if (this.attached) {
      return;
    }
    this.attach(root);
    if (!this.$root) {
      throw new Error("Root not specified");
    }
    this.updateSize();
    this.resizeObserver.observe(this.$root, { box: "border-box" });
    this.attached = true;
  }

  public detach(full = false) {
    if (this.attached) {
      this.layers.forEach((layer) => {
        layer.detachLayer();
      });

      this.attached = false;
    }

    this.handleRootResize.cancel();
    this.resizeObserver.disconnect();

    if (full) {
      this.$root = undefined;
    }
  }

  public unmount() {
    this.detach(true);
    this.destroy();
    window.removeEventListener("resize", this.handleRootResize);
  }

  protected resizeObserver = new ResizeObserver(() => {
    this.handleRootResize();
  });

  protected handleRootResize = throttle(
    () => {
      this.updateSize();
    },
    {
      priority: ESchedulerPriority.HIGHEST,
    }
  );

  public destroy() {
    this.detach();
    this.destroyLayers();
    this.off();
  }

  protected destroyLayers() {
    this.layers.forEach((layer) => {
      Component.unmount(layer);
    });
  }

  public updateSize = () => {
    if (!this.rootSize) {
      return;
    }
    const changed = this.updateRootSize();
    if (!changed) {
      return;
    }

    const { width, height } = this.rootSize;
    this.layers.forEach((layer) => {
      layer.updateSize(width, height);
    });
    this.emit("update-size", this.rootSize);
  };

  private updateRootSize = () => {
    let changed = false;
    if (!this.$root) {
      return changed;
    }
    if (this.rootSize.width !== this.$root.clientWidth) {
      this.rootSize.width = this.$root.clientWidth;
      changed = true;
    }
    if (this.rootSize.height !== this.$root.clientHeight) {
      changed = true;
      this.rootSize.height = this.$root.clientHeight;
    }
    return changed;
  };
}
