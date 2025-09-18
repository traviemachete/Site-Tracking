// ====== script.js (นับจาก row) ======
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
// เก็บ "ทุกแถว" จากทุกชีตไว้ที่นี่ (แม้ไม่มีพิกัด)
const allRows = [];  // { id, props: { place,type,year,warranty,status, lat, lng, ... } }
// map ระหว่าง row -> marker (เฉพาะแถวที่มีพิกัด)
const markerByRowId = new Map(); // id -> Leaflet marker
// ค่าไว้สร้าง dropdown
const uniqueVals = { type: new Set(), year: new Set(), warranty: new Set(), status: new Set() };

// ===== Populate <select> with unique values =====
function populateSelect(selectEl, valuesSet) {
  const values = [...valuesSet].filter(v => v && v !== '-').sort((a,b)=> String(a).localeCompare(String(b), 'th'));
  // เคลียร์ (เหลือ option แรก "ทั้งหมด")
  selectEl.length = 1;
  for (const v of values) {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = v;
    selectEl.appendChild(opt);
  }
}

// ===== Apply filters (นับจาก allRows และแสดง/ซ่อน marker ที่แมตช์) =====
function applyFilters() {
  const fType     = (selType.value || '').trim();
  const fYear     = (selYear.value || '').trim();
  const fWarranty = (selWarranty.value || '').trim();
  const fStatus   = (selStatus.value || '').trim();

  let shown = 0;

  for (const row of allRows) {
    const p = row.props;
    const match =
      (!fType     || p.type     === fType) &&
      (!fYear     || p.year     === fYear) &&
      (!fWarranty || p.warranty === fWarranty) &&
      (!fStatus   || p.status   === fStatus);

    // อัปเดต marker บนแผนที่เฉพาะแถวที่มี marker
    const m = markerByRowId.get(row.id);
    if (m) {
      const onMap = map.hasLayer(m);
      if (match && !onMap) m.addTo(map);
      else if (!match && onMap) m.removeFrom(map);
    }

    if (match) shown++;
  }

  // นับจากจำนวน "แถว" ทั้งหมด และจำนวนที่ตรงตัวกรอง
  matchCount.textContent = String(shown);
  totalCount.textContent = String(allRows.length);
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
      const idxStatus       = col('สถานะ');
      const idxWStatus      = col('สถานะประกัน');
      const idxBudgetYear   = col('ปีงบประมาณ');
      const idxContactName  = col('ชื่อผู้ดูแล');
      const idxContactPhone = col('เบอร์โทร/ผู้ดูแล');
      const idxWarrantyDate = col('วันที่หมดระยะประกัน');

      rows.forEach((r, i) => {
        const lat = num(r[idxLat]);
        const lng = num(r[idxLng]);

        const place        = (r[idxPlace] || '-').toString().trim();
        const type         = (r[idxType] || '-').toString().trim();
        const status       = (r[idxStatus]  || '').toString().trim();
        const wStatus      = (r[idxWStatus] || '').toString().trim();
        const year         = (idxBudgetYear >= 0 ? (r[idxBudgetYear] || '').toString().trim() : '');
        const contactName  = (r[idxContactName]  || '-').toString().trim();
        const contactPhone = (r[idxContactPhone] || '-').toString().trim();
        const warrantyDate = (r[idxWarrantyDate] || '-').toString().trim();

        // เก็บค่า unique สำหรับสร้างตัวเลือก filter (จากทุกแถว)
        if (type)    uniqueVals.type.add(type);
        if (year)    uniqueVals.year.add(year);
        if (wStatus) uniqueVals.warranty.add(wStatus);
        if (status)  uniqueVals.status.add(status);

        // --- เก็บเป็น "row" เสมอ แม้ไม่มีพิกัด ---
        const id = `${name}::${i+2}`; // อ้างอิงชีต+เลขแถว (แถว header คือบรรทัด 1 เลยบวก 2)
        const props = { place, type, year, warranty: wStatus, status, lat, lng,
                        contactName, contactPhone, warrantyDate };
        allRows.push({ id, props });

        // --- สร้าง marker เฉพาะแถวที่มีพิกัดเท่านั้น ---
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
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

          marker.addTo(map);                   // แสดงครั้งแรกทั้งหมด
          markerByRowId.set(id, marker);       // map จาก row -> marker
        }
      });
    } catch (e) {
      console.error('Sheet error:', name, e);
    }
  }

  // เติมตัวเลือกจากค่าจริงในชีท
  populateSelect(selType, uniqueVals.type);
  populateSelect(selYear, uniqueVals.year);
  populateSelect(selWarranty, uniqueVals.warranty);
  populateSelect(selStatus, uniqueVals.status);

  // อัปเดตตัวนับครั้งแรก (นับจากจำนวนแถวทั้งหมด)
  totalCount.textContent = String(allRows.length);
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
