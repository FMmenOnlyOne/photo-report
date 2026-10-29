'use strict';

const $ = (sel) => document.querySelector(sel);

const stageOrder = ['before', 'during', 'after'];
const stageLabel = { before: 'До', during: 'Во время', after: 'После' };
const stageFile = { before: 'before', during: 'during', after: 'after' };

const state = {
  role: null,        // 'worker' | 'manager'
  userName: '',
  currentObjectId: null,
  currentOrderId: null,
};

let navStack = [];
let pendingStage = null;

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function statusClass(s) {
  if (s === 'Завершён') return 'badge-ok';
  if (s === 'Приостановлен') return 'badge-warn';
  return 'badge-info';
}

/* ---------- навигация ---------- */

function showScreen(id) {
  document.querySelectorAll('.screen').forEach((s) => { s.hidden = true; });
  const el = document.getElementById(id);
  if (el) el.hidden = false;
  $('#topbar').hidden = (id === 'screen-login');
  window.scrollTo(0, 0);
}

function setTitle(title) { $('#topbar-title').textContent = title; }

function goBack() {
  if (navStack.length <= 1) return;
  navStack.pop();
  const prev = navStack[navStack.length - 1];
  setTitle(prev.title);
  showScreen(prev.id);
  if (prev.id === 'screen-objects') renderObjects();
  else if (prev.id === 'screen-orders') renderOrders(prev.objectId);
  else if (prev.id === 'screen-order') renderOrderDetail(prev.orderId);
}

function goObjects() {
  navStack = [{ id: 'screen-objects', title: 'Объекты' }];
  setTitle('Объекты');
  showScreen('screen-objects');
  renderObjects();
}

function goObjectForm(objectId) {
  navStack.push({ id: 'screen-object-form', title: objectId ? 'Объект' : 'Новый объект', objectId });
  setTitle(objectId ? 'Объект' : 'Новый объект');
  showScreen('screen-object-form');
  setupObjectForm(objectId);
}

function goOrders(objectId) {
  state.currentObjectId = objectId;
  navStack.push({ id: 'screen-orders', title: 'Заказы', objectId });
  setTitle('Заказы');
  showScreen('screen-orders');
  renderOrders(objectId);
}

function goOrderForm(objectId) {
  navStack.push({ id: 'screen-order-form', title: 'Новый заказ', objectId });
  setTitle('Новый заказ');
  showScreen('screen-order-form');
  setupOrderForm(objectId);
}

function goOrderDetail(orderId) {
  state.currentOrderId = orderId;
  navStack.push({ id: 'screen-order', title: 'Заказ', orderId });
  setTitle('Заказ');
  showScreen('screen-order');
  renderOrderDetail(orderId);
}

function goWorkTypes() {
  navStack.push({ id: 'screen-worktypes', title: 'Виды работ' });
  setTitle('Виды работ');
  showScreen('screen-worktypes');
  renderWorkTypes();
}

/* ---------- объекты ---------- */

async function renderObjects() {
  const list = $('#objects-list');
  const [objects, orders] = await Promise.all([dbAll('objects'), dbAll('orders')]);
  objects.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  if (!objects.length) {
    list.innerHTML = '<div class="empty">Пока нет объектов.<br>Нажмите «+», чтобы добавить первый.</div>';
    return;
  }
  list.innerHTML = '';
  for (const o of objects) {
    const count = orders.filter((x) => x.objectId === o.id).length;
    const sub = [o.apartment ? 'кв. ' + o.apartment : '', o.floor ? 'этаж ' + o.floor : '', o.entrance ? 'подъезд ' + o.entrance : ''].filter(Boolean).join(' · ') || '—';
    const card = document.createElement('div');
    card.className = 'card object-card';
    card.innerHTML =
      '<div class="obj-main">' +
        '<div class="obj-title">' + esc(o.address || 'Без адреса') + '</div>' +
        '<div class="obj-sub">' + esc(sub) + '</div>' +
        (o.customerName ? '<div class="obj-sub">' + esc(o.customerName) + (o.customerPhone ? ' · ' + esc(o.customerPhone) : '') + '</div>' : '') +
      '</div>' +
      '<div class="obj-actions">' +
        '<span class="badge">' + count + ' заказ(ов)</span>' +
        '<button class="mini-btn" title="Изменить">✎</button>' +
      '</div>';
    card.querySelector('.obj-main').onclick = () => goOrders(o.id);
    card.querySelector('.mini-btn').onclick = (e) => { e.stopPropagation(); goObjectForm(o.id); };
    list.appendChild(card);
  }
}

async function setupObjectForm(objectId) {
  const form = $('#object-form');
  form.reset();
  $('#obj-lat').value = ''; $('#obj-lng').value = '';
  $('#btn-locate').disabled = false; $('#btn-locate').textContent = '📍 Определить';
  form.dataset.id = objectId || '';
  if (objectId) {
    const o = await dbGet('objects', objectId);
    if (o) {
      $('#obj-address').value = o.address || '';
      $('#obj-apartment').value = o.apartment || '';
      $('#obj-floor').value = o.floor || '';
      $('#obj-entrance').value = o.entrance || '';
      $('#obj-customer').value = o.customerName || '';
      $('#obj-phone').value = o.customerPhone || '';
      $('#obj-comment').value = o.comment || '';
      $('#obj-lat').value = o.lat != null ? o.lat : '';
      $('#obj-lng').value = o.lng != null ? o.lng : '';
    }
  }
}

/* ---------- заказы ---------- */

async function renderOrders(objectId) {
  state.currentObjectId = objectId;
  const object = await dbGet('objects', objectId);
  $('#orders-object-title').textContent = object ? (object.address || 'Объект') : 'Объект';
  $('#orders-object-sub').textContent = object
    ? [object.apartment ? 'кв. ' + object.apartment : '', object.floor ? 'этаж ' + object.floor : '', object.customerName].filter(Boolean).join(' · ')
    : '';

  const [orders, photos] = await Promise.all([dbAll('orders'), dbAll('photos')]);
  const objectOrders = orders.filter((o) => o.objectId === objectId).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const list = $('#orders-list');

  if (!objectOrders.length) {
    list.innerHTML = '<div class="empty">Заказов пока нет.<br>Нажмите «Новый заказ».</div>';
    return;
  }
  list.innerHTML = '';
  for (const o of objectOrders) {
    const n = photos.filter((p) => p.orderId === o.id).length;
    const types = (o.workTypes || []).map((t) => '<span class="chip">' + esc(t) + '</span>').join('') || '<span class="muted">без видов работ</span>';
    const card = document.createElement('div');
    card.className = 'card order-card';
    card.innerHTML =
      '<div class="order-main">' +
        '<div>' + types + '</div>' +
        '<div class="obj-sub">' + esc(o.workerName || '') + (o.date ? ' · ' + esc(o.date) : '') + '</div>' +
      '</div>' +
      '<div class="obj-actions">' +
        '<span class="badge ' + statusClass(o.status) + '">' + esc(o.status || '—') + '</span>' +
        '<span class="badge">📷 ' + n + '</span>' +
      '</div>';
    card.onclick = () => goOrderDetail(o.id);
    list.appendChild(card);
  }
}

async function setupOrderForm(objectId) {
  state.currentObjectId = objectId;
  const form = $('#order-form');
  form.reset();
  $('#order-worker').value = state.userName || '';
  $('#order-date').value = new Date().toISOString().slice(0, 10);
  $('#order-status').value = 'В работе';
  form.dataset.objectId = objectId;

  const types = await dbAll('workTypes');
  const box = $('#order-worktypes');
  box.innerHTML = '';
  if (!types.length) {
    box.innerHTML = '<span class="muted">Сначала добавьте виды работ в справочнике.</span>';
    return;
  }
  for (const t of types) {
    const label = document.createElement('label');
    label.className = 'check';
    label.innerHTML = '<input type="checkbox" value="' + esc(t.name) + '"> <span>' + esc(t.name) + '</span>';
    box.appendChild(label);
  }
}

/* ---------- карточка заказа: фото ---------- */

async function renderOrderDetail(orderId) {
  state.currentOrderId = orderId;
  const order = await dbGet('orders', orderId);
  if (!order) { alert('Заказ не найден'); goBack(); return; }
  const object = await dbGet('objects', order.objectId);
  const photos = await dbAllByIndex('photos', 'orderId', orderId);

  $('#od-object').innerHTML = buildObjectSummary(object);
  $('#od-order').innerHTML =
    '<div class="row"><span class="k">Виды работ</span><span class="v">' + esc((order.workTypes || []).join(', ') || '—') + '</span></div>' +
    '<div class="row"><span class="k">Исполнитель</span><span class="v">' + esc(order.workerName || '—') + '</span></div>' +
    '<div class="row"><span class="k">Дата</span><span class="v">' + esc(order.date || '—') + '</span></div>' +
    '<div class="row"><span class="k">Статус</span><span class="v">' + esc(order.status || '—') + '</span></div>' +
    (order.comment ? '<div class="row"><span class="k">Комментарий</span><span class="v">' + esc(order.comment) + '</span></div>' : '');

  for (const stage of stageOrder) {
    renderStage(stage, photos.filter((p) => p.stage === stage));
  }
}

function buildObjectSummary(o) {
  if (!o) return '<span class="muted">Объект не найден</span>';
  let html = '<div class="obj-title">' + esc(o.address || 'Без адреса') + '</div>';
  const sub = [o.apartment ? 'кв. ' + o.apartment : '', o.floor ? 'этаж ' + o.floor : '', o.entrance ? 'подъезд ' + o.entrance : '', o.customerName].filter(Boolean).join(' · ');
  if (sub) html += '<div class="obj-sub">' + esc(sub) + '</div>';
  if (o.customerPhone) html += '<div class="obj-sub">📞 ' + esc(o.customerPhone) + '</div>';
  if (o.lat != null && o.lng != null) html += '<div class="obj-sub">📍 ' + esc(o.lat) + ', ' + esc(o.lng) + '</div>';
  return html;
}

function renderStage(stage, photos) {
  const root = document.getElementById('stage-' + stage);
  const grid = root.querySelector('.stage-photos');
  const countEl = root.querySelector('.stage-count');
  countEl.textContent = photos.length ? photos.length + ' фото' : '';
  grid.innerHTML = '';

  for (const p of photos) {
    const url = URL.createObjectURL(p.blob);
    const item = document.createElement('div');
    item.className = 'photo-item';
    item.innerHTML =
      '<img src="' + url + '" alt="" loading="lazy">' +
      '<button class="photo-del" title="Удалить">✕</button>' +
      (p.note ? '<div class="photo-note">' + esc(p.note) + '</div>' : '');
    item.querySelector('img').onclick = () => openModal(url);
    item.querySelector('.photo-del').onclick = async (e) => {
      e.stopPropagation();
      if (confirm('Удалить фото?')) {
        await dbDelete('photos', p.id);
        renderOrderDetail(state.currentOrderId);
      }
    };
    grid.appendChild(item);
  }
}

async function addPhoto(stage, file) {
  const order = await dbGet('orders', state.currentOrderId);
  if (!order) return;
  const note = prompt('Подпись к фото (необязательно):') || '';
  await dbAdd('photos', {
    orderId: state.currentOrderId,
    objectId: order.objectId,
    stage,
    blob: file,
    mimeType: file.type || 'image/jpeg',
    note,
    createdAt: Date.now(),
  });
  renderOrderDetail(state.currentOrderId);
}

/* ---------- экспорт ZIP ---------- */

function buildReportText(o, order, photoLines) {
  const L = [];
  L.push('ОТЧЁТ ПО РАБОТАМ');
  L.push('=================');
  L.push('');
  L.push('Объект:');
  if (o) {
    L.push('  Адрес: ' + (o.address || ''));
    L.push('  Квартира: ' + (o.apartment || ''));
    L.push('  Этаж: ' + (o.floor || ''));
    L.push('  Подъезд: ' + (o.entrance || ''));
    L.push('  Заказчик: ' + (o.customerName || ''));
    L.push('  Телефон: ' + (o.customerPhone || ''));
    L.push('  Комментарий: ' + (o.comment || ''));
    if (o.lat != null && o.lng != null) L.push('  Координаты: ' + o.lat + ', ' + o.lng);
  }
  L.push('');
  L.push('Заказ:');
  L.push('  Виды работ: ' + ((order.workTypes || []).join(', ') || '—'));
  L.push('  Исполнитель: ' + (order.workerName || ''));
  L.push('  Дата: ' + (order.date || ''));
  L.push('  Статус: ' + (order.status || ''));
  if (order.comment) L.push('  Комментарий: ' + order.comment);
  L.push('');
  L.push('ФОТО:');
  if (photoLines.length) photoLines.forEach((p) => L.push('  ' + p));
  else L.push('  (нет фото)');
  L.push('');
  L.push('Сформировано: ' + new Date().toLocaleString('ru-RU'));
  return L;
}

async function exportOrder() {
  const orderId = state.currentOrderId;
  const order = await dbGet('orders', orderId);
  if (!order) { alert('Заказ не найден'); return; }
  const object = await dbGet('objects', order.objectId);
  const photos = await dbAllByIndex('photos', 'orderId', orderId);
  if (!photos.length) { alert('Нет фото для экспорта'); return; }

  const files = [];
  const photoLines = [];
  const counters = {};

  for (const stage of stageOrder) {
    for (const p of photos.filter((x) => x.stage === stage)) {
      counters[stage] = (counters[stage] || 0) + 1;
      const ext = (p.mimeType && p.mimeType.includes('png')) ? 'png' : 'jpg';
      const name = stageFile[stage] + '_' + String(counters[stage]).padStart(2, '0') + '.' + ext;
      const note = p.note ? ' — ' + p.note : '';
      const ts = p.createdAt ? new Date(p.createdAt).toLocaleString('ru-RU') : '';
      photoLines.push('[' + stageLabel[stage] + '] ' + name + note + ' (' + ts + ')');
      files.push({ name, data: await p.blob.arrayBuffer() });
    }
  }

  const lines = buildReportText(object, order, photoLines);
  files.unshift({ name: 'report.txt', data: new TextEncoder().encode(lines.join('\r\n')) });

  const blob = await createZip(files);
  triggerDownload(blob, 'otchet_' + orderId + '.zip');
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/* ---------- справочник работ ---------- */

async function renderWorkTypes() {
  const types = await dbAll('workTypes');
  const list = $('#worktypes-list');
  list.innerHTML = '';
  if (!types.length) {
    list.innerHTML = '<div class="empty">Список пуст.</div>';
    return;
  }
  for (const t of types) {
    const row = document.createElement('div');
    row.className = 'list-row';
    row.innerHTML = '<span>' + esc(t.name) + '</span><button class="mini-btn danger" title="Удалить">✕</button>';
    row.querySelector('button').onclick = async () => {
      if (confirm('Удалить вид работ «' + t.name + '»?')) {
        await dbDelete('workTypes', t.id);
        renderWorkTypes();
      }
    };
    list.appendChild(row);
  }
}

/* ---------- прочее ---------- */

function openModal(url) {
  $('#modal-img').src = url;
  $('#modal').hidden = false;
}

function locate() {
  if (!navigator.geolocation) { alert('Геолокация недоступна в этом браузере'); return; }
  const btn = $('#btn-locate');
  btn.disabled = true; btn.textContent = 'Определяю…';
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      $('#obj-lat').value = pos.coords.latitude.toFixed(6);
      $('#obj-lng').value = pos.coords.longitude.toFixed(6);
      btn.disabled = false; btn.textContent = '📍 Определить';
    },
    (err) => {
      alert('Не удалось определить местоположение: ' + err.message);
      btn.disabled = false; btn.textContent = '📍 Определить';
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

async function seedWorkTypes() {
  const existing = await dbAll('workTypes');
  if (existing.length === 0) {
    const defaults = ['Отделка', 'Сантехника', 'Электрика', 'Малярные работы', 'Демонтаж', 'Монтаж', 'Прочее'];
    for (const n of defaults) await dbAdd('workTypes', { name: n });
  }
}

async function logout() {
  if (confirm('Выйти из аккаунта?')) {
    await dbDelete('settings', 'session');
    state.role = null; state.userName = '';
    navStack = [];
    showScreen('screen-login');
  }
}

/* ---------- инициализация ---------- */

async function init() {
  // навигация и общие кнопки
  $('#btn-back').onclick = goBack;
  $('#btn-logout').onclick = logout;
  $('#modal-close').onclick = () => { $('#modal').hidden = true; };
  $('#modal').onclick = (e) => { if (e.target === $('#modal')) $('#modal').hidden = true; };
  $('#btn-new-object').onclick = () => goObjectForm(null);
  $('#btn-new-order').onclick = () => goOrderForm(state.currentObjectId);
  $('#worktypes-btn').onclick = goWorkTypes;
  $('#btn-export').onclick = exportOrder;
  $('#btn-locate').onclick = locate;

  // кнопки съёмки
  document.querySelectorAll('.shot-btn').forEach((btn) => {
    btn.onclick = () => {
      pendingStage = btn.dataset.stage;
      if (btn.dataset.mode === 'camera') cameraInput.click();
      else galleryInput.click();
    };
  });

  // формы
  $('#login-form').onsubmit = (e) => {
    e.preventDefault();
    const role = document.querySelector('input[name="role"]:checked').value;
    const name = $('#login-name').value.trim();
    state.role = role;
    state.userName = name || 'Работник';
    dbSetSetting('session', { role, name: state.userName });
    $('#role-badge').textContent = role === 'manager' ? 'Менеджер' : 'Работник';
    $('#worktypes-btn').hidden = (role !== 'manager');
    goObjects();
  };

  $('#object-form').onsubmit = async (e) => {
    e.preventDefault();
    const id = $('#object-form').dataset.id;
    const data = {
      address: $('#obj-address').value.trim(),
      apartment: $('#obj-apartment').value.trim(),
      floor: $('#obj-floor').value.trim(),
      entrance: $('#obj-entrance').value.trim(),
      customerName: $('#obj-customer').value.trim(),
      customerPhone: $('#obj-phone').value.trim(),
      comment: $('#obj-comment').value.trim(),
      lat: $('#obj-lat').value ? parseFloat($('#obj-lat').value) : null,
      lng: $('#obj-lng').value ? parseFloat($('#obj-lng').value) : null,
    };
    if (!data.address) { alert('Укажите адрес объекта'); return; }
    if (id) {
      data.id = Number(id);
      await dbPut('objects', data);
    } else {
      data.createdAt = Date.now();
      await dbAdd('objects', data);
    }
    goBack();
  };

  $('#order-form').onsubmit = async (e) => {
    e.preventDefault();
    const objectId = Number($('#order-form').dataset.objectId);
    const workTypes = Array.from(document.querySelectorAll('#order-worktypes input:checked')).map((i) => i.value);
    const data = {
      objectId,
      workTypes,
      workerName: $('#order-worker').value.trim() || state.userName,
      date: $('#order-date').value,
      status: $('#order-status').value,
      comment: $('#order-comment').value.trim(),
      createdAt: Date.now(),
    };
    await dbAdd('orders', data);
    goBack();
  };

  $('#add-worktype-form').onsubmit = async (e) => {
    e.preventDefault();
    const name = $('#new-worktype').value.trim();
    if (!name) return;
    await dbAdd('workTypes', { name });
    $('#new-worktype').value = '';
    renderWorkTypes();
  };

  // скрытые input для камеры/галереи
  const cameraInput = document.createElement('input');
  cameraInput.type = 'file';
  cameraInput.accept = 'image/*';
  cameraInput.setAttribute('capture', 'environment');
  cameraInput.style.display = 'none';
  const galleryInput = document.createElement('input');
  galleryInput.type = 'file';
  galleryInput.accept = 'image/*';
  galleryInput.style.display = 'none';
  document.body.appendChild(cameraInput);
  document.body.appendChild(galleryInput);
  window.cameraInput = cameraInput;
  window.galleryInput = galleryInput;
  cameraInput.onchange = () => { if (cameraInput.files[0] && pendingStage) addPhoto(pendingStage, cameraInput.files[0]); cameraInput.value = ''; };
  galleryInput.onchange = () => { if (galleryInput.files[0] && pendingStage) addPhoto(pendingStage, galleryInput.files[0]); galleryInput.value = ''; };

  // запуск
  await openDB();
  await seedWorkTypes();
  const session = await dbGetSetting('session');
  if (session && session.role) {
    state.role = session.role;
    state.userName = session.name || '';
    $('#role-badge').textContent = session.role === 'manager' ? 'Менеджер' : 'Работник';
    $('#worktypes-btn').hidden = (session.role !== 'manager');
    goObjects();
  } else {
    showScreen('screen-login');
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

document.addEventListener('DOMContentLoaded', init);
