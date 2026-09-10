import { spawn } from "node:child_process";

export function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (options.printStdout !== false) {
        process.stdout.write(chunk);
      }
    });
    child.stderr.on("data", (chunk) => process.stderr.write(chunk));
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }

      reject(
        new Error(
          signal
            ? `${command} ${args.join(" ")} was terminated by ${signal}.`
            : `${command} ${args.join(" ")} exited with code ${code}.`
        )
      );
    });
  });
}
