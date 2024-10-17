import type { Monaco } from "@monaco-editor/react";

export const GravityTheme = 'gravity';

export function defineTheme(monaco: Monaco) {
  monaco.editor.defineTheme(GravityTheme, {
    base: "vs-dark",
    inherit: true,
    rules: [
      {
        token: "string.key.json",
        foreground: "#febe5c",
      },
    ],
    colors: {
      "editor.foreground": "#ffdb4d4d",
      "editor.background": "#251b25",
      "editor.lineHighlightBackground": "#ffdb4d4d",
      "editorLineNumber.foreground": "#bd5c0a",
      "editor.selectionBackground": "#ffdb4d4d",
      "editor.inactiveSelectionBackground": "#ffdb4d4d",
    },
  });
}