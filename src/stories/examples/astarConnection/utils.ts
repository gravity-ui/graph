import { GridNode } from "./astarConnection.stories";

export function parseLinkedListToPath(node: GridNode) {
  let curr = node;
  const path: GridNode[] = [];
  while (curr.parent) {
    path.unshift(curr);
    curr = curr.parent;
  }
  return path;
}

export function removeIntermediatePoints(path: GridNode[]): GridNode[] {
  if (!path.length) return [];

  const newPath: GridNode[] = [];

  newPath.push(path[0]);

  for (let i = 1; i < path.length; i++) {
    if (i === path.length - 1) {
      newPath.push(path[i]);
      break;
    }

    const prevPath = path[i - 1];
    const curPath = path[i];
    const nextPath = path[i + 1];

    if (
      curPath.x === prevPath.x + 1 &&
      curPath.x === nextPath.x - 1 &&
      curPath.y === prevPath.y &&
      curPath.y === nextPath.y
    ) {
      continue;
    }

    if (
      curPath.x === prevPath.x - 1 &&
      curPath.x === nextPath.x + 1 &&
      curPath.y === prevPath.y &&
      curPath.y === nextPath.y
    ) {
      continue;
    }

    if (
      curPath.y === prevPath.y + 1 &&
      curPath.y === nextPath.y - 1 &&
      curPath.x === prevPath.x &&
      curPath.x === nextPath.x
    ) {
      continue;
    }

    if (
      curPath.y === prevPath.y - 1 &&
      curPath.y === nextPath.y + 1 &&
      curPath.x === prevPath.x &&
      curPath.x === nextPath.x
    ) {
      continue;
    }

    newPath.push(curPath);
  }
  return newPath;
}

export function getHeuristicValueByManhattanFunction(pointStart: GridNode, pointEnd: GridNode): number {
  const D = 2;
  const dx = Math.abs(pointStart.x - pointEnd.x);
  const dy = Math.abs(pointStart.y - pointEnd.y);

  return D * (dx + dy);
}

export function getOrCreateNeighbors(map: Map<string, GridNode>, point: GridNode, step: number): GridNode[] {
  const keyTop = `${point.x}-${point.y - step}`;
  const keyBottom = `${point.x}-${point.y + step}`;
  const keyLeft = `${point.x - step}-${point.y}`;
  const keyRight = `${point.x + step}-${point.y}`;

  if (!map.has(keyTop)) map.set(keyTop, new GridNode(point.x, point.y - step));
  if (!map.has(keyBottom)) map.set(keyBottom, new GridNode(point.x, point.y + step));
  if (!map.has(keyLeft)) map.set(keyLeft, new GridNode(point.x - step, point.y));
  if (!map.has(keyRight)) map.set(keyRight, new GridNode(point.x + step, point.y));

  return [map.get(keyTop), map.get(keyBottom), map.get(keyLeft), map.get(keyRight)];
}

export type TScoreFunction<T> = (element: T) => number;

export class BinaryHeap<T> {
  private content: T[] = [];
  private scoreFunction: TScoreFunction<T>;

  constructor(scoreFunction: TScoreFunction<T>) {
    this.scoreFunction = scoreFunction;
  }

  public push(element: T) {
    // Add the new element to the end of the array.
    this.content.push(element);

    // Allow it to sink down.
    this.sinkDown(this.content.length - 1);
  }

  public pop() {
    // Store the first element so we can return it later.
    const result = this.content[0];
    // Get the element at the end of the array.
    const end = this.content.pop();
    // If there are any elements left, put the end element at the
    // start, and let it bubble up.
    if (this.content.length > 0) {
      this.content[0] = end;
      this.bubbleUp(0);
    }
    return result;
  }

  public remove(node: T) {
    const i = this.content.indexOf(node);

    // When it is found, the process seen in 'pop' is repeated
    // to fill up the hole.
    const end = this.content.pop();

    if (i !== this.content.length - 1) {
      this.content[i] = end;

      if (this.scoreFunction(end) < this.scoreFunction(node)) {
        this.sinkDown(i);
      } else {
        this.bubbleUp(i);
      }
    }
  }

  public size() {
    return this.content.length;
  }

  public rescoreElement(node: T) {
    this.sinkDown(this.content.indexOf(node));
  }

  public sinkDown(n: number) {
    // Fetch the element that has to be sunk.
    const element = this.content[n];

    // When at 0, an element can not sink any further.
    while (n > 0) {
      // Compute the parent element's index, and fetch it.
      // eslint-disable-next-line no-bitwise
      const parentN = ((n + 1) >> 1) - 1;
      const parent = this.content[parentN];
      // Swap the elements if the parent is greater.
      if (this.scoreFunction(element) < this.scoreFunction(parent)) {
        this.content[parentN] = element;
        this.content[n] = parent;
        // Update 'n' to continue at the new position.
        n = parentN;
      }
      // Found a parent that is less, no need to sink any further.
      else {
        break;
      }
    }
  }

  public bubbleUp(n: number) {
    // Look up the target element and its score.
    const length = this.content.length;
    const element = this.content[n];
    const elemScore = this.scoreFunction(element);

    // eslint-disable-next-line no-constant-condition
    while (true) {
      // Compute the indices of the child elements.
      // eslint-disable-next-line no-bitwise
      const child2N = (n + 1) << 1;
      const child1N = child2N - 1;
      // This is used to store the new position of the element, if any.
      let swap: number | null = null;
      let child1Score: number;
      // If the first child exists (is inside the array)...
      if (child1N < length) {
        // Look it up and compute its score.
        const child1 = this.content[child1N];
        child1Score = this.scoreFunction(child1);

        // If the score is less than our element's, we need to swap.
        if (child1Score < elemScore) {
          swap = child1N;
        }
      }

      // Do the same checks for the other child.
      if (child2N < length) {
        const child2 = this.content[child2N];
        const child2Score = this.scoreFunction(child2);
        if (child2Score < (swap === null ? elemScore : child1Score)) {
          swap = child2N;
        }
      }

      // If the element needs to be moved, swap it, and continue.
      if (swap !== null) {
        this.content[n] = this.content[swap];
        this.content[swap] = element;
        n = swap;
      }
      // Otherwise, we are done.
      else {
        break;
      }
    }
  }
}
