// ====== script.js ====== 
const SHEET_ID    = '1OF8QYGVpeiKjVToRvJQfTuKUreZTOcc9yZYxQXlh5vQ';
const SHEET_NAMES = [
  'เอน คอนเนค',
  'อินโนวาเทค โซลูชั่น',
  'พินพอยท์ อินโนเวชั่น',
  'เอสทีอาร์ อินโนเวชั่น',
  'อีสาน-ส่วนกลาง',
  'เขต 7'
];
const API_KEY     = 'AIzaSyBJ99_hsyJJQe4SyntE4SzORk8S0VhNF7I';

// ===== DOM refs for filters & counts =====
const selType     = document.getElementById('filter-type');
const selYear     = document.getElementById('filter-year');
const selWarranty = document.getElementById('filter-warranty');
const selStatus   = document.getElementById('filter-status');
const btnReset    = document.getElementById('btn-reset');
const matchCount  = document.getElementById('match-count');
const totalCount  = document.getElementById('total-count');

// ===== Map init =====
const map = L.map('map').setView([15.5, 101.0], 7);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap'
}).addTo(map);

// ===== Helpers =====
const num = v => {
  if (v == null) return NaN;
  const cleaned = String(v).trim().replace(/,/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
};

function markerColor(status, warrantyStatus) {
  const st = (status || '').trim();
  const ws = (warrantyStatus || '').trim();
  if (st === 'เปิดใช้งาน' && ws === 'อยู่ในประกัน') return '#00E036'; // green
  if (st === 'เปิดใช้งาน' && ws === 'หมดประกัน') return '#0000E0'; // blue
  if (st === 'ปิดใช้งานชั่วคราว') return '#EB7302'; // orange
  if (st === 'ปิดใช้งาน') return '#EB020A'; // red
  return '#737373'; // fallback gray
}

async function fetchSheetData(sheetName) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(sheetName)}?key=${API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) {
    console.error('Load sheet failed:', sheetName, res.status, res.statusText);
    return null;
  }
  return res.json();
}

// ===== State =====
const allMarkers = []; // { marker, props: { type, year, warranty, status, place } }
const uniqueVals = { type: new Set(), year: new Set(), warranty: new Set(), status: new Set() };

// ===== Populate <select> with unique values =====
function populateSelect(selectEl, valuesSet) {
  const values = [...valuesSet].filter(v => v && v !== '-').sort((a,b)=> String(a).localeCompare(String(b), 'th'));
  // Clear (keep the first 'ทั้งหมด')
  selectEl.length = 1;
  for (const v of values) {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = v;
    selectEl.appendChild(opt);
  }
}

// ===== Apply filters (show/hide markers) =====
function applyFilters() {
  const fType     = (selType.value || '').trim();
  const fYear     = (selYear.value || '').trim();
  const fWarranty = (selWarranty.value || '').trim();
  const fStatus   = (selStatus.value || '').trim();

  let shown = 0;
  for (const item of allMarkers) {
    const { marker, props } = item;
    const match =
      (!fType     || props.type     === fType) &&
      (!fYear     || props.year     === fYear) &&
      (!fWarranty || props.warranty === fWarranty) &&
      (!fStatus   || props.status   === fStatus);

    const onMap = map.hasLayer(marker);
    if (match && !onMap) {
      marker.addTo(map);
    } else if (!match && onMap) {
      marker.removeFrom(map);
    }
    if (match) shown++;
  }

  matchCount.textContent = String(shown);
  totalCount.textContent = String(allMarkers.length);
}

// ===== Reset filters =====
function resetFilters() {
  selType.value = '';
  selYear.value = '';
  selWarranty.value = '';
  selStatus.value = '';
  applyFilters();
}

// ===== Render all sheets =====
async function renderAllSheets() {
  for (const name of SHEET_NAMES) {
    try {
      const data = await fetchSheetData(name);
      if (!data || !data.values || data.values.length < 2) continue;

      const headers = data.values[0].map(h => (h || '').trim());
      const rows    = data.values.slice(1);

      const col = key => headers.indexOf(key);

      const idxLat          = col('Lat');
      const idxLng          = col('Long');
      const idxPlace        = col('พื้นที่');
      const idxType         = col('Type');
      const idxStatus       = col('สถานะ');           // ใช้งาน/ปิดใช้งาน
      const idxWStatus      = col('สถานะประกัน');     // อยู่ในประกัน/หมดประกัน
      const idxBudgetYear   = col('ปีงบประมาณ');       // ✅ เพิ่มปีงบประมาณ
      const idxContactName  = col('ชื่อผู้ดูแล');
      const idxContactPhone = col('เบอร์โทร/ผู้ดูแล');
      const idxWarrantyDate = col('วันที่หมดระยะประกัน');

      rows.forEach((r) => {
        const lat = num(r[idxLat]);
        const lng = num(r[idxLng]);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

        const place        = (r[idxPlace] || '-').toString().trim();
        const type         = (r[idxType] || '-').toString().trim();
        const status       = (r[idxStatus]  || '').toString().trim();
        const wStatus      = (r[idxWStatus] || '').toString().trim();
        const year         = (idxBudgetYear >= 0 ? (r[idxBudgetYear] || '').toString().trim() : '');
        const contactName  = (r[idxContactName]  || '-').toString().trim();
        const contactPhone = (r[idxContactPhone] || '-').toString().trim();
        const warrantyDate = (r[idxWarrantyDate] || '-').toString().trim();

        // เก็บ unique values สำหรับสร้างตัวเลือก filter
        if (type)     uniqueVals.type.add(type);
        if (year)     uniqueVals.year.add(year);
        if (wStatus)  uniqueVals.warranty.add(wStatus);
        if (status)   uniqueVals.status.add(status);

        const color = markerColor(status, wStatus);
        const marker = L.circleMarker([lat, lng], {
          radius: 7,
          color,
          fillColor: color,
          fillOpacity: 0.85,
          weight: 1
        });

        // Tooltip hover = ชื่อพื้นที่
        marker.bindTooltip(String(place), {
          sticky: true,
          direction: 'top',
          offset: [0, -6],
          opacity: 0.95
        });

        // Popup รายละเอียด
        marker.bindPopup(`
          <b>${place}</b><br/>
          Type: ${type}<br/>
          ปีงบประมาณ: ${year || '-'}<br/>
          สถานะ: ${status}<br/>
          สถานะประกัน: ${wStatus}<br/>
          วันที่หมดระยะประกัน: ${warrantyDate}<br/>
          ผู้ดูแล: ${contactName}<br/>
          เบอร์โทร: ${contactPhone}
        `);

        // ใส่ marker ลง map + เก็บ state
        marker.addTo(map);
        allMarkers.push({
          marker,
          props: {
            place,
            type,
            year,
            warranty: wStatus,
            status
          }
        });
      });
    } catch (e) {
      console.error('Sheet error:', name, e);
    }
  }

  // สร้างรายการตัวเลือกจากค่าจริงในชีท
  populateSelect(selType, uniqueVals.type);
  populateSelect(selYear, uniqueVals.year);
  populateSelect(selWarranty, uniqueVals.warranty);
  populateSelect(selStatus, uniqueVals.status);

  // อัปเดตตัวนับครั้งแรก
  totalCount.textContent = String(allMarkers.length);
  applyFilters();
}

// ===== Event listeners =====
selType.addEventListener('change', applyFilters);
selYear.addEventListener('change', applyFilters);
selWarranty.addEventListener('change', applyFilters);
selStatus.addEventListener('change', applyFilters);
btnReset.addEventListener('click', resetFilters);

// Run
renderAllSheets();
