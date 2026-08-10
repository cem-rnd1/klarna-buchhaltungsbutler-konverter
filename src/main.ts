// Wiring, state and top-level rendering.

import './style.css';
import { convertFiles, type ConversionResult } from './core/transform.ts';
import {
  renderFileList,
  renderIssuesPanel,
  renderPayoutCards,
  renderPreview,
  renderShopifyFileList,
  renderTaxNotice,
} from './ui/render.ts';
import { datenschutzHtml, helpHtml, impressumHtml, ui } from './ui/strings.ts';

const SOURCE_URL = 'https://github.com/cem-rnd1/klarna-buchhaltungsbutler-konverter';

interface StoredFile {
  id: number;
  fileName: string;
  bytes: Uint8Array;
}

let storedFiles: StoredFile[] = [];
let storedShopifyFiles: StoredFile[] = [];
let overrideChecked = false;
let importHintVisible = false;
let nextId = 1;

const app = document.getElementById('app')!;

app.innerHTML = `
  <header class="site">
    <div class="inner">
      <h1>${ui.appTitle}</h1>
      <p class="tagline">${ui.appTagline}</p>
      <p class="header-links">${ui.appUnofficial} · <a href="${SOURCE_URL}" rel="noopener">${ui.sourceLink}</a></p>
    </div>
  </header>
  <main id="view-main">
    <section>
      <label class="dropzone" id="dropzone">
        <strong>${ui.dropzoneTitle}</strong>
        <span>${ui.dropzoneHint}</span>
        <input type="file" id="file-input" multiple accept=".csv,text/csv" />
      </label>
    </section>
    <section id="sec-shopify">
      <label class="dropzone optional" id="shopify-dropzone">
        <strong>${ui.shopifyDropzoneTitle}</strong>
        <span>${ui.shopifyDropzoneHint}</span>
        <input type="file" id="shopify-file-input" multiple accept=".csv,text/csv" />
      </label>
      <p class="dropzone-help"><a href="#hilfe-shopify">${ui.shopifyDropzoneHelp}</a></p>
      <div id="sec-shopify-files" hidden>
        <h2>${ui.shopifyFilesHeading}</h2>
        <ul class="file-list" id="shopify-file-list"></ul>
      </div>
    </section>
    <section id="sec-files" hidden>
      <h2>${ui.filesHeading}</h2>
      <ul class="file-list" id="file-list"></ul>
    </section>
    <section id="sec-payouts" hidden>
      <h2>${ui.payoutsHeading}</h2>
      <div class="cards" id="payout-cards"></div>
    </section>
    <section id="sec-tax" hidden></section>
    <section id="sec-issues" hidden></section>
    <section id="sec-preview" hidden>
      <h2>${ui.previewHeading}</h2>
      <div id="preview"></div>
    </section>
    <section id="sec-actions" hidden>
      <div class="actions">
        <button class="primary" id="download-btn" type="button">${ui.downloadButton}</button>
        <button class="secondary" id="reset-btn" type="button">${ui.resetButton}</button>
      </div>
      <div class="notice info" id="import-hint" hidden>
        <h2>${ui.importHintTitle}</h2>
        ${helpHtml.importGuide}
      </div>
    </section>
    <section id="sec-help">
      <h2 id="hilfe">${ui.helpHeading}</h2>
      <div class="help">
        <details>
          <summary>Klarna-Bericht richtig konfigurieren</summary>
          ${helpHtml.klarnaConfig}
        </details>
        <details id="details-shopify">
          <summary>Shopify-Bestellexport (optional)</summary>
          ${helpHtml.shopifyExport}
        </details>
        <details>
          <summary>Import in BuchhaltungsButler</summary>
          <h3 id="hilfe-import">Import in BuchhaltungsButler</h3>
          ${helpHtml.importGuide}
        </details>
        <details>
          <summary>FAQ</summary>
          ${helpHtml.faq}
        </details>
      </div>
    </section>
  </main>
  <div class="page" id="view-impressum" hidden>
    ${impressumHtml}
    <p><a href="#">${ui.backToApp}</a></p>
  </div>
  <div class="page" id="view-datenschutz" hidden>
    ${datenschutzHtml}
    <p><a href="#">${ui.backToApp}</a></p>
  </div>
  <footer class="site">
    <div class="inner">
      <nav>
        <a href="#impressum">${ui.footerImpressum}</a>
        <a href="#datenschutz">${ui.footerDatenschutz}</a>
      </nav>
      <p>${ui.footerDisclaimer}</p>
    </div>
  </footer>
`;

const el = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const dropzone = el<HTMLLabelElement>('dropzone');
const fileInput = el<HTMLInputElement>('file-input');
const shopifyDropzone = el<HTMLLabelElement>('shopify-dropzone');
const shopifyFileInput = el<HTMLInputElement>('shopify-file-input');
const downloadBtn = el<HTMLButtonElement>('download-btn');

const payload = (f: StoredFile) => ({ fileName: f.fileName, bytes: f.bytes });

function currentResult(): ConversionResult {
  return convertFiles(storedFiles.map(payload), storedShopifyFiles.map(payload));
}

function render(): void {
  const result = currentResult();
  const hasFiles = storedFiles.length > 0;
  const hasPayouts = result.payouts.length > 0;
  const blocking = result.issues.filter((i) => i.severity === 'blocking');

  el('sec-files').hidden = !hasFiles;
  el('file-list').innerHTML = renderFileList(result, storedFiles.map((f) => f.id));

  el('sec-shopify-files').hidden = storedShopifyFiles.length === 0;
  el('shopify-file-list').innerHTML = renderShopifyFileList(
    result.shopifyFiles,
    storedShopifyFiles.map((f) => f.id),
  );

  el('sec-payouts').hidden = !hasPayouts;
  el('payout-cards').innerHTML = renderPayoutCards(result.payouts);

  const taxHtml = renderTaxNotice(result.payouts);
  el('sec-tax').hidden = taxHtml === '';
  el('sec-tax').innerHTML = taxHtml;

  const issuesHtml = renderIssuesPanel(result.issues, overrideChecked);
  el('sec-issues').hidden = issuesHtml === '';
  el('sec-issues').innerHTML = issuesHtml;

  el('sec-preview').hidden = !hasPayouts;
  el('preview').innerHTML = renderPreview(result.payouts.flatMap((p) => p.outputRows));

  el('sec-actions').hidden = !hasFiles;
  downloadBtn.disabled = !hasPayouts || (blocking.length > 0 && !overrideChecked);
  el('import-hint').hidden = !importHintVisible;
}

async function addFiles(list: FileList | File[], target: StoredFile[]): Promise<void> {
  for (const file of Array.from(list)) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    target.push({ id: nextId++, fileName: file.name, bytes });
  }
  overrideChecked = false;
  render();
}

// --- Dropzone events -------------------------------------------------------

function wireDropzone(zone: HTMLLabelElement, input: HTMLInputElement, target: () => StoredFile[]) {
  input.addEventListener('change', () => {
    if (input.files) void addFiles(input.files, target());
    input.value = '';
  });
  zone.addEventListener('dragover', (ev) => {
    ev.preventDefault();
    zone.classList.add('dragover');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', (ev) => {
    ev.preventDefault();
    zone.classList.remove('dragover');
    if (ev.dataTransfer?.files) void addFiles(ev.dataTransfer.files, target());
  });
}

wireDropzone(dropzone, fileInput, () => storedFiles);
wireDropzone(shopifyDropzone, shopifyFileInput, () => storedShopifyFiles);

// --- File list / issues / actions ------------------------------------------

el('file-list').addEventListener('click', (ev) => {
  const btn = (ev.target as HTMLElement).closest<HTMLButtonElement>('button[data-remove]');
  if (!btn) return;
  const id = Number(btn.dataset.remove);
  storedFiles = storedFiles.filter((f) => f.id !== id);
  overrideChecked = false;
  render();
});

el('shopify-file-list').addEventListener('click', (ev) => {
  const btn = (ev.target as HTMLElement).closest<HTMLButtonElement>('button[data-remove-shopify]');
  if (!btn) return;
  const id = Number(btn.dataset.removeShopify);
  storedShopifyFiles = storedShopifyFiles.filter((f) => f.id !== id);
  overrideChecked = false;
  render();
});

el('sec-issues').addEventListener('change', (ev) => {
  const box = ev.target as HTMLInputElement;
  if (box.id === 'override-checkbox') {
    overrideChecked = box.checked;
    render();
  }
});

downloadBtn.addEventListener('click', () => {
  const result = currentResult();
  if (result.payouts.length === 0) return;
  const blob = new Blob([result.csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = result.filename;
  a.click();
  URL.revokeObjectURL(url);
  importHintVisible = true;
  render();
});

el('reset-btn').addEventListener('click', () => {
  storedFiles = [];
  storedShopifyFiles = [];
  overrideChecked = false;
  importHintVisible = false;
  fileInput.value = '';
  shopifyFileInput.value = '';
  render();
});

// --- Simple hash routing for Impressum / Datenschutz ------------------------

/** Help anchors sit inside collapsed <details> — open them on the way there. */
function revealAnchor(hash: string): void {
  const target = hash.length > 1 ? document.getElementById(hash.slice(1)) : null;
  if (!target) return;
  let details = target.closest('details');
  while (details) {
    details.open = true;
    details = details.parentElement?.closest('details') ?? null;
  }
  target.scrollIntoView();
}

function route(): void {
  const hash = location.hash;
  const impressum = hash === '#impressum';
  const datenschutz = hash === '#datenschutz';
  el('view-main').hidden = impressum || datenschutz;
  el('view-impressum').hidden = !impressum;
  el('view-datenschutz').hidden = !datenschutz;
  if (impressum || datenschutz) window.scrollTo(0, 0);
  else revealAnchor(hash);
}

window.addEventListener('hashchange', route);
route();
render();
