import { stat } from "node:fs/promises";
import path from "node:path";

async function requireFile(file) {
  if (!(await stat(file)).isFile()) throw new Error(`CSS asset is not a regular file: ${file}`);
}

export async function validateStyleEntry(packageRoot, manifest, styles) {
  const entry = manifest.exports?.["./styles.css"];
  if (styles ? entry !== "./build/styles.css" : entry !== undefined)
    throw new Error(`Invalid public styles.css entry for ${manifest.name ?? packageRoot}`);
  if (styles) await requireFile(path.join(packageRoot, entry));
}
