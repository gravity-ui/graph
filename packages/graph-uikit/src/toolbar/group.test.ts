import { group } from "./group";

const action = (id: string): { id: string; title: string; label: string; action: jest.Mock } => ({
  id,
  title: id,
  label: id,
  action: jest.fn(),
});

describe("group", () => {
  it("flattens action arrays", () => {
    expect(group(action("a"), [action("b"), action("c")]).actions.map((item) => item.id)).toEqual(["a", "b", "c"]);
  });
});
