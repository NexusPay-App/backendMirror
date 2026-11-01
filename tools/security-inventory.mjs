import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
const root = new URL("../src/", import.meta.url).pathname;
async function walk(dir) {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const location = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...(await walk(location)));
    else if (entry.name.endsWith(".ts")) result.push(location);
  }
  return result;
}
const report = { routes: [], signing: [], environmentVariables: new Set() };
for (const file of await walk(root)) {
  const text = await readFile(file, "utf8");
  const relative = path.relative(root, file);
  for (const match of text.matchAll(/process\.env\.([A-Z][A-Z_0-9]+)/g))
    report.environmentVariables.add(match[1]);
  text.split("\n").forEach((line, index) => {
    if (/router\.(get|post|put|patch|delete)\(/.test(line))
      report.routes.push({
        file: relative,
        line: index + 1,
        declaration: line.trim(),
      });
    if (
      /privateKeyToAccount|signUserOp|sendTransaction|revealWalletKey/.test(
        line,
      )
    )
      report.signing.push({ file: relative, line: index + 1 });
  });
}
console.log(
  JSON.stringify(
    {
      ...report,
      environmentVariables: [...report.environmentVariables].sort(),
    },
    null,
    2,
  ),
);
