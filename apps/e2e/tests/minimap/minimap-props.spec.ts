import type { MiniMapLayerProps } from "@gravity-ui/graph-minimap";
import { expect, test } from "@playwright/test";

import { GraphPageObject } from "../../page-objects/GraphPageObject";

const BLOCKS = [
  { id: "block", is: "Block" as const, x: 100, y: 100, width: 200, height: 100, name: "Block", anchors: [] },
];

type MiniMapOptions = Pick<MiniMapLayerProps, "width" | "height" | "location" | "classNames">;
type MiniMapWindow = Window & { setMiniMapProps?: (props: MiniMapOptions) => void };

test("resizing a live minimap rebuilds its picture and keeps click navigation aligned", async ({ page }) => {
  const graphPO = new GraphPageObject(page);
  await graphPO.initialize({ blocks: BLOCKS });

  const result = await page.evaluate(async () => {
    const graph = window.graph;
    const { MiniMapLayer } = window.GraphModule;
    const layer = graph.addLayer(MiniMapLayer, { width: 240, height: 140 });
    const draw = graph.scene.drawInterpreted.bind(graph.scene);
    let pictures = 0;
    graph.scene.drawInterpreted = (ctx, elements, scale, options) => {
      if (options?.drawHidden && options.skipText) pictures++;
      draw(ctx, elements, scale, options);
    };

    const nextFrame = () =>
      new Promise<void>((resolve) => {
        const remove = graph.scene.onFrameEnd(() => {
          remove();
          resolve();
        });
      });
    await nextFrame();
    pictures = 0;
    layer.setProps({ width: 320 });
    await nextFrame();

    const canvas = layer.context.canvas;
    const dpr = layer.getDRP();
    return { pictures, size: [canvas.width / dpr, canvas.height / dpr] };
  });
  expect(result).toEqual({ pictures: 1, size: [320, 140] });

  const canvas = page.locator("canvas.graph-minimap");
  await expect(canvas).toHaveCSS("width", "320px");
  await expect(canvas).toHaveCSS("height", "140px");
  await canvas.click({ position: { x: 160, y: 70 } });
  await graphPO.waitForFrames(2);
  const [x, y] = await page.evaluate(() => {
    const camera = window.graph.cameraService;
    const { width, height } = camera.getCameraState();
    return camera.getRelativeXY(width / 2, height / 2);
  });
  // The block is centered on the minimap. Allow one CSS pixel of minimap click rounding.
  expect(Math.abs(x - 200)).toBeLessThan(8);
  expect(Math.abs(y - 150)).toBeLessThan(8);
});

test("moving a live minimap and changing its camera border reuse the existing picture", async ({ page }) => {
  const graphPO = new GraphPageObject(page);
  await graphPO.initialize({ blocks: BLOCKS });

  const result = await page.evaluate(async () => {
    const graph = window.graph;
    const layer = graph.addLayer(window.GraphModule.MiniMapLayer, { location: "bottomRight" });
    const draw = graph.scene.drawInterpreted.bind(graph.scene);
    let pictures = 0;
    graph.scene.drawInterpreted = (ctx, elements, scale, options) => {
      if (options?.drawHidden && options.skipText) pictures++;
      draw(ctx, elements, scale, options);
    };

    const nextFrame = () =>
      new Promise<void>((resolve) => {
        const remove = graph.scene.onFrameEnd(() => {
          remove();
          resolve();
        });
      });
    await nextFrame();
    pictures = 0;
    layer.setProps({ location: { left: "15px", top: "20px" }, cameraBorderColor: "#123456", cameraBorderSize: 6 });
    await nextFrame();
    const { ctx, canvas } = layer.context;
    const { top, bottom, left, right } = canvas.style;
    const border = () => ({
      color: ctx.strokeStyle,
      size: (ctx.lineWidth * ctx.getTransform().a) / layer.getDRP(),
    });
    const customBorder = border();

    layer.setProps({ cameraBorderColor: undefined, cameraBorderSize: undefined });
    await nextFrame();
    return { pictures, position: [top, right, bottom, left], customBorder, defaultBorder: border() };
  });

  expect(result).toEqual({
    pictures: 0,
    position: ["20px", "unset", "unset", "15px"],
    customBorder: { color: "#123456", size: expect.closeTo(6) },
    defaultBorder: { color: "rgba(255, 119, 0, 0.9)", size: expect.closeTo(2) },
  });
});

test("useLayer updates the same minimap canvas and can restore optional defaults", async ({ page }) => {
  await page.goto("/react.html");
  const canvas = await page.evaluateHandle(() => {
    const { Graph, MiniMapLayer, React, ReactDOM, useLayer } = window.GraphModule;
    const root = document.querySelector<HTMLDivElement>("#root")!;
    const graph = new Graph({}, root);
    graph.start();
    const host = document.createElement("div");
    root.append(host);

    return new Promise<HTMLCanvasElement>((resolve) => {
      function App() {
        const [props, setProps] = React.useState<MiniMapOptions>({
          width: 120,
          height: 80,
          classNames: ["initial-minimap"],
          location: "bottomRight",
        });
        (window as MiniMapWindow).setMiniMapProps = setProps;
        const layer = useLayer(graph, MiniMapLayer, props);
        if (layer) resolve(layer.context.canvas);
        return null;
      }

      ReactDOM.createRoot(host).render(React.createElement(App));
    });
  });

  const locator = page.locator("canvas.graph-minimap");
  await expect(locator).toHaveCSS("width", "120px");
  await expect(locator).toHaveCSS("height", "80px");
  await expect(locator).toHaveClass(/initial-minimap/);

  await page.evaluate(() => {
    (window as MiniMapWindow).setMiniMapProps!({
      width: undefined,
      height: undefined,
      classNames: undefined,
      location: undefined,
    });
  });
  await expect(locator).toHaveCSS("width", "200px");
  await expect(locator).toHaveCSS("height", "200px");
  await expect(locator).toHaveCSS("top", "0px");
  await expect(locator).toHaveCSS("left", "0px");
  await expect(locator).not.toHaveClass(/initial-minimap/);
  expect(await locator.evaluate((element, original) => element === original, canvas)).toBe(true);
});
