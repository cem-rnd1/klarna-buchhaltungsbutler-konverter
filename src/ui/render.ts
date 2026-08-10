// HTML-string view helpers. No state — pure functions from data to markup.

import { formatCentsEur } from '../core/money.ts';
import type { ConversionResult, OutputRow, Payout } from '../core/transform.ts';
import { formatCents } from '../core/money.ts';
import type { Issue } from '../core/validate.ts';
import { ui } from './strings.ts';

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const e = escapeHtml;

export function renderFileList(
  result: ConversionResult,
  fileIds: number[],
): string {
  return result.files
    .map((f, i) => {
      const issues = result.issues.filter((iss) => iss.fileName === f.file.fileName);
      const errors = issues.filter((iss) => iss.severity === 'error');
      const hasBlocking = issues.some((iss) => iss.severity === 'blocking');
      const status = errors.length > 0 ? 'error' : hasBlocking ? 'warn' : 'ok';
      const icon = status === 'error' ? '✗' : status === 'warn' ? '⚠' : '✓';
      const statusText =
        status === 'error' ? 'Fehler' : status === 'warn' ? 'Warnung' : 'OK';
      return `<li>
        <span class="file-status ${status}" title="${statusText}">${icon}</span>
        <span class="file-name">${e(f.file.fileName)}</span>
        <span class="file-meta">${e(ui.payoutCount(f.file.payouts.length))}</span>
        <button class="link" type="button" data-remove="${fileIds[i]}">${e(ui.removeFile)}</button>
        ${errors.map((err) => `<span class="file-error">${e(err.messageDe)}</span>`).join('')}
      </li>`;
    })
    .join('');
}

export function renderPayoutCards(payouts: Payout[]): string {
  return payouts
    .map((p) => {
      const balance =
        p.balanceCents === 0
          ? `<span class="balance-ok">${e(ui.balanceOk)}</span>`
          : `<span class="balance-fail">${e(ui.balanceFail(formatCentsEur(p.balanceCents)))}</span>`;
      const feeLabel = p.taxMerged ? ui.cardFeesWithTax : ui.cardFees;
      const feeCents = p.feeCents + p.taxCents;
      return `<div class="card">
        <h3>${e(ui.cardPayoutDate)} ${e(p.payoutDate)}</h3>
        <dl>
          <dt>${e(ui.cardReference)}</dt><dd>${e(p.paymentReference)}</dd>
          <dt>${e(ui.cardSettlement)}</dt><dd>${e(formatCentsEur(p.settlementCents))}</dd>
          <dt>${e(feeLabel)}</dt><dd>${e(formatCentsEur(feeCents))}</dd>
          <dt>${e(ui.cardCommission)}</dt><dd>${e(formatCentsEur(p.commissionCents))}</dd>
          <dt>${e(ui.cardTransactions)}</dt><dd>${p.transactionCount}</dd>
          <dt>${e(ui.cardBalance)}</dt><dd>${balance}</dd>
        </dl>
      </div>`;
    })
    .join('');
}

export function renderTaxNotice(payouts: Payout[]): string {
  const affected = payouts.filter((p) => p.taxMerged);
  if (affected.length === 0) return '';
  const refs = affected.map((p) => `„${p.paymentReference}“`).join(', ');
  return `<div class="notice tax">
    <h2>${e(ui.taxNoticeTitle)}</h2>
    <p>${e(ui.taxNotice(refs))}</p>
  </div>`;
}

export function renderIssuesPanel(issues: Issue[], overrideChecked: boolean): string {
  const bySeverity = (s: Issue['severity']) => issues.filter((i) => i.severity === s);
  const errors = bySeverity('error');
  const blocking = bySeverity('blocking');
  const infos = bySeverity('info');
  const list = (items: Issue[]) =>
    `<ul>${items.map((i) => `<li>${e(i.fileName ? `${i.fileName}: ` : '')}${e(i.messageDe)}</li>`).join('')}</ul>`;

  let html = '';
  if (errors.length > 0) {
    html += `<div class="notice error"><h2>${e(ui.errorsHeading)}</h2>${list(errors)}</div>`;
  }
  if (blocking.length > 0) {
    html += `<div class="notice blocking"><h2>${e(ui.warningsHeading)}</h2>${list(blocking)}
      <label class="override">
        <input type="checkbox" id="override-checkbox" ${overrideChecked ? 'checked' : ''} />
        ${e(ui.overrideLabel)}
      </label>
    </div>`;
  }
  if (infos.length > 0) {
    html += `<div class="notice info"><h2>${e(ui.infosHeading)}</h2>${list(infos)}</div>`;
  }
  return html;
}

const PREVIEW_CAP = 1000;

export function renderPreview(rows: OutputRow[]): string {
  const shown = rows.slice(0, PREVIEW_CAP);
  const header = ui.previewColumns.map((c) => `<th scope="col">${e(c)}</th>`).join('');
  const body = shown
    .map(
      (r) => `<tr>
        <td>${e(r.datum)}</td>
        <td>${e(r.auftragsart)}</td>
        <td>${e(r.zahlungsreferenz)}</td>
        <td>${e(r.buchungstext)}</td>
        <td>${e(r.empfaenger)}</td>
        <td class="num">${e(formatCents(r.betragCents))}</td>
        <td>${e(r.waehrung)}</td>
      </tr>`,
    )
    .join('');
  const more =
    rows.length > PREVIEW_CAP
      ? `<p class="preview-more">${e(ui.previewMore(rows.length - PREVIEW_CAP))}</p>`
      : '';
  return `<div class="preview-wrap">
    <table class="preview">
      <thead><tr>${header}</tr></thead>
      <tbody>${body}</tbody>
    </table>
    ${more}
  </div>`;
}
