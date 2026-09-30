import { spawn } from "node:child_process";
export async function runNode(
  script: string,
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], {
      stdio: "inherit",
      env,
      windowsHide: true,
    });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`Command failed with exit code ${code}`)),
    );
  });
}
