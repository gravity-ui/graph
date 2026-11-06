import { fileURLToPath } from "node:url";
import { buildPackage } from "../../../scripts/build-package.mjs";

await buildPackage({ packageRoot: fileURLToPath(new URL("../", import.meta.url)) });
