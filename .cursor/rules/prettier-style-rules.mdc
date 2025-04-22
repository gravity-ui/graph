---
description: 
globs: 
alwaysApply: true
---
# Prettier Style Rules

Coding style guidelines derived from the project's Prettier configuration, intended for use by an LLM agent.



1.  **Quotes:** Always use double quotes (`"`) for strings.
    *   Example: `const message = "Hello world";`
2.  **Semicolons:** Always end statements with a semicolon (`;`). (Based on Prettier default `semi: true` or inherited config).
    *   Example: `const x = 10;`
3.  **Trailing Commas:** Use trailing commas in multi-line arrays, objects, and function parameter lists. (Based on Prettier default or inherited config).
    *   Example:
        ```javascript
        const arr = [
            1,
            2,
            3, // <-- Trailing comma
        ];
        const obj = {
            a: 1,
            b: 2, // <-- Trailing comma
        };
        function greet(
            name,
            age, // <-- Trailing comma
        ) { /* ... */ }
        ```
4.  **Line Length:** Keep lines of code under 100 characters long. Break longer lines logically. (Based on Prettier default or inherited config).
5.  **Indentation:** Use 2 spaces for indentation in TypeScript/JavaScript files (`.ts`, `.tsx`, `.js`, `.jsx`).
    *   Use 2 spaces for indentation in Markdown (`.md`), JSON (`.json`), YAML (`.yaml`, `.yml`) files.
6.  **Spacing in Braces:** *Do* add spaces inside curly braces for object literals.
    *   Correct: `{ foo: "bar" }`
    *   Incorrect: `{foo: "bar"}`
7.  **Parsing:** Ensure code is valid TypeScript for `.ts`, `.tsx`, `.js`, and `.jsx` files, as the TypeScript parser will be used.

8. **Fix error** If the file contains eslint errors, then do not try to fix them by rewriting, first run the command `npx eslint --fix PATH_TO_FILE`
