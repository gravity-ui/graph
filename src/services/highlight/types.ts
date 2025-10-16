/**
 * Well-known target prefixes for highlight system.
 * Custom prefixes can also be used for plugins or custom components.
 *
 * IDs can be strings or numbers - they will be normalized to strings internally.
 */
export type THighlightTargets = Partial<Record<string, Array<string | number>>>;
