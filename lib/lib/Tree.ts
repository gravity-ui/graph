type TIterator = (Node) => boolean;

export class Node {
  public data: any;
  private parent: Node;
  private walkIndex: number = 0;
  private childrenLength: number = 0;
  private children: Node[] = [];

  constructor (data, parent?: Node) {
    this.data = data;
    this.parent = parent;
  }

  append (node: Node) {
    this.children.push(node);
    this.childrenLength = this.children.length;
  }

  remove (node: Node = this) {
    if (node.parent === null) return;

    node.parent.children.splice(node.parent.children.indexOf(node), 1);
    node.parent.childrenLength = node.parent.children.length;
  }

  setChildren (nodes: Node[]) {
    this.children = nodes;
    this.childrenLength = nodes.length;
  }

  clearChildren () {
    this.children = [];
    this.childrenLength = 0;
  }

  traverseDown (iterator: TIterator) {
    this._traverse(iterator, '_walkDown');
  }

  private _traverse (iterator: TIterator, strategyName: string) {
    this[strategyName](iterator);
  }

  protected _walkDown (iterator: TIterator) {
    if (iterator(this) === true && this.childrenLength > 0) {
      while (this.walkIndex < this.childrenLength) {
        this.children[this.walkIndex]._walkDown(iterator);
        this.walkIndex += 1;
      }

      this.walkIndex = 0;
    }

    return void 0;
  }
}

