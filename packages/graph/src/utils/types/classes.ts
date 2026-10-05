/** Class identity marker; retain the concrete class when constructing instances. */
export type GraphClassConstructor<T = object> = new (...args: never[]) => T;

/** A class used for instanceof/filtering, including abstract bases. */
export type Class<T = object> = abstract new (...args: never[]) => T;

/** Public structural members, excluding private and protected implementation details. */
export type Interface<T> = { [P in keyof T]: T[P] };
