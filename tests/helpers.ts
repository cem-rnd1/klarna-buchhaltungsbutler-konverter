// Shared end-to-end pipeline for tests, delegating to the app's own core pipeline.

import type { SettlementFile } from '../src/core/parse.ts';
import type { ShopifyFileResult } from '../src/core/shopify.ts';
import { convertFiles, type ConversionResult, type Payout } from '../src/core/transform.ts';
import type { Issue } from '../src/core/validate.ts';

export interface ConvertResult {
  files: SettlementFile[];
  shopifyFiles: ShopifyFileResult[];
  payouts: Payout[];
  issues: Issue[];
  csv: string;
  filename: string;
}

export interface TestFile {
  name: string;
  content: string | Uint8Array;
}

const toInput = (f: TestFile) => ({
  fileName: f.name,
  bytes: typeof f.content === 'string' ? new TextEncoder().encode(f.content) : f.content,
});

/** Optional Shopify order exports (§4.5) are passed as the second argument. */
export function convert(inputs: TestFile[], shopifyInputs: TestFile[] = []): ConvertResult {
  const result: ConversionResult = convertFiles(
    inputs.map(toInput),
    shopifyInputs.map(toInput),
  );
  return {
    files: result.files.map((f) => f.file),
    shopifyFiles: result.shopifyFiles,
    payouts: result.payouts,
    issues: result.issues,
    csv: result.csv,
    filename: result.filename,
  };
}

export function issueCodes(result: ConvertResult): string[] {
  return result.issues.map((i) => i.code);
}
