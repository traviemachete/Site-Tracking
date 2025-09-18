const SHEET_ID = '1OF8QYGVpeiKjVToRvJQfTuKUreZTOcc9yZYxQXlh5vQ';
const SHEET_NAMES = ['เอน คอนเนทค', 'อินโนวาเทค โซลูชั่น', 'พินพอยท์ อินโนเวชั่น', 'เอสทีอาร์ อินโนเวชั่น', 'อีสาน-ส่วนกลาง', 'เขต 7'];
const API_KEY = 'AIzaSyBJ99_hsyJJQe4SyntE4SzORk8S0VhNF7I';

const map = L.map('map').setView([15.5, 101.0], 7);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

async function fetchSheetData(sheetName) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(sheetName)}?key=${API_KEY}`;
  const res = await fetch(url);
  return res.json();
}

function getColor(status, warrantyDate) {
  const now = new Date();
  const warranty = new Date(warrantyDate);

  if (status === 'เปิดใช้งาน' && warranty >= now) return 'green';
  if (status === 'เปิดใช้งาน' && warranty < now) return 'gray';
  if (status === 'ปิดใช้งาน') return 'red';
  return 'blue';
}

async function renderAllSheets() {
  for (const name of SHEET_NAMES) {
    try {
      const data = await fetchSheetData(name);
      const rows = data.values;
      if (!rows || rows.length < 2) continue;

      const headers = rows[0];
      const body = rows.slice(1);

      // หา index ที่แม่นยำจากชื่อคอลัมน์แทนการ hardcode
      const latIdx = headers.findIndex(h => h.trim() === 'Lat');
      const lngIdx = headers.findIndex(h => h.trim() === 'Long');
      const areaIdx = headers.findIndex(h => h.trim() === 'พื้นที่');
      const typeIdx = headers.findIndex(h => h.trim() === 'Type');
      const statusIdx = headers.findIndex(h => h.trim() === 'สถานะ');
      const nameIdx = headers.findIndex(h => h.trim() === 'ชื่อผู้ดูแล');
      const phoneIdx = headers.findIndex(h => h.trim() === 'เบอร์โทร/ผู้ดูแล');
      const warrantyIdx = headers.findIndex(h => h.trim() === 'วันที่หมดระยะประกัน');

      body.forEach(row => {
        const lat = parseFloat(row[latIdx]);
        const lng = parseFloat(row[lngIdx]);
        const status = row[statusIdx]?.trim() || '';
        const warranty = row[warrantyIdx]?.trim() || '';

        const popupText = `
          <b>${row[areaIdx]}</b><br>
          ประเภท: ${row[typeIdx]}<br>
          สถานะ: ${row[statusIdx]}<br>
          ผู้ดูแล: ${row[nameIdx]}<br>
          เบอร์โทร: ${row[phoneIdx]}<br>
          หมดประกัน: ${row[warrantyIdx]}<br>
        `;

        if (!isNaN(lat) && !isNaN(lng)) {
          L.circleMarker([lat, lng], {
            radius: 8,
            color: getColor(status, warranty),
            fillOpacity: 0.7
          }).bindPopup(popupText).addTo(map);
        }
      });
    } catch (err) {
      console.error('❌ Error loading sheet:', name, err);
    }
  }
}

renderAllSheets();
