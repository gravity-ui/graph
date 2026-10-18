import { run } from "../utils.mjs";

export async function checkTarballTypes({ contract, tarballPath }) {
  for (const { entrypoint, profile } of contract.attw ?? [{ entrypoint: ".", profile: "esm-only" }]) {
    console.log(`\n[package-contract] Checking ${contract.packageName} ${entrypoint} types with ATTW (${profile})...`);
    await run(
      "pnpm",
      ["exec", "attw", tarballPath, "--profile", profile, "--entrypoints", entrypoint, "--no-emoji", "--no-color"],
      {
        cwd: contract.packageRoot,
      }
    );
  }
}

export async function checkConsumerTypes({ consumerDirectory, consumerName, configs }) {
  for (const config of configs) {
    console.log(`\n[package-contract:${consumerName}] Type-checking the public consumer API with ${config}...`);
    await run("pnpm", ["exec", "tsc", "-p", config, "--noEmit"], { cwd: consumerDirectory });
  }
}
