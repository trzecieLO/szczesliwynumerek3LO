'use strict';

// Godzinę i datę liczymy według Polski, nawet jeśli ktoś otworzy stronę za granicą.
const ZONE = 'Europe/Warsaw';
const DAY_NAMES = ['Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek'];
const COLORS = ['mint', 'lavender', 'peach', 'sky', 'pink'];
const datePartsFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
});
const offsetFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: ZONE, timeZoneName: 'shortOffset'
});
const plMonthDay = new Intl.DateTimeFormat('pl-PL', {
  timeZone: 'UTC', day: 'numeric', month: 'long'
});
const plYear = new Intl.DateTimeFormat('pl-PL', {
  timeZone: 'UTC', year: 'numeric'
});

const grid = document.getElementById('weekday-grid');
const title = document.getElementById('week-title');
const badge = document.getElementById('week-badge');
const range = document.getElementById('week-range');
const notice = document.getElementById('notice');
const countdown = document.getElementById('countdown');

let cachedData = null;
let lastViewSignature = '';

function dateFromIso(value) {
  return new Date(`${value}T12:00:00Z`);
}
function isoFromUTCDate(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}
function addDays(iso, count) {
  const dt = dateFromIso(iso);
  dt.setUTCDate(dt.getUTCDate() + count);
  return isoFromUTCDate(dt);
}
function plDate(iso) { return plMonthDay.format(dateFromIso(iso)); }
function warsawNowParts(now = new Date()) {
  const parts = Object.fromEntries(datePartsFormatter.formatToParts(now).map(p => [p.type, p.value]));
  return {
    iso: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour), minute: Number(parts.minute),
    weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday)
  };
}
function expectedMonday(now = new Date()) {
  const p = warsawNowParts(now);
  const monday = addDays(p.iso, -((p.weekday + 6) % 7));
  return (p.weekday === 6 || p.weekday === 0 || (p.weekday === 5 && p.hour >= 18))
    ? addDays(monday, 7) : monday;
}
function nextDrawUTC(now = new Date()) {
  const p = warsawNowParts(now);
  let untilFri = (5 - p.weekday + 7) % 7;
  if (p.weekday === 5 && p.hour >= 18) untilFri = 7;
  const friday = dateFromIso(addDays(p.iso, untilFri));
  const offsetStr = offsetFormatter.formatToParts(friday).find(x => x.type === 'timeZoneName').value;
  const match = offsetStr.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  const offsetMinutes = match ? (match[1] === '+' ? 1 : -1) * (Number(match[2]) * 60 + Number(match[3] || 0)) : 60;
  return Date.UTC(friday.getUTCFullYear(), friday.getUTCMonth(), friday.getUTCDate(), 18, 0, 0) - offsetMinutes * 60000;
}
function formatCountdown(now = new Date()) {
  const seconds = Math.max(0, Math.floor((nextDrawUTC(now) - now.getTime()) / 1000));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return [
    [days, 'dni'], [hours, 'godz.'], [minutes, 'min'], [secs, 'sek']
  ].map(([n, name], idx) => `<span class="countdown__part"><span class="countdown__number">${String(n).padStart(2, '0')}</span><span class="countdown__label">${name}</span></span>${idx < 3 ? '<span class="countdown__colon" aria-hidden="true">:</span>' : ''}`).join('');
}
function weekRangeText(data) {
  const start = dateFromIso(data.weekStart);
  const end = dateFromIso(data.weekEnd);
  const sameMonth = start.getUTCFullYear() === end.getUTCFullYear() && start.getUTCMonth() === end.getUTCMonth();
  const year = plYear.format(end);
  if (sameMonth) return `${start.getUTCDate()}–${plDate(data.weekEnd)} ${year}`;
  const firstYear = start.getUTCFullYear() !== end.getUTCFullYear() ? ` ${plYear.format(start)}` : '';
  return `${plDate(data.weekStart)}${firstYear} – ${plDate(data.weekEnd)} ${year}`;
}
function validateResults(data) {
  if (!data || typeof data.weekStart !== 'string' || !/^\d{4}-\d\d-\d\d$/.test(data.weekStart) || !Array.isArray(data.days) || data.days.length !== 5) return false;
  if (data.weekEnd !== addDays(data.weekStart, 4)) return false;
  const found = [];
  for (let i = 0; i < 5; i++) {
    const item = data.days[i];
    if (!item || item.date !== addDays(data.weekStart, i) || !Array.isArray(item.numbers) || item.numbers.length !== 2) return false;
    for (const n of item.numbers) {
      if (!Number.isInteger(n) || n < data.minNumber || n > data.maxNumber) return false;
      found.push(n);
    }
  }
  return new Set(found).size === 10;
}
function render() {
  if (!cachedData) return;
  const today = warsawNowParts();
  const expected = expectedMonday();
  const data = cachedData;
  const signature = `${data.weekStart}|${data.drawnAt}|${today.iso}|${expected}`;
  if (signature === lastViewSignature) return;
  lastViewSignature = signature;

  const future = data.weekStart > today.iso;
  const stale = data.weekStart < expected;
  const currentWeek = data.weekStart === expected;
  title.innerHTML = `${future ? 'Numerki na przyszły tydzień' : 'Numerki na ten tydzień'}<span class="heading-period">.</span>`;
  range.textContent = weekRangeText(data);
  badge.innerHTML = `<span class="week-badge__dot"></span>${future ? 'Już wylosowane!' : currentWeek ? 'Aktualne wyniki' : 'Ostatnie wyniki'}`;
  notice.hidden = !stale;
  if (stale) notice.textContent = 'Nowe losowanie jest jeszcze publikowane. Poniżej widzisz wyniki z poprzedniego tygodnia. Strona sprawdza aktualizację automatycznie.';

  grid.innerHTML = data.days.map((item, i) => {
    const isToday = !stale && item.date === today.iso;
    return `<article class="day-card day-card--${COLORS[i]}${isToday ? ' day-card--today' : ''}" aria-label="${DAY_NAMES[i]} ${plDate(item.date)}. Szczęśliwe numerki: ${item.numbers[0]} i ${item.numbers[1]}">
      <div class="day-card__top"><span class="day-card__sequence">DZIEŃ 0${i + 1}</span>${isToday ? '<span class="day-card__today">DZISIAJ ✦</span>' : ''}</div>
      <h3 class="day-card__day">${DAY_NAMES[i]}</h3>
      <p class="day-card__date">${plDate(item.date)}</p>
      <div class="day-card__numbers"><span class="number-token">${item.numbers[0]}</span><span class="number-token">${item.numbers[1]}</span></div>
      <div class="day-card__bottom"><span aria-hidden="true">✦</span> szczęśliwe numerki</div>
    </article>`;
  }).join('');
  grid.setAttribute('aria-busy', 'false');
}
async function refreshResults() {
  try {
    // Wymusza sprawdzenie aktualnego JSON także po pozostawieniu karty otwartej.
    const response = await fetch(`data/results.json?v=${Date.now()}`, {cache: 'no-store'});
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!validateResults(data)) throw new Error('Błędne dane losowania');
    cachedData = data;
    render();
  } catch (error) {
    console.error('Nie udało się pobrać wyników:', error);
    if (!cachedData) {
      grid.innerHTML = '<div class="placeholder">Nie udało się pobrać numerków. Odśwież stronę lub spróbuj za chwilę.</div>';
      grid.setAttribute('aria-busy', 'false');
      range.textContent = 'Brak połączenia z plikiem wyników';
    }
  }
}
function tick() {
  countdown.innerHTML = formatCountdown();
  // O północy / w piątek o 18:00 odśwież etykiety nawet bez nowego pliku.
  render();
}

refreshResults();
tick();
setInterval(tick, 1000);
setInterval(refreshResults, 45_000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) { refreshResults(); tick(); }
});
