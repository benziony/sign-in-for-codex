import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const included = ["src", "public", "integrations", "docs", "scripts", "test", ".github"];
const textExtensions = new Set([".js", ".json", ".md", ".ts", ".yaml", ".yml", ".html", ".css", ".example"]);
const blocked = [
  /credential[ -]?inbox/i,
  /server-mac-ops/i,
  /BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/,
  /gh[pousr]_[A-Za-z0-9_]{20,}/,
  /sk-[A-Za-z0-9_-]{20,}/,
  /xox[baprs]-[A-Za-z0-9-]{10,}/,
  /AKIA[0-9A-Z]{16}/
];

function files(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? files(full) : [full];
  });
}

const findings = [];
for (const directory of included) {
  for (const file of files(path.join(root, directory))) {
    if (!textExtensions.has(path.extname(file)) && path.basename(file) !== ".env.example") continue;
    const source = fs.readFileSync(file, "utf8");
    for (const pattern of blocked) {
      if (pattern.test(source)) findings.push(`${path.relative(root, file)} matches ${pattern}`);
    }
  }
}

if (findings.length > 0) {
  console.error("Public-boundary audit failed:\n" + findings.map((item) => `- ${item}`).join("\n"));
  process.exit(1);
}
console.log("Public-boundary audit passed.");
