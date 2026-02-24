// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Constructor<T = Record<string, unknown>> = new (...args: any[]) => T;

type Interface<T> = { [P in keyof T]: T[P] };

type PartialObject<T> = Pick<T, keyof T>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const global: any;

interface IWithEvent extends EventTarget {
  handleEvent?(event: Event): void;
  hasEventListener(type: string): boolean;
}

declare interface ICustomElement extends HTMLElement {
  connectedCallback(): void;
  disconnectedCallback(): void;
}
