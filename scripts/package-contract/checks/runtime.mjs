import { run } from "../utils.mjs";

async function checkUnresolvable(consumerDirectory, specifiers) {
  const probe = `
    for (const specifier of ${JSON.stringify(specifiers)}) {
      try {
        await import(specifier);
      } catch (error) {
        if (error?.code === "ERR_MODULE_NOT_FOUND") continue;
        throw error;
      }
      throw new Error("The isolated consumer unexpectedly resolves " + specifier);
    }
  `;

  console.log(`\n[package-contract] Confirming the consumer cannot resolve ${specifiers.join(", ")}...`);
  await run(process.execPath, ["--input-type=module", "--eval", probe], { cwd: consumerDirectory });
}

export async function checkRuntimeConsumer({ consumerDirectory, mustNotResolve = [], probes = [] }) {
  if (mustNotResolve.length > 0) {
    await checkUnresolvable(consumerDirectory, mustNotResolve);
  }

  for (const { label, type = "module", source } of probes) {
    console.log(`\n[package-contract] ${label}...`);
    await run(process.execPath, [`--input-type=${type === "commonjs" ? "commonjs" : "module"}`, "--eval", source], {
      cwd: consumerDirectory,
    });
  }
}
