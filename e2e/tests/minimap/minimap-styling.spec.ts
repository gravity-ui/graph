import { test, expect } from "@playwright/test";
import { GraphPageObject } from "../../page-objects/GraphPageObject";
import { MiniMapPageObject } from "./MiniMapPageObject";

/** Tolerance in pixels when comparing element positions. */
const POSITION_TOLERANCE = 5;

const BLOCKS = [
  {
    id: "block-1",
    is: "Block" as const,
    x: 100,
    y: 100,
    width: 200,
    height: 100,
    name: "Block 1",
    anchors: [],
    selected: false,
  },
];

test.describe("MiniMap – styling", () => {
  let graphPO: GraphPageObject;
  let minimapPO: MiniMapPageObject;

  test.beforeEach(async ({ page }) => {
    graphPO = new GraphPageObject(page);
    minimapPO = new MiniMapPageObject(page, graphPO);
    await graphPO.initialize({ blocks: BLOCKS, connections: [] });
  });

  // ─── CSS class ───────────────────────────────────────────────────────────

  test("minimap canvas should have graph-minimap CSS class", async () => {
    await minimapPO.addLayer();
    expect(await minimapPO.hasClass("graph-minimap")).toBe(true);
  });

  test("additional classNames prop should be added to the minimap element", async () => {
    await minimapPO.addLayer({ classNames: ["my-custom-class"] });
    expect(await minimapPO.hasClass("my-custom-class")).toBe(true);
  });

  // ─── Size ─────────────────────────────────────────────────────────────────

  test("default size should be 200×200 pixels", async () => {
    await minimapPO.addLayer();
    const size = await minimapPO.getCanvasSize();
    // Default width and height are 200px; the border adds a few pixels to
    // the bounding rect so we allow a small tolerance.
    expect(size.width).toBeGreaterThanOrEqual(200);
    expect(size.width).toBeLessThanOrEqual(210);
    expect(size.height).toBeGreaterThanOrEqual(200);
    expect(size.height).toBeLessThanOrEqual(210);
  });

  test("custom width and height props should be applied", async () => {
    await minimapPO.addLayer({ width: 120, height: 80 });
    const size = await minimapPO.getCanvasSize();
    expect(size.width).toBeGreaterThanOrEqual(120);
    expect(size.width).toBeLessThanOrEqual(130);
    expect(size.height).toBeGreaterThanOrEqual(80);
    expect(size.height).toBeLessThanOrEqual(90);
  });

  // ─── Location ─────────────────────────────────────────────────────────────

  test("default location (no prop) should place minimap at top-left corner", async () => {
    await minimapPO.addLayer(); // no location prop → defaults to "topLeft"
    const pos = await minimapPO.getPositionRelativeToRoot();
    expect(Math.abs(pos.fromLeft)).toBeLessThanOrEqual(POSITION_TOLERANCE);
    expect(Math.abs(pos.fromTop)).toBeLessThanOrEqual(POSITION_TOLERANCE);
  });

  test("topLeft location should place minimap at the top-left corner", async () => {
    await minimapPO.addLayer({ location: "topLeft" });
    const pos = await minimapPO.getPositionRelativeToRoot();
    expect(Math.abs(pos.fromLeft)).toBeLessThanOrEqual(POSITION_TOLERANCE);
    expect(Math.abs(pos.fromTop)).toBeLessThanOrEqual(POSITION_TOLERANCE);
  });

  test("topRight location should place minimap at the top-right corner", async () => {
    await minimapPO.addLayer({ location: "topRight" });
    const pos = await minimapPO.getPositionRelativeToRoot();
    expect(Math.abs(pos.fromRight)).toBeLessThanOrEqual(POSITION_TOLERANCE);
    expect(Math.abs(pos.fromTop)).toBeLessThanOrEqual(POSITION_TOLERANCE);
  });

  test("bottomLeft location should place minimap at the bottom-left corner", async () => {
    await minimapPO.addLayer({ location: "bottomLeft" });
    const pos = await minimapPO.getPositionRelativeToRoot();
    expect(Math.abs(pos.fromLeft)).toBeLessThanOrEqual(POSITION_TOLERANCE);
    expect(Math.abs(pos.fromBottom)).toBeLessThanOrEqual(POSITION_TOLERANCE);
  });

  test("bottomRight location should place minimap at the bottom-right corner", async () => {
    await minimapPO.addLayer({ location: "bottomRight" });
    const pos = await minimapPO.getPositionRelativeToRoot();
    expect(Math.abs(pos.fromRight)).toBeLessThanOrEqual(POSITION_TOLERANCE);
    expect(Math.abs(pos.fromBottom)).toBeLessThanOrEqual(POSITION_TOLERANCE);
  });

  test("custom location object should place minimap at the specified position", async () => {
    // Inset 20px from the right and 30px from the bottom
    await minimapPO.addLayer({
      location: { right: "20px", bottom: "30px", top: "unset", left: "unset" },
    });
    const pos = await minimapPO.getPositionRelativeToRoot();
    expect(Math.abs(pos.fromRight - 20)).toBeLessThanOrEqual(POSITION_TOLERANCE);
    expect(Math.abs(pos.fromBottom - 30)).toBeLessThanOrEqual(POSITION_TOLERANCE);
  });
});
