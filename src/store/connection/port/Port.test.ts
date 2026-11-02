import { effect } from "@preact/signals-core";

import type { ConnectionState } from "../ConnectionState";

import { PortState } from "./Port";

const createConnectionStub = (id: string): ConnectionState => ({ id }) as unknown as ConnectionState;

describe("PortState.$connections", () => {
  let port: PortState;

  beforeEach(() => {
    port = new PortState({ id: "port", x: 0, y: 0, lookup: true });
  });

  it("starts with no connections", () => {
    expect(port.$connections.value.size).toBe(0);
  });

  it("lists an attached connection once", () => {
    const connection = createConnectionStub("c1");

    port.attachConnection(connection);
    port.attachConnection(connection);

    expect([...port.$connections.value]).toEqual([connection]);
  });

  it("does not notify when an already attached connection is attached again", () => {
    const connection = createConnectionStub("c1");
    port.attachConnection(connection);
    const notifications: ReadonlySet<ConnectionState>[] = [];
    const dispose = effect(() => {
      notifications.push(port.$connections.value);
    });

    port.attachConnection(connection);

    expect(notifications).toHaveLength(1);
    dispose();
  });

  it("publishes a new set when a connection is detached", () => {
    const first = createConnectionStub("c1");
    const second = createConnectionStub("c2");
    port.attachConnection(first);
    port.attachConnection(second);
    const before = port.$connections.value;

    port.detachConnection(first);

    expect(port.$connections.value).not.toBe(before);
    expect([...port.$connections.value]).toEqual([second]);
  });

  it("does not change a set that was read before a later change", () => {
    port.attachConnection(createConnectionStub("c1"));
    const before = port.$connections.value;

    port.attachConnection(createConnectionStub("c2"));
    port.detachConnection([...before][0]);

    expect([...before].map((connection) => connection.id)).toEqual(["c1"]);
    expect([...port.$connections.value].map((connection) => connection.id)).toEqual(["c2"]);
  });

  it("ignores detaching a connection that is not attached", () => {
    const before = port.$connections.value;

    port.detachConnection(createConnectionStub("unknown"));

    expect(port.$connections.value).toBe(before);
  });

  it("keeps reference counting separate from the relation", () => {
    port.attachConnection(createConnectionStub("c1"));

    expect(port.observers.size).toBe(0);
    expect(port.canBeDeleted()).toBe(true);
  });
});
