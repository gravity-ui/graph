import type { TEntityAddress } from "./types";

type TAddressable = { getEntityId(): string | number };

/** The tag address of a component: its class's static entityType and its entity id. */
export function getEntityAddress(component: object): TEntityAddress | undefined {
  const type = (component.constructor as { entityType?: string }).entityType;
  if (!type) return undefined;
  const getEntityId = (component as Partial<TAddressable>).getEntityId;
  if (typeof getEntityId !== "function") return undefined;
  return { type, id: getEntityId.call(component) };
}
