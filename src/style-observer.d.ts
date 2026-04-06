/**
 * Ambient typings for style-observer (package ships .d.ts paths not resolved with moduleResolution "node").
 */
declare module "style-observer" {
  export interface StyleObserverRecord {
    property: string;
    value: string;
    oldValue: string;
  }

  export interface StyleObserverConstructorOptions {
    targets: (Element | null)[];
    properties: string[];
  }

  export default class StyleObserver {
    constructor(callback: (records: StyleObserverRecord[]) => void, options: StyleObserverConstructorOptions);

    public unobserve(target: Element | null): void;
  }
}
