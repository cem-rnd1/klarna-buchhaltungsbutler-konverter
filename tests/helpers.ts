// Shared end-to-end pipeline for tests, delegating to the app's own core pipeline.

import type { SettlementFile } from '../src/core/parse.ts';
import { convertFiles, type ConversionResult, type Payout } from '../src/core/transform.ts';
import type { Issue } from '../src/core/validate.ts';

export interface ConvertResult {
  files: SettlementFile[];
  payouts: Payout[];
  issues: Issue[];
  csv: string;
  filename: string;
}

export function convert(inputs: { name: string; content: string | Uint8Array }[]): ConvertResult {
  const result: ConversionResult = convertFiles(
    inputs.map((f) => ({
      fileName: f.name,
      bytes: typeof f.content === 'string' ? new TextEncoder().encode(f.content) : f.content,
    })),
  );
  return {
    files: result.files.map((f) => f.file),
    payouts: result.payouts,
    issues: result.issues,
    csv: result.csv,
    filename: result.filename,
  };
}

export function issueCodes(result: ConvertResult): string[] {
  return result.issues.map((i) => i.code);
}
