import { Graph } from "../../../graph";
import { sceneTextMetrics } from "../../../lib/scene/textMetrics";
import type { TSceneChange, TScenePrimitive, TSceneTextPolicy } from "../../../lib/scene/types";
import type {
  ISceneBackend,
  ISceneBackendModule,
  TSceneFrame,
  TSceneTextFrame,
} from "../../../lib/scene/webgl/backendTypes";
import type { TStyleParts } from "../../styles/types";
import type { TSceneElementView } from "../types";

type TMockContext = CanvasRenderingContext2D & {
  __getDrawCalls(): { type: string; props: { text?: string; x?: number; y?: number } }[];
};

beforeEach(() => {
  // Half the font size per character at TEXT_METRICS_PX (100 px).
  jest.spyOn(sceneTextMetrics, "width").mockImplementation((text) => text.length * 50);
  jest.spyOn(sceneTextMetrics, "top").mockImplementation(() => 80);
});

afterEach(() => jest.restoreAllMocks());

/**
 * A 10 px name in a 120 x 48 box, 12 per line: at scale 1 (size 10) its three words fit one line, at 0.5 (size 20) two
 * lines, at 0.25 (size 40) one line of "aaa".
 */
const NAME: TScenePrimitive = {
  kind: "text",
  part: "title",
  text: "aaa bbb ccc",
  family: "f",
  size: 10,
  cameraAware: { maxWorld: 80 },
  lineHeight: 12,
  color: "#000",
  x: 0,
  y: 0,
  width: 120,
  height: 48,
};

function view(primitive: TScenePrimitive = NAME): TSceneElementView {
  return {
    id: "e",
    childOrder: 0,
    zIndex: 200,
    order: 1,
    x: 0,
    y: 0,
    bounds: { minX: 0, minY: 0, maxX: 120, maxY: 48 },
    primitives: [primitive],
    styleId: 0,
    hidden: false,
  };
}

function lines(ctx: CanvasRenderingContext2D): string[] {
  return (ctx as TMockContext)
    .__getDrawCalls()
    .filter((call) => call.type === "fillText")
    .map((call) => call.props.text ?? "");
}

function context(): CanvasRenderingContext2D {
  return document.createElement("canvas").getContext("2d") as CanvasRenderingContext2D;
}

describe("the cameraAwareText setting", () => {
  let graph: Graph;

  afterEach(() => graph.unmount());

  it("is on by default and reaches graph.scene as a signal", () => {
    graph = new Graph({});
    expect(graph.rootStore.settings.getConfigFlag("cameraAwareText")).toBe(true);
    expect(graph.scene.$cameraAwareText.value).toBe(true);
    graph.updateSettings({ cameraAwareText: false });
    expect(graph.scene.$cameraAwareText.value).toBe(false);
  });

  it("drawInterpreted lays texts out under it, unless the call passes its own policy", () => {
    graph = new Graph({});
    const draw = (policy?: TSceneTextPolicy): string[] => {
      const ctx = context();
      graph.scene.drawInterpreted(ctx, [view()], 0.5, policy ? { textPolicy: policy } : {});
      return lines(ctx);
    };
    expect(draw()).toEqual(["aaa bbb", "ccc"]);
    graph.updateSettings({ cameraAwareText: false });
    expect(draw()).toEqual(["aaa bbb ccc"]);
    expect(draw({ cameraAware: true })).toEqual(["aaa bbb", "ccc"]);
    // An unset policy in the options is the setting's.
    const ctx = context();
    graph.scene.drawInterpreted(ctx, [view()], 0.5, { textPolicy: undefined });
    expect(lines(ctx)).toEqual(["aaa bbb ccc"]);
  });

  it("toImage lays texts out at the export's scale under the setting", () => {
    graph = new Graph({}, document.createElement("div"));
    graph.cameraService.set({ width: 200, height: 100, x: 0, y: 0, scale: 1 });
    graph.scene.store.add({ ...view(), primitives: [NAME] });
    const exported = (scale: number): string[] => {
      const image = graph.scene.toImage({ rect: { x: 0, y: 0, width: 120, height: 48 }, scale, pixelRatio: 1 });
      return lines(image.getContext("2d") as CanvasRenderingContext2D);
    };
    expect(exported(1)).toEqual(["aaa bbb ccc"]);
    expect(exported(0.5)).toEqual(["aaa bbb", "ccc"]);
    expect(exported(0.25)).toEqual(["aaa"]);
    graph.updateSettings({ cameraAwareText: false });
    expect(exported(0.25)).toEqual(["aaa bbb ccc"]);
  });

  it("explain reports the forced-off status while the setting is off", () => {
    class Titled {
      public declare readonly __styleParts?: TStyleParts<"title">;
    }
    graph = new Graph({});
    graph.scene.styles.add([{ target: Titled, style: { parts: { title: { cameraAware: true } } } }]);
    graph.scene.store.add({ ...view(), primitives: [NAME] });
    const unbind = graph.scene.bindStyle("e", { type: "block", id: "e" }, Titled);
    expect(graph.scene.explain("block", "e").cameraAwareText).toBeUndefined();
    expect(graph.scene.explain("block", "e").style?.base).toEqual({ title: { cameraAware: true } });
    graph.updateSettings({ cameraAwareText: false });
    expect(graph.scene.explain("block", "e").cameraAwareText).toBe("forced-off");
    expect(graph.scene.explain("block", "unbound").cameraAwareText).toBe("forced-off");
    graph.updateSettings({ cameraAwareText: true });
    expect(graph.scene.explain("block", "e").cameraAwareText).toBeUndefined();
    unbind();
  });

  it("explain reports a style's cameraAware that a heightless text does not take, and development warns once", () => {
    class Labelled {
      public declare readonly __styleParts?: TStyleParts<"title" | "label">;
    }
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    graph = new Graph({});
    graph.scene.styles.add([
      { target: Labelled, style: { parts: { title: { cameraAware: true }, label: { cameraAware: true } } } },
    ]);
    const label: TScenePrimitive = { ...NAME, part: "label", height: undefined, cameraAware: undefined };
    graph.scene.store.add({ ...view(), id: "block\u0000e", primitives: [NAME, label] });
    const unbind = graph.scene.bindStyle("block\u0000e", { type: "block", id: "e" }, Labelled);
    // The title has a height and takes the style; the heightless label does not.
    expect(graph.scene.explain("block", "e").cameraAwareNotApplied).toEqual(["label"]);
    const warnings = warn.mock.calls.map(([message]) => String(message)).filter((message) => message.includes("label"));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('type "block"');
    graph.scene.store.update("block\u0000e", { primitives: [NAME, { ...label }] });
    expect(warn.mock.calls.filter(([message]) => String(message).includes("label"))).toHaveLength(1);
    unbind();
  });

  it("warns once in development when a rule added after binding turns a heightless text camera-aware", () => {
    class Late {
      public declare readonly __styleParts?: TStyleParts<"title" | "note">;
    }
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    graph = new Graph({});
    const note: TScenePrimitive = { ...NAME, part: "note", height: undefined, cameraAware: undefined };
    graph.scene.store.add({ ...view(), id: "late\u0000e", primitives: [NAME, note] });
    const unbind = graph.scene.bindStyle("late\u0000e", { type: "late", id: "e" }, Late);
    const notes = (): string[] =>
      warn.mock.calls.map(([message]) => String(message)).filter((message) => message.includes('part "note"'));
    expect(notes()).toHaveLength(0);
    // The rule comes after the binding: the store's row changes (SceneStyleSheet, StyleResolver, replaceStyles).
    graph.scene.styles.add([{ target: Late, style: { parts: { note: { cameraAware: true } } } }]);
    expect(graph.scene.explain("late", "e").cameraAwareNotApplied).toEqual(["note"]);
    expect(notes()).toHaveLength(1);
    expect(notes()[0]).toContain('type "late"');
    graph.scene.styles.add([{ target: Late, style: { parts: { note: { cameraAware: true, color: "red" } } } }]);
    expect(notes()).toHaveLength(1);
    unbind();
  });

  it("grows the bounds of a heightless text's element when web fonts load", () => {
    graph = new Graph({});
    const label: TScenePrimitive = { ...NAME, text: "aaa bbb ccc ddd", height: undefined, cameraAware: undefined };
    graph.scene.store.add({ ...view(), primitives: [label], bounds: { minX: 0, minY: 0, maxX: 120, maxY: 10 } });
    // The loaded font is wider: one word per line.
    jest.spyOn(sceneTextMetrics, "width").mockImplementation((text) => text.length * 400);
    graph.scene.onFontsLoaded();
    const bounds = graph.scene.store.get("e")?.bounds;
    expect(bounds?.minX).toBe(0);
    expect(bounds?.maxY).toBeGreaterThan(4 * 12);
  });

  it("reaches the WebGL backend with every apply, replay and frame, and a change redraws", async () => {
    const frames: TSceneFrame[] = [];
    const texts: (TSceneTextFrame | undefined)[] = [];
    const module: ISceneBackendModule = {
      createSceneBackend: async (): Promise<ISceneBackend> =>
        ({
          canvas: document.createElement("canvas"),
          stats: {},
          replay: (_store: unknown, text?: TSceneTextFrame): void => {
            texts.push(text);
          },
          applyMany: (_changes: readonly TSceneChange[], text?: TSceneTextFrame): void => {
            texts.push(text);
          },
          setStyles: (): void => undefined,
          draw: (frame: TSceneFrame): boolean => {
            frames.push(frame);
            return false;
          },
          dispose: (): void => undefined,
        }) as unknown as ISceneBackend,
    };
    graph = new Graph(
      { settings: { renderer: "webgl", webglBackend: async () => module } },
      document.createElement("div")
    );
    graph.cameraService.set({ width: 200, height: 100, x: 0, y: 0, scale: 0.5 });
    graph.start();
    for (let i = 0; i < 20 && graph.scene.$renderer.value !== "webgl"; i++) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    expect(graph.scene.$renderer.value).toBe("webgl");
    expect(texts[0]).toEqual({ scale: 0.5, textPolicy: { cameraAware: true } });
    graph.scene.store.add({ ...view(), primitives: [NAME] });
    graph.scheduler.performUpdate();
    expect(texts[texts.length - 1]).toEqual({ scale: 0.5, textPolicy: { cameraAware: true } });
    expect(frames[frames.length - 1].textPolicy).toEqual({ cameraAware: true });
    const drawn = frames.length;
    graph.updateSettings({ cameraAwareText: false });
    graph.scheduler.performUpdate();
    expect(frames.length).toBeGreaterThan(drawn);
    expect(frames[frames.length - 1].textPolicy).toEqual({ cameraAware: false });
  });
});
