import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
for (const name of fs.readdirSync(path.join(root, "docs")).sort()) {
  if (name.endsWith(".md")) console.log(`docs/${name}`);
}
