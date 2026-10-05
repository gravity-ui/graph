/** A listener whose event type is fixed by the registration's event name. */
export type TypedEventListener<E extends Event, Target = EventTarget> =
  | ((this: Target, event: E) => void)
  | { handleEvent: (event: E) => void };

/** EventTarget erases the event-name relationship at its DOM boundary. Keep identity and DOM semantics. */
export function toDOMListener<E extends Event, Target = EventTarget>(
  listener: TypedEventListener<E, Target>
): EventListenerOrEventListenerObject {
  return listener as EventListenerOrEventListenerObject;
}

export function addTypedEventListener<E extends Event, Target = EventTarget>(
  target: EventTarget,
  type: string,
  listener: TypedEventListener<E, Target>,
  options?: AddEventListenerOptions | boolean
): () => void {
  const erased = toDOMListener(listener);
  // Snapshot capture: callers may mutate the options object after registration.
  const capture = typeof options === "boolean" ? options : Boolean(options?.capture);
  target.addEventListener(type, erased, options);
  return () => target.removeEventListener(type, erased, capture);
}

export function removeTypedEventListener<E extends Event, Target = EventTarget>(
  target: EventTarget,
  type: string,
  listener: TypedEventListener<E, Target>,
  options?: EventListenerOptions | boolean
): void {
  target.removeEventListener(type, toDOMListener(listener), options);
}
