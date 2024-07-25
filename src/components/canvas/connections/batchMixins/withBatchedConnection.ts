import { Component } from "../../../../../lib/lib/Component";

export interface IWithBatchedConnection {
  _iterate(): boolean;
}

// default export because https://github.com/microsoft/TypeScript/issues/30355#issuecomment-671095933
export default <T extends Constructor<Component>>(superclass: T): T & Constructor<Component> =>
  class BatchedConnection extends superclass implements IWithBatchedConnection {
    public declare props: {
      addInRenderOrder(cmp, setting: object): void;
      removeFromRenderOrder(cmp): void;
    };

    public _iterate() {
      return super.iterate();
    }

    public iterate() {
      if (this.firstIterate) {
        return super.iterate();
      }
      return this.shouldRenderChildren;
    }

    public unmount() {
      super.unmount();

      this.props.removeFromRenderOrder(this);
    }
  };
