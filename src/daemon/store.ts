import fs from "node:fs";
import path from "node:path";
import { ensurePrivateDirectory } from "./paths.js";
import { validateDurableRequest } from "../shared/validation.js";
import type { DurableRequest } from "../shared/types.js";

export class RequestStore {
  constructor(readonly filePath: string) {}

  load(): DurableRequest[] {
    if (!fs.existsSync(this.filePath)) return [];
    const parsed: unknown = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("request ledger is invalid");
    }
    const record = parsed as Record<string, unknown>;
    if (record.schemaVersion !== 1 || !Array.isArray(record.requests)) {
      throw new Error("request ledger schema is unsupported");
    }
    return record.requests.map(validateDurableRequest);
  }

  save(requests: DurableRequest[]): void {
    const directory = path.dirname(this.filePath);
    ensurePrivateDirectory(directory);
    const temporary = `${this.filePath}.${process.pid}.tmp`;
    try {
      fs.writeFileSync(
        temporary,
        `${JSON.stringify({ schemaVersion: 1, requests: requests.map(validateDurableRequest) }, null, 2)}\n`,
        { mode: 0o600 }
      );
      fs.chmodSync(temporary, 0o600);
      fs.renameSync(temporary, this.filePath);
      fs.chmodSync(this.filePath, 0o600);
    } finally {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    }
  }
}
