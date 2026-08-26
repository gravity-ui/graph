import { test, expect, type Page } from "@playwright/test";

/**
 * Regression tests for the color.ts utility in Safari (WebKit).
 *
 * `applyAlpha` internally calls `parseColor`, which normalizes any CSS color
 * string — named colors ("red"), hsl/hsla, hex, rgb/rgba — into a plain
 * `rgba(r, g, b, a)` string by assigning it to a canvas `fillStyle` and
 * reading the value back. The browser performs the conversion; no pixels are
 * drawn or read.
 *
 * The bug: when different colors are parsed in varying orders the offscreen
 * canvas used internally can composite pixel values from a previously drawn
 * colour into the next one, producing wrong RGBA results in Safari.
 *
 * Each test calls `applyAlpha(color, 1.0)` and then draws the returned colour
 * string onto a fresh 1×1 canvas and reads the pixel via `getImageData`.
 * This gives us an actual pixel-level comparison against the expected value.
 */

interface ColorFixture {
  input: string;
  expected: { r: number; g: number; b: number };
}

const TEST_COLORS: ColorFixture[] = [
  { input: "#ff0000", expected: { r: 255, g: 0, b: 0 } },
  { input: "#00ff00", expected: { r: 0, g: 255, b: 0 } },
  { input: "#0000ff", expected: { r: 0, g: 0, b: 255 } },
  { input: "#ffff00", expected: { r: 255, g: 255, b: 0 } },
  { input: "#00ffff", expected: { r: 0, g: 255, b: 255 } },
  { input: "#ff00ff", expected: { r: 255, g: 0, b: 255 } },
  { input: "#ffffff", expected: { r: 255, g: 255, b: 255 } },
  { input: "#000000", expected: { r: 0, g: 0, b: 0 } },
  { input: "#ff8800", expected: { r: 255, g: 136, b: 0 } },
  { input: "rgb(64, 128, 192)", expected: { r: 64, g: 128, b: 192 } },
];

type PixelResult = { r: number; g: number; b: number };

/**
 * Clears the color cache, runs `applyAlpha(input, 1.0)` for each color in the
 * given order, then draws each result onto a fresh 1×1 canvas and returns the
 * pixel RGB values — all in a single page.evaluate call.
 */
async function runColors(page: Page, colors: ColorFixture[]): Promise<PixelResult[]> {
  return page.evaluate((colors: ColorFixture[]) => {
    function readPixelFromColor(colorString: string): { r: number; g: number; b: number } {
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const ctx = canvas.getContext("2d")!;
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = colorString;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      return { r: d[0], g: d[1], b: d[2] };
    }

    const { applyAlpha, clearColorCache } = (window as any).GraphModule;
    clearColorCache();
    return colors.map(({ input }) => readPixelFromColor(applyAlpha(input, 1.0)));
  }, colors);
}

test.describe("color.ts – Safari pixel-level regression", () => {
  // Run this suite only in WebKit to catch Safari-specific compositing bugs.
  // test.skip(({ browserName }) => browserName !== "webkit", "Safari-only regression test");

  test.beforeEach(async ({ page }) => {
    await page.goto("/base.html");
    await page.waitForFunction(() => (window as Window & { graphLibraryLoaded?: boolean }).graphLibraryLoaded === true);
  });

  test("forward order: each color produces the correct pixel", async ({ page }) => {
    const results = await runColors(page, TEST_COLORS);

    for (let i = 0; i < TEST_COLORS.length; i++) {
      const { input, expected } = TEST_COLORS[i];
      expect(results[i], `forward order: ${input}`).toEqual(expected);
    }
  });

  test("reverse order: each color produces the correct pixel", async ({ page }) => {
    const reversed = [...TEST_COLORS].reverse();
    const results = await runColors(page, reversed);

    for (let i = 0; i < reversed.length; i++) {
      const { input, expected } = reversed[i];
      expect(results[i], `reverse order: ${input}`).toEqual(expected);
    }
  });

  test("shuffled order: each color produces the correct pixel", async ({ page }) => {
    // A fixed shuffle that interleaves contrasting hues (bright↔dark, warm↔cool).
    const shuffled: ColorFixture[] = [
      TEST_COLORS[4], // #00ffff
      TEST_COLORS[0], // #ff0000
      TEST_COLORS[7], // #000000
      TEST_COLORS[2], // #0000ff
      TEST_COLORS[9], // rgb(64,128,192)
      TEST_COLORS[1], // #00ff00
      TEST_COLORS[6], // #ffffff
      TEST_COLORS[3], // #ffff00
      TEST_COLORS[8], // #ff8800
      TEST_COLORS[5], // #ff00ff
    ];

    const results = await runColors(page, shuffled);

    for (let i = 0; i < shuffled.length; i++) {
      const { input, expected } = shuffled[i];
      expect(results[i], `shuffled order: ${input}`).toEqual(expected);
    }
  });

  test("results are identical regardless of processing order", async ({ page }) => {
    const reversed = [...TEST_COLORS].reverse();
    const shuffled: ColorFixture[] = [
      TEST_COLORS[4],
      TEST_COLORS[0],
      TEST_COLORS[7],
      TEST_COLORS[2],
      TEST_COLORS[9],
      TEST_COLORS[1],
      TEST_COLORS[6],
      TEST_COLORS[3],
      TEST_COLORS[8],
      TEST_COLORS[5],
    ];

    const [fwdResults, revResults, mixResults] = await Promise.all([
      runColors(page, TEST_COLORS),
      runColors(page, reversed),
      runColors(page, shuffled),
    ]);

    const toMap = (colors: ColorFixture[], results: PixelResult[]): Record<string, PixelResult> =>
      Object.fromEntries(colors.map(({ input }, i) => [input, results[i]]));

    const forward = toMap(TEST_COLORS, fwdResults);
    const rev = toMap(reversed, revResults);
    const mix = toMap(shuffled, mixResults);

    for (const { input } of TEST_COLORS) {
      expect(rev[input], `reverse vs forward: ${input}`).toEqual(forward[input]);
      expect(mix[input], `shuffled vs forward: ${input}`).toEqual(forward[input]);
    }
  });
});
