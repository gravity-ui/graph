import { fileURLToPath } from "node:url";
import { buildPackage } from "../../../scripts/build-package.mjs";

await buildPackage({
  packageRoot: fileURLToPath(new URL("../", import.meta.url)),
  inlinedWorkspacePackages: new Map([
    ["@gravity-ui/graph-scheduler", fileURLToPath(import.meta.resolve("@gravity-ui/graph-scheduler"))],
  ]),
  playwright: true,
  docs: true,
});
