

import { Editor, type Monaco, OnMount, loader } from "@monaco-editor/react";
import React, { Ref, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import type { TBlock } from "../../../components/canvas/blocks/Block";
import type { TConnection } from "../../../store/connection/ConnectionState";
import { defineTheme, GravityTheme } from "./theme";
import { TBlockId } from "../../../store/block/Block";
import { Button, Flex } from "@gravity-ui/uikit";

import "./Editor.css";


loader.init().then((monaco) => {
  defineTheme(monaco);
});

export interface ConfigEditorController {
  scrollTo: (blockId: TBlockId) => void;
}

export const ConfigEditor = React.forwardRef(function ConfigEditor({ blocks, connections }: { blocks: TBlock[], connections: TConnection[] }, ref: Ref<ConfigEditorController>) {

  const monacoRef = useRef<Parameters<OnMount>[0]>(null);

  const blocksMap = useRef(new Map());

  const value = useMemo(() => {
    return  JSON.stringify({
      blocks,
      connections
    }, null, 2);
  }, [blocks, connections]);

  useImperativeHandle(ref, () => ({
    scrollTo: (blockId: string) => {
      const symbolIndex = value.indexOf(`"id": "${blockId}"`);
      if (symbolIndex >= 0) {
        const line = Array.from(value.slice(0, symbolIndex).matchAll(/\n+/gm)).length
        monacoRef.current?.revealLineNearTop(line, 0);
      }
    }
  }))

  return <Flex direction="column" className="editor-wrap">
    <Flex grow={1} >
      <Editor
        onMount={(editor) => {
          monacoRef.current = editor;
        }}
        language={'json'}
        value={value}
        theme={GravityTheme}
        options={{
          contextmenu: false,
          lineNumbersMinChars: 2,
          glyphMargin: false,
          fontSize: 18,
          lineHeight: 20,
          colorDecorators: true,
          minimap: {enabled: false},
          // @ts-ignore
          'bracketPairColorization.editor': true,
        }}
      />
    </Flex>
    <Flex className="actions" gap={3}>
      <Button view="action">Apply</Button>
      <Button>Add new block</Button>
    </Flex>
  </Flex>
})