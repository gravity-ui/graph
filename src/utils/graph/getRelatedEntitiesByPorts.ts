import { GraphComponent } from "../../components/canvas/GraphComponent";
import type { Graph } from "../../graph";

export type TRelatedEntitiesByType = Record<string, Array<string | number>>;

export type TRelatedEntitiesOptions = {
  depth?: number;
};

type TRelatedEntitiesMap = Map<string, Set<string | number>>;
type TObserverWithViewComponent = {
  getViewComponent: () => unknown;
};

function normalizeDepth(depth?: number): number {
  if (!Number.isFinite(depth) || depth === undefined) {
    return 1;
  }

  return Math.max(1, Math.floor(depth));
}

function getEntityKey(component: GraphComponent): string {
  return `${component.getEntityType()}:${String(component.getEntityId())}`;
}

function resolveObserverComponent(observer: unknown): GraphComponent | undefined {
  if (observer instanceof GraphComponent) {
    return observer;
  }

  if (
    observer &&
    typeof observer === "object" &&
    "getViewComponent" in observer &&
    typeof (observer as TObserverWithViewComponent).getViewComponent === "function"
  ) {
    const viewComponent = (observer as TObserverWithViewComponent).getViewComponent();
    if (viewComponent instanceof GraphComponent) {
      return viewComponent;
    }
  }

  return undefined;
}

function collectPortLinkedComponents(component: GraphComponent): GraphComponent[] {
  const linkedComponents: GraphComponent[] = [];
  const visited = new Set<string>();

  for (const port of component.getPorts()) {
    if (port.owner instanceof GraphComponent) {
      const ownerKey = getEntityKey(port.owner);
      if (!visited.has(ownerKey)) {
        visited.add(ownerKey);
        linkedComponents.push(port.owner);
      }
    }

    for (const observer of port.observers) {
      const observerComponent = resolveObserverComponent(observer);
      if (!observerComponent) {
        continue;
      }

      const observerKey = getEntityKey(observerComponent);
      if (!visited.has(observerKey)) {
        visited.add(observerKey);
        linkedComponents.push(observerComponent);
      }
    }
  }

  return linkedComponents;
}

function getConnectionsByEntity(component: GraphComponent): GraphComponent[] {
  const linkedComponents = collectPortLinkedComponents(component);
  const connections = linkedComponents.filter((linked) => linked.getEntityType() === "connection");

  if (component.getEntityType() === "connection") {
    const componentKey = getEntityKey(component);
    const alreadyIncluded = connections.some((item) => getEntityKey(item) === componentKey);
    if (!alreadyIncluded) {
      connections.push(component);
    }
  }

  return connections;
}

function getEntitiesByConnection(connection: GraphComponent): GraphComponent[] {
  return collectPortLinkedComponents(connection).filter((linked) => linked.getEntityType() !== "connection");
}

function addToResult(map: TRelatedEntitiesMap, component: GraphComponent): void {
  const type = component.getEntityType();
  const id = component.getEntityId();

  if (!map.has(type)) {
    map.set(type, new Set());
  }

  map.get(type)?.add(id);
}

function toResult(map: TRelatedEntitiesMap): TRelatedEntitiesByType {
  const result: TRelatedEntitiesByType = {};

  for (const [type, ids] of map.entries()) {
    result[type] = Array.from(ids);
  }

  return result;
}

export function getRelatedEntitiesByPorts(
  _graph: Graph,
  component: GraphComponent,
  options?: TRelatedEntitiesOptions
): TRelatedEntitiesByType {
  const depth = normalizeDepth(options?.depth);
  const sourceKey = getEntityKey(component);

  const resultMap: TRelatedEntitiesMap = new Map();
  const expanded = new Set<string>([sourceKey]);

  let frontier: GraphComponent[] = [component];

  for (let level = 0; level < depth; level += 1) {
    if (frontier.length === 0) {
      break;
    }

    const nextFrontier: GraphComponent[] = [];

    for (const current of frontier) {
      const connections = getConnectionsByEntity(current);

      for (const connection of connections) {
        const connectionKey = getEntityKey(connection);
        if (connectionKey !== sourceKey) {
          addToResult(resultMap, connection);
        }

        const boundEntities = getEntitiesByConnection(connection);
        for (const entity of boundEntities) {
          const entityKey = getEntityKey(entity);

          if (entityKey !== sourceKey) {
            addToResult(resultMap, entity);
          }

          if (!expanded.has(entityKey)) {
            expanded.add(entityKey);
            nextFrontier.push(entity);
          }
        }
      }
    }

    frontier = nextFrontier;
  }

  return toResult(resultMap);
}
