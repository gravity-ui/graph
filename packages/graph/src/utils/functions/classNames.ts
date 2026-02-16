/**
 * Parses a string of class names into an array of individual class names.
 * Handles multiple spaces, trims whitespace, and filters out empty strings.
 *
 * @param className - String containing one or more CSS class names separated by spaces
 * @returns Array of individual class names
 *
 * @example
 * parseClassNames("class1 class2  class3") // ["class1", "class2", "class3"]
 * parseClassNames("   single-class   ") // ["single-class"]
 * parseClassNames("") // []
 * parseClassNames("   ") // []
 */
export function parseClassNames(className: string): string[] {
  return className.trim().split(/\s+/).filter(Boolean);
}
