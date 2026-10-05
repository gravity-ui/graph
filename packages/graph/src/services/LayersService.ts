import { signal } from "@preact/signals-core";

import { ESchedulerPriority } from "../lib";
import { Component } from "../lib/Component";
import { Emitter } from "../utils/Emitter";
import { observeDPR, throttle } from "../utils/functions";

import { Layer } from "./Layer";

export type LayersRootSize = { width: number; height: number; dpr: number };

export class Layers extends Emitter<{ "update-size": (size: LayersRootSize) => void }> {
  private attached = false;

  public readonly rootSize = signal({ width: 0, height: 0, dpr: globalThis.devicePixelRatio || 1 });

  protected layers: Set<Layer> = new Set();

  private unwatchDPR?: () => void;

  constructor(public $root?: HTMLDivElement) {
    super();
  }

  public getDPR() {
    return globalThis.devicePixelRatio || 1;
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
    if (this.attached && this.$root) {
      layer.attachLayer(this.$root);
    }
    return layer;
  }

  public detachLayer(layer: Layer) {
    this.layers.delete(layer);
    layer.detachLayer();
  }

  public getRootSize() {
    return this.rootSize.value;
  }

  public getLayers(): Layer[] {
    return Array.from(this.layers);
  }

  public attach(root: HTMLDivElement | undefined = this.$root) {
    if (!root) throw new Error("Root not specified");
    this.$root = root;
    this.layers.forEach((layer) => {
      layer.attachLayer(root);
    });
  }

  public start(root: HTMLDivElement | undefined = this.$root) {
    if (this.attached) {
      return;
    }
    this.attach(root);
    if (!this.$root) {
      throw new Error("Root not specified");
    }
    this.updateSize();
    this.resizeObserver.observe(this.$root, { box: "border-box" });
    window.addEventListener("resize", this.handleRootResize);
    this.unwatchDPR = observeDPR(() => this.updateSize());
    this.attached = true;
  }

  public detach(full = false) {
    this.layers.forEach((layer) => {
      layer.detachLayer();
    });

    this.attached = false;

    window.removeEventListener("resize", this.handleRootResize);
    this.unwatchDPR?.();
    this.unwatchDPR = undefined;

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

  protected handleRootResize = throttle(
    () => {
      this.updateSize();
    },
    {
      priority: ESchedulerPriority.LOWEST,
      frameInterval: 1,
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
    this.layers.clear();
  }

  public updateSize = () => {
    if (!this.$root) {
      return;
    }
    this.rootSize.value = {
      width: this.$root.clientWidth,
      height: this.$root.clientHeight,
      dpr: this.getDPR(),
    };
    this.emit("update-size", this.getRootSize());
  };
}
