// GeoRadar CRM — Парсер лидов 2ГИС + Яндекс (раздел «Инструменты»)
// Мост к расширению MapLeads Audit v2.4.1: сайт готовит умный запрос и
// открывает карты, сбор на самих картах выполняет расширение в браузере
// пользователя, а результат (CSV/JSON из расширения) возвращается сюда:
// сервер склеивает дубли 2ГИС и Яндекс, сохраняет сбор в «Журнал сборов»
// и отдаёт экспорт в формате импорта вкладки «AI Офферы».
let parserLeads = [];
let parserDuplicatesMerged = 0;
let parserMetaLoaded = false;
let parserRun = null;

function parserEsc(v) {
  let s = String(v == null ? '' : v);
  s = s.replace(/&/g, '&amp;');
  s = s.replace(/</g, '&lt;');
  s = s.replace(/>/g, '&gt;');
  s = s.split(String.fromCharCode(34)).join('&quot;');
  return s;
}

function parserAttr(name, value) {
  const q = String.fromCharCode(34);
  return ' ' + name + '=' + q + parserEsc(value) + q;
}

function parserEl(id) { return document.getElementById(id); }

function parserCurrentCity() {
  const custom = parserEl('parser-city-custom');
  if (custom && custom.value.trim()) return custom.value.trim();
  const sel = parserEl('parser-city');
  return sel ? sel.value.trim() : '';
}

function parserCurrentQuery() {
  const custom = parserEl('parser-niche-custom');
  if (custom && custom.value.trim()) return custom.value.trim();
  const sel = parserEl('parser-niche');
  return sel ? sel.value.trim() : '';
}

function parserCurrentNicheLabel() {
  const custom = parserEl('parser-niche-custom');
  if (custom && custom.value.trim()) return custom.value.trim();
  const sel = parserEl('parser-niche');
  if (!sel) return '';
  const opt = sel.options[sel.selectedIndex];
  return opt ? opt.textContent.trim() : sel.value.trim();
}

function parserUpdatePreview() {
  const box = parserEl('parser-query-preview');
  if (box) box.textContent = (parserCurrentQuery() + ' ' + parserCurrentCity()).trim();
}

async function initParserTab() {
  if (parserMetaLoaded) { parserUpdatePreview(); return; }
  try {
    const res = await fetch('/api/tools/parser/meta');
    if (!res.ok) throw new Error('meta');
    const data = await res.json();
    const nicheSel = parserEl('parser-niche');
    if (nicheSel) {
      nicheSel.innerHTML = (data.niches || []).map(function (n) {
        return '<option' + parserAttr('value', n.query || n.name) + '>' + parserEsc((n.icon || '') + ' ' + (n.name || '')) + '</option>';
      }).join('');
    }
    const citySel = parserEl('parser-city');
    if (citySel) {
      citySel.innerHTML = (data.cities || []).map(function (c) {
        return '<option' + parserAttr('value', c) + (c === 'Краснодар' ? ' selected' : '') + '>' + parserEsc(c) + '</option>';
      }).join('');
    }
    parserMetaLoaded = true;
    parserUpdatePreview();
  } catch (e) {
    const nicheSel = parserEl('parser-niche');
    if (nicheSel && !nicheSel.options.length) {
      nicheSel.innerHTML = [['салон красоты', '✂️ Салоны красоты и Барбершопы'], ['автосервис', '🚗 Автосервисы и Детейлинг'], ['ремонт квартир', '🔨 Ремонт квартир и Отделка'], ['мебель на заказ', '🛋️ Мебель на заказ и Кухни'], ['стоматология', '🦷 Стоматологии и Медцентры']].map(function (p) { return '<option' + parserAttr('value', p[0]) + '>' + parserEsc(p[1]) + '</option>'; }).join('');
    }
    const citySel = parserEl('parser-city');
    if (citySel && !citySel.options.length) {
      citySel.innerHTML = ['Краснодар', 'Тюмень', 'Сочи', 'Москва', 'Санкт-Петербург', 'Екатеринбург', 'Новосибирск', 'Казань'].map(function (c) { return '<option' + parserAttr('value', c) + (c === 'Краснодар' ? ' selected' : '') + '>' + parserEsc(c) + '</option>'; }).join('');
    }
    parserMetaLoaded = true;
    parserUpdatePreview();
    showToast('Справочники ниш и городов не загрузились с сервера — подставлен базовый список', 'warning');
  }
}

function parserSetProgress(percent, text) {
  const box = parserEl('parser-progress-box');
  if (box) box.classList.remove('hidden');
  const bar = parserEl('parser-progress-bar');
  if (bar) bar.style.width = Math.max(0, Math.min(100, percent)) + '%';
  const label = parserEl('parser-progress-text');
  if (label) label.textContent = text || '';
}

async function parserStartRun() {
  const query = parserCurrentQuery();
  const city = parserCurrentCity();
  const serviceEl = parserEl('parser-service');
  const service = serviceEl ? serviceEl.value : 'both';
  if (!query || !city) { showToast('Выберите нишу и город для сбора', 'warning'); return; }
  parserSetProgress(15, 'Готовлю умный запрос для карт…');
  try {
    const res = await fetch('/api/tools/parser/prepare', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ city: city, niche: query, service: service }) });
    if (!res.ok) throw new Error('prepare');
    parserRun = await res.json();
    const linksBox = parserEl('parser-open-links');
    if (linksBox) {
      linksBox.innerHTML = Object.keys(parserRun.urls || {}).map(function (label) {
        const url = parserRun.urls[label];
        return '<a' + parserAttr('href', url) + parserAttr('target', '_blank') + parserAttr('rel', 'noopener') + parserAttr('class', 'inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-blue-200 text-brand-deep text-xs font-bold hover:bg-blue-50') + '>Открыть: ' + parserEsc(label) + '</a>';
      }).join('');
      linksBox.classList.remove('hidden');
    }
    Object.keys(parserRun.urls || {}).forEach(function (label) { window.open(parserRun.urls[label], '_blank'); });
    const importBox = parserEl('parser-import-box');
    if (importBox) importBox.classList.remove('hidden');
    parserSetProgress(45, 'Карты открыты. В расширении MapLeads Audit на странице карт запустите сбор, затем скачайте CSV или скопируйте JSON и загрузите результат сюда — дубли 2ГИС и Яндекс склеятся автоматически.');
    showToast('Запрос готов: карты открыты в новых вкладках', 'success');
    if (typeof playSound === 'function') playSound('pop');
  } catch (e) {
    parserSetProgress(0, 'Ошибка подготовки запроса');
    showToast('Не удалось подготовить запрос парсера', 'error');
  }
}

function parserSplitPhones(value) {
  if (Array.isArray(value)) return value.map(function (p) { return String(p || '').trim(); }).filter(Boolean);
  return String(value || '').split(/[,;]+/).map(function (p) { return p.trim(); }).filter(Boolean);
}

function parserNormalizeLead(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const emails = Array.isArray(raw.emails) ? raw.emails.join(', ') : (raw.email || '');
  const ratingRaw = raw.rating == null ? '' : String(raw.rating).replace(',', '.');
  const rating = ratingRaw === '' ? null : parseFloat(ratingRaw);
  const reviewsRaw = raw.reviews_count == null ? raw.reviewsCount : raw.reviews_count;
  const lead = {
    name: String(raw.name || raw.company_name || '').trim(),
    address: String(raw.address || '').trim(),
    phones: parserSplitPhones(raw.phones || raw.phone || ''),
    website: String(raw.website || '').trim(),
    rating: isNaN(rating) ? null : rating,
    reviews_count: reviewsRaw == null || reviewsRaw === '' ? null : parseInt(String(reviewsRaw).replace(/[^0-9]/g, ''), 10) || null,
    category: String(raw.category || raw.niche || '').trim() || parserCurrentNicheLabel(),
    map_url: String(raw.map_url || raw.mapUrl || '').trim(),
    map_urls: Array.isArray(raw.map_urls) ? raw.map_urls : (Array.isArray(raw.mapUrls) ? raw.mapUrls : []),
    source: String(raw.source || '').trim(),
    city: String(raw.city || '').trim() || parserCurrentCity(),
    niche: String(raw.niche || raw.category || '').trim() || parserCurrentNicheLabel(),
    email: String(emails || '').trim(),
    telegram: String(raw.telegram || '').trim(),
    whatsapp: String(raw.whatsapp || '').trim(),
    vk: String(raw.vk || '').trim()
  };
  if (!lead.name && !lead.phones.length) return null;
  if (!lead.name) lead.name = 'Без названия';
  return lead;
}

function parserFieldByHeader(h) {
  const s = String(h || '').trim().toLowerCase();
  if (!s) return 'skip';
  if (s.indexOf('статус сайта') >= 0 || s.indexOf('слабые') >= 0 || s.indexOf('оффер') >= 0) return 'skip';
  if (s.indexOf('ссылка на карт') >= 0) return 'map_url';
  if (s.indexOf('телефон') >= 0 || s === 'тел') return 'phones';
  if (s.indexOf('компан') >= 0 || s.indexOf('назван') >= 0 || s.indexOf('организац') >= 0) return 'name';
  if (s.indexOf('город и адрес') >= 0) return 'address';
  if (s.indexOf('адрес') >= 0) return 'address';
  if (s.indexOf('город') >= 0) return 'city';
  if (s.indexOf('сайт') >= 0) return 'website';
  if (s.indexOf('рейтинг') >= 0) return 'rating';
  if (s.indexOf('отзыв') >= 0) return 'reviews_count';
  if (s.indexOf('категор') >= 0 || s.indexOf('ниш') >= 0) return 'category';
  if (s.indexOf('источник') >= 0) return 'source';
  if (s.indexOf('email') >= 0 || s.indexOf('почт') >= 0) return 'email';
  if (s.indexOf('telegram') >= 0 || s.indexOf('телеграм') >= 0) return 'telegram';
  if (s.indexOf('whatsapp') >= 0) return 'whatsapp';
  if (s.indexOf('вконтакте') >= 0 || s === 'вк') return 'vk';
  if (s.indexOf('точек в городе') >= 0) return 'skip';
  return 'skip';
}

function parserParseCsv(text) {
  const nl = String.fromCharCode(10);
  const q = String.fromCharCode(34);
  let src = String(text || '');
  if (src.charCodeAt(0) === 65279) src = src.slice(1);
  const firstLine = src.split(nl)[0] || '';
  const delim = firstLine.split(';').length >= firstLine.split(',').length ? ';' : ',';
  const rows = [];
  let row = [];
  let cell = '';
  let inQ = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === q) {
      if (inQ && src[i + 1] === q) { cell += q; i++; } else { inQ = !inQ; }
    } else if (c === delim && !inQ) { row.push(cell); cell = ''; }
    else if ((c === nl || c === String.fromCharCode(13)) && !inQ) {
      if (c === String.fromCharCode(13) && src[i + 1] === nl) i++;
      row.push(cell); cell = '';
      if (row.some(function (v) { return String(v).trim() !== ''; })) rows.push(row);
      row = [];
    } else { cell += c; }
  }
  row.push(cell);
  if (row.some(function (v) { return String(v).trim() !== ''; })) rows.push(row);
  if (!rows.length) return [];
  const fields = rows[0].map(parserFieldByHeader);
  const leads = [];
  for (let r = 1; r < rows.length; r++) {
    const obj = {};
    fields.forEach(function (f, idx) { if (f !== 'skip') obj[f] = rows[r][idx] || ''; });
    if (obj.map_url && obj.map_url.indexOf('|') >= 0) { obj.map_urls = obj.map_url.split('|').map(function (u) { return u.trim(); }).filter(Boolean); obj.map_url = obj.map_urls[0] || ''; }
    const lead = parserNormalizeLead(obj);
    if (lead) leads.push(lead);
  }
  return leads;
}

async function parserImportLeads(rawLeads) {
  const leads = (rawLeads || []).map(parserNormalizeLead).filter(Boolean);
  if (!leads.length) { showToast('Нет строк для импорта: нужны название компании или телефон', 'warning'); return; }
  parserSetProgress(70, 'Склеиваю дубли 2ГИС и Яндекс и сохраняю сбор в журнал…');
  const serviceEl = parserEl('parser-service');
  try {
    const res = await fetch('/api/tools/parser/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ leads: leads, city: parserCurrentCity(), niche: parserCurrentNicheLabel(), service: serviceEl ? serviceEl.value : 'both' }) });
    if (!res.ok) throw new Error('import');
    const data = await res.json();
    parserLeads = data.leads || [];
    parserDuplicatesMerged = data.duplicates_merged || 0;
    parserRenderLeads(data);
    parserSetProgress(100, 'Готово: сбор #' + data.parse_record_id + ' сохранён в «Журнал сборов». Получено ' + data.received + ', после склейки дублей — ' + data.saved + '.');
    showToast('Сохранено в журнал сборов: ' + data.saved + ' компаний, склеено дублей: ' + data.duplicates_merged, 'success');
    if (typeof playSound === 'function') playSound('safe');
    if (typeof loadStatsSummary === 'function') loadStatsSummary();
    if (typeof loadJournalData === 'function') loadJournalData();
  } catch (e) {
    parserSetProgress(0, 'Ошибка импорта результатов');
    showToast('Не удалось импортировать результаты парсера', 'error');
  }
}

function parserRenderLeads(importInfo) {
  const box = parserEl('parser-results-box');
  if (box) box.classList.remove('hidden');
  const total = parserLeads.length;
  const withPhone = parserLeads.filter(function (l) { return (l.phones || []).length > 0; }).length;
  const withoutSite = parserLeads.filter(function (l) { return !l.website; }).length;
  const stats = parserEl('parser-stats');
  if (stats) {
    stats.innerHTML = [
      ['Всего после склейки', total],
      ['С телефоном', withPhone],
      ['Без сайта', withoutSite],
      ['Склеено дублей', parserDuplicatesMerged]
    ].map(function (p) {
      return '<div' + parserAttr('class', 'p-3 rounded-2xl bg-slate-50 border border-slate-200 text-center') + '><p' + parserAttr('class', 'text-[10px] font-bold text-slate-500 uppercase tracking-wide') + '>' + parserEsc(p[0]) + '</p><h4' + parserAttr('class', 'text-lg font-black text-slate-900') + '>' + p[1] + '</h4></div>';
    }).join('');
  }
  const countEl = parserEl('parser-results-count');
  if (countEl) countEl.textContent = total;
  const body = parserEl('parser-table-body');
  if (!body) return;
  if (!total) {
    body.innerHTML = '<tr><td' + parserAttr('colspan', '8') + parserAttr('class', 'py-10 text-center text-slate-400 text-xs font-bold') + '>Результатов пока нет</td></tr>';
    return;
  }
  body.innerHTML = parserLeads.map(function (l) {
    const urls = (l.map_urls && l.map_urls.length) ? l.map_urls : (l.map_url ? [l.map_url] : []);
    const site = l.website ? '<a' + parserAttr('href', l.website.indexOf('http') === 0 ? l.website : 'https://' + l.website) + parserAttr('target', '_blank') + parserAttr('rel', 'noopener') + parserAttr('class', 'text-brand-blue font-bold hover:underline') + '>' + parserEsc(l.website) + '</a>' : '<span' + parserAttr('class', 'text-amber-600 font-bold') + '>нет сайта</span>';
    const card = urls.length ? urls.map(function (u, i) { return '<a' + parserAttr('href', u) + parserAttr('target', '_blank') + parserAttr('rel', 'noopener') + parserAttr('class', 'text-brand-blue font-bold hover:underline') + '>Карточка' + (urls.length > 1 ? ' ' + (i + 1) : '') + '</a>'; }).join('<br>') : '—';
    const rating = l.rating == null || l.rating === '' ? '—' : '⭐ ' + l.rating + (l.reviews_count ? ' (' + l.reviews_count + ')' : '');
    const srcBadge = (typeof getSourceBadgeHtml === 'function') ? getSourceBadgeHtml(l.source || '') : parserEsc(l.source || '');
    return '<tr' + parserAttr('class', 'hover:bg-slate-50/80 transition-colors align-top') + '>' +
      '<td' + parserAttr('class', 'py-3 px-4 font-bold text-slate-900') + '>' + parserEsc(l.name) + '</td>' +
      '<td' + parserAttr('class', 'py-3 px-4 text-slate-600') + '>' + parserEsc(l.address || '—') + '</td>' +
      '<td' + parserAttr('class', 'py-3 px-4 font-semibold text-slate-800 whitespace-nowrap') + '>' + parserEsc((l.phones || []).join(', ') || '—') + '</td>' +
      '<td' + parserAttr('class', 'py-3 px-4') + '>' + site + '</td>' +
      '<td' + parserAttr('class', 'py-3 px-4 whitespace-nowrap') + '>' + parserEsc(rating) + '</td>' +
      '<td' + parserAttr('class', 'py-3 px-4 text-slate-600') + '>' + parserEsc(l.category || l.niche || '—') + '</td>' +
      '<td' + parserAttr('class', 'py-3 px-4 whitespace-nowrap') + '>' + card + '</td>' +
      '<td' + parserAttr('class', 'py-3 px-4 whitespace-nowrap') + '>' + srcBadge + '</td></tr>';
  }).join('');
  if (window.lucide) lucide.createIcons();
}

function parserHandleFile(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function () {
    const text = String(reader.result || '');
    try {
      if (file.name.toLowerCase().endsWith('.json')) {
        const parsed = JSON.parse(text);
        const arr = Array.isArray(parsed) ? parsed : (parsed.leads || []);
        parserImportLeads(arr);
      } else {
        parserImportLeads(parserParseCsv(text));
      }
    } catch (e) {
      showToast('Не удалось прочитать файл: нужен CSV или JSON из расширения MapLeads Audit (Excel из расширения сначала откройте и сохраните как CSV, либо скачайте экспорт отсюда в XLSX)', 'error');
    }
    input.value = '';
  };
  reader.readAsText(file, 'UTF-8');
}

function parserImportFromTextarea() {
  const ta = parserEl('parser-json-input');
  const text = ta ? ta.value.trim() : '';
  if (!text) { showToast('Вставьте JSON или CSV из расширения в поле импорта', 'warning'); return; }
  try {
    if (text[0] === '[' || text[0] === '{') {
      const parsed = JSON.parse(text);
      parserImportLeads(Array.isArray(parsed) ? parsed : (parsed.leads || []));
    } else {
      parserImportLeads(parserParseCsv(text));
    }
  } catch (e) {
    showToast('Не удалось разобрать вставленные данные: проверьте формат JSON/CSV', 'error');
  }
}

function parserLoadDemoLeads() {
  const city = parserCurrentCity() || 'Краснодар';
  const niche = parserCurrentNicheLabel();
  parserImportLeads([
    { name: 'Салон Ромашка', address: city + ', ул. Красная, 1', phones: ['+7 (912) 390-00-90'], website: '', rating: 4.5, reviewsCount: 21, category: niche, mapUrl: 'https://2gis.ru/krasnodar/firm/123', source: '2ГИС', city: city },
    { name: 'Салон Ромашка', address: city + ', ул. Красная, 1', phones: ['89123900090'], website: 'https://romashka.ru', rating: 4.6, reviewsCount: 25, category: niche, mapUrl: 'https://yandex.ru/maps/org/romashka/456', source: 'Яндекс Карты', city: city },
    { name: 'Барбершоп Бритва', address: city + ', ул. Северная, 200', phones: ['+7 (999) 111-22-33'], website: '', rating: 4.9, reviewsCount: 48, category: niche, mapUrl: 'https://yandex.ru/maps/org/britva/789', source: 'Яндекс Карты', city: city }
  ]);
}

async function parserDownload(format) {
  if (!parserLeads.length) { showToast('Сначала импортируйте результаты сбора — таблица пуста', 'warning'); return; }
  const serviceEl = parserEl('parser-service');
  try {
    const res = await fetch('/api/tools/parser/export/' + format, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ leads: parserLeads, city: parserCurrentCity(), niche: parserCurrentNicheLabel(), service: serviceEl ? serviceEl.value : 'both' }) });
    if (!res.ok) throw new Error('export');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'parser_leads.' + format;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
    showToast('Файл для «AI Офферы» скачивается: колонки совпадают с импортом, переделывать вручную не нужно', 'success');
  } catch (e) {
    showToast('Не удалось сформировать файл экспорта', 'error');
  }
}
