import React from "react";

import { ThemeProvider } from "@gravity-ui/uikit";
import { render, screen } from "@testing-library/react";

import { UikitGraphBlockContent, getUikitGraphBlockClassName } from "./UikitGraphBlock";

describe("UikitGraphBlock", () => {
  it("builds surface class names from selection and theme", () => {
    expect(getUikitGraphBlockClassName({ selected: false, theme: "normal" })).toBe(
      "graph-uikit-block__surface graph-uikit-block__surface_theme_normal"
    );
    expect(getUikitGraphBlockClassName({ selected: true, theme: "danger" }, "extra")).toBe(
      "graph-uikit-block__surface graph-uikit-block__surface_theme_danger graph-uikit-block__surface_selected extra"
    );
  });

  it("renders the default content like the canvas schematic view", () => {
    render(
      <ThemeProvider theme="light">
        <UikitGraphBlockContent
          block={{
            id: "a",
            is: "Block",
            name: "Block A",
            x: 0,
            y: 0,
            width: 200,
            height: 100,
            meta: { description: "First" },
          }}
        />
      </ThemeProvider>
    );

    expect(screen.getByText("Block A").classList.contains("g-text_variant_subheader-1")).toBe(true);
    expect(screen.getByText("First").classList.contains("g-text_variant_caption-2")).toBe(true);
  });
});
