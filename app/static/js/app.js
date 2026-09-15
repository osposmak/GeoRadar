// GeoRadar CRM - Main Frontend Application Logic v1.2
let currentTab = 'radar';
let soundEnabled = true;
let filterTimeout = null;
let charts = {};

// Mascot dialogue phrases for interactive click
const MASCOT_QUOTES = [
  "Не забывай проверять связку перед запуском парсера! 🐾",
  "В 2ГИС и Яндекс Картах базы обновляются регулярно — держим руку на пульсе! ⚡",
  "Если ниша парсилась больше 60 дней назад, пора обновить контакты! 🕒",
  "Я на страже базы: ни один дубликат не проскочит! 📢",
  "Хороший парсинг — это чистая база без повторов! 🚀",
  "Загляни во вкладку «Аналитика», там собрана вся статистика по городам!"
];

// Web Audio API for lightweight sound effects
const audioCtx = (window.AudioContext || window.webkitAudioContext) ? new (window.AudioContext || window.webkitAudioContext)() : null;

function playTone(freq, type = 'sine', duration = 0.15, delay = 0) {
  if (!soundEnabled || !audioCtx) return;
  try {
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime + delay);
    gain.gain.setValueAtTime(0.12, audioCtx.currentTime + delay);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + delay + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(audioCtx.currentTime + delay);
    osc.stop(audioCtx.currentTime + delay + duration);
  } catch (e) {
    console.warn("Audio playback error:", e);
  }
}

function playSound(name) {
  if (!soundEnabled) return;
  if (name === 'safe') {
    // Joyful major chord
    playTone(523.25, 'triangle', 0.12, 0);       // C5
    playTone(659.25, 'triangle', 0.12, 0.08);    // E5
    playTone(783.99, 'triangle', 0.25, 0.16);    // G5
  } else if (name === 'danger') {
    // Alert chime
    playTone(392.00, 'sawtooth', 0.15, 0);       // G4
    playTone(311.13, 'sawtooth', 0.25, 0.12);    // Eb4
  } else if (name === 'pop') {
    playTone(600, 'sine', 0.08, 0);
  }
}

function toggleSound() {
  soundEnabled = !soundEnabled;
  const icon = document.getElementById('sound-icon');
  if (soundEnabled) {
    icon.setAttribute('data-lucide', 'volume-2');
    showToast('Звуковые уведомления маскота включены', 'info');
    playSound('pop');
  } else {
    icon.setAttribute('data-lucide', 'volume-x');
    showToast('Звук выключен', 'info');
  }
  lucide.createIcons();
}

// Poke the mascot easter egg
function pokeMascot() {
  const img = document.getElementById('mascot-dynamic-img');
  img.classList.remove('mascot-floating');
  img.classList.add('mascot-bouncing');
  setTimeout(() => {
    img.classList.remove('mascot-bouncing');
    img.classList.add('mascot-floating');
  }, 900);

  const randomQuote = MASCOT_QUOTES[Math.floor(Math.random() * MASCOT_QUOTES.length)];
  document.getElementById('mascot-speech-text').innerHTML = `<b>Радарчик:</b> ${randomQuote}`;
  playSound('pop');
}

// Tab Switching
function switchTab(tab) {
  currentTab = tab;
  const tabs = ['radar', 'journal', 'analytics', 'offers', 'about'];

  tabs.forEach(t => {
    const el = document.getElementById(`tab-${t}`);
    const btn = document.getElementById(`tab-${t}-btn`);
    if (el) el.classList.toggle('hidden', t !== tab);
    if (btn) {
      if (t === tab) {
        btn.className = 'tab-btn px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 bg-white text-brand-deep shadow-xs';
      } else {
        btn.className = 'tab-btn px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 text-slate-600 hover:text-slate-900';
      }
    }
  });

  if (tab === 'journal') {
    loadJournalData();
  } else if (tab === 'analytics') {
    loadAnalytics();
  } else if (tab === 'radar') {
    loadStatsSummary();
  } else if (tab === 'offers') {
    initOffersTab();
  }

  lucide.createIcons();
}

// Autocomplete meta data
async function loadAutocompleteMeta() {
  try {
    const res = await fetch('/api/parses/meta/autocomplete');
    if (!res.ok) return;
    const data = await res.json();
    
    const cityList = document.getElementById('cities-datalist');
    const nicheList = document.getElementById('niches-datalist');
    
    if (cityList) {
      cityList.innerHTML = data.cities.map(c => `<option value="${c}"></option>`).join('');
    }
    if (nicheList) {
      nicheList.innerHTML = data.niches.map(n => `<option value="${n}"></option>`).join('');
    }
  } catch (e) {
    console.error("Failed to load autocomplete meta", e);
  }
}

// Quick Search Chips
function setQuickSearch(city, niche) {
  document.getElementById('radar-city-input').value = city;
  document.getElementById('radar-niche-input').value = niche;
  document.getElementById('radar-check-form').dispatchEvent(new Event('submit'));
}

// Duplicate Radar Check Logic
async function handleRadarCheck(e) {
  e.preventDefault();
  const city = document.getElementById('radar-city-input').value.trim();
  const niche = document.getElementById('radar-niche-input').value.trim();

  if (!city || !niche) {
    showToast('Введите город и нишу для проверки', 'warning');
    return;
  }

  const submitBtn = document.getElementById('radar-submit-btn');
  submitBtn.disabled = true;
  submitBtn.innerHTML = `<i data-lucide="loader" class="w-4 h-4 animate-spin"></i><span>Проверяю...</span>`;
  lucide.createIcons();

  try {
    const res = await fetch(`/api/check?city=${encodeURIComponent(city)}&niche=${encodeURIComponent(niche)}`);
    if (!res.ok) throw new Error('Ошибка сервера при проверке');
    const result = await res.json();

    renderRadarVerdict(result);

    // Update Mascot state using our new high-res renders
    const mascotImg = document.getElementById('mascot-dynamic-img');
    const speechEl = document.getElementById('mascot-speech-text');

    if (result.status === 'danger') {
      mascotImg.src = '/static/img/mascot_alert.png';
      speechEl.innerHTML = `🚨 <b>Внимание!</b> Нишу <b>${result.niche_query}</b> в г. <b>${result.city_query}</b> уже собрали ${result.days_since_last} дн. назад! Не делай повторный сбор!`;
      playSound('danger');
    } else if (result.status === 'warning') {
      mascotImg.src = '/static/img/mascot_radar.png';
      speechEl.innerHTML = `🕒 <b>Можно обновить!</b> По связке <b>${result.city_query}</b> + <b>${result.niche_query}</b> собирали ${result.days_since_last} дн. назад. База могла устареть!`;
      playSound('pop');
    } else {
      mascotImg.src = '/static/img/mascot_celebrate.png';
      speechEl.innerHTML = `🎉 <b>Свободно!</b> В г. <b>${result.city_query}</b> нишу <b>${result.niche_query}</b> никто не парсил! Забирай в работу!`;
      playSound('safe');
    }

  } catch (err) {
    console.error(err);
    showToast('Ошибка при сканировании радара: ' + err.message, 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = `<i data-lucide="search" class="w-4 h-4"></i><span>Проверить</span>`;
    lucide.createIcons();
  }
}

function renderRadarVerdict(data) {
  const container = document.getElementById('radar-verdict-container');
  container.classList.remove('hidden');

  let statusBadgeClass = '';
  let borderClass = '';
  let bgGradient = '';

  if (data.status === 'danger') {
    statusBadgeClass = 'bg-rose-100 text-rose-800 border-rose-200';
    borderClass = 'border-rose-200';
    bgGradient = 'from-rose-50 via-white to-amber-50/30';
  } else if (data.status === 'warning') {
    statusBadgeClass = 'bg-amber-100 text-amber-800 border-amber-200';
    borderClass = 'border-amber-200';
    bgGradient = 'from-amber-50 via-white to-blue-50/30';
  } else {
    statusBadgeClass = 'bg-emerald-100 text-emerald-800 border-emerald-200';
    borderClass = 'border-emerald-200';
    bgGradient = 'from-emerald-50 via-white to-blue-50/30';
  }

  let matchesHtml = '';
  if (data.matches && data.matches.length > 0) {
    matchesHtml = `
      <div class="mt-4 border-t border-slate-200 pt-4">
        <h4 class="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2.5">
          История предыдущих сборов по этой связке (${data.matches.length}):
        </h4>
        <div class="space-y-2 max-h-60 overflow-y-auto pr-1">
          ${data.matches.map(m => `
            <div class="p-3 bg-white rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div class="space-y-1">
                <div class="flex items-center gap-2">
                  <span class="font-bold text-slate-800 text-xs">${m.city} • ${m.niche}</span>
                  ${getSourceBadgeHtml(m.source)}
                  ${getStatusBadgeHtml(m.status)}
                </div>
                <p class="text-xs text-slate-500">
                  Собрал: <b>${m.operator_name}</b> • Дата: <b>${formatDate(m.parsed_date)}</b> (${m.days_ago} дн. назад) • Контактов: <b class="text-brand-deep">${m.records_count}</b>
                </p>
                ${m.notes ? `<p class="text-xs text-slate-600 bg-slate-50 px-2 py-1 rounded-lg italic">«${m.notes}»</p>` : ''}
              </div>
              <div class="flex items-center gap-2 shrink-0">
                <button onclick="editParseRecord(${m.id})" class="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-colors">
                  Детали
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  container.innerHTML = `
    <div class="p-6 rounded-3xl bg-gradient-to-br ${bgGradient} border-2 ${borderClass} shadow-lg space-y-4">
      <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        
        <div class="space-y-1">
          <div class="flex items-center gap-2">
            <span class="text-xs font-bold px-3 py-1 rounded-full border ${statusBadgeClass}">
              ${data.is_duplicate ? (data.status === 'danger' ? 'Свежий дубль' : 'Старая запись') : 'Чисто / Свободно'}
            </span>
            <span class="text-xs text-slate-400 font-medium">Город: <b>${data.city_query}</b> • Ниша: <b>${data.niche_query}</b></span>
          </div>
          <h2 class="text-xl sm:text-2xl font-black text-slate-900">${data.headline}</h2>
          <p class="text-xs sm:text-sm text-slate-700 leading-relaxed">${data.message}</p>
        </div>

        <div class="flex items-center gap-3 shrink-0">
          ${data.is_duplicate ? `
            <button onclick="switchTab('journal'); document.getElementById('filter-search').value = '${data.city_query}'; loadJournalData();" 
              class="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 text-xs font-bold rounded-xl shadow-xs transition-all flex items-center gap-1.5">
              <i data-lucide="external-link" class="w-4 h-4"></i>
              Смотреть в журнале
            </button>
          ` : ''}

          <button onclick="openCreateModal('${data.city_query}', '${data.niche_query}')"
            class="px-5 py-2.5 bg-gradient-to-r from-brand-deep to-brand-blue hover:from-brand-navy hover:to-brand-deep text-white text-xs font-bold rounded-xl shadow-md transition-all flex items-center gap-2">
            <i data-lucide="bookmark-plus" class="w-4 h-4"></i>
            <span>Занять нишу в работу</span>
          </button>
        </div>

      </div>

      <div class="p-3.5 bg-white/80 rounded-2xl border border-slate-200 text-xs text-slate-600 flex items-center gap-2.5">
        <i data-lucide="info" class="w-4 h-4 text-brand-blue shrink-0"></i>
        <span><b>Рекомендация:</b> ${data.recommended_action}</span>
      </div>

      ${matchesHtml}
    </div>
  `;

  lucide.createIcons();
  container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// KPI Summary Loader
async function loadStatsSummary() {
  try {
    const res = await fetch('/api/analytics/summary');
    if (!res.ok) return;
    const data = await res.json();

    document.getElementById('stat-total-parses').innerText = data.total_parses.toLocaleString('ru-RU');
    document.getElementById('stat-total-contacts').innerText = data.total_contacts.toLocaleString('ru-RU');
    document.getElementById('stat-unique-cities').innerText = data.unique_cities.toLocaleString('ru-RU');
    document.getElementById('stat-unique-niches').innerText = data.unique_niches.toLocaleString('ru-RU');

    const badgeTotal = document.getElementById('badge-total-count');
    if (badgeTotal) {
      badgeTotal.innerText = data.total_parses;
    }
  } catch (e) {
    console.error("Failed to load stats summary", e);
  }
}

// Journal Data Loader
async function loadJournalData() {
  const tableBody = document.getElementById('journal-table-body');
  tableBody.innerHTML = `
    <tr>
      <td colspan="10" class="py-8 text-center text-slate-400">
        <i data-lucide="loader" class="w-5 h-5 animate-spin mx-auto mb-1 text-brand-blue"></i>
        Загрузка...
      </td>
    </tr>
  `;
  lucide.createIcons();

  const search = document.getElementById('filter-search').value.trim();
  const source = document.getElementById('filter-source').value;
  const status = document.getElementById('filter-status').value;

  const params = new URLSearchParams();
  if (search) params.append('search', search);
  if (source && source !== 'Все') params.append('source', source);
  if (status && status !== 'Все') params.append('status', status);

  try {
    const res = await fetch(`/api/parses?${params.toString()}`);
    if (!res.ok) throw new Error('Ошибка загрузки журнала');
    const records = await res.json();

    document.getElementById('journal-visible-count').innerText = records.length;

    if (records.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="10" class="py-12 text-center text-slate-400">
            <i data-lucide="inbox" class="w-10 h-10 mx-auto mb-2 text-slate-300"></i>
            <p class="font-bold text-sm text-slate-600">База данных пуста</p>
            <p class="text-xs text-slate-400 mt-1">Добавьте первый сбор через кнопку «Новый сбор» или нажмите «Демо-данные» для теста</p>
          </td>
        </tr>
      `;
      lucide.createIcons();
      return;
    }

    const today = new Date();

    tableBody.innerHTML = records.map(r => {
      let daysAgoText = '';
      if (r.parsed_date) {
        const pDate = new Date(r.parsed_date);
        const diffDays = Math.floor((today - pDate) / (1000 * 60 * 60 * 24));
        if (diffDays === 0) daysAgoText = '<span class="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-1.5 py-0.5 rounded">сегодня</span>';
        else if (diffDays === 1) daysAgoText = '<span class="text-[10px] text-slate-500">вчера</span>';
        else daysAgoText = `<span class="text-[10px] text-slate-400">${diffDays} дн. назад</span>`;
      }

      return `
        <tr class="hover:bg-slate-50/80 transition-colors">
          <td class="py-3.5 px-4 font-mono text-slate-400 text-xs">#${r.id}</td>
          <td class="py-3.5 px-4 font-bold text-slate-900 whitespace-nowrap">${r.city}</td>
          <td class="py-3.5 px-4 font-semibold text-brand-deep whitespace-nowrap">${r.niche}</td>
          <td class="py-3.5 px-4 whitespace-nowrap">
            ${getSourceBadgeHtml(r.source)}
          </td>
          <td class="py-3.5 px-4 whitespace-nowrap">
            ${getStatusBadgeHtml(r.status)}
          </td>
          <td class="py-3.5 px-4 font-black text-sm text-slate-800 whitespace-nowrap">
            ${r.records_count > 0 ? r.records_count.toLocaleString('ru-RU') : '<span class="text-slate-300 font-normal">—</span>'}
          </td>
          <td class="py-3.5 px-4 whitespace-nowrap">
            <div class="flex items-center gap-1.5">
              <div class="w-5 h-5 rounded-full bg-blue-100 text-brand-blue flex items-center justify-center font-bold text-[10px]">
                ${r.operator_name ? r.operator_name[0].toUpperCase() : 'М'}
              </div>
              <span class="font-medium text-slate-700">${r.operator_name || 'Менеджер'}</span>
            </div>
          </td>
          <td class="py-3.5 px-4 whitespace-nowrap">
            <div class="flex flex-col">
              <span class="font-medium text-slate-800">${formatDate(r.parsed_date)}</span>
              ${daysAgoText}
            </div>
          </td>
          <td class="py-3.5 px-4 max-w-xs truncate text-slate-500" title="${r.notes || ''}">
            ${r.notes || '<span class="text-slate-300 italic">Нет заметок</span>'}
          </td>
          <td class="py-3.5 px-4 text-right whitespace-nowrap">
            <button onclick="editParseRecord(${r.id})" class="p-1.5 hover:bg-slate-200 text-slate-500 hover:text-brand-blue rounded-lg transition-colors" title="Редактировать">
              <i data-lucide="edit-2" class="w-3.5 h-3.5"></i>
            </button>
          </td>
        </tr>
      `;
    }).join('');

    lucide.createIcons();

  } catch (err) {
    console.error(err);
    showToast('Ошибка при загрузке таблицы: ' + err.message, 'error');
  }
}

function debounceFilter() {
  clearTimeout(filterTimeout);
  filterTimeout = setTimeout(() => {
    loadJournalData();
  }, 300);
}

function resetFilters() {
  document.getElementById('filter-search').value = '';
  document.getElementById('filter-source').value = 'Все';
  document.getElementById('filter-status').value = 'Все';
  loadJournalData();
}

// Beautiful Source Badge Renderer (Fixes overlapping and bug look)
function getSourceBadgeHtml(source) {
  if (source === '2ГИС + Яндекс' || source.includes('+') || source === 'Оба') {
    return `
      <div class="inline-flex items-center gap-1.5 whitespace-nowrap bg-blue-50/90 border border-blue-200/80 px-2.5 py-1 rounded-xl shadow-2xs">
        <span class="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700">
          <span class="w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-emerald-200"></span>2ГИС
        </span>
        <span class="text-slate-300 font-semibold">•</span>
        <span class="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700">
          <span class="w-2 h-2 rounded-full bg-amber-500 ring-2 ring-amber-200"></span>Яндекс
        </span>
      </div>
    `;
  }
  if (source === '2ГИС') {
    return `
      <div class="inline-flex items-center gap-1.5 whitespace-nowrap bg-emerald-50 border border-emerald-200/90 px-2.5 py-1 rounded-xl text-[11px] font-bold text-emerald-800 shadow-2xs">
        <span class="w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-emerald-200"></span>
        <span>2ГИС</span>
      </div>
    `;
  }
  return `
    <div class="inline-flex items-center gap-1.5 whitespace-nowrap bg-amber-50 border border-amber-200/90 px-2.5 py-1 rounded-xl text-[11px] font-bold text-amber-800 shadow-2xs">
      <span class="w-2 h-2 rounded-full bg-amber-500 ring-2 ring-amber-200"></span>
      <span>Яндекс Карты</span>
    </div>
  `;
}

// Beautiful Status Badge Renderer (Fixes bug look for "Требует обновления")
function getStatusBadgeHtml(status) {
  if (status === 'Требует обновления') {
    return `
      <div class="inline-flex items-center gap-1.5 whitespace-nowrap bg-amber-50 border border-amber-300/80 px-2.5 py-1 rounded-xl text-[11px] font-bold text-amber-800 shadow-2xs">
        <i data-lucide="clock" class="w-3 h-3 text-amber-600"></i>
        <span>Обновить (&gt;60 дн)</span>
      </div>
    `;
  }
  if (status === 'Завершено') {
    return `
      <div class="inline-flex items-center gap-1.5 whitespace-nowrap bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-xl text-[11px] font-bold text-emerald-700 shadow-2xs">
        <i data-lucide="check-circle-2" class="w-3 h-3 text-emerald-600"></i>
        <span>Завершено</span>
      </div>
    `;
  }
  if (status === 'В процессе') {
    return `
      <div class="inline-flex items-center gap-1.5 whitespace-nowrap bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-xl text-[11px] font-bold text-brand-deep shadow-2xs">
        <span class="w-2 h-2 rounded-full bg-brand-blue animate-ping mr-0.5"></span>
        <span>В процессе</span>
      </div>
    `;
  }
  if (status === 'Запланировано') {
    return `
      <div class="inline-flex items-center gap-1.5 whitespace-nowrap bg-purple-50 border border-purple-200 px-2.5 py-1 rounded-xl text-[11px] font-bold text-purple-700 shadow-2xs">
        <i data-lucide="calendar" class="w-3 h-3 text-purple-500"></i>
        <span>Запланировано</span>
      </div>
    `;
  }
  return `<span class="px-2 py-0.5 rounded-lg text-[11px] font-medium bg-slate-100 text-slate-700">${status}</span>`;
}

function formatDate(isoStr) {
  if (!isoStr) return '—';
  const parts = isoStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}.${parts[1]}.${parts[0]}`;
  }
  return isoStr;
}

// Database Clearing Handlers
function confirmClearDatabase() {
  document.getElementById('modal-clear-db').classList.remove('hidden');
}

function closeClearModal() {
  document.getElementById('modal-clear-db').classList.add('hidden');
}

async function executeClearDatabase() {
  closeClearModal();
  try {
    const res = await fetch('/api/parses/clear-all', { method: 'POST' });
    if (!res.ok) throw new Error('Ошибка очистки');
    showToast('База данных полностью очищена!', 'success');
    playSound('pop');

    loadStatsSummary();
    loadJournalData();
    loadAutocompleteMeta();
    if (currentTab === 'analytics') loadAnalytics();

    document.getElementById('mascot-speech-text').innerHTML = `🧹 <b>База очищена!</b> Теперь здесь только ваши реальные рабочие данные! 🐾`;
  } catch (err) {
    showToast('Ошибка: ' + err.message, 'error');
  }
}

async function confirmResetDemo() {
  if (!confirm('Восстановить демонстрационные данные для тестирования?')) return;
  try {
    const res = await fetch('/api/parses/reset-demo', { method: 'POST' });
    if (!res.ok) throw new Error('Ошибка сброса демо-данных');
    showToast('Демо-данные успешно загружены', 'info');
    playSound('pop');

    loadStatsSummary();
    loadJournalData();
    loadAutocompleteMeta();
    if (currentTab === 'analytics') loadAnalytics();
  } catch (err) {
    showToast('Ошибка: ' + err.message, 'error');
  }
}

// Modal: Create Parse Record
function openCreateModal(defaultCity = '', defaultNiche = '') {
  document.getElementById('modal-city').value = defaultCity;
  document.getElementById('modal-niche').value = defaultNiche;
  document.getElementById('modal-count').value = '0';
  document.getElementById('modal-notes').value = '';
  
  // Set today's date
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  document.getElementById('modal-date').value = `${yyyy}-${mm}-${dd}`;

  document.getElementById('modal-create').classList.remove('hidden');
  playSound('pop');
}

function closeCreateModal() {
  document.getElementById('modal-create').classList.add('hidden');
}

async function handleCreateParse(e) {
  e.preventDefault();
  const city = document.getElementById('modal-city').value.trim();
  const niche = document.getElementById('modal-niche').value.trim();
  const source = document.getElementById('modal-source').value;
  const status = document.getElementById('modal-status').value;
  const records_count = parseInt(document.getElementById('modal-count').value) || 0;
  const operator_name = document.getElementById('modal-operator').value.trim() || 'Менеджер';
  const parsed_date = document.getElementById('modal-date').value;
  const notes = document.getElementById('modal-notes').value.trim();

  try {
    const res = await fetch('/api/parses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        city, niche, source, status, records_count, operator_name, parsed_date, notes
      })
    });

    if (!res.ok) throw new Error('Не удалось сохранить сбор');
    const created = await res.json();

    closeCreateModal();
    showToast(`Сбор «${city} • ${niche}» успешно сохранен!`, 'success');
    playSound('safe');

    loadStatsSummary();
    loadAutocompleteMeta();
    if (currentTab === 'journal') loadJournalData();
    if (currentTab === 'analytics') loadAnalytics();

    // Congratulate in speech bubble
    document.getElementById('mascot-speech-text').innerHTML = `🎉 Зафиксировал: <b>${city} + ${niche}</b>! Другие сотрудники теперь увидят эту бронь в базе!`;
    document.getElementById('mascot-dynamic-img').src = '/static/img/mascot_celebrate.png';

  } catch (err) {
    showToast('Ошибка сохранения: ' + err.message, 'error');
  }
}

// Modal: Edit Parse Record
async function editParseRecord(id) {
  try {
    const res = await fetch(`/api/parses/${id}`);
    if (!res.ok) throw new Error('Запись не найдена');
    const r = await res.json();

    document.getElementById('edit-id').value = r.id;
    document.getElementById('edit-id-display').innerText = `#${r.id}`;
    document.getElementById('edit-city').value = r.city;
    document.getElementById('edit-niche').value = r.niche;
    document.getElementById('edit-source').value = r.source;
    document.getElementById('edit-status').value = r.status;
    document.getElementById('edit-count').value = r.records_count;
    document.getElementById('edit-operator').value = r.operator_name || 'Менеджер';
    document.getElementById('edit-notes').value = r.notes || '';

    document.getElementById('modal-edit').classList.remove('hidden');
    playSound('pop');
  } catch (err) {
    showToast('Ошибка: ' + err.message, 'error');
  }
}

function closeEditModal() {
  document.getElementById('modal-edit').classList.add('hidden');
}

async function handleUpdateParse(e) {
  e.preventDefault();
  const id = document.getElementById('edit-id').value;
  const city = document.getElementById('edit-city').value.trim();
  const niche = document.getElementById('edit-niche').value.trim();
  const source = document.getElementById('edit-source').value;
  const status = document.getElementById('edit-status').value;
  const records_count = parseInt(document.getElementById('edit-count').value) || 0;
  const operator_name = document.getElementById('edit-operator').value.trim();
  const notes = document.getElementById('edit-notes').value.trim();

  try {
    const res = await fetch(`/api/parses/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        city, niche, source, status, records_count, operator_name, notes
      })
    });

    if (!res.ok) throw new Error('Ошибка при обновлении');
    closeEditModal();
    showToast(`Запись #${id} успешно обновлена`, 'success');
    playSound('pop');

    loadStatsSummary();
    if (currentTab === 'journal') loadJournalData();
    if (currentTab === 'analytics') loadAnalytics();
  } catch (err) {
    showToast('Ошибка обновления: ' + err.message, 'error');
  }
}

async function handleDeleteParse() {
  const id = document.getElementById('edit-id').value;
  if (!confirm(`Вы действительно хотите удалить запись #${id}?`)) return;

  try {
    const res = await fetch(`/api/parses/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Ошибка при удалении');
    closeEditModal();
    showToast(`Запись #${id} удалена`, 'info');
    playSound('pop');

    loadStatsSummary();
    if (currentTab === 'journal') loadJournalData();
    if (currentTab === 'analytics') loadAnalytics();
  } catch (err) {
    showToast('Ошибка удаления: ' + err.message, 'error');
  }
}

// Analytics Charts Loader
async function loadAnalytics() {
  try {
    const res = await fetch('/api/analytics/summary');
    if (!res.ok) return;
    const data = await res.json();

    renderSourcesChart(data.sources_distribution);
    renderStatusesChart(data.status_distribution);
    renderTopCitiesChart(data.top_cities);
    renderTopNichesChart(data.top_niches);
  } catch (err) {
    console.error("Failed to load analytics charts", err);
  }
}

function renderSourcesChart(sourcesData) {
  const ctx = document.getElementById('chart-sources').getContext('2d');
  if (charts.sources) charts.sources.destroy();

  const labels = Object.keys(sourcesData);
  const counts = labels.map(k => sourcesData[k].count);

  charts.sources = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: counts,
        backgroundColor: ['#10B981', '#F59E0B', '#2875FB', '#6366F1'],
        borderWidth: 3,
        borderColor: '#ffffff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { font: { family: 'Inter', size: 11 } } }
      },
      cutout: '70%'
    }
  });
}

function renderStatusesChart(statusData) {
  const ctx = document.getElementById('chart-statuses').getContext('2d');
  if (charts.statuses) charts.statuses.destroy();

  const labels = Object.keys(statusData);
  const counts = labels.map(k => statusData[k]);

  charts.statuses = new Chart(ctx, {
    type: 'pie',
    data: {
      labels: labels,
      datasets: [{
        data: counts,
        backgroundColor: ['#22C55E', '#EAB308', '#6366F1', '#F59E0B'],
        borderWidth: 3,
        borderColor: '#ffffff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { font: { family: 'Inter', size: 11 } } }
      }
    }
  });
}

function renderTopCitiesChart(topCities) {
  const ctx = document.getElementById('chart-top-cities').getContext('2d');
  if (charts.topCities) charts.topCities.destroy();

  charts.topCities = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: topCities.map(c => c.name),
      datasets: [{
        label: 'Собрано контактов',
        data: topCities.map(c => c.total_records),
        backgroundColor: '#2875FB',
        borderRadius: 8
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: { beginAtZero: true, grid: { color: '#F1F5F9' } },
        x: { grid: { display: false } }
      }
    }
  });
}

function renderTopNichesChart(topNiches) {
  const ctx = document.getElementById('chart-top-niches').getContext('2d');
  if (charts.topNiches) charts.topNiches.destroy();

  charts.topNiches = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: topNiches.map(n => n.name),
      datasets: [{
        label: 'Сборов ниши',
        data: topNiches.map(n => n.count),
        backgroundColor: '#1E3FB2',
        borderRadius: 8
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: { beginAtZero: true, grid: { color: '#F1F5F9' } },
        y: { grid: { display: false } }
      }
    }
  });
}

// Data Export Trigger
function exportData(format) {
  const search = document.getElementById('filter-search')?.value.trim() || '';
  const url = format === 'excel' ? `/api/export/excel?search=${encodeURIComponent(search)}` : '/api/export/csv';
  window.open(url, '_blank');
  showToast(`Скачивание файла ${format.toUpperCase()} началось...`, 'info');
}

// Toast Notifications
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  
  let bgClass = 'bg-slate-900 text-white';
  let icon = 'info';

  if (type === 'success') {
    bgClass = 'bg-emerald-600 text-white';
    icon = 'check-circle-2';
  } else if (type === 'warning') {
    bgClass = 'bg-amber-600 text-white';
    icon = 'alert-triangle';
  } else if (type === 'error') {
    bgClass = 'bg-rose-600 text-white';
    icon = 'x-circle';
  }

  toast.className = `${bgClass} px-4 py-3 rounded-2xl shadow-xl flex items-center gap-2.5 text-xs font-bold pointer-events-auto transition-all transform translate-y-2 opacity-0 duration-200`;
  toast.innerHTML = `
    <i data-lucide="${icon}" class="w-4 h-4 shrink-0"></i>
    <span>${message}</span>
  `;

  container.appendChild(toast);
  lucide.createIcons();

  requestAnimationFrame(() => {
    toast.classList.remove('translate-y-2', 'opacity-0');
  });

  setTimeout(() => {
    toast.classList.add('translate-y-2', 'opacity-0');
    setTimeout(() => toast.remove(), 250);
  }, 3500);
}

// Initialization on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();
  loadStatsSummary();
  loadAutocompleteMeta();
});
