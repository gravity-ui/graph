export type RecursivePartial<T> = {
  [P in keyof T]?: T[P] extends (infer U)[]
    ? RecursivePartial<U>[]
    : T[P] extends object | undefined
      ? RecursivePartial<T[P]>
      : T[P];
};

/**
 * A universal “constructor” type: any class that can be called with `new`
 * and produces a value of type `T`.
 *
 * Why use `any[]` instead of `unknown[]` for constructor parameters:
 * - In strict mode, parameter types of function/constructor signatures are checked
 *   contravariantly.
 * - A signature `new (...args: unknown[]) => T` means “this constructor must accept
 *   any arguments.” Real classes usually have narrower constructors (e.g., `(props: Props)`).
 * - Such a class is NOT assignable to `new (...args: unknown[]) => T`, because that
 *   would require accepting `unknown` where `Props` is expected. `unknown` is not assignable
 *   to `Props`, so the assignment fails.
 * - `any[]` is permissive: `any` is assignable to and from all types, so classes with
 *   narrower constructors remain assignable to this constructor type.
 *
 * Tip: If you need to precisely type constructor arguments, parameterize them:
 *   type Constructor<T, Args extends any[] = any[]> = new (...args: Args) => T;
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Constructor<T = Record<string, any>> = new (...args: any[]) => T;
