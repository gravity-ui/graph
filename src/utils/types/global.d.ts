type Constructor<T = Record<string, unknown>> = new (...args: any[]) => T;

type Interface<T> = { [P in keyof T]: T[P] };

declare const global: any;

interface IWithEvent extends EventTarget {
  handleEvent?(event: Event): void;
  hasEventListener(type: string): boolean;
}

declare interface ICustomElement extends HTMLElement {
  connectedCallback(): void;
  disconnectedCallback(): void;
}
