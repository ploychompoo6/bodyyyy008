/* ==========================================================
   Body Scent — script.js (ใช้ร่วมกันทุกหน้า)
   - product.html : โหลดสินค้าจาก products.json + ตัวกรอง mood
   - order.html   : เติมชื่อสินค้า/ราคาจาก URL + ส่งออเดอร์ไป Apps Script
   - admin.html   : อ่าน CSV จาก Google Sheets มาแสดงเป็นตาราง
   ========================================================== */

const APPS_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbxDWnkV1tGslnK8Le_aXr2z_zaDaxOwiSgwtAHThupFTnC6ZRGsNnRWUnn_h-oNOgWMNw/exec';

const SHEET_CSV_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vQAt8OXzbGnHZm37mR6et5oMEf8ci4jt_MTN-D9b2bAmKSLaoAX0DMg4cYZtDVYpMxqqsZ5tGXyld9E/pub?gid=0&single=true&output=csv';

const MOODS = [
  { key: 'all', label: 'ทั้งหมด' },
  { key: 'fresh', label: 'Fresh' },
  { key: 'sweet', label: 'Sweet' },
  { key: 'confident', label: 'Confident' },
  { key: 'romance', label: 'Romance' }
];

const MOOD_LABELS = {
  fresh: 'Fresh',
  sweet: 'Sweet',
  confident: 'Confident',
  romance: 'Romance'
};

document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('product-list')) initProductPage();
  if (document.getElementById('orderForm')) initOrderPage();
  if (document.getElementById('ordersTable')) initAdminPage();
});

/* ---------- helper: สร้าง element ---------- */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/* ==========================================================
   1) หน้า product.html
   ========================================================== */
function initProductPage() {
  const list = document.getElementById('product-list');
  const filterBar = document.getElementById('filter-bar');
  let products = [];

  const params = new URLSearchParams(window.location.search);
  const requested = (params.get('mood') || 'all').toLowerCase();
  let activeMood = MOODS.some(m => m.key === requested) ? requested : 'all';

  function buildFilterBar() {
    if (!filterBar) return;
    filterBar.innerHTML = '';
    MOODS.forEach(mood => {
      const btn = el('button', 'filter-btn', mood.label);
      btn.type = 'button';
      btn.dataset.mood = mood.key;
      btn.addEventListener('click', () => {
        activeMood = mood.key;
        syncUrl();
        updateActiveButton();
        renderProducts();
      });
      filterBar.appendChild(btn);
    });
    updateActiveButton();
  }

  function updateActiveButton() {
    if (!filterBar) return;
    filterBar.querySelectorAll('.filter-btn').forEach(btn => {
      const isActive = btn.dataset.mood === activeMood;
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-pressed', String(isActive));
    });
  }

  function syncUrl() {
    const url = new URL(window.location.href);
    if (activeMood === 'all') url.searchParams.delete('mood');
    else url.searchParams.set('mood', activeMood);
    window.history.replaceState(null, '', url);
  }

  function buildCard(product) {
    const card = el('article', 'product-card');
    card.dataset.mood = product.mood;

    const media = el('div', 'product-card__media');
    const img = document.createElement('img');
    img.src = product.image;
    img.alt = product.name + (product.size ? ' ' + product.size : '');
    img.loading = 'lazy';
    media.appendChild(img);
    card.appendChild(media);

    const mood = el('div', 'product-card__mood');
    mood.appendChild(el('span', 'mood-dot'));
    mood.appendChild(document.createTextNode(MOOD_LABELS[product.mood] || product.mood));
    card.appendChild(mood);

    card.appendChild(el('h3', 'product-card__name', product.name));
    if (product.size) card.appendChild(el('div', 'product-card__meta', product.size));

    const footer = el('div', 'product-card__footer');
    const price = el('span', 'price', Number(product.price).toLocaleString('th-TH'));
    price.appendChild(el('small', '', 'บาท'));
    footer.appendChild(price);

    const itemName = product.size ? product.name + ' ' + product.size : product.name;
    const order = el('a', 'btn btn--small', 'สั่งซื้อ');
    order.href =
      'order.html?item=' + encodeURIComponent(itemName) +
      '&price=' + encodeURIComponent(product.price);
    footer.appendChild(order);

    card.appendChild(footer);
    return card;
  }

  function renderProducts() {
    list.innerHTML = '';
    const shown = activeMood === 'all'
      ? products
      : products.filter(p => p.mood === activeMood);

    if (shown.length === 0) {
      list.appendChild(el('p', '', 'ไม่พบสินค้าในหมวดนี้'));
      return;
    }
    shown.forEach(p => list.appendChild(buildCard(p)));
  }

  buildFilterBar();

  fetch('products.json')
    .then(res => {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(data => {
      products = data;
      renderProducts();
    })
    .catch(error => {
      console.error(error);
      list.innerHTML = '';
      list.appendChild(el('p', '', 'โหลดข้อมูลสินค้าไม่สำเร็จ กรุณารีเฟรชหน้านี้อีกครั้ง'));
    });
}

/* ==========================================================
   2) หน้า order.html
   ========================================================== */
function initOrderPage() {
  const form = document.getElementById('orderForm');
  const itemsInput = document.getElementById('items');
  const totalInput = document.getElementById('total');

  // เติมชื่อสินค้า + ราคาจาก URL parameter ทันทีที่โหลดหน้า
  const params = new URLSearchParams(window.location.search);
  const item = params.get('item');
  const price = params.get('price');

  if (item && itemsInput) itemsInput.value = item;
  if (price && totalInput) totalInput.value = price;

  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!form.reportValidity()) return;

    const payload = {
      customerName: document.getElementById('customerName').value.trim(),
      contact: document.getElementById('contact').value.trim(),
      items: itemsInput.value.trim(),
      total: totalInput.value.trim(),
      note: document.getElementById('note').value.trim()
    };

    const submitBtn = form.querySelector('[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      body: JSON.stringify(payload)
    })
    .then(() => { window.location.href = 'thankyou.html'; })
    .catch(error => {
      console.error(error);
      alert('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
      if (submitBtn) submitBtn.disabled = false;
    });
  });
}

/* ==========================================================
   3) หน้า admin.html
   ========================================================== */

/* parse CSV เอง: รองรับเครื่องหมายคำพูด, "" (escape), คอมมาและขึ้นบรรทัดใหม่ในช่อง */
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1); // ตัด BOM

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }

  // แถวสุดท้าย (กรณีไฟล์ไม่ลงท้ายด้วยขึ้นบรรทัดใหม่)
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function initAdminPage() {
  const tbody = document.querySelector('#ordersTable tbody');
  const columnCount = 6;

  function showMessage(message) {
    tbody.innerHTML = '';
    const tr = document.createElement('tr');
    const td = el('td', '', message);
    td.colSpan = columnCount;
    tr.appendChild(td);
    tbody.appendChild(tr);
  }

  showMessage('กำลังโหลดข้อมูล...');

  fetch(SHEET_CSV_URL + '&_=' + Date.now())
    .then(res => {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.text();
    })
    .then(text => {
      const rows = parseCSV(text)
        .slice(1) // ข้ามแถวหัวตาราง
        .filter(r => r.some(cell => cell.trim() !== ''));

      if (rows.length === 0) {
        showMessage('ยังไม่มีรายการสั่งซื้อ');
        return;
      }

      // ชีตเพิ่มแถวใหม่ต่อท้ายเสมอ → กลับลำดับให้รายการล่าสุดขึ้นก่อน
      rows.reverse();

      tbody.innerHTML = '';
      rows.forEach(r => {
        const tr = document.createElement('tr');
        // ลำดับคอลัมน์: วันเวลา, ชื่อลูกค้า, เบอร์โทร/Line, รายการสินค้า, จำนวนเงินรวม, หมายเหตุ
        for (let i = 0; i < columnCount; i++) {
          tr.appendChild(el('td', '', (r[i] || '').trim()));
        }
        tbody.appendChild(tr);
      });
    })
    .catch(error => {
      console.error(error);
      showMessage('โหลดข้อมูลไม่สำเร็จ กรุณารีเฟรชหน้านี้อีกครั้ง');
    });
}
