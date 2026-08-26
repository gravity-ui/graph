import { run } from "../utils.mjs";

export async function checkTarballTypes({ packageRoot, tarballPath }) {
  console.log("\n[package-contract] Checking the root and React ESM type contracts with ATTW...");
  await run(
    "pnpm",
    ["exec", "attw", tarballPath, "--profile", "esm-only", "--entrypoints", ".", "./react", "--no-emoji", "--no-color"],
    { cwd: packageRoot }
  );

  console.log("\n[package-contract] Checking the Playwright ESM and CommonJS type contracts with ATTW...");
  await run(
    "pnpm",
    ["exec", "attw", tarballPath, "--profile", "node16", "--entrypoints", "./playwright", "--no-emoji", "--no-color"],
    { cwd: packageRoot }
  );
}

export async function checkConsumerTypes({ consumerDirectory, consumerName, configs }) {
  for (const config of configs) {
    console.log(`\n[package-contract:${consumerName}] Type-checking the public consumer API with ${config}...`);
    await run("pnpm", ["exec", "tsc", "-p", config, "--noEmit"], { cwd: consumerDirectory });
  }
}
