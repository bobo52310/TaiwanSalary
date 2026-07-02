/*
 * Progressive enhancement for the homepage salary table: search, filter, sort, and
 * shareable URL state. Dependency-free. The table is fully server-rendered in the
 * default median-desc order, so with JS disabled it still shows every row — this
 * script only adds interactivity on top.
 */

type Dir = 'asc' | 'desc';

interface RowVM {
  el: HTMLTableRowElement;
  code: string;
  name: string;
  codeLC: string;
  nameLC: string;
  industry: string;
  market: string;
}

interface State {
  q: string;
  ind: string;
  mkt: string; // 'all' | 'sii' | 'otc'
  sort: string;
  dir: Dir;
}

const DEFAULT_SORT = 'median';
const DEFAULT_DIR: Dir = 'desc';

/** Lowercase + NFKC so a full-width "２３３０" or "ＴＳＭＣ" matches its half-width form. */
function normalize(s: string): string {
  return s.normalize('NFKC').toLowerCase();
}

function debounce(fn: () => void, ms: number): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(fn, ms);
  };
}

function init(): void {
  const table = document.querySelector<HTMLTableElement>('[data-salary-table]');
  const tbodyEl = table?.tBodies[0];
  if (!table || !tbodyEl) return;
  // Re-bind with a definite type so the narrowing survives into the nested closures below.
  const tbody: HTMLTableSectionElement = tbodyEl;

  const headEls = table.tHead ? Array.from(table.tHead.rows[0]?.cells ?? []) : [];
  const colKeys = headEls.map((th) => th.dataset.key ?? '');
  const colTypes = headEls.map((th) => th.dataset.type ?? 'str');

  // Only the homepage table leads with a 排名 (positional index) column; other tables
  // that share [data-salary-table] (e.g. the company history table) start with real
  // data in cell 0, so they must never be renumbered.
  const hasRankCol = headEls[0]?.classList.contains('c-rank') ?? false;

  const bodyRows = Array.from(tbody.rows);
  const emptyRow = bodyRows.find((r) => r.hasAttribute('data-empty')) ?? null;
  const rows: RowVM[] = bodyRows
    .filter((r) => r !== emptyRow)
    .map((el) => ({
      el,
      code: el.dataset.c ?? '',
      name: el.dataset.n ?? '',
      codeLC: normalize(el.dataset.c ?? ''),
      nameLC: normalize(el.dataset.n ?? ''),
      industry: el.dataset.i ?? '',
      market: el.dataset.m ?? '',
    }));

  const searchEl = document.querySelector<HTMLInputElement>('#q');
  const indSel = document.querySelector<HTMLSelectElement>('#ind');
  const mktInputs = Array.from(
    document.querySelectorAll<HTMLInputElement>('input[name="mkt"]'),
  );
  const countEl = document.querySelector<HTMLElement>('[data-count]');

  const state: State = { q: '', ind: '', mkt: 'all', sort: DEFAULT_SORT, dir: DEFAULT_DIR };

  function numAt(el: HTMLTableRowElement, idx: number): number | null {
    const raw = el.cells[idx]?.dataset.s;
    if (raw === undefined || raw === '') return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  function strKey(r: RowVM, key: string): string {
    switch (key) {
      case 'code':
        return r.code;
      case 'name':
        return r.name;
      case 'industry':
        return r.industry;
      case 'market':
        return r.market;
      default:
        return '';
    }
  }

  // The first cell of every row is the 排名 column: a positional index, not data.
  // After any sort or filter it must reflect the row's live position, so we walk the
  // tbody in DOM order and renumber the visible rows 1..N. (Server-rendered 1..N in
  // median-desc order is the no-JS fallback.)
  function renumber(): void {
    if (!hasRankCol) return;
    let n = 0;
    for (const tr of Array.from(tbody.rows)) {
      if (tr === emptyRow || tr.hidden) continue;
      const cell = tr.cells[0];
      if (cell) cell.textContent = String(++n);
    }
  }

  function applyFilter(): void {
    const q = normalize(state.q.trim());
    let shown = 0;
    for (const r of rows) {
      const okQ = q === '' || r.codeLC.startsWith(q) || r.nameLC.includes(q);
      const okInd = state.ind === '' || r.industry === state.ind;
      const okMkt = state.mkt === 'all' || r.market === state.mkt;
      const show = okQ && okInd && okMkt;
      r.el.hidden = !show;
      if (show) shown++;
    }
    if (countEl) countEl.textContent = shown.toLocaleString('en-US');
    if (emptyRow) emptyRow.hidden = shown !== 0;
    renumber();
  }

  function setAria(): void {
    headEls.forEach((th, i) => {
      // The 排名 header carries no data-key and isn't sortable — leave it untouched.
      if (!colKeys[i]) return;
      th.setAttribute(
        'aria-sort',
        colKeys[i] !== state.sort ? 'none' : state.dir === 'asc' ? 'ascending' : 'descending',
      );
    });
  }

  function applySort(): void {
    const idx = colKeys.indexOf(state.sort);
    if (idx < 0) return;
    const isNum = (colTypes[idx] ?? 'str') === 'num';
    const key = colKeys[idx] ?? '';
    const dir = state.dir;
    const sorted = rows.slice().sort((a, b) => {
      if (isNum) {
        const av = numAt(a.el, idx);
        const bv = numAt(b.el, idx);
        if (av === null) return bv === null ? 0 : 1; // nulls always last…
        if (bv === null) return -1; // …regardless of direction
        return dir === 'asc' ? av - bv : bv - av;
      }
      const c = strKey(a, key).localeCompare(strKey(b, key), 'zh-Hant');
      return dir === 'asc' ? c : -c;
    });
    const frag = document.createDocumentFragment();
    for (const r of sorted) frag.appendChild(r.el);
    tbody.appendChild(frag);
    if (emptyRow) tbody.appendChild(emptyRow); // keep the empty-state row last
    setAria();
    renumber();
  }

  function syncURL(): void {
    const p = new URLSearchParams();
    const q = state.q.trim();
    if (q) p.set('q', q);
    if (state.ind) p.set('ind', state.ind);
    if (state.mkt !== 'all') p.set('mkt', state.mkt);
    if (!(state.sort === DEFAULT_SORT && state.dir === DEFAULT_DIR)) {
      p.set('sort', state.sort);
      p.set('dir', state.dir);
    }
    const qs = p.toString();
    history.replaceState(null, '', qs ? `${location.pathname}?${qs}` : location.pathname);
  }

  function readURL(): void {
    const p = new URLSearchParams(location.search);
    state.q = p.get('q') ?? '';
    state.ind = p.get('ind') ?? '';
    const mkt = p.get('mkt');
    state.mkt = mkt === 'sii' || mkt === 'otc' ? mkt : 'all';
    const sort = p.get('sort');
    if (sort && colKeys.includes(sort)) {
      state.sort = sort;
      state.dir = p.get('dir') === 'asc' ? 'asc' : 'desc';
    } else {
      state.sort = DEFAULT_SORT;
      state.dir = DEFAULT_DIR;
    }
    if (searchEl) searchEl.value = state.q;
    if (indSel) indSel.value = state.ind;
    for (const i of mktInputs) i.checked = i.value === state.mkt;
  }

  function defaultDir(key: string): Dir {
    const idx = colKeys.indexOf(key);
    return (colTypes[idx] ?? 'str') === 'num' ? 'desc' : 'asc';
  }

  function onSort(key: string): void {
    if (!colKeys.includes(key)) return;
    if (state.sort === key) {
      state.dir = state.dir === 'asc' ? 'desc' : 'asc';
    } else {
      state.sort = key;
      state.dir = defaultDir(key);
    }
    applySort();
    syncURL();
  }

  if (searchEl) {
    searchEl.addEventListener(
      'input',
      debounce(() => {
        state.q = searchEl.value;
        applyFilter();
        syncURL();
      }, 100),
    );
  }
  if (indSel) {
    indSel.addEventListener('change', () => {
      state.ind = indSel.value;
      applyFilter();
      syncURL();
    });
  }
  for (const i of mktInputs) {
    i.addEventListener('change', () => {
      if (!i.checked) return;
      state.mkt = i.value;
      applyFilter();
      syncURL();
    });
  }
  for (const th of headEls) {
    const key = th.dataset.key ?? '';
    if (!key) continue;
    th.addEventListener('click', () => onSort(key));
    th.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onSort(key);
      }
    });
  }

  readURL();
  applyFilter();
  applySort();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
