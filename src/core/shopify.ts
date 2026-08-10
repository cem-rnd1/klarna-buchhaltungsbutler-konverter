// §3.5/§4.5: optional Shopify order export -> token lookup table for matching
// Klarna transaction rows to customer names and order numbers.

import { parseCsv } from './csv.ts';
import { decodeCsvBytes, detectDelimiter } from './detect.ts';
import { makeIssue, type Issue } from './validate.ts';

export interface ShopifyOrder {
  /** Shopify order number from the "Name" column, e.g. "RND26-1156-DE". */
  orderName: string;
  /** Customer name from the "Billing Name" column; may be empty. */
  billingName: string;
}

/** Payment-session token -> order. Built from all added Shopify files. */
export type ShopifyIndex = Map<string, ShopifyOrder>;

export interface ShopifyFileResult {
  fileName: string;
  /** Distinct orders contributed by this file. */
  orderCount: number;
  /** false ⇒ file-level error; the file contributes nothing. */
  ok: boolean;
  issues: Issue[];
}

// Header names, matched case-insensitively after trimming (§3.5).
const COL_ORDER_NAME = 'name';
const COL_BILLING_NAME = 'billing name';
const TOKEN_COLUMNS = ['payment reference', 'payment id', 'payment references'];

/**
 * Reduce a merchant/payment reference to the bare payment-session token:
 * "gid://shopify/PaymentSession/rN6NG…" and "rN6NG…" both yield "rN6NG…".
 * Returns null when nothing is left.
 */
export function extractSessionToken(raw: string): string | null {
  const value = raw.trim();
  const token = value.slice(value.lastIndexOf('/') + 1).trim();
  return token === '' ? null : token;
}

/**
 * Tokens of one Shopify cell. "Payment References" can list several references
 * joined by " + " (payment plus refund token), so cells are split first.
 */
export function extractSessionTokens(cell: string): string[] {
  const tokens: string[] = [];
  for (const part of cell.split(/[\s,;+]+/)) {
    const token = extractSessionToken(part);
    if (token !== null) tokens.push(token);
  }
  return tokens;
}

function headerMap(header: string[]): Map<string, number> {
  const map = new Map<string, number>();
  header.forEach((name, i) => {
    const canonical = name.trim().toLowerCase();
    if (!map.has(canonical)) map.set(canonical, i);
  });
  return map;
}

function parseShopifyFile(
  bytes: Uint8Array,
  fileName: string,
  index: ShopifyIndex,
): ShopifyFileResult {
  const issues: Issue[] = [];
  const text = decodeCsvBytes(bytes);
  const rows = parseCsv(text, detectDelimiter(text));
  const header = rows[0] ?? [];
  const map = headerMap(header);
  const tokenColumns = TOKEN_COLUMNS.filter((col) => map.has(col));

  if (!map.has(COL_ORDER_NAME) || tokenColumns.length === 0) {
    issues.push(makeIssue('error', 'shopify_unusable_file', undefined, { fileName }));
    return { fileName, orderCount: 0, ok: false, issues };
  }
  if (!map.has(COL_BILLING_NAME)) {
    issues.push(makeIssue('info', 'shopify_missing_billing_column', undefined, { fileName }));
  }

  const get = (row: string[], col: string): string => {
    const idx = map.get(col);
    return idx === undefined ? '' : (row[idx] ?? '').trim();
  };

  // One order spans several rows (one per line item); only the first carries
  // the payment references, so keying on token presence skips the rest.
  // A token already known (repeated row, second file) keeps its first order.
  const orders = new Set<string>();
  for (const row of rows.slice(1)) {
    const order: ShopifyOrder = {
      orderName: get(row, COL_ORDER_NAME),
      billingName: get(row, COL_BILLING_NAME),
    };
    for (const col of tokenColumns) {
      for (const token of extractSessionTokens(get(row, col))) {
        if (!index.has(token)) {
          index.set(token, order);
          orders.add(order.orderName);
        }
      }
    }
  }

  return { fileName, orderCount: orders.size, ok: true, issues };
}

/** Build one combined lookup table from all added Shopify exports (§3.5). */
export function buildShopifyIndex(inputs: { fileName: string; bytes: Uint8Array }[]): {
  index: ShopifyIndex;
  files: ShopifyFileResult[];
  issues: Issue[];
} {
  const index: ShopifyIndex = new Map();
  const files = inputs.map(({ fileName, bytes }) => parseShopifyFile(bytes, fileName, index));
  return { index, files, issues: files.flatMap((f) => f.issues) };
}

/**
 * Look up an order by the first reference that resolves to a known token.
 * Klarna swaps merchant_reference1/2 between exports (§3.4), so both are tried.
 */
export function lookupShopifyOrder(
  index: ShopifyIndex,
  ...refs: string[]
): ShopifyOrder | undefined {
  for (const ref of refs) {
    const token = extractSessionToken(ref);
    if (token === null) continue;
    const order = index.get(token);
    if (order !== undefined) return order;
  }
  return undefined;
}
