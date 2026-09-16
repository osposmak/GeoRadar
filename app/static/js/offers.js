// GeoRadar CRM — модуль «AI Офферы» (холодный обзвон с нейросетью)
// Доступ только для администраторов: токен сессии хранится в localStorage.

const OFFERS_TOKEN_KEY = 'georadar_admin_token';
const CALL_STATUSES = {
  'Новый':        { badge: 'bg-slate-100 text-slate-600 border-slate-200',       icon: 'circle-dot' },
  'Согласие':     { badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',  icon: 'check-check' },
  'Отказ':        { badge: 'bg-rose-50 text-rose-700 border-rose-200',           icon: 'phone-off' },
  'Перезвонить':  { badge: 'bg-amber-50 text-amber-700 border-amber-200',        icon: 'phone-forwarded' },
  'Не дозвонился':{ badge: 'bg-blue-50 text-blue-700 border-blue-200',           icon: 'phone-missed' }
};

let offersFilterTimeout = null;
let offersGenerating = false;
let offersGenerationStop = false;
let offersAiConfigured = true;

// ---------- Токен и обёртка fetch ----------

function getOffersToken() {
  return localStorage.getItem(OFFERS_TOKEN_KEY) || '';
}

function setOffersToken(token) {
  if (token) localStorage.setItem(OFFERS_TOKEN_KEY, token);
  else localStorage.removeItem(OFFERS_TOKEN_KEY);
}

async function offersFetch(url, options = {}) {
  const headers = Object.assign({}, options.headers || {});
  const token = getOffersToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (options.body && !(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(url, Object.assign({}, options, { headers }));
  if (res.status === 401) {
    setOffersToken('');
    showOffersGate(true);
    throw new Error('Требуется вход администратора');
  }
  return res;
}

async function offersErrorMessage(res, fallback) {
  try {
    const data = await res.json();
    return data.detail || fallback;
  } catch (e) {
    return fallback;
  }
}

// ---------- Инициализация вкладки ----------

async function initOffersTab() {
  const token = getOffersToken();
  if (!token) {
    showOffersGate(true);
    return;
  }
  try {
    const res = await offersFetch('/api/offers/stats');
    if (!res.ok) throw new Error('unauthorized');
    showOffersGate(false);
    await refreshOffersStats();
    await loadOffersLeads();
  } catch (e) {
    // 401 уже показал экран входа; остальное — тоже показываем вход
    showOffersGate(true);
  }
}

function showOffersGate(showLogin) {
  document.getElementById('offers-login').classList.toggle('hidden', !showLogin);
  document.getElementById('offers-tool').classList.toggle('hidden', showLogin);
  if (!showLogin) lucide.createIcons();
}

async function handleOffersLogin(e) {
  e.preventDefault();
  const errorBox = document.getElementById('offers-login-error');
  const submitBtn = document.getElementById('offers-login-submit');
  errorBox.classList.add('hidden');

  submitBtn.disabled = true;
  submitBtn.innerHTML = `<i data-lucide="loader" class="w-4 h-4 animate-spin"></i><span>Проверяю…</span>`;
  lucide.createIcons();

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: document.getElementById('offers-login-username').value.trim(),
        password: document.getElementById('offers-login-password').value
      })
    });
    if (!res.ok) {
      const detail = await offersErrorMessage(res, 'Неверный логин или пароль');
      throw new Error(detail);
    }
    const data = await res.json();
    setOffersToken(data.token);

    document.getElementById('offers-login-password').value = '';
    showOffersGate(false);
    showToast(`Добро пожаловать, ${data.username}! Панель офферов разблокирована.`, 'success');
    playSound('safe');
    await refreshOffersStats();
    await loadOffersLeads();
  } catch (err) {
    errorBox.textContent = err.message;
    errorBox.classList.remove('hidden');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = `<i data-lucide="log-in" class="w-4 h-4"></i><span>Войти в панель</span>`;
    lucide.createIcons();
  }
}

async function handleOffersLogout() {
  try { await offersFetch('/api/auth/logout', { method: 'POST' }); } catch (e) {}
  setOffersToken('');
  showOffersGate(true);
  showToast('Вы вышли из панели администратора', 'info');
}

// ---------- Статистика ----------

async function refreshOffersStats() {
  try {
    const res = await offersFetch('/api/offers/stats');
    if (!res.ok) return;
    const s = await res.json();

    document.getElementById('offers-stat-total').innerText = s.total;
    document.getElementById('offers-stat-with-offer').innerText = s.with_offer;
    document.getElementById('offers-stat-agreed').innerText = s.by_status['Согласие'] || 0;
    document.getElementById('offers-stat-refused').innerText = s.by_status['Отказ'] || 0;

    const badge = document.getElementById('badge-offers-count');
    if (badge) {
      badge.innerText = s.total;
      badge.classList.toggle('hidden', s.total === 0);
    }
  } catch (e) {
    console.warn('Offers stats:', e.message);
  }
}

// ---------- Загрузка таблицы ----------

async function handleOffersUpload(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  await uploadOffersFile(file);
  input.value = '';
}

async function uploadOffersFile(file) {
  const dropzone = document.getElementById('offers-dropzone');
  const formData = new FormData();
  formData.append('file', file);

  dropzone.innerHTML = `
    <i data-lucide="loader" class="w-10 h-10 mx-auto mb-2 text-violet-200 animate-spin"></i>
    <p class="text-sm font-bold">Загружаю «${file.name}»…</p>
  `;
  lucide.createIcons();

  try {
    const res = await offersFetch('/api/offers/upload', { method: 'POST', body: formData });
    if (!res.ok) throw new Error(await offersErrorMessage(res, 'Ошибка загрузки файла'));
    const data = await res.json();
    showToast(data.message, 'success');
    playSound('safe');
    await refreshOffersStats();
    await loadOffersLeads();
  } catch (err) {
    showToast(err.message, 'error');
    playSound('danger');
  } finally {
    restoreDropzone();
  }
}

function restoreDropzone() {
  const dropzone = document.getElementById('offers-dropzone');
  dropzone.innerHTML = `
    <i data-lucide="file-spreadsheet" class="w-10 h-10 mx-auto mb-2 text-violet-200"></i>
    <p class="text-sm font-bold">Перетащите Excel/CSV сюда</p>
    <p class="text-[11px] text-brand-soft mt-1">или нажмите, чтобы выбрать файл (.xlsx, .csv) — колонки «Компания», «Телефон» определяются автоматически</p>
    <input type="file" id="offers-file-input" accept=".xlsx,.xls,.csv" class="hidden" onchange="handleOffersUpload(this)">
  `;
  lucide.createIcons();
  attachDropzoneEvents();
}

function attachDropzoneEvents() {
  const dropzone = document.getElementById('offers-dropzone');
  if (!dropzone) return;
  ['dragenter', 'dragover'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropzone.classList.add('border-white', 'bg-white/20');
    });
  });
  ['dragleave', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropzone.classList.remove('border-white', 'bg-white/20');
    });
  });
  dropzone.addEventListener('drop', (e) => {
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) uploadOffersFile(file);
  });
}

// ---------- Список лидов ----------

function debounceOffersFilter() {
  clearTimeout(offersFilterTimeout);
  offersFilterTimeout = setTimeout(() => loadOffersLeads(), 300);
}

async function loadOffersLeads() {
  if (!getOffersToken()) return;
  const container = document.getElementById('offers-leads-list');
  const search = document.getElementById('offers-search')?.value.trim() || '';
  const status = document.getElementById('offers-status-filter')?.value || 'Все';

  const params = new URLSearchParams();
  if (search) params.append('search', search);
  if (status !== 'Все') params.append('status', status);

  container.innerHTML = `
    <div class="bg-white rounded-2xl border border-slate-200 shadow-xs py-12 text-center text-slate-400">
      <i data-lucide="loader" class="w-6 h-6 animate-spin mx-auto mb-2 text-violet-500"></i>
      <p class="text-xs font-bold">Загружаю базу обзвона…</p>
    </div>
  `;
  lucide.createIcons();

  try {
    const res = await offersFetch(`/api/offers/leads?${params.toString()}`);
    if (!res.ok) throw new Error('Не удалось загрузить лиды');
    const leads = await res.json();
    renderOffersLeads(leads);
  } catch (err) {
    if (err.message === 'Требуется вход администратора') return;
    container.innerHTML = `
      <div class="bg-white rounded-2xl border border-rose-200 shadow-xs py-10 text-center text-rose-500 text-xs font-bold">${err.message}</div>
    `;
  }
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[ch]);
}

function formatDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso + (iso.endsWith('Z') ? '' : 'Z'));
  if (isNaN(d)) return '';
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// ---------- Сайт компании и телефоны ----------

// Домены без схемы (http://…) считаем сайтом только в популярных зонах.
const OFFERS_TRUSTED_TLDS = new Set([
  'ru', 'рф', 'рус', 'москва', 'com', 'net', 'org', 'su', 'io', 'biz', 'info',
  'site', 'online', 'shop', 'store', 'pro', 'club', 'tech', 'space', 'life',
  'top', 'xyz', 'me', 'app', 'dev', 'cloud', 'media', 'studio', 'agency',
  'digital', 'market', 'expert', 'company', 'business', 'name', 'mobi', 'tv',
  'kz', 'by', 'ua', 'uz', 'am', 'ge', 'md', 'az', 'kg', 'tj',
  'xn--p1ai', 'xn--80asehdb'
]);

// Агрегаторы, карты и мессенджеры: их ссылки сайтом компании не считаем.
const OFFERS_BLOCKED_DOMAINS = [
  '2gis.ru', '2gis.com', '2gis.kz', '2gis.by', 'yandex.ru', 'yandex.com', 'ya.ru',
  'google.com', 'google.ru', 'goo.gl', 'maps.google.com', 'g.page', 'avito.ru',
  'wa.me', 'api.whatsapp.com', 'whatsapp.com', 't.me', 'telegram.me', 'telegram.org',
  'vk.com', 'vk.ru', 'instagram.com', 'facebook.com', 'fb.me', 'ok.ru',
  'youtube.com', 'youtu.be', 'dzen.ru', 'ozon.ru', 'wildberries.ru',
  'market.yandex.ru', 'maps.yandex.ru'
];

// Текстовые статусы вместо ссылки: «🚫 Нет сайта в карточке», «Слабые места · 40/100».
const OFFERS_WEBSITE_STATUS_RE = /(нет\s*сайт|без\s*сайт|отсутств|не\s*указан|слабые\s*места|проверк|конструктор|поддомен|не\s*работает|брошен|ошибк|на\s*продаже|заглушк)/i;

// Домен: латиница и кириллица (зоны .рф, .рус). Без «g»-флага — для .match() ниже.
const OFFERS_DOMAIN_RE = /((?:[A-Za-z0-9\u0400-\u04FF](?:[A-Za-z0-9\u0400-\u04FF-]*[A-Za-z0-9\u0400-\u04FF])?\.)+[A-Za-z\u0400-\u04FF][A-Za-z0-9\u0400-\u04FF-]{1,})/g;

/**
 * Достаёт домен сайта из значения поля «Сайт».
 * Возвращает '' для текстовых статусов («Нет сайта в карточке») и ссылок
 * на карты/мессенджеры, иначе — домен без схемы и без «www.».
 */
function websiteDomain(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const hasScheme = /https?:\/\//i.test(raw) || /(^|[\s(])www\./i.test(raw);
  if (!hasScheme && OFFERS_WEBSITE_STATUS_RE.test(raw)) return '';

  const candidates = raw.match(OFFERS_DOMAIN_RE) || [];
  for (const candidate of candidates) {
    const domain = candidate.toLowerCase().replace(/^www\./, '');
    const blocked = OFFERS_BLOCKED_DOMAINS.some(b => domain === b || domain.endsWith('.' + b));
    if (blocked) continue;
    const tld = domain.split('.').pop();
    if (hasScheme || OFFERS_TRUSTED_TLDS.has(tld)) return domain;
  }
  return '';
}

/** Ссылка для перехода на сайт компании (или '' если сайта нет). */
function websiteUrl(value) {
  const domain = websiteDomain(value);
  return domain ? `https://${domain}` : '';
}

/** Телефоны из строки хранятся через запятую: «+735...,+798...». */
function splitPhones(value) {
  return String(value || '')
    .split(/[,;]+/)
    .map(part => part.trim())
    .filter(Boolean)
    .slice(0, 5);
}

/** Значение для href="tel:". */
function telHref(value) {
  let digits = String(value || '').replace(/[^\d+]/g, '');
  if (digits.length === 11 && digits.startsWith('8')) digits = '+7' + digits.slice(1);
  return digits;
}

/** Читабельный вид российского номера: +7 (353) 290-42-00. */
function formatPhone(value) {
  const raw = splitPhones(value)[0] || String(value || '').trim();
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8'))) {
    return `+7 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9, 11)}`;
  }
  if (digits.length === 10) {
    return `+7 (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 8)}-${digits.slice(8, 10)}`;
  }
  return raw;
}

function renderOffersLeads(leads) {
  const container = document.getElementById('offers-leads-list');

  if (leads.length === 0) {
    container.innerHTML = `
      <div class="bg-white rounded-3xl border border-slate-200 shadow-xs py-16 text-center relative overflow-hidden">
        <div class="absolute -right-16 -top-16 w-64 h-64 bg-violet-100/50 rounded-full blur-3xl pointer-events-none"></div>
        <div class="relative z-10 space-y-3">
          <div class="w-16 h-16 rounded-2xl bg-violet-50 text-violet-400 flex items-center justify-center mx-auto">
            <i data-lucide="inbox" class="w-8 h-8"></i>
          </div>
          <p class="font-black text-sm text-slate-700">База обзвона пуста</p>
          <p class="text-xs text-slate-400 max-w-sm mx-auto">Загрузите Excel/CSV таблицу с компаниями и телефонами в поле сверху — и нажмите «Сгенерировать лиды», чтобы ИИ подготовил офферы для звонков.</p>
        </div>
      </div>
    `;
    lucide.createIcons();
    return;
  }

  container.innerHTML = leads.map(lead => {
    const st = CALL_STATUSES[lead.call_status] || CALL_STATUSES['Новый'];
    const hasOffer = Boolean(lead.offer_text);
    const siteDomain = websiteDomain(lead.website);
    const siteHref = websiteUrl(lead.website);
    const phoneNumbers = splitPhones(lead.phone);

    return `
    <div class="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden" id="offer-lead-${lead.id}">
      <div class="p-4 sm:p-5 flex flex-col lg:flex-row gap-4">

        <!-- Левая колонка: компания и телефон -->
        <div class="w-full lg:w-80 lg:shrink-0 min-w-0 space-y-2.5">
          <div class="flex items-start justify-between gap-2 min-w-0">
            <div class="flex items-start gap-2.5 min-w-0">
              <div class="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-deep to-brand-blue text-white flex items-center justify-center font-black text-xs shrink-0 mt-0.5">
                ${esc((lead.company_name || '?')[0].toUpperCase())}
              </div>
              <div class="min-w-0">
                <h4 class="font-black text-sm text-slate-900 leading-snug break-words" title="${esc(lead.company_name)}">${esc(lead.company_name)}</h4>
                <div class="flex flex-wrap gap-1 mt-1">
                  ${lead.niche ? `<span class="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-blue-50 text-brand-deep border border-blue-100">${esc(lead.niche)}</span>` : ''}
                  ${lead.city ? `<span class="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-slate-50 text-slate-600 border border-slate-200">📍 ${esc(lead.city)}</span>` : ''}
                  ${siteDomain
                    ? `<span class="inline-block max-w-full truncate align-bottom text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-100" title="Сайт: ${esc(siteDomain)}">🌐 ${esc(siteDomain)}</span>`
                    : `<span class="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-100">🚫 без сайта</span>`}
                </div>
              </div>
            </div>
          </div>

          ${phoneNumbers.length ? `
            <div class="flex items-start gap-2 min-w-0">
              <div class="flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0 flex-1">
                ${phoneNumbers.map((number, index) => `
                  <a href="tel:${esc(telHref(number))}" title="Позвонить ${esc(formatPhone(number))}"
                    class="inline-flex items-center gap-1 max-w-full ${index === 0 ? 'text-base' : 'text-sm'} font-black text-brand-deep hover:text-brand-blue transition-colors">
                    <i data-lucide="phone" class="w-3.5 h-3.5 shrink-0"></i><span class="break-all">${esc(formatPhone(number))}</span>
                  </a>
                `).join('')}
              </div>
              <button onclick="copyOffersText('${esc(phoneNumbers.join(', '))}', this)" title="Скопировать номера"
                class="shrink-0 p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 transition-colors">
                <i data-lucide="copy" class="w-3.5 h-3.5"></i>
              </button>
            </div>
          ` : `<p class="text-xs text-slate-400 italic">Телефон не указан</p>`}

          ${lead.address ? `<p class="text-[11px] text-slate-500 leading-snug break-words">${esc(lead.address)}</p>` : ''}
          ${lead.extra_info ? `<p class="text-[10px] text-slate-400 leading-snug line-clamp-2 break-words" title="${esc(lead.extra_info)}">${esc(lead.extra_info)}</p>` : ''}

          <!-- Статус звонка -->
          <div class="flex flex-wrap gap-1.5 pt-1">
            ${['Согласие', 'Отказ', 'Перезвонить', 'Не дозвонился'].map(s => {
              const cfg = CALL_STATUSES[s];
              const isActive = lead.call_status === s;
              return `
                <button onclick="setOfferCallStatus(${lead.id}, '${s}')" ${offersGenerating ? 'disabled' : ''}
                  class="offers-status-btn px-2.5 py-1.5 rounded-xl text-[11px] font-bold border transition-all flex items-center gap-1 ${isActive ? cfg.badge + ' ring-2 ring-offset-1 ring-slate-300' : 'bg-white text-slate-400 border-slate-200 hover:bg-slate-50'}">
                  <i data-lucide="${cfg.icon}" class="w-3 h-3"></i>${s}
                </button>
              `;
            }).join('')}
          </div>
          ${lead.called_at ? `<p class="text-[10px] text-slate-400">Отметка: ${formatDateTime(lead.called_at)}</p>` : ''}

          <!-- Заметка оператора -->
          <textarea rows="2" placeholder="Заметка по разговору… (сохранится автоматически)"
            onchange="saveOfferNotes(${lead.id}, this.value)"
            class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:border-violet-400 outline-none resize-none">${esc(lead.call_notes || '')}</textarea>
        </div>

        <!-- Правая колонка: оффер от нейросети -->
        <div class="flex-1 min-w-0">
          ${hasOffer ? `
            <div class="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50/80 via-white to-blue-50/50 p-4 space-y-3 h-full">
              <div class="flex items-center justify-between gap-2 border-b border-violet-100 pb-2.5">
                <span class="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-violet-700">
                  <i data-lucide="sparkles" class="w-3.5 h-3.5"></i>
                  Готовый шаблон звонка
                </span>
                <div class="flex items-center gap-1.5">
                  <button onclick="generateOfferForLead(${lead.id})" ${offersGenerating ? 'disabled' : ''} title="Перегенерировать оффер"
                    class="p-1.5 rounded-lg bg-white border border-violet-200 hover:bg-violet-50 text-violet-600 transition-colors disabled:opacity-50">
                    <i data-lucide="refresh-cw" class="w-3 h-3"></i>
                  </button>
                  <button onclick="copyOfferFull(${lead.id}, this)"
                    class="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-violet-600 hover:bg-violet-700 text-white transition-colors flex items-center gap-1">
                    <i data-lucide="clipboard-copy" class="w-3 h-3"></i>
                    Скопировать скрипт
                  </button>
                </div>
              </div>
              <div class="space-y-2.5 text-xs leading-relaxed max-h-96 overflow-y-auto pr-1 offers-offer-scroll">
                ${lead.offer_hook ? `
                  <div>
                    <p class="text-[10px] font-black uppercase tracking-wider text-rose-500 mb-0.5">🪝 Крючок · первые секунды</p>
                    <p class="text-slate-800 font-medium whitespace-pre-line">${esc(lead.offer_hook)}</p>
                  </div>
                ` : ''}
                ${lead.offer_text ? `
                  <div>
                    <p class="text-[10px] font-black uppercase tracking-wider text-violet-600 mb-0.5">💼 Шаблон разговора по шагам</p>
                    <p class="text-slate-800 font-medium whitespace-pre-line">${esc(lead.offer_text)}</p>
                  </div>
                ` : ''}
                ${lead.offer_objections ? `
                  <div>
                    <p class="text-[10px] font-black uppercase tracking-wider text-amber-600 mb-0.5">🛡 Если возражают</p>
                    <p class="text-slate-700 whitespace-pre-line">${esc(lead.offer_objections)}</p>
                  </div>
                ` : ''}
                ${lead.offer_closing ? `
                  <div>
                    <p class="text-[10px] font-black uppercase tracking-wider text-emerald-600 mb-0.5">✅ Закрытие</p>
                    <p class="text-slate-800 font-semibold whitespace-pre-line">${esc(lead.offer_closing)}</p>
                  </div>
                ` : ''}
              </div>
              <p class="text-[10px] text-slate-400 border-t border-violet-100 pt-2">
                Сгенерировано ${formatDateTime(lead.offer_generated_at)} · проверьте факты перед звонком
              </p>
            </div>
          ` : lead.offer_error ? `
            <div class="rounded-2xl border border-rose-200 bg-rose-50/60 p-4 h-full flex flex-col items-center justify-center gap-2 text-center">
              <i data-lucide="alert-triangle" class="w-6 h-6 text-rose-400"></i>
              <p class="text-xs font-bold text-rose-600">Не удалось сгенерировать оффер</p>
              <p class="text-[11px] text-rose-500 max-w-md">${esc(lead.offer_error)}</p>
              <button onclick="generateOfferForLead(${lead.id})" class="mt-1 text-[11px] font-bold px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white transition-colors flex items-center gap-1.5">
                <i data-lucide="refresh-cw" class="w-3 h-3"></i> Повторить
              </button>
            </div>
          ` : `
            <div class="rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 p-4 h-full flex flex-col items-center justify-center gap-2 text-center">
              <i data-lucide="bot" class="w-6 h-6 text-slate-300"></i>
              <p class="text-xs font-bold text-slate-500">Оффер ещё не сгенерирован</p>
              <button onclick="generateOfferForLead(${lead.id})" ${offersGenerating ? 'disabled' : ''}
                class="text-[11px] font-bold px-3 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white transition-colors flex items-center gap-1.5 disabled:opacity-50">
                <i data-lucide="sparkles" class="w-3 h-3"></i>
                Сгенерировать для этой компании
              </button>
            </div>
          `}
        </div>
      </div>

      <!-- Нижняя панель: сайт и удаление -->
      <div class="bg-slate-50 border-t border-slate-100 px-4 py-2 flex flex-wrap items-center justify-between gap-2">
        <div class="flex items-center gap-2 min-w-0">
          <span class="text-[10px] text-slate-400 font-mono truncate">#${lead.id}${lead.source_file ? ` · ${esc(lead.source_file)}` : ''}</span>
          ${siteHref ? `
            <a href="${esc(siteHref)}" target="_blank" rel="noopener noreferrer" title="Открыть ${esc(siteDomain)} в новой вкладке"
              class="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold transition-colors shrink-0">
              <i data-lucide="external-link" class="w-3 h-3"></i>
              Проверить сайт
            </a>
          ` : ''}
        </div>
        <button onclick="deleteOfferLead(${lead.id})" class="text-[11px] font-bold text-slate-400 hover:text-rose-600 transition-colors flex items-center gap-1 shrink-0">
          <i data-lucide="trash-2" class="w-3 h-3"></i> Удалить
        </button>
      </div>
    </div>
    `;
  }).join('');

  lucide.createIcons();
}

// ---------- Действия с лидами ----------

async function generateOfferForLead(leadId) {
  const card = document.getElementById(`offer-lead-${leadId}`);
  if (card) {
    const box = card.querySelector('.flex-1.min-w-0');
    if (box) {
      box.innerHTML = `
        <div class="rounded-2xl border border-violet-200 bg-violet-50/60 p-4 h-full flex flex-col items-center justify-center gap-2 text-center">
          <i data-lucide="loader" class="w-6 h-6 text-violet-500 animate-spin"></i>
          <p class="text-xs font-bold text-violet-700">Нейросеть составляет оффер…</p>
          <p class="text-[11px] text-violet-400">Обычно занимает 10–30 секунд</p>
        </div>
      `;
      lucide.createIcons();
    }
  }

  try {
    const res = await offersFetch(`/api/offers/leads/${leadId}/generate`, { method: 'POST' });
    if (!res.ok) throw new Error(await offersErrorMessage(res, 'Ошибка генерации оффера'));
    showToast('Оффер готов!', 'success');
    playSound('pop');
  } catch (err) {
    if (err.message !== 'Требуется вход администратора') {
      showToast(err.message, 'error');
    }
  }
  await loadOffersLeads();
  await refreshOffersStats();
}

async function setOfferCallStatus(leadId, status) {
  try {
    const res = await offersFetch(`/api/offers/leads/${leadId}`, {
      method: 'PATCH',
      body: JSON.stringify({ call_status: status })
    });
    if (!res.ok) throw new Error(await offersErrorMessage(res, 'Не удалось сохранить статус'));
    playSound(status === 'Согласие' ? 'safe' : 'pop');
    showToast(`Статус «${status}» сохранён`, 'success');
    await loadOffersLeads();
    await refreshOffersStats();
  } catch (err) {
    if (err.message !== 'Требуется вход администратора') showToast(err.message, 'error');
  }
}

async function saveOfferNotes(leadId, notes) {
  try {
    const res = await offersFetch(`/api/offers/leads/${leadId}`, {
      method: 'PATCH',
      body: JSON.stringify({ call_notes: notes })
    });
    if (!res.ok) throw new Error('Не удалось сохранить заметку');
  } catch (err) {
    if (err.message !== 'Требуется вход администратора') showToast(err.message, 'error');
  }
}

async function deleteOfferLead(leadId) {
  if (!confirm(`Удалить лид #${leadId} из базы обзвона?`)) return;
  try {
    const res = await offersFetch(`/api/offers/leads/${leadId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Ошибка удаления');
    showToast('Лид удалён', 'info');
    playSound('pop');
    await loadOffersLeads();
    await refreshOffersStats();
  } catch (err) {
    if (err.message !== 'Требуется вход администратора') showToast(err.message, 'error');
  }
}

async function confirmOffersClear() {
  if (!confirm('Удалить ВСЮ базу обзвона (все загруженные лиды и офферы)? Действие необратимо.')) return;
  try {
    const res = await offersFetch('/api/offers/clear', { method: 'POST' });
    if (!res.ok) throw new Error('Ошибка очистки базы');
    showToast('База обзвона полностью очищена', 'success');
    playSound('pop');
    await loadOffersLeads();
    await refreshOffersStats();
  } catch (err) {
    if (err.message !== 'Требуется вход администратора') showToast(err.message, 'error');
  }
}

// ---------- Массовая генерация офферов ----------

async function startOffersGeneration() {
  if (offersGenerating) return;

  let targets = [];
  try {
    const res = await offersFetch('/api/offers/leads?only_without_offer=true&limit=2000');
    if (!res.ok) throw new Error('Не удалось получить список лидов');
    targets = await res.json();
  } catch (err) {
    if (err.message !== 'Требуется вход администратора') showToast(err.message, 'error');
    return;
  }

  if (targets.length === 0) {
    showToast('Все лиды уже с офферами! Загрузите новую таблицу.', 'info');
    return;
  }

  if (!confirm(`Нейросеть составит офферы для ${targets.length} компаний. Продолжить?`)) return;

  offersGenerating = true;
  offersGenerationStop = false;
  setOffersGeneratingUi(true);

  let done = 0, failed = 0;
  const total = targets.length;
  const progressBox = document.getElementById('offers-progress-box');
  const progressBar = document.getElementById('offers-progress-bar');
  const progressDetail = document.getElementById('offers-progress-detail');

  progressBox.classList.remove('hidden');

  for (const lead of targets) {
    if (offersGenerationStop) break;
    progressDetail.innerText = `Обработано ${done + failed} из ${total} · ошибок: ${failed}`;
    progressBar.style.width = `${Math.round(((done + failed) / total) * 100)}%`;

    try {
      const res = await offersFetch(`/api/offers/leads/${lead.id}/generate`, { method: 'POST' });
      if (!res.ok) throw new Error(await offersErrorMessage(res, 'ошибка'));
      done++;
    } catch (err) {
      failed++;
      if (err.message === 'Требуется вход администратора') break;
    }

    // Обновляем список каждые 3 лида, чтобы оператор видел готовые офферы на ходу
    if ((done + failed) % 3 === 0) {
      await loadOffersLeads();
    }
  }

  offersGenerating = false;
  setOffersGeneratingUi(false);
  progressBox.classList.add('hidden');

  await loadOffersLeads();
  await refreshOffersStats();

  if (offersGenerationStop) {
    showToast(`Генерация остановлена: готово офферов ${done}, ошибок ${failed}`, 'warning');
  } else if (failed === 0) {
    showToast(`Готово! Офферы составлены для ${done} компаний 🎉`, 'success');
    playSound('safe');
  } else {
    showToast(`Готово: ${done} офферов, ошибок ${failed}. Ошибки можно повторить кнопкой у лида.`, 'warning');
  }
}

function stopOffersGeneration() {
  offersGenerationStop = true;
}

function setOffersGeneratingUi(busy) {
  const btn = document.getElementById('offers-generate-btn');
  if (btn) {
    btn.disabled = busy;
    btn.innerHTML = busy
      ? `<i data-lucide="loader" class="w-4 h-4 animate-spin"></i><span>Генерирую…</span>`
      : `<i data-lucide="zap" class="w-4 h-4"></i><span>Сгенерировать лиды</span>`;
  }
  document.querySelectorAll('.offers-status-btn').forEach(b => b.disabled = busy);
  lucide.createIcons();
}

// ---------- Копирование ----------

function copyOffersText(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    if (btn) {
      const icon = btn.querySelector('svg');
      btn.classList.add('text-emerald-600');
      setTimeout(() => btn.classList.remove('text-emerald-600'), 1200);
    }
    showToast('Скопировано: ' + text, 'info');
  });
}

function copyOfferFull(leadId, btn) {
  const card = document.getElementById(`offer-lead-${leadId}`);
  if (!card) return;
  const sections = card.querySelectorAll('.offers-offer-scroll > div');
  let text = '';
  sections.forEach(section => {
    const label = section.querySelector('p')?.innerText || '';
    const body = Array.from(section.querySelectorAll('p')).slice(1).map(p => p.innerText).join('\n');
    text += `${label}\n${body}\n\n`;
  });

  navigator.clipboard.writeText(text.trim()).then(() => {
    const original = btn.innerHTML;
    btn.innerHTML = `<i data-lucide="check" class="w-3 h-3"></i> Скопировано!`;
    lucide.createIcons();
    setTimeout(() => { btn.innerHTML = original; lucide.createIcons(); }, 1800);
    playSound('pop');
  });
}

// ---------- Drag & drop + старт ----------

document.addEventListener('DOMContentLoaded', () => {
  attachDropzoneEvents();
});
