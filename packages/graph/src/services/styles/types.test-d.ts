// Type test: checked by `pnpm --dir packages/graph run typecheck`, not run by Jest.
import { Block } from "../../components/canvas/blocks/Block";

import { SceneStyleSheet } from "./SceneStyleSheet";
import type { TPartsOf, TStyleParts } from "./types";

type TExpectEqual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;

class Typed {
  public declare readonly __styleParts?: TStyleParts<"body">;
}

class Untyped {}

const sheet = new SceneStyleSheet();
sheet.add([{ target: Typed, style: { parts: { body: { color: "#000000" } } } }]);
// @ts-expect-error "bdy" is not a part of Typed.
sheet.add([{ target: Typed, style: { parts: { bdy: { color: "#000000" } } } }]);
// `dim` is set on the element and on parts.
sheet.add([{ target: Typed, style: { dim: 0.6, parts: { body: { dim: 0 } } } }]);
// `opacity` is set on the element and on parts.
sheet.add([{ target: Typed, style: { opacity: 0.4, parts: { body: { opacity: 0.5 } } } }]);
// Each rule is checked against its own target.
sheet.add([
  { target: Untyped, style: { parts: { anything: { color: "#000000" } } } },
  { target: Typed, style: { parts: { body: { color: "#000000" } } } },
]);
sheet.add([
  { target: Untyped, style: { parts: { anything: { color: "#000000" } } } },
  // @ts-expect-error "bdy" is not a part of Typed, even next to an untyped target.
  { target: Typed, style: { parts: { bdy: { color: "#000000" } } } },
]);
// Function styles are checked as well.
// @ts-expect-error "bdy" is not a part of Typed.
sheet.add([{ target: Typed, style: () => ({ parts: { bdy: { color: "#000000" } } }) }]);

// A subclass widens its base's parts by redeclaring the brand.
class Widened extends Typed {
  public declare readonly __styleParts?: TStyleParts<"body" | "badge">;
}
// A subclass that does not redeclare the brand inherits its base's parts.
class Inherited extends Typed {}

sheet.add([{ target: Widened, style: { parts: { badge: { color: "#000000" }, body: { color: "#000000" } } } }]);
sheet.add([{ target: Inherited, style: { parts: { body: { color: "#000000" } } } }]);
// @ts-expect-error "bdge" is not a part of Widened.
sheet.add([{ target: Widened, style: { parts: { bdge: { color: "#000000" } } } }]);
// @ts-expect-error "badge" is a part of Widened only, not of Inherited.
sheet.add([{ target: Inherited, style: { parts: { badge: { color: "#000000" } } } }]);

// The same with the canvas Block, the case custom blocks hit.
class BadgeBlock extends Block {
  public declare readonly __styleParts?: TStyleParts<"body" | "border" | "title" | "badge">;
}
class PlainBlock extends Block {}

sheet.add([
  { target: BadgeBlock, style: { parts: { badge: { color: "#000000" }, title: { color: "#000000" } } } },
  { target: PlainBlock, style: { parts: { border: { color: "#000000" } } } },
]);
// @ts-expect-error "bdge" is not a part of BadgeBlock.
sheet.add([{ target: BadgeBlock, style: { parts: { bdge: { color: "#000000" } } } }]);

export const partChecks: [
  TExpectEqual<TPartsOf<typeof Block>, "body" | "border" | "title">,
  TExpectEqual<TPartsOf<typeof BadgeBlock>, "body" | "border" | "title" | "badge">,
  TExpectEqual<TPartsOf<typeof PlainBlock>, "body" | "border" | "title">,
  TExpectEqual<TPartsOf<typeof Widened>, "body" | "badge">,
  TExpectEqual<TPartsOf<typeof Inherited>, "body">,
  TExpectEqual<TPartsOf<typeof Untyped>, string>,
] = [true, true, true, true, true, true];
