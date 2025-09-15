/**
 * Utility function for combining CSS class names
 * Accepts strings, objects with truthy/falsy values, or undefined values
 * @param classes - Array of class names (strings), conditional classes (objects), or undefined
 * @returns Combined class names as a single string
 */
export const cn = (
  ...classes: (string | Record<string, boolean | string | number | null | undefined> | undefined)[]
): string => {
  return classes.reduce<string>((acc, curr) => {
    // Skip undefined values
    if (!curr) return acc;

    // Handle string class names
    if (typeof curr === "string") {
      return acc ? `${acc} ${curr}` : curr;
    }

    // Handle conditional classes (objects with truthy/falsy values)
    const items = Object.entries(curr)
      .filter(([_, value]) => value) // Only include classes where value is truthy
      .map(([key]) => key) // Extract the class name (key)
      .join(" ");

    return items ? (acc ? `${acc} ${items}` : items) : acc;
  }, "");
};
