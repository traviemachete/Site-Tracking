// ====== config ======
const SHEET_ID    = '1OF8QYGVpeiKjVToRvJQfTuKUreZTOcc9yZYxQXlh5vQ';
const SHEET_NAMES = [
  'เอน คอนเนค',  // <- ตรวจสะกดให้ตรงชีตจริง
  'อินโนวาเทค โซลูชั่น',
  'พินพอยท์ อินโนเวชั่น',
  'เอสทีอาร์ อินโนเวชั่น',
  'อีสาน-ส่วนกลาง',
  'เขต 7'
];
const API_KEY     = 'AIzaSyBJ99_hsyJJQe4SyntE4SzORk8S0VhNF7I';
// ====================

// util
const norm = s => (s ?? '').toString().trim();
const num  = v => {
  const n = Number(String(v ?? '').replace(/,/g,'').trim());
  return Number.isFinite(n) ? n : NaN;
};
function findCol(headers, target, alts = []) {
  const want = norm(target);
  return headers.findIndex(h => {
    const hh = norm(h);
    return hh === want || alts.map(norm).includes(hh);
  });
}

// สี marker ตามกฎ
function markerColor(status, warrantyStatus) {
  const st = norm(status);
  const ws = norm(warrantyStatus);
  if (st === 'เปิดใช้งาน' && ws === 'อยู่ในประกัน') return '#00E036';
  if (st === 'เปิดใช้งาน' && ws === 'หมดประกัน')  return '#0B00E0';
  if (st === 'ปิดใช้งานชั่วคราว')                 return '#EB7302';
  if (st === 'ปิดใช้งาน')                         return '#EB020A';
  return '#737373';
}

// --------- (ใหม่) ดึงหลายชีตครั้งเดียวด้วย batchGet + backoff ----------
async function batchGetAllSheets(sheetNames, attempt = 0) {
  // cache 1 นาที (ลด reload ถี่ ๆ)
  const cacheKey = 'sheets-cache-v1';
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    try {
      const obj = JSON.parse(cached);
      if (Date.now() - obj.time < 60_000) return obj.data; // 1 นาที
    } catch {}
  }

  const ranges = sheetNames.map(n => encodeURIComponent(n));
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values:batchGet?` +
              ranges.map(r => `ranges=${r}`).join('&') + `&majorDimension=ROWS&key=${API_KEY}`;

  const res = await fetch(url);
  if (res.status === 429 && attempt < 4) {
    // exponential backoff: 1s, 2s, 4s, 8s
    const delay = 1000 * Math.pow(2, attempt);
    console.warn(`429 rate-limit: retry in ${delay}ms`);
    await new Promise(r => setTimeout(r, delay));
    return batchGetAllSheets(sheetNames, attempt + 1);
  }
  if (!res.ok) {
    console.error('batchGet error', res.status, res.statusText);
    return null;
  }
  const data = await res.json();

  // cache
  localStorage.setItem(cacheKey, JSON.stringify({ time: Date.now(), data }));
  return data;
}

// --------- ใช้ batchGet แล้ววาด marker ----------
async function renderAllSheetsBatch(map) {
  const resp = await batchGetAllSheets(SHEET_NAMES);
  if (!resp || !resp.valueRanges) return;

  const allLatLng = [];
  let plotted = 0;

  for (const vr of resp.valueRanges) {
    const sheetName = vr.range.split('!')[0].replace(/^'/,'').replace(/'$/,''); // ชื่อชีต
    const values = vr.values;
    if (!values || values.length < 2) continue;

    const headers = values[0].map(h => norm(h));
    const rows    = values.slice(1);

    const idxLat          = findCol(headers,'Lat');
    const idxLng          = findCol(headers,'Long');
    if (idxLat < 0 || idxLng < 0) {
      console.warn(`ชีต "${sheetName}" ไม่มี Lat/Long ข้าม`);
      continue;
    }
    const idxPlace        = findCol(headers,'พื้นที่');
    const idxType         = findCol(headers,'Type');
    const idxStatus       = findCol(headers,'สถานะ');
    const idxWStatus      = findCol(headers,'สถานะประกัน',['สถานะ ประกัน','สถานะ-ประกัน']);
    const idxContactName  = findCol(headers,'ชื่อผู้ดูแล');
    const idxContactPhone = findCol(headers,'เบอร์โทร/ผู้ดูแล',['เบอร์โทร / ผู้ดูแล']);
    const idxWarrantyDate = findCol(headers,'วันที่หมดระยะประกัน',['วันหมดระยะประกัน']);

    rows.forEach(r => {
      const lat = num(r[idxLat]);
      const lng = num(r[idxLng]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      const place        = idxPlace        >= 0 ? r[idxPlace]        : '-';
      const type         = idxType         >= 0 ? r[idxType]         : '-';
      const status       = idxStatus       >= 0 ? r[idxStatus]       : '-';
      let   wStatus      = idxWStatus      >= 0 ? r[idxWStatus]      : '';
      const contactName  = idxContactName  >= 0 ? r[idxContactName]  : '-';
      const contactPhone = idxContactPhone >= 0 ? r[idxContactPhone] : '-';
      const warrantyDate = idxWarrantyDate >= 0 ? r[idxWarrantyDate] : '-';

      if (!norm(wStatus) && norm(warrantyDate)) {
        const d = new Date(warrantyDate);
        if (!isNaN(d)) wStatus = (d >= new Date()) ? 'อยู่ในประกัน' : 'หมดประกัน';
      }

      const color = markerColor(status, wStatus);
      L.circleMarker([lat, lng], {
        radius: 7,
        color,
        fillColor: color,
        fillOpacity: 0.85,
        weight: 1
      })
      .bindPopup(`
        <b>${norm(place)}</b><br/>
        ประเภท: ${norm(type)}<br/>
        สถานะ: ${norm(status)}<br/>
        สถานะประกัน: ${norm(wStatus) || '-'}<br/>
        วันที่หมดระยะประกัน: ${norm(warrantyDate) || '-'}<br/>
        ผู้ดูแล: ${norm(contactName)}<br/>
        เบอร์โทร: ${norm(contactPhone)}
      `)
      .bindTooltip(norm(place), { direction: 'top', offset: [0, -8] })
      .addTo(map);

      allLatLng.push([lat, lng]);
      plotted++;
    });
  }

  if (allLatLng.length) map.fitBounds(allLatLng, { padding: [30,30] });
  const el = document.getElementById('counter');
  if (el) el.textContent = `แสดงจุด: ${plotted.toLocaleString()}`;
}
