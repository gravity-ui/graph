export type Constructor<T = {}> = new (...args: any[]) => T;
export type Interface<T> = { [P in keyof T]: T[P] };
