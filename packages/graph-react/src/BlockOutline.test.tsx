import React from "react";

import { act, fireEvent, render } from "@testing-library/react";

import { BlockOutline } from "./BlockOutline";

it("traces the visible circular anchors, updates a raised or hovered radius, and keeps the path on camera changes", async () => {
  let diameter = 16;
  let scale = 2;
  let pan = 100;
  const rect = (x: number, y: number, w: number, h: number): DOMRect =>
    ({ x, y, left: x, top: y, right: x + w, bottom: y + h, width: w, height: h }) as DOMRect;
  const bounds = jest.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    if (this.classList.contains("graph-block-anchor")) {
      return rect(pan - (diameter * scale) / 2, (40 - diameter / 2) * scale, diameter * scale, diameter * scale);
    }
    return rect(pan, 0, 120 * scale, 80 * scale);
  });
  const original = Object.getOwnPropertyDescriptor(SVGElement.prototype, "getScreenCTM");
  Object.defineProperty(SVGElement.prototype, "getScreenCTM", {
    configurable: true,
    value: () => ({ a: scale, b: 0, c: 0, d: scale, e: pan, f: 0 }),
  });
  try {
    const view = render(
      <div className="graph-block-container">
        <div className="graph-block-wrapper">
          <div className="graph-block-anchor" style={{ borderRadius: "50%" }} />
        </div>
        <BlockOutline outline={{ color: "#2860ba", width: 3 }} />
      </div>
    );
    const path = view.container.querySelector("path") as SVGPathElement;
    const anchor = view.container.querySelector(".graph-block-anchor") as HTMLElement;
    const resting = path.getAttribute("d");
    expect(resting).toContain("C");
    const paint = view.container.querySelector("use");
    expect(paint?.getAttribute("stroke")).toBe("#2860ba");
    expect(paint?.getAttribute("stroke-width")).toBe("3");

    diameter = 24;
    fireEvent.pointerOver(anchor);
    const hovered = path.getAttribute("d");
    expect(hovered).not.toBe(resting);
    diameter = 16;
    await act(async () => anchor.classList.add("graph-block-anchor-raised"));
    expect(path.getAttribute("d")).toBe(resting);
    const body = anchor.parentElement as HTMLElement;
    await act(async () => {
      body.style.borderTopRightRadius = "12px";
    });
    const rounded = path.getAttribute("d");
    expect(rounded).not.toBe(resting);
    const setPath = jest.spyOn(path, "setAttribute");
    pan = 150;
    scale = 1.5;
    await act(async () => {
      (body.parentElement as HTMLElement).style.transform = "translate(150px)";
    });
    expect(setPath).not.toHaveBeenCalled();
    await act(async () => {
      anchor.style.display = "none";
    });
    expect(path.getAttribute("d")).not.toBe(resting);
    const noAnchor = path.getAttribute("d");
    await act(async () => {
      anchor.style.display = "";
      anchor.style.borderRadius = "0px";
    });
    expect(path.getAttribute("d")).toBe(noAnchor);
    view.unmount();
  } finally {
    bounds.mockRestore();
    if (original) Object.defineProperty(SVGElement.prototype, "getScreenCTM", original);
    else Reflect.deleteProperty(SVGElement.prototype, "getScreenCTM");
  }
});

it("reuses each block's own path for its halo and keeps that geometry when the halo is turned off", () => {
  const stroke = { color: "#386caf", width: 3 };
  const halo = { color: "#225588", width: 4 };
  const blocks = (firstHalo: boolean) => (
    <>
      {[firstHalo, true].map((active, index) => (
        <div key={index} className="graph-block-container">
          <div className="graph-block-wrapper" />
          <BlockOutline outline={active ? { ...stroke, halo } : stroke} />
        </div>
      ))}
    </>
  );
  const view = render(blocks(true));
  const [first, second] = view.container.querySelectorAll("svg");
  const paths = Array.from(view.container.querySelectorAll("path"));
  expect(paths).toHaveLength(2);
  expect(paths[0].id).not.toBe(paths[1].id);
  for (const [i, svg] of [first, second].entries()) {
    const paints = Array.from(svg.querySelectorAll("use"));
    expect(paints.map((use) => use.getAttribute("href"))).toEqual(Array(3).fill("#" + paths[i].id));
    expect(paints.map((use) => use.getAttribute("stroke-width"))).toEqual(["11", "7", "3"]);
  }
  view.rerender(blocks(false));
  expect(first.querySelector("path")).toBe(paths[0]);
  expect(first.querySelectorAll("use")).toHaveLength(1);
  expect(second.querySelectorAll("use")).toHaveLength(3);
});
