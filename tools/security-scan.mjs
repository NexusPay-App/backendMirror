import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
const files = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { encoding: "utf8" },
)
  .split("\0")
  .filter(Boolean);
const findings = [];
const patterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /mongodb(?:\+srv)?:\/\/[^\s"'<>:@]+:[^\s"'<>@]+@/,
  /(?:JWT_SECRET|THIRDWEB_SECRET_KEY|AFRICAS_TALKING_API_KEY)\s*[:=]\s*["'][A-Za-z0-9_\/-]{24,}["']/,
];
for (const file of files) {
  if (!existsSync(file)) continue;
  if (
    /\.(png|jpg|jpeg|webp|gif|ico|woff2?|ttf|mp4|mp3|pdf)$/.test(file) ||
    file.includes("package-lock.json")
  )
    continue;
  if (
    /(^|\/)\.env($|\.)/.test(file) &&
    !/\.(example|sample|template)$/.test(file)
  ) {
    findings.push(file);
    continue;
  }
  if (/LOCAL_ONLY|(^|\/)\.security-local\//.test(file)) {
    findings.push(file);
    continue;
  }
  try {
    const text = await readFile(file, "utf8");
    if (patterns.some((pattern) => pattern.test(text))) findings.push(file);
  } catch {}
}
if (findings.length) {
  console.error(
    "Potential secrets or local-only files detected:",
    [...new Set(findings)].join(", "),
  );
  process.exitCode = 1;
} else
  console.log(
    "No matching secrets or local-only reference files in tracked/candidate files.",
  );
