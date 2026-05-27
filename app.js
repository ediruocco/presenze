/* ===== STATE ===== */
const STORAGE_KEY = 'presenze_v1';

const TYPE_LABELS = {
  P:   '🏢 Presenza',
  SW:  '💻 Smart Working',
  Fp:  '🌴 Ferie Anno Prec.',
  Fc:  '🌴 Ferie Anno Corr.',
  M:   '🤒 Malattia',
  A41: '📋 Permesso personale',
  A44: '🩺 Visita medica',
  RC:  '🔄 Riposo Comp.',
  PB:  '🎉 Festività soppressa',
  PE:  '📝 Permesso esame',
  PL:  '♿ Permesso L.104',
  PS:  '🤝 Permesso sindacale',
  MP:  '🏠 Motivi personali',
};

const MONTH_NAMES = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
  'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
const DAY_NAMES = ['Domenica','Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato'];

/* EXCEL row index -> month (0-based), rows 8..19 in xlsx = months 0..11 */
const EXCEL_ROW_TO_MONTH = { 8:0, 9:1, 10:2, 11:3, 12:4, 13:5, 14:6, 15:7, 16:8, 17:9, 18:10, 19:11 };

/* Normalize raw Excel codes (case-insensitive) to internal TYPE_LABELS keys */
const EXCEL_CODE_MAP = {
  'P':   'P',
  'SW':  'SW',
  'FP':  'Fp',   // Ferie Anno Prec. (maiuscolo nel file)
  'Fp':  'Fp',
  'FC':  'Fc',   // Ferie Anno Corr.
  'Fc':  'Fc',
  'M':   'M',
  'RC':  'RC',
  'A41': 'A41',
  'A44': 'A44',
  'PB':  'PB',
  'PE':  'PE',
  'PL':  'PL',
  'PS':  'PS',
  'MP':  'MP',
};

let state = {
  people: [
    { id: 'p1', name: 'Di Ruocco Ernesto', matricola: '57006' },
    { id: 'p2', name: 'Persona 2', matricola: '' }
  ],
  entries: {},   // { "YYYY-MM-DD": { personId: typeCode, ... } }
  currentYear: new Date().getFullYear(),
  currentMonth: new Date().getMonth(),
  selectedDay: null,
  activeView: 'calendar',
  importedData: null,
};

/* ===== GITHUB GIST PERSISTENCE ===== */
// Settings stored in localStorage (only credentials, never data)
const SETTINGS_KEY = 'presenze_settings_v1';

function getSettings() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch(e) { return {}; }
}
function saveSettings(s) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

// Status indicator
function setSyncStatus(status, msg) {
  const el = document.getElementById('syncStatus');
  if (!el) return;
  const icons = { idle:'', saving:'⏳', ok:'✓', error:'⚠️', loading:'⏳' };
  el.textContent = (icons[status] || '') + ' ' + msg;
  el.className = 'sync-status sync-' + status;
}

// Serialize data payload
function buildPayload() {
  return JSON.stringify({ people: state.people, entries: state.entries }, null, 2);
}

// Save: Gist first, localStorage as fallback cache
async function save() {
  const s = getSettings();
  // Always keep a local cache
  localStorage.setItem(STORAGE_KEY, buildPayload());

  if (!s.token || !s.gistId) return; // no Gist configured

  setSyncStatus('saving', 'Salvataggio...');
  try {
    const res = await fetch(`https://api.github.com/gists/${s.gistId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `token ${s.token}`,
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28'
      },
      body: JSON.stringify({
        files: { 'presenze-data.json': { content: buildPayload() } }
      })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    setSyncStatus('ok', 'Salvato su Gist');
    setTimeout(() => setSyncStatus('idle', ''), 2500);
  } catch(e) {
    setSyncStatus('error', 'Errore Gist (locale OK)');
    console.warn('Gist save error', e);
  }
}

// Load: try Gist first, fallback to localStorage
async function load() {
  const s = getSettings();

  if (s.token && s.gistId) {
    setSyncStatus('loading', 'Caricamento...');
    try {
      const res = await fetch(`https://api.github.com/gists/${s.gistId}`, {
        headers: {
          'Authorization': `token ${s.token}`,
          'X-GitHub-Api-Version': '2022-11-28'
        }
      });
      if (res.ok) {
        const gist = await res.json();
        const file = gist.files['presenze-data.json'];
        if (file && file.content) {
          const { people, entries } = JSON.parse(file.content);
          if (people) state.people = people;
          if (entries) state.entries = entries;
          // update local cache
          localStorage.setItem(STORAGE_KEY, file.content);
          setSyncStatus('ok', 'Dati caricati da Gist');
          setTimeout(() => setSyncStatus('idle', ''), 2500);
          return;
        }
      }
    } catch(e) { console.warn('Gist load error', e); }
    setSyncStatus('error', 'Errore Gist – uso cache locale');
    setTimeout(() => setSyncStatus('idle', ''), 3000);
  }

  // Fallback: localStorage
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const { people, entries } = JSON.parse(raw);
    if (people) state.people = people;
    if (entries) state.entries = entries;
  } catch(e) { console.warn('Load error', e); }
}

// Create a new Gist and save gistId
async function createGist(token) {
  const res = await fetch('https://api.github.com/gists', {
    method: 'POST',
    headers: {
      'Authorization': `token ${token}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28'
    },
    body: JSON.stringify({
      description: 'Presenze App – dati',
      public: false,
      files: { 'presenze-data.json': { content: buildPayload() } }
    })
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const gist = await res.json();
  return gist.id;
}

/* ===== HELPERS ===== */
function dateKey(y, m, d) {
  return `${y}-${String(m + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}

function colorClass(idx) {
  return `color-${idx % 6}`;
}

function initials(name) {
  return name.split(' ').slice(0,2).map(w => w[0]).join('').toUpperCase();
}

/* ===== RENDER SIDEBAR PEOPLE ===== */
function renderPeople() {
  const list = document.getElementById('peopleList');
  list.innerHTML = state.people.map((p, i) => `
    <div class="person-item" data-id="${p.id}">
      <div class="person-avatar ${colorClass(i)}">${initials(p.name)}</div>
      <span class="person-name" title="${p.name}">${p.name}</span>
      <button class="person-delete" data-id="${p.id}" title="Rimuovi">✕</button>
    </div>
  `).join('');

  list.querySelectorAll('.person-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (state.people.length <= 1) { alert('Devi avere almeno una persona.'); return; }
      if (!confirm('Rimuovere questa persona e tutte le sue presenze?')) return;
      const id = btn.dataset.id;
      state.people = state.people.filter(p => p.id !== id);
      Object.keys(state.entries).forEach(dk => { delete state.entries[dk][id]; });
      save();
      renderPeople();
      renderCalendar();
    });
  });

  // update person selects
  updatePersonSelects();
}

function updatePersonSelects() {
  ['modalPerson','importPerson'].forEach(selId => {
    const sel = document.getElementById(selId);
    if (!sel) return;
    sel.innerHTML = state.people.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
  });
}

/* ===== RENDER CALENDAR ===== */
function renderCalendar() {
  const { currentYear: y, currentMonth: m } = state;
  updateTopbarTitle();
  const viewSubEl = document.getElementById('viewSub');
  if (viewSubEl && document.getElementById('view-calendar').classList.contains('active')) {
    viewSubEl.textContent = 'Clicca su un giorno per aggiungere o modificare una voce';
  }

  const daysInMonth = new Date(y, m + 1, 0).getDate();
  let firstDow = new Date(y, m, 1).getDay(); // 0=Sun
  firstDow = (firstDow + 6) % 7; // convert to Mon=0

  const today = new Date();
  const grid = document.getElementById('calGrid');
  let html = '';

  // empty cells
  for (let i = 0; i < firstDow; i++) {
    html += `<div class="cal-cell empty"></div>`;
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dow = (firstDow + d - 1) % 7; // 0=Mon
    const isWeekend = dow >= 5;
    const isToday = d === today.getDate() && m === today.getMonth() && y === today.getFullYear();
    const isSel = state.selectedDay && state.selectedDay.d === d;
    const dk = dateKey(y, m, d);

    let cls = 'cal-cell';
    if (isWeekend) cls += ' weekend-day';
    if (isToday) cls += ' today';
    if (isSel) cls += ' selected';

    // entry chips
    let chips = '';
    if (state.entries[dk]) {
      state.people.forEach((p, pi) => {
        const type = state.entries[dk][p.id];
        if (type) {
          chips += `<div class="entry-chip chip-${type}" style="border-left-color:var(--${personColor(pi)})">${initials(p.name)}: ${TYPE_LABELS[type] ? TYPE_LABELS[type].split(' ').slice(1).join(' ') : type}</div>`;
        }
      });
    }

    html += `<div class="${cls}" data-d="${d}">
      <div class="day-num">${d}</div>
      <div class="day-entries">${chips}</div>
    </div>`;
  }

  grid.innerHTML = html;

  grid.querySelectorAll('.cal-cell:not(.empty)').forEach(cell => {
    cell.addEventListener('click', () => {
      state.selectedDay = { y, m, d: parseInt(cell.dataset.d) };
      openDayModal();
      renderCalendar();
    });
  });
}

function personColor(idx) {
  const colors = ['accent','blue','purple','amber','red'];
  return colors[idx % colors.length];
}

/* ===== DAY MODAL ===== */
function openDayModal() {
  const { y, m, d } = state.selectedDay;
  const dk = dateKey(y, m, d);
  const date = new Date(y, m, d);
  document.getElementById('modalDate').textContent =
    `${DAY_NAMES[date.getDay()]} ${d} ${MONTH_NAMES[m]} ${y}`;

  renderModalEntries(dk);
  document.getElementById('modalOverlay').classList.add('open');
}

function renderModalEntries(dk) {
  const container = document.getElementById('modalEntries');
  const dayData = state.entries[dk] || {};

  const filled = state.people.filter(p => dayData[p.id]);

  if (filled.length === 0) {
    container.innerHTML = `<div class="modal-empty">Nessuna voce per questo giorno.</div>`;
    return;
  }

  container.innerHTML = filled.map((p, _) => {
    const pi = state.people.indexOf(p);
    const type = dayData[p.id];
    return `<div class="modal-entry">
      <div class="modal-entry-info">
        <div class="person-avatar ${colorClass(pi)}" style="width:28px;height:28px;font-size:11px">${initials(p.name)}</div>
        <span style="font-weight:500">${p.name}</span>
        <span class="entry-chip chip-${type}" style="margin-left:4px">${TYPE_LABELS[type] || type}</span>
      </div>
      <button class="modal-entry-delete" data-person="${p.id}" data-dk="${dk}">Rimuovi</button>
    </div>`;
  }).join('');

  container.querySelectorAll('.modal-entry-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      const { person, dk: key } = btn.dataset;
      if (state.entries[key]) delete state.entries[key][person];
      save();
      renderModalEntries(key);
      renderCalendar();
    });
  });
}

/* ===== ADD ENTRY ===== */
document.getElementById('addEntryBtn').addEventListener('click', () => {
  if (!state.selectedDay) return;
  const { y, m, d } = state.selectedDay;
  const dk = dateKey(y, m, d);
  const personId = document.getElementById('modalPerson').value;
  const type = document.getElementById('modalType').value;

  if (!state.entries[dk]) state.entries[dk] = {};
  state.entries[dk][personId] = type;
  save();
  renderModalEntries(dk);
  renderCalendar();
});

/* ===== MODAL CLOSE ===== */
document.getElementById('modalClose').addEventListener('click', closeAllModals);
document.getElementById('modalOverlay').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeAllModals();
});

/* ===== MONTH NAV ===== */
document.getElementById('prevMonth').addEventListener('click', () => {
  state.currentMonth--;
  if (state.currentMonth < 0) { state.currentMonth = 11; state.currentYear--; }
  state.selectedDay = null;
  renderCalendar();
});

document.getElementById('nextMonth').addEventListener('click', () => {
  state.currentMonth++;
  if (state.currentMonth > 11) { state.currentMonth = 0; state.currentYear++; }
  state.selectedDay = null;
  renderCalendar();
});

document.getElementById('todayBtn').addEventListener('click', () => {
  const t = new Date();
  state.currentYear = t.getFullYear();
  state.currentMonth = t.getMonth();
  state.selectedDay = null;
  renderCalendar();
});

/* ===== SIDEBAR OPEN/CLOSE (mobile) ===== */
function openSidebar() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sidebarOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('open');
  document.body.style.overflow = '';
}

document.getElementById('menuBtn').addEventListener('click', openSidebar);
document.getElementById('sidebarClose').addEventListener('click', closeSidebar);
document.getElementById('sidebarOverlay').addEventListener('click', closeSidebar);

/* ===== NAV BUTTONS ===== */
function switchView(view) {
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll(`.nav-btn[data-view="${view}"]`).forEach(b => b.classList.add('active'));
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(`view-${view}`).classList.add('active');

  // Show/hide topbar nav (only relevant on calendar)
  const calNav = document.getElementById('calendarNav');
  if (calNav) calNav.classList.toggle('hidden', view !== 'calendar');

  // Update topbar title for stats view
  const monthTitle = document.getElementById('monthTitle');
  const viewSub = document.getElementById('viewSub');
  if (view === 'stats') {
    if (monthTitle) monthTitle.textContent = 'Riepilogo';
    if (viewSub) viewSub.textContent = 'Totali per anno e persona';
    renderStats();
  } else {
    updateTopbarTitle();
  }

  closeSidebar();
}

document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => switchView(btn.dataset.view));
});

function updateTopbarTitle() {
  const { currentYear: y, currentMonth: m } = state;
  const el = document.getElementById('monthTitle');
  if (el) el.textContent = `${MONTH_NAMES[m]} ${y}`;
}

/* ===== STATS ===== */
function renderStats() {
  const selYear = parseInt(document.getElementById('statsYearSelect').value) || state.currentYear;
  document.getElementById('statsYear').textContent = `Anno ${selYear}`;

  const content = document.getElementById('statsContent');

  content.innerHTML = state.people.map((p, pi) => {
    const monthly = MONTH_NAMES.map((mName, mi) => {
      const counts = {};
      const days = new Date(selYear, mi + 1, 0).getDate();
      for (let d = 1; d <= days; d++) {
        const dk = dateKey(selYear, mi, d);
        if (state.entries[dk] && state.entries[dk][p.id]) {
          const t = state.entries[dk][p.id];
          counts[t] = (counts[t] || 0) + 1;
        }
      }
      return { mName, counts };
    });

    const totals = {};
    monthly.forEach(({ counts }) => {
      Object.entries(counts).forEach(([k, v]) => { totals[k] = (totals[k] || 0) + v; });
    });

    const statCards = [
      { key: 'P', label: 'Presenze' },
      { key: 'SW', label: 'Smart W.' },
      { key: 'Fp', label: 'Ferie Prec.' },
      { key: 'Fc', label: 'Ferie Corr.' },
      { key: 'M', label: 'Malattia' },
    ].map(({ key, label }) => `
      <div class="stat-item">
        <div class="stat-num">${totals[key] || 0}</div>
        <div class="stat-lbl">${label}</div>
      </div>`).join('');

    const tableRows = monthly.map(({ mName, counts }) => {
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      return `<tr>
        <td>${mName}</td>
        <td>${counts.P || 0}</td>
        <td>${counts.SW || 0}</td>
        <td>${(counts.Fp || 0) + (counts.Fc || 0)}</td>
        <td>${counts.M || 0}</td>
        <td>${(counts.A41||0)+(counts.A44||0)+(counts.RC||0)+(counts.PE||0)+(counts.PL||0)+(counts.PS||0)+(counts.MP||0)+(counts.PB||0)}</td>
        <td style="font-weight:500">${total}</td>
      </tr>`;
    }).join('');

    return `
      <div class="stats-person-block">
        <div class="stats-person-header">
          <div class="person-avatar ${colorClass(pi)}">${initials(p.name)}</div>
          <div>
            <h3>${p.name}</h3>
            ${p.matricola ? `<div class="stats-matricola">Matricola: ${p.matricola}</div>` : ''}
          </div>
        </div>
        <div class="stats-totals">${statCards}</div>
        <div class="stats-table-wrap">
          <table class="stats-table">
            <thead><tr>
              <th>Mese</th><th>Presenza</th><th>Smart W.</th><th>Ferie</th>
              <th>Malattia</th><th>Permessi/Altro</th><th>Totale</th>
            </tr></thead>
            <tbody>${tableRows}</tbody>
          </table>
        </div>
      </div>`;
  }).join('');
}

function populateYearSelect() {
  const sel = document.getElementById('statsYearSelect');
  const years = new Set();
  years.add(new Date().getFullYear());
  Object.keys(state.entries).forEach(dk => years.add(parseInt(dk.split('-')[0])));
  const sorted = [...years].sort((a, b) => b - a);
  sel.innerHTML = sorted.map(y => `<option value="${y}">${y}</option>`).join('');
  sel.value = state.currentYear;
  sel.addEventListener('change', renderStats);
}

/* ===== ADD PERSON ===== */
document.getElementById('addPersonBtn').addEventListener('click', () => {
  document.getElementById('newPersonName').value = '';
  document.getElementById('newPersonMatricola').value = '';
  document.getElementById('addPersonOverlay').classList.add('open');
});

document.getElementById('confirmAddPerson').addEventListener('click', () => {
  const name = document.getElementById('newPersonName').value.trim();
  if (!name) { alert('Inserisci un nome.'); return; }
  const matricola = document.getElementById('newPersonMatricola').value.trim();
  state.people.push({ id: 'p' + Date.now(), name, matricola });
  save();
  renderPeople();
  renderCalendar();
  closeAllModals();
});

document.getElementById('cancelAddPerson').addEventListener('click', closeAllModals);
document.getElementById('addPersonClose').addEventListener('click', closeAllModals);
document.getElementById('addPersonOverlay').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeAllModals();
});

/* ===== EXPORT ===== */
document.getElementById('exportBtn').addEventListener('click', () => {
  const data = { people: state.people, entries: state.entries, exportedAt: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `presenze_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

/* ===== CLEAR ===== */
document.getElementById('clearBtn').addEventListener('click', () => {
  if (!confirm('Cancellare tutti i dati di presenza? Le persone rimarranno.')) return;
  state.entries = {};
  save();
  renderCalendar();
});

/* ===== IMPORT EXCEL ===== */
document.getElementById('importBtn').addEventListener('click', () => {
  document.getElementById('importStatus').textContent = '';
  document.getElementById('importStatus').className = 'import-status';
  document.getElementById('importPreview').style.display = 'none';
  document.getElementById('importActions').style.display = 'none';
  state.importedData = null;
  document.getElementById('importOverlay').classList.add('open');
});

document.getElementById('importClose').addEventListener('click', closeAllModals);
document.getElementById('importOverlay').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeAllModals();
});

// File input via label
document.getElementById('fileInput').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) handleExcelFile(file);
});

// Drag & drop
const dropZone = document.getElementById('dropZone');
dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) handleExcelFile(file);
});

function handleExcelFile(file) {
  const status = document.getElementById('importStatus');
  const preview = document.getElementById('importPreview');
  status.className = 'import-status';
  status.textContent = 'Lettura file in corso...';

  const reader = new FileReader();
  reader.onload = (evt) => {
    try {
      const workbook = XLSX.read(evt.target.result, { type: 'array' });
      const sheetName = workbook.SheetNames.find(s =>
        s.toLowerCase().includes('pres') || s.toLowerCase().includes('foglio')
      ) || workbook.SheetNames[0];

      const ws = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

      // Extract metadata from rows 0-1
      let employeeName = null, year = null, matricola = null;
      if (data[0]) {
        const row0 = data[0];
        const annIdx = row0.findIndex(c => c && String(c).toLowerCase() === 'anno');
        if (annIdx >= 0) year = data[1] && data[1][annIdx] ? parseInt(data[1][annIdx]) : null;
        const matIdx = row0.findIndex(c => c && String(c).toLowerCase() === 'matricola');
        if (matIdx >= 0) matricola = data[1] && data[1][matIdx] ? String(data[1][matIdx]) : null;
      }
      if (data[1]) {
        const row1 = data[1];
        const cogIdx = row1.findIndex(c => c && String(c).includes('DI RUOCCO'));
        if (cogIdx < 0) {
          // find non-null, non-numeric, after matricola
          for (let i = 0; i < row1.length; i++) {
            const v = row1[i];
            if (v && typeof v === 'string' && v.trim().length > 3 && isNaN(v.trim())) {
              if (v.trim().toLowerCase() !== 'anno' && v.trim().toLowerCase() !== 'matricola') {
                employeeName = v.trim();
                break;
              }
            }
          }
        } else {
          employeeName = row1[cogIdx];
        }
        // Fallback: look in cognome column area (col ~11)
        if (!employeeName) {
          for (let c = 8; c < 16; c++) {
            const v = row1[c];
            if (v && typeof v === 'string' && v.trim().length > 2) {
              employeeName = v.trim();
              break;
            }
          }
        }
      }

      if (!year) year = new Date().getFullYear();

      // Parse monthly rows (rows 8..19 = months 0..11)
      // Columns 3..33 represent days 1..31 (pairs: col 3=day1, col 4=day1val, col5=day2, etc.)
      // Actually structure: col index 3 = day 1 value, col 4 = day 2, etc. (days fill cols 3-33)
      const importedEntries = {};

      for (let rowIdx = 8; rowIdx <= 19; rowIdx++) {
        const row = data[rowIdx];
        if (!row) continue;
        const monthIdx = rowIdx - 8; // 0=Jan, 4=May

        // Row 7 has the day numbers: cols 3..33 -> days 1..31
        const headerRow = data[7];
        for (let colIdx = 3; colIdx < row.length; colIdx++) {
          const dayNum = headerRow && headerRow[colIdx] ? parseInt(headerRow[colIdx]) : null;
          if (!dayNum || dayNum < 1 || dayNum > 31) continue;

          const val = row[colIdx];
          if (!val) continue;

          const rawCode = String(val).trim().toUpperCase();
          const code = EXCEL_CODE_MAP[String(val).trim()] || EXCEL_CODE_MAP[rawCode] || null;
          if (!code || !TYPE_LABELS[code]) continue; // skip unknowns

          const dk = dateKey(year, monthIdx, dayNum);
          if (!importedEntries[dk]) importedEntries[dk] = {};
          importedEntries[dk]['__import__'] = code;
        }
      }

      const count = Object.keys(importedEntries).length;

      state.importedData = { entries: importedEntries, year, employeeName, matricola };

      status.className = 'import-status success';
      status.textContent = `✓ File letto: ${count} giorni con presenze trovati per ${employeeName || 'dipendente sconosciuto'} (${year}).`;

      preview.style.display = 'block';
      preview.textContent = `Foglio: ${sheetName} | Anno: ${year} | Matricola: ${matricola || '—'} | Dipendente: ${employeeName || '—'} | Voci: ${count}`;

      // Pre-fill import person select
      updatePersonSelects();
      // Try to auto-match by name or matricola
      const autoMatch = state.people.findIndex(p =>
        (matricola && p.matricola === matricola) ||
        (employeeName && p.name.toUpperCase().includes(employeeName.split(' ')[0].toUpperCase()))
      );
      if (autoMatch >= 0) {
        document.getElementById('importPerson').value = state.people[autoMatch].id;
      }

      document.getElementById('importActions').style.display = 'block';

    } catch (err) {
      status.className = 'import-status error';
      status.textContent = `Errore nella lettura del file: ${err.message}`;
      console.error(err);
    }
  };
  reader.readAsArrayBuffer(file);
}

document.getElementById('confirmImportBtn').addEventListener('click', () => {
  if (!state.importedData) return;
  const personId = document.getElementById('importPerson').value;
  const { entries } = state.importedData;

  let count = 0;
  Object.entries(entries).forEach(([dk, val]) => {
    const code = val['__import__'];
    if (!state.entries[dk]) state.entries[dk] = {};
    state.entries[dk][personId] = code;
    count++;
  });

  save();
  populateYearSelect();
  renderCalendar();
  closeAllModals();

  // Navigate to the year/month with most imported entries
  if (state.importedData.year) {
    state.currentYear = state.importedData.year;
    const monthCounts = {};
    Object.keys(state.importedData.entries).forEach(dk => {
      const m = parseInt(dk.split('-')[1]) - 1;
      monthCounts[m] = (monthCounts[m] || 0) + 1;
    });
    const topMonth = Object.entries(monthCounts).sort((a,b) => b[1]-a[1])[0];
    if (topMonth) state.currentMonth = parseInt(topMonth[0]);
    renderCalendar();
  }

  alert(`✓ Importate ${count} voci per ${state.people.find(p => p.id === personId)?.name}.`);
});

/* ===== CLOSE ALL MODALS ===== */
function closeAllModals() {
  document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('open'));
  state.selectedDay = null;
}

/* ===== GIST SETTINGS MODAL ===== */
function openGistSettings() {
  const s = getSettings();
  document.getElementById('gistToken').value = s.token || '';
  document.getElementById('gistId').value = s.gistId || '';
  document.getElementById('gistStatusMsg').textContent = '';
  document.getElementById('gistOverlay').classList.add('open');
}

document.getElementById('gistSettingsBtn')?.addEventListener('click', openGistSettings);


document.getElementById('gistClose')?.addEventListener('click', closeAllModals);
document.getElementById('gistOverlay')?.addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeAllModals();
});

document.getElementById('gistSaveBtn')?.addEventListener('click', async () => {
  const token = document.getElementById('gistToken').value.trim();
  const existingId = document.getElementById('gistId').value.trim();
  const msg = document.getElementById('gistStatusMsg');

  if (!token) { msg.textContent = '⚠️ Inserisci il token.'; msg.style.color='var(--red)'; return; }

  msg.textContent = '⏳ Connessione a GitHub...';
  msg.style.color = 'var(--text-2)';

  try {
    let gistId = existingId;
    if (!gistId) {
      msg.textContent = '⏳ Creazione Gist...';
      gistId = await createGist(token);
      document.getElementById('gistId').value = gistId;
    } else {
      // verify gist is reachable
      const r = await fetch(`https://api.github.com/gists/${gistId}`, {
        headers: { 'Authorization': `token ${token}`, 'X-GitHub-Api-Version': '2022-11-28' }
      });
      if (!r.ok) throw new Error(`Gist non trovato (HTTP ${r.status})`);
    }
    saveSettings({ token, gistId });

    // If this is a new browser (no local data), pull from Gist
    // If local data exists, push it to Gist
    const localRaw = localStorage.getItem(STORAGE_KEY);
    const hasLocalData = localRaw && JSON.parse(localRaw).entries &&
      Object.keys(JSON.parse(localRaw).entries).length > 0;

    if (!hasLocalData && existingId) {
      // Pull: load data from existing Gist
      msg.textContent = '⏳ Caricamento dati dal Gist...';
      await load();
      renderPeople();
      renderCalendar();
      populateYearSelect();
      msg.textContent = `✓ Dati caricati! ${Object.keys(state.entries).length} giorni sincronizzati.`;
    } else {
      // Push: save current local data to Gist
      await save();
      msg.textContent = `✓ Connesso! Gist ID: ${gistId}`;
    }
    msg.style.color = 'var(--accent-dark)';
    renderSyncBadge();
    // show manual load button
    document.getElementById('gistLoadBtn').style.display = 'inline-flex';
  } catch(e) {
    msg.textContent = `⚠️ Errore: ${e.message}`;
    msg.style.color = 'var(--red)';
  }
});

document.getElementById('gistLoadBtn')?.addEventListener('click', async () => {
  const msg = document.getElementById('gistStatusMsg');
  msg.textContent = '⏳ Caricamento dal Gist...';
  msg.style.color = 'var(--text-2)';
  try {
    await load();
    renderPeople();
    renderCalendar();
    populateYearSelect();
    msg.textContent = `✓ Caricati ${Object.keys(state.entries).length} giorni dal Gist.`;
    msg.style.color = 'var(--accent-dark)';
  } catch(e) {
    msg.textContent = `⚠️ Errore: ${e.message}`;
    msg.style.color = 'var(--red)';
  }
});

document.getElementById('gistDisconnectBtn')?.addEventListener('click', () => {
  if (!confirm('Disconnettere il Gist? I dati locali restano salvati nel browser.')) return;
  saveSettings({});
  document.getElementById('gistToken').value = '';
  document.getElementById('gistId').value = '';
  document.getElementById('gistStatusMsg').textContent = '✓ Disconnesso.';
  renderSyncBadge();
});

function renderSyncBadge() {
  const s = getSettings();
  const badge = document.getElementById('syncBadge');
  const badgeMob = null; // removed in v1.2
  const connected = !!(s.token && s.gistId);
  [badge, badgeMob].forEach(el => {
    if (!el) return;
    el.textContent = connected ? '☁️ Gist' : '💾 Locale';
    el.title = connected ? `Gist: ${s.gistId}` : 'Nessun Gist configurato – dati solo nel browser';
    el.className = 'sync-badge ' + (connected ? 'sync-cloud' : 'sync-local');
  });
}

/* ===== INIT ===== */
(async () => {
  const s = getSettings();
  const hasCredentials = !!(s.token && s.gistId);

  // Show a loading screen while fetching from Gist
  if (hasCredentials) {
    document.getElementById('appLoadingOverlay').style.display = 'flex';
  }

  await load();

  document.getElementById('appLoadingOverlay').style.display = 'none';
  renderPeople();
  renderCalendar();
  populateYearSelect();
  renderSyncBadge();

  // New browser: no credentials saved → open Gist setup automatically
  if (!hasCredentials) {
    const neverAsked = !localStorage.getItem('presenze_onboarded');
    if (neverAsked) {
      setTimeout(() => {
        document.getElementById('gistOnboardingMsg').style.display = 'block';
        openGistSettings();
      }, 600);
    }
  }
  localStorage.setItem('presenze_onboarded', '1');
})();
