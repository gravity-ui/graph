import { verifyCulling } from "./src/lib/culling/cullingInvariants";
import { TreeCulling } from "./src/lib/culling/TreeCulling";

// Every walk in every test of the package checks the published visibility against a recomputation.
const walk = TreeCulling.prototype.walk;
TreeCulling.prototype.walk = function (this: TreeCulling, iterator: Parameters<TreeCulling["walk"]>[0]): void {
  walk.call(this, iterator);
  verifyCulling(this);
};
