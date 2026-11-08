import { Graph } from "../../../graph";
import { globalScheduler } from "../../../lib/Scheduler";
import { TConnection } from "../../../store/connection/ConnectionState";

import { BezierMultipointConnection } from "./BezierMultipointConnection";
import { BlockConnection } from "./BlockConnection";
import { MultipointConnection } from "./MultipointConnection";

const calls: string[] = [];

class Legacy extends BlockConnection<TConnection> {
  protected createPath(): void {
    calls.push("createPath");
  }

  public getClassName(): string {
    calls.push("getClassName");
    return "legacy";
  }
}

class LegacyChild extends Legacy {
  protected createPath(): void {
    calls.push("createPath");
  }

  public isAnimated(): boolean {
    return false;
  }
}

function mount(Connection: typeof BlockConnection, ids: string[]): Graph {
  const root = document.createElement("div");
  Object.defineProperties(root, { clientWidth: { value: 1000 }, clientHeight: { value: 800 } });
  const graph = new Graph(
    {
      connections: ids.map((id) => ({ id, sourcePortId: `${id}-s`, targetPortId: `${id}-t` })),
      settings: { connection: Connection as never, useBezierConnections: false },
    },
    root
  );
  for (const id of ids) {
    const state = graph.connections.getConnectionState(id);
    state?.$sourcePortState.value.updatePort({ x: 100, y: 100, lookup: false });
    state?.$targetPortState.value.updatePort({ x: 300, y: 100, lookup: false });
  }
  graph.cameraService.set({ width: 1000, height: 800, x: 0, y: 0, scale: 1 });
  graph.start();
  for (let i = 0; i < 3; i++) globalScheduler.performUpdate();
  return graph;
}

describe("warnRemovedConnectionMethods", () => {
  const env = process.env.NODE_ENV;
  let warn: jest.SpyInstance;

  beforeEach(() => {
    calls.length = 0;
    warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.env.NODE_ENV = env;
    warn.mockRestore();
  });

  it("warns once per class and names the methods, the class and static line", () => {
    class Once extends Legacy {}
    mount(Once as never, ["a", "b"]);
    const messages = warn.mock.calls.map(([text]) => String(text)).filter((text) => text.includes("Once"));
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("[@gravity-ui/graph] Once overrides createPath, getClassName");
    expect(messages[0]).toContain("static line");
    expect(messages[0]).toContain("Connection lines and geometry");
  });

  it("lists overrides along the prototype chain without duplicates", () => {
    mount(LegacyChild as never, ["a"]);
    const text = String(warn.mock.calls.map(([t]) => t).find((t) => String(t).includes("LegacyChild")));
    expect(text).toContain("overrides createPath, isAnimated, getClassName,");
  });

  it("never calls the removed methods", () => {
    class Spied extends Legacy {}
    mount(Spied as never, ["a"]);
    expect(calls).toEqual([]);
  });

  it("does not warn for multipoint connections", () => {
    mount(MultipointConnection as never, ["a"]);
    mount(BezierMultipointConnection as never, ["b"]);
    expect(warn).not.toHaveBeenCalled();
  });

  it("does not warn in a production build", () => {
    process.env.NODE_ENV = "production";
    class Quiet extends Legacy {}
    mount(Quiet as never, ["a"]);
    expect(warn).not.toHaveBeenCalled();
  });
});
