import { elkConverter } from "./eklConverter";

test("missing ELK arrays produce empty records", () => {
  expect(elkConverter({ id: "root" })).toEqual({ edges: {}, blocks: {} });
});

test("unpositioned children and unrouted edges are omitted", () => {
  expect(
    elkConverter({
      id: "root",
      children: [{ id: "missing" }, { id: "partial", x: 5 }, { id: "placed", x: 0, y: 0 }],
      edges: [
        { id: "missing", sources: [], targets: [] },
        { id: "empty", sources: [], targets: [], sections: [] },
        {
          id: "routed",
          sources: [],
          targets: [],
          sections: [{ id: "section", startPoint: { x: 1, y: 2 }, endPoint: { x: 3, y: 4 } }],
        },
      ],
    })
  ).toEqual({
    blocks: { placed: { x: 0, y: 0 } },
    edges: {
      routed: {
        points: [
          { x: 1, y: 2 },
          { x: 3, y: 4 },
        ],
      },
    },
  });
});
