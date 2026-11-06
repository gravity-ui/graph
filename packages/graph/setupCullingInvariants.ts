import { verifyCulling } from "./src/lib/culling/cullingInvariants";
import { TreeCulling } from "./src/lib/culling/TreeCulling";

// Every walk in every test of the package checks the published visibility against a recomputation.
const walk = TreeCulling.prototype.walk;
TreeCulling.prototype.walk = function (this: TreeCulling, ...args: Parameters<TreeCulling["walk"]>): void {
  walk.apply(this, args);
  verifyCulling(this);
};
