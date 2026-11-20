import { elkConverter } from "./elkConverter";

test("missing ELK arrays produce empty records", () => {
  expect(elkConverter({ id: "root" })).toEqual({ edges: {}, blocks: {} });
});

test("omits unpositioned children and unrouted edges and keeps straight and bent routes", () => {
  const startPoint = { x: 1, y: 2 };
  const bend = { x: 2, y: 4 };
  const endPoint = { x: 3, y: 4 };
  expect(
    elkConverter({
      id: "root",
      children: [{ id: "missing" }, { id: "partial", x: 5 }, { id: "placed", x: 0, y: 0 }],
      edges: [
        { id: "missing", sources: [], targets: [] },
        { id: "empty", sources: [], targets: [], sections: [] },
        { id: "straight", sources: [], targets: [], sections: [{ id: "s1", startPoint, endPoint }] },
        { id: "bent", sources: [], targets: [], sections: [{ id: "s2", startPoint, bendPoints: [bend], endPoint }] },
      ],
    })
  ).toEqual({
    blocks: { placed: { x: 0, y: 0 } },
    edges: {
      straight: { points: [startPoint, endPoint] },
      bent: { points: [startPoint, bend, endPoint] },
    },
  });
});
