

export class ZIndexMap<T> {

  protected zIndexMap: Map<number, Set<T>> = new Map();

  protected zIndexArray: number[] = [];

  protected indexMap: Map<T, number> = new Map();

  protected orderMap: Map<T, number> = new Map();

  public load(item: T[], getInder: (item: T) => number) {
    item.forEach(item => {
      this.add(item, getInder(item));
    });
  }

  public clear() {
    this.zIndexMap.clear();
    this.indexMap.clear();
    this.zIndexArray = [];
  }

  public add(item: T, zIndex: number) {
    if (!this.zIndexMap.has(zIndex)) {
      this.zIndexMap.set(zIndex, new Set());
    }
    this.zIndexMap.get(zIndex).add(item);
    this.indexMap.set(item, zIndex);
    this.resort();
  }

  public remove(item: T) {
    if (!this.indexMap.has(item)) {
      return;
    }
    const zIndex = this.indexMap.get(item);
    const set = this.zIndexMap.get(zIndex);
    if(!set) return;
    set.delete(item);
    this.indexMap.delete(item);
    if(!set.size) {
      this.zIndexMap.delete(zIndex);
      this.resort();
    }
  }

  protected resort() {
    this.zIndexArray = Array.from(this.zIndexMap.keys()).sort((a, b) => a - b);
  }

  public update(item: T, zIndex: number) {
    this.remove(item);
    this.add(item, zIndex);
    this.resort();
  }

  public forEach(callback: (item: T, zIndex: number) => void) {
    this.zIndexArray.forEach(zIndex => {
      this.zIndexMap.get(zIndex).forEach(item => {
        callback(item, zIndex);
      });
    });
  }


}