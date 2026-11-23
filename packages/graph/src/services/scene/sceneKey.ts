/** The scene key of a component: the element it is drawn in and its place inside it (0 for the element's owner). */
export type TSceneKey = { readonly elementId: string; readonly sub: number };

/** A component ordered by the scene key: element owners, child-element owners and, in 3b, sub-components. */
export interface ISceneKeyed {
  getSceneKey(): TSceneKey | undefined;
}

export function isSceneKeyed(value: unknown): value is ISceneKeyed {
  return (
    typeof value === "object" && value !== null && typeof (value as Partial<ISceneKeyed>).getSceneKey === "function"
  );
}
