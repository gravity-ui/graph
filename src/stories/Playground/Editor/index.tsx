

import { Editor, type Monaco, OnMount, loader } from "@monaco-editor/react";
import React, { Ref, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import type { TBlock } from "../../../components/canvas/blocks/Block";
import type { TConnection } from "../../../store/connection/ConnectionState";
import { defineTheme, GravityTheme } from "./theme";
import { TBlockId } from "../../../store/block/Block";
import { Button, Flex } from "@gravity-ui/uikit";

import "./Editor.css";
import { findBlockPositionsMonaco } from "./utils";


loader.init().then((monaco) => {
  defineTheme(monaco);
});

export interface ConfigEditorController {
  scrollTo: (blockId: TBlockId) => void;
  updateBlocks: (block: TBlock[]) => void;
  setContent: (p: {blocks: TBlock[], connections: TConnection[]}) => void;
}

type ConfigEditorProps = { 
  onChange?: (config: { blocks: TBlock[], connections: TConnection[] }) => void
};

export const ConfigEditor = React.forwardRef(function ConfigEditor(props: ConfigEditorProps, ref: Ref<ConfigEditorController>) {

  const monacoRef = useRef<Parameters<OnMount>[0]>(null);

  const valueRef = useRef<{ blocks: TBlock[], connections: TConnection[] }>({ blocks: [], connections: []})

  useImperativeHandle(ref, () => ({
    scrollTo: (blockId: string) => {

      const model = monacoRef.current.getModel();
      const range = findBlockPositionsMonaco(model, blockId);
      
      if (range?.start.column) {
        monacoRef.current?.revealLinesInCenter(range.start.lineNumber, range.end.lineNumber, 0);
      }

      monacoRef.current.setSelection({
        startColumn: range.start.column,
        startLineNumber: range.start.lineNumber,
        endColumn: range.end.column,
        endLineNumber: range.end.lineNumber
      });
    },
    updateBlocks: (blocks: TBlock[]) => {
      const model = monacoRef.current.getModel();
      const edits = blocks.map((block)=> {
        const range = findBlockPositionsMonaco(model, block.id);
        const text = JSON.stringify({ block: [block] }, null, 2);
        return {
          range: {
            startColumn: range.start.column,
            startLineNumber: range.start.lineNumber,
            endColumn: range.end.column,
            endLineNumber: range.end.lineNumber,
          },
          text: text.slice(19, text.length - 6),
        }
      })
      
      model.applyEdits(edits);
    },
    setContent: ({ blocks, connections}) => {
      valueRef.current = {
        blocks,
        connections
      }
      monacoRef.current?.setValue(JSON.stringify(valueRef.current, null, 2));
    },
  }));

  return <Flex direction="column" className="editor-wrap">
    <Flex grow={1} >
      <Editor
        onMount={(editor) => {
          monacoRef.current = editor;
          monacoRef.current?.setValue(JSON.stringify(valueRef.current, null, 2));
        }}
        language={'json'}
        theme={GravityTheme}
        options={{
          contextmenu: false,
          lineNumbersMinChars: 2,
          glyphMargin: false,
          fontSize: 18,
          lineHeight: 20,
          colorDecorators: true,
          minimap: {enabled: false},
          smoothScrolling: true,
          // @ts-ignore
          'bracketPairColorization.editor': true,
        }}
      />
    </Flex>
    <Flex className="actions" gap={3}>
      <Button view="action" onClick={() => {
        try {
          const data = JSON.parse(monacoRef.current.getModel().getValue());
          props?.onChange?.({ blocks: data.blocks, connections: data.conections })
        } catch(e) {
          console.error(e);
        }
      }}>Apply</Button>
      <Button>Add new block</Button>
    </Flex>
  </Flex>
})