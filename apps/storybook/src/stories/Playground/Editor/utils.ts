import type { TBlockId } from "@gravity-ui/graph";
import type { IPosition, editor } from "monaco-editor/esm/vs/editor/editor.api";

export function findBlockPositionsMonaco(
  model: editor.ITextModel,
  blockId: TBlockId
): { start: IPosition; end: IPosition } {
  const configString = model.getValue();
  const blockSearchStr = `"id": "${blockId}"`;
  const startIndex = configString.indexOf(blockSearchStr);

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
