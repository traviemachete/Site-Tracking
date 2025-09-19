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

// ===== DOM =====
const selType     = document.getElementById('filter-type');
const selYear     = document.getElementById('filter-year');
const selWarranty = document.getElementById('filter-warranty');
const selStatus   = document.getElementById('filter-status');
const btnReset    = document.getElementById('btn-reset');
const matchCount  = document.getElementById('match-count');
const totalCount  = document.getElementById('total-count');

// ===== Map =====
const map = L.map('map').setView([15.5, 101.0], 7);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19, attribution: '&copy; OpenStreetMap'
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
  if (st === 'เปิดใช้งาน' && ws === 'อยู่ในประกัน') return '#00E036';
  if (st === 'เปิดใช้งาน' && ws === 'หมดประกัน')   return '#0000E0';
  if (st === 'ปิดใช้งานชั่วคราว')                  return '#EB7302';
  if (st === 'ปิดใช้งาน')                           return '#EB020A';
  return '#737373';
}

/**
 * ดึงข้อมูลชีทแบบ includeGridData เพื่อให้รู้ว่า row ไหนถูกซ่อน
 * คืนค่า: { headers: string[], rows: string[][] } (rows = เฉพาะแถวที่ "ไม่ถูกซ่อน")
 */
async function fetchVisibleRows(sheetName) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}`
            + `?includeGridData=true&ranges=${encodeURIComponent(sheetName)}&key=${API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) {
    console.error('Load sheet failed:', sheetName, res.status, res.statusText);
    return { headers: [], rows: [] };
  }
  const data = await res.json();

  const sheet = (data.sheets || []).find(s => s?.properties?.title === sheetName);
  const grid  = sheet?.data?.[0];
  const rowData = grid?.rowData || [];
  const rowMeta = grid?.rowMetadata || []; // มีค่าสถานะแถวถูกซ่อน

  if (!rowData.length) return { headers: [], rows: [] };

  // อ่านหัวตาราง = แถวแรกที่ "ไม่ถูกซ่อน" (ปกติคือแถว 1)
  let headerIdx = 0;
  while (headerIdx < rowData.length) {
    const hiddenHeader = !!(rowMeta?.[headerIdx]?.hiddenByUser || rowMeta?.[headerIdx]?.hiddenByFilter);
    if (!hiddenHeader) break;
    headerIdx++;
  }
  const headers = (rowData[headerIdx]?.values || []).map(c =>
    (c?.formattedValue ?? '').toString().trim()
  );

  // อ่านแถวข้อมูล: ข้ามทุกแถวที่ถูกซ่อน
  const rows = [];
  for (let i = headerIdx + 1; i < rowData.length; i++) {
    const hidden = !!(rowMeta?.[i]?.hiddenByUser || rowMeta?.[i]?.hiddenByFilter);
    if (hidden) continue; // ✅ ข้ามแถวที่ซ่อน

    const vals = (rowData[i]?.values || []).map(c => (c?.formattedValue ?? '').toString().trim());
    // ข้ามแถวที่ว่างทั้งแถว (กัน noise)
    const hasAny = vals.some(v => v !== '');
    if (!hasAny) continue;

    rows.push(vals);
  }

  return { headers, rows };
}

// ===== State =====
// กลุ่มตาม "พื้นที่"
const placeGroups = new Map(); // place -> { place, items:[], typeSet, yearSet, warrantySet, statusSet, lat, lng, marker }
const uniqueVals  = { type: new Set(), year: new Set(), warranty: new Set(), status: new Set() };

// สำหรับ popup (เลือกแถวแรกเป็นตัวแทน)
function pickRepresentative(items) {
  const withCoord = items.find(it => Number.isFinite(it.lat) && Number.isFinite(it.lng));
  return withCoord || items[0];
}

// เติม options ให้ select
function populateSelect(selectEl, valuesSet) {
  const values = [...valuesSet].filter(v => v && v !== '-')
    .sort((a,b) => String(a).localeCompare(String(b), 'th'));
  selectEl.length = 1; // คง option แรก "ทั้งหมด"
  for (const v of values) {
    const opt = document.createElement('option');
    opt.value = v; opt.textContent = v;
    selectEl.appendChild(opt);
  }
}

// ===== Filtering (แบบพื้นที่ยูนีก) =====
// เงื่อนไข: ถ้ามี "อย่างน้อยหนึ่งรายการในพื้นที่นั้น" ตรงกับฟิลเตอร์ => นับ/แสดงพื้นที่นั้น
function groupMatchesFilter(group) {
  const fType     = (selType.value || '').trim();
  const fYear     = (selYear.value || '').trim();
  const fWarranty = (selWarranty.value || '').trim();
  const fStatus   = (selStatus.value || '').trim();

  if (fType     && !group.typeSet.has(fType))         return false;
  if (fYear     && !group.yearSet.has(fYear))         return false;
  if (fWarranty && !group.warrantySet.has(fWarranty)) return false;
  if (fStatus   && !group.statusSet.has(fStatus))     return false;

  return true;
}

function applyFilters() {
  let shown = 0;
  for (const group of placeGroups.values()) {
    const match = groupMatchesFilter(group);

    const m = group.marker;
    if (m) {
      const onMap = map.hasLayer(m);
      if (match && !onMap) m.addTo(map);
      else if (!match && onMap) m.removeFrom(map);
    }

    if (match) shown++;
  }

  matchCount.textContent = String(shown);
  totalCount.textContent = String(placeGroups.size); // นับจำนวนพื้นที่ยูนีกทั้งหมด
}

function resetFilters() {
  selType.value = '';
  selYear.value = '';
  selWarranty.value = '';
  selStatus.value = '';
  applyFilters();
}

// ===== Load & Build =====
async function renderAllSheets() {
  for (const name of SHEET_NAMES) {
    try {
      const { headers, rows } = await fetchVisibleRows(name); // ✅ ใช้เฉพาะแถวที่ "ไม่ถูกซ่อน"
      if (!headers.length || !rows.length) continue;

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

      rows.forEach(r => {
        const place        = (r[idxPlace] || '-').toString().trim();
        const lat          = num(r[idxLat]);
        const lng          = num(r[idxLng]);
        const type         = (r[idxType] || '-').toString().trim();
        const status       = (r[idxStatus]  || '').toString().trim();
        const wStatus      = (r[idxWStatus] || '').toString().trim();
        const year         = (idxBudgetYear >= 0 ? (r[idxBudgetYear] || '').toString().trim() : '');
        const contactName  = (r[idxContactName]  || '-').toString().trim();
        const contactPhone = (r[idxContactPhone] || '-').toString().trim();
        const warrantyDate = (r[idxWarrantyDate] || '-').toString().trim();

        // เก็บค่าลง set สำหรับสร้างตัวเลือก
        if (type)    uniqueVals.type.add(type);
        if (year)    uniqueVals.year.add(year);
        if (wStatus) uniqueVals.warranty.add(wStatus);
        if (status)  uniqueVals.status.add(status);

        // รวมเป็นกลุ่มตาม "พื้นที่"
        if (!placeGroups.has(place)) {
          placeGroups.set(place, {
            place,
            items: [],
            typeSet: new Set(),
            yearSet: new Set(),
            warrantySet: new Set(),
            statusSet: new Set(),
            lat: undefined,
            lng: undefined,
            marker: null
          });
        }
        const g = placeGroups.get(place);
        g.items.push({ place, type, status, wStatus, year, lat, lng, contactName, contactPhone, warrantyDate });
        g.typeSet.add(type);
        if (year) g.yearSet.add(year);
        if (wStatus) g.warrantySet.add(wStatus);
        if (status) g.statusSet.add(status);
        // เก็บพิกัดตัวแทน (แถวแรกที่มีพิกัด)
        if ((!Number.isFinite(g.lat) || !Number.isFinite(g.lng)) &&
            Number.isFinite(lat) && Number.isFinite(lng)) {
          g.lat = lat; g.lng = lng;
        }
      });
    } catch(e) {
      console.error('Sheet error:', name, e);
    }
  }

  // สร้าง marker ต่อ "พื้นที่"
  for (const group of placeGroups.values()) {
    if (Number.isFinite(group.lat) && Number.isFinite(group.lng)) {
      const rep = pickRepresentative(group.items);
      const color = markerColor(rep.status, rep.wStatus);
      const m = L.circleMarker([group.lat, group.lng], {
        radius: 7, color, fillColor: color, fillOpacity: 0.85, weight: 1
      });

      // Tooltip = ชื่อพื้นที่
      m.bindTooltip(String(group.place), {
        sticky: true, direction: 'top', offset: [0, -6], opacity: 0.95
      });

      // Popup = ใช้ข้อมูลตัวแทน
      m.bindPopup(`
        <b>${group.place}</b><br/>
        Type: ${rep.type}<br/>
        ปีงบประมาณ: ${rep.year || '-'}<br/>
        สถานะ: ${rep.status}<br/>
        สถานะประกัน: ${rep.wStatus}<br/>
        วันที่หมดระยะประกัน: ${rep.warrantyDate}<br/>
        ผู้ดูแล: ${rep.contactName}<br/>
        เบอร์โทร: ${rep.contactPhone}
      `);

      m.addTo(map);
      group.marker = m;
    }
  }

  // เติมตัวเลือก
  populateSelect(selType, uniqueVals.type);
  populateSelect(selYear, uniqueVals.year);
  populateSelect(selWarranty, uniqueVals.warranty);
  populateSelect(selStatus, uniqueVals.status);

  // อัปเดตตัวนับครั้งแรก (นับจำนวน "พื้นที่ยูนีก" จากแถวที่ไม่ถูกซ่อนเท่านั้น)
  totalCount.textContent = String(placeGroups.size);
  applyFilters();
}

// Events
selType.addEventListener('change', applyFilters);
selYear.addEventListener('change', applyFilters);
selWarranty.addEventListener('change', applyFilters);
selStatus.addEventListener('change', applyFilters);
btnReset.addEventListener('click', resetFilters);

// Run
renderAllSheets();
