import debounce from "lodash/debounce";

import { Component } from "../lib/Component";
import { Emitter } from "../utils/Emitter";

import { Layer } from "./Layer";

export class Layers extends Emitter {
  private attached = false;

  private rootSize: { width: number; height: number } = { width: 0, height: 0 };

  protected layers: Set<Layer> = new Set();

  constructor(public $root?: HTMLDivElement) {
    super();
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

  public getRootSize() {
    return this.rootSize;
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
  }

  protected resizeObserver = new ResizeObserver(() => {
    this.handleRootResize();
  });

  protected handleRootResize = debounce(() => {
    this.updateSize();
  }, 16);

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
    this.updateRootSize();

    const { width, height } = this.rootSize;
    this.layers.forEach((layer) => {
      layer.updateSize(width, height);
    });
    this.emit("update-size", this.rootSize);
  };

  private updateRootSize() {
    this.rootSize.width = this.$root.clientWidth;
    this.rootSize.height = this.$root.clientHeight;
  }
}
