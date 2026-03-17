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

function collectImmediateRelatedEntities(start: GraphComponent, sourceKey: string): GraphComponent[] {
  const queue: GraphComponent[] = [start];
  const visited = new Set<string>([getEntityKey(start)]);
  const related: GraphComponent[] = [];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    const ports = current.getPorts();
    for (const port of ports) {
      if (port.owner instanceof GraphComponent) {
        const ownerKey = getEntityKey(port.owner);
        if (!visited.has(ownerKey)) {
          visited.add(ownerKey);

          if (port.owner.getEntityType() === "connection") {
            queue.push(port.owner);
          } else if (ownerKey !== sourceKey) {
            related.push(port.owner);
          }
        }
      }

      for (const observer of port.observers) {
        const observerComponent = resolveObserverComponent(observer);
        if (!observerComponent) {
          continue;
        }

        const observerKey = getEntityKey(observerComponent);
        if (visited.has(observerKey)) {
          continue;
        }

        visited.add(observerKey);

        if (observerComponent.getEntityType() === "connection") {
          queue.push(observerComponent);
          continue;
        }

        if (observerKey !== sourceKey) {
          related.push(observerComponent);
        }
      }
    }
  }

  return related;
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
      const directRelated = collectImmediateRelatedEntities(current, sourceKey);

      for (const relatedComponent of directRelated) {
        addToResult(resultMap, relatedComponent);

        const relatedKey = getEntityKey(relatedComponent);
        if (!expanded.has(relatedKey)) {
          expanded.add(relatedKey);
          nextFrontier.push(relatedComponent);
        }
      }
    }

    frontier = nextFrontier;
  }

  return toResult(resultMap);
}
