import type { TInstanceUpload } from "./InstanceRanges";

export const PATH_RECORD_TEXELS = 10;
const RECORD_FLOATS = PATH_RECORD_TEXELS * 4;
const PATH_FLOATS = 32;
const ELEMENT_FLOATS = 8;

type TRecordWrite = { x: number; y: number; width: number; height: number; data: Float32Array };

/** Interleaves only dirty records into row-aligned texture writes, with no duplicate resident geometry buffer. */
export function pathRecordWrites(
  paths: Float32Array,
  elements: Float32Array,
  pathUpload: TInstanceUpload,
  elementUpload: TInstanceUpload,
  width: number
): TRecordWrite[] {
  const count = paths.length / PATH_FLOATS;
  const perRow = width / PATH_RECORD_TEXELS;
  if (!Number.isInteger(perRow) || perRow < 1 || elements.length / ELEMENT_FLOATS !== count) {
    throw new Error("Path record texture rows and companion instances must align");
  }
  if (!count || (pathUpload.kind === "none" && elementUpload.kind === "none")) return [];
  const writes: TRecordWrite[] = [];
  const pack = (first: number, size: number, x: number, y: number, writeWidth: number, height: number): void => {
    const data = new Float32Array(writeWidth * height * 4);
    for (let i = 0; i < size; i++) {
      const record = first + i;
      const out = i * RECORD_FLOATS;
      for (let f = 0; f < PATH_FLOATS; f++) data[out + f] = paths[record * PATH_FLOATS + f];
      for (let f = 0; f < ELEMENT_FLOATS; f++) data[out + PATH_FLOATS + f] = elements[record * ELEMENT_FLOATS + f];
    }
    writes.push({ x, y, width: writeWidth, height, data });
  };
  if (pathUpload.kind === "full" || elementUpload.kind === "full") {
    pack(0, count, 0, 0, width, Math.ceil(count / perRow));
    return writes;
  }
  const dirty: { first: number; end: number }[] = [];
  for (const [upload, floats] of [
    [pathUpload, PATH_FLOATS],
    [elementUpload, ELEMENT_FLOATS],
  ] as const) {
    if (upload.kind !== "range") continue;
    for (const span of upload.spans) {
      const first = Math.min(count, Math.floor(span.byteOffset / (floats * 4)));
      const end = Math.min(count, Math.ceil((span.byteOffset + span.data.byteLength) / (floats * 4)));
      if (first < end) dirty.push({ first, end });
    }
  }
  dirty.sort((a, b) => a.first - b.first);
  const merged: typeof dirty = [];
  for (const span of dirty) {
    const last = merged[merged.length - 1];
    if (last && span.first <= last.end) last.end = Math.max(last.end, span.end);
    else merged.push(span);
  }
  for (const { first, end } of merged) {
    let from = first;
    const column = from % perRow;
    if (column) {
      const size = Math.min(end - from, perRow - column);
      pack(from, size, column * PATH_RECORD_TEXELS, Math.floor(from / perRow), size * PATH_RECORD_TEXELS, 1);
      from += size;
    }
    const rows = Math.floor((end - from) / perRow);
    if (rows) {
      pack(from, rows * perRow, 0, from / perRow, width, rows);
      from += rows * perRow;
    }
    if (from < end) pack(from, end - from, 0, from / perRow, (end - from) * PATH_RECORD_TEXELS, 1);
  }
  return writes;
}
