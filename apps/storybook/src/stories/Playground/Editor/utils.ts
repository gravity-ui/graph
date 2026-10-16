import type { TBlockId } from "@gravity-ui/graph";
import type { IPosition, editor } from "monaco-editor/esm/vs/editor/editor.api";

/** Index of `search` followed by the end of a JSON value, so `"id": 1` does not match `"id": 12`. */
function findValueIndex(text: string, search: string): number {
  let index = text.indexOf(search);
  while (index !== -1) {
    const next = text[index + search.length];
    if (next === undefined || next === "," || next === "}" || /\s/.test(next)) {
      return index;
    }
    index = text.indexOf(search, index + 1);
  }
  return -1;
}

export function findBlockPositionsMonaco(
  model: editor.ITextModel,
  blockId: TBlockId
): { start: IPosition; end: IPosition } | null {
  const configString = model.getValue();
  // Match the id as JSON serializes it: numeric ids are not quoted.
  const blockSearchStr = `"id": ${JSON.stringify(blockId)}`;
  const startIndex = findValueIndex(configString, blockSearchStr);
  if (startIndex === -1) {
    return null;
  }

  const blockStart = configString.lastIndexOf("{", startIndex);
  let blockEnd = configString.indexOf("}", startIndex);

  let braceCount = 1;
  let currentPos = blockEnd + 1;
  while (braceCount > 0 && currentPos < configString.length) {
    if (configString[currentPos] === "{") {
      braceCount++;
    } else if (configString[currentPos] === "}") {
      braceCount--;
    }
    currentPos++;
  }
  blockEnd = currentPos;

  // Получаем позиции начала и конца через Monaco Editor API
  const startPosition = model.getPositionAt(blockStart);
  const endPosition = model.getPositionAt(blockEnd);

  return {
    start: startPosition,
    end: endPosition,
  };
}
