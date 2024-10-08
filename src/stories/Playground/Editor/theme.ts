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
      // {
      //   token: "string.value.json",
      //   foreground: "#ffffff",
      // },
      // {
      //   token: "number.json",
      //   foreground: "#ffffff",
      // },
      // {
      //   token: "keyword.json",
      //   foreground: "#ffffff",
      // },
      // {
      //   token: "delimiter.bracket.json",
      //   foreground: "#ffffff",
      //   background: "#ffffff",
      // },
      // {
      //   token: "delimiter.comma.json",
      //   foreground: "#ffffff",
      //   background: "#ffffff",
      // },
      // {
      //   token: "delimiter.array.json",
      //   foreground: "#ffffff",
      //   background: "#ffffff",
      // }
    ],
    colors: {
      "editor.foreground": "#ffdb4d4d",
      "editor.background": "#251b25",
      "editor.lineHighlightBackground": "#ffdb4d4d",
      "editorLineNumber.foreground": "#251b25",
      "editor.selectionBackground": "#ffdb4d4d",
      "editor.inactiveSelectionBackground": "#88000015",
      // "editorBracketHighlight.foreground1": "#ffffff",
      // "editorBracketHighlight.foreground2": "#ffffff",
      // "editorBracketHighlight.foreground3": "#ffffff",
      // "editorBracketHighlight.foreground4": "#ffffff",
      // "editorBracketHighlight.foreground5": "#ffffff",
      // "editorBracketHighlight.foreground6": "#ffffff",
      // "editorBracketHighlight.unexpectedBracket.foreground": "#ffffff"
    },
  });
}