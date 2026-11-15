// Test helpers for scene components (excluded from the published types in tsconfig.publish.json).
import { signal } from "@preact/signals-core";
import type { Signal } from "@preact/signals-core";

import { Component } from "../../../lib/Component";
import type { ChildDescriptor } from "../../../lib/CoreComponent";
import { globalScheduler } from "../../../lib/Scheduler";
import type { TScenePrimitive } from "../../../lib/scene/types";
import { Layer } from "../../../services/Layer";
import type { LayerProps } from "../../../services/Layer";
import type { TPoint } from "../../../utils/types/shapes";
import type { TGraphComponentProps } from "../GraphComponent";

import { SceneComponent } from "./SceneComponent";
import type { TSceneParent } from "./SceneComponent";

export type TBoxSource = { x: Signal<number>; title: Signal<string>; meta: Signal<{ tone: string }> };
export type TBoxView = { title: string; meta: { tone: string } };
export type TBoxProps = TGraphComponentProps & { id: string; source: TBoxSource; zIndex?: number; dots?: number };
export type TBoxDotProps = TGraphComponentProps & { id: string; index: number };

export function boxSource(title = "box", x = 0): TBoxSource {
  return { x: signal(x), title: signal(title), meta: signal({ tone: "a" }) };
}

export function frames(count = 3): void {
  for (let i = 0; i < count; i++) globalScheduler.performUpdate();
}

/** What a dot reads from its parent box. */
type TDotHost = { getSource(): TBoxSource; getSceneElementId(): string };

function isDotHost(value: unknown): value is TDotHost {
  return typeof (value as Partial<TDotHost> | undefined)?.getSource === "function";
}

/** A child element of a Box: a dot at the box's right edge, 10 units apart per index. */
export class BoxDot extends SceneComponent<{ r: number }, TBoxDotProps> {
  public static override entityType = "dot";

  public getEntityId(): string {
    return this.props.id;
  }

  protected getViewData(): { r: number } {
    return { r: 4 };
  }

  protected schematic(view: { r: number }): TScenePrimitive[] {
    return [{ kind: "circle", cx: 0, cy: 0, r: view.r, part: "dot" }];
  }

  protected getSceneOrigin(): TPoint {
    const box = this.getParent();
    return isDotHost(box) ? { x: box.getSource().x.value + 100, y: 10 * (this.props.index + 1) } : { x: 0, y: 0 };
  }

  protected getSceneParent(): TSceneParent | undefined {
    const box = this.getParent();
    return isDotHost(box) ? { elementId: box.getSceneElementId(), order: this.props.index } : undefined;
  }
}

/** A scene component for tests: a 100 x 50 body and a title, its origin and view data read from signals. */
export class Box extends SceneComponent<TBoxView, TBoxProps> {
  public static override entityType = "box";

  /** How many times the level methods ran (counted in `minimalistic`). */
  public levelRuns = 0;

  public getEntityId(): string {
    return this.props.id;
  }

  public getSource(): TBoxSource {
    return this.props.source;
  }

  public refresh(): void {
    this.invalidate();
  }

  protected willMount(): void {
    super.willMount();
    this.subscribeSignal(this.props.source.x, (x: number) => this.setHitBox(x, 0, x + 100, 50));
  }

  protected updateChildren(): ChildDescriptor[] {
    return Array.from({ length: this.props.dots ?? 0 }, (_, index) =>
      BoxDot.create({ id: `${this.props.id}/${index}`, index }, { key: String(index) })
    );
  }

  protected getViewData(): TBoxView {
    return { title: this.props.source.title.value, meta: this.props.source.meta.value };
  }

  protected getSceneOrigin(): TPoint {
    return { x: this.props.source.x.value, y: 0 };
  }

  protected getSceneZIndex(): number {
    return this.props.zIndex ?? 200;
  }

  protected minimalistic(_view: TBoxView): TScenePrimitive[] {
    this.levelRuns++;
    return [{ kind: "rect", x: 0, y: 0, width: 100, height: 50, part: "body" }];
  }

  protected schematic(view: TBoxView): TScenePrimitive[] {
    return [
      { kind: "rect", x: 0, y: 0, width: 100, height: 50, part: "body" },
      {
        kind: "text",
        text: view.title,
        family: "sans-serif",
        size: 12,
        lineHeight: 14,
        x: 4,
        y: 4,
        width: 92,
        part: "title",
      },
    ];
  }
}

class TestContainer extends Component<{ children: ChildDescriptor[] }> {
  protected propsChanged(next: { children: ChildDescriptor[] }): void {
    this.shouldUpdateChildren = true;
    super.propsChanged(next);
  }

  protected updateChildren(): ChildDescriptor[] {
    return this.props.children;
  }
}

/** A layer whose children are given as props; `setProps({ children })` reconciles them. */
export class TestLayer extends Layer<LayerProps & { children: ChildDescriptor[] }> {
  protected propsChanged(next: LayerProps & { children: ChildDescriptor[] }): void {
    this.shouldUpdateChildren = true;
    super.propsChanged(next);
  }

  protected updateChildren(): ChildDescriptor[] {
    return [TestContainer.create({ children: this.props.children })];
  }
}
