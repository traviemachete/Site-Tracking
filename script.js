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

function getColor(status, warrantyStatus) {
  if (status === 'ใช้งาน' && warrantyStatus === 'อยู่ในประกัน') return 'green';
  if (status === 'ใช้งาน' && warrantyStatus === 'หมดประกัน') return 'gray';
  if (status === 'ปิดใช้งาน') return 'red';
  return 'blue'; // fallback
}

async function renderAllSheets() {
  for (const name of SHEET_NAMES) {
    try {
      const data = await fetchSheetData(name);
      const rows = data.values;
      if (!rows || rows.length < 2) continue;

      const headers = rows[0];
      const body = rows.slice(1);

      body.forEach(row => {
        const rowData = Object.fromEntries(headers.map((h, i) => [h.trim(), row[i] || ""]));

        const lat = parseFloat(rowData['Lat']);
        const lng = parseFloat(rowData['Long']);
        const status = rowData['สถานะ'].trim();
        const warrantyStatus = rowData['สถานะประกัน'].trim();

        const popupText = `
          <b>${rowData['พื้นที่']}</b><br>
          ประเภท: ${rowData['Type']}<br>
          สถานะ: ${status}<br>
          สถานะประกัน: ${warrantyStatus}<br>
          ผู้ดูแล: ${rowData['ชื่อผู้ดูแล']}<br>
          เบอร์โทร: ${rowData['เบอร์โทร/ผู้ดูแล']}<br>
          หมดประกัน: ${rowData['วันที่หมดระยะประกัน']}
        `;

        if (!isNaN(lat) && !isNaN(lng)) {
          L.circleMarker([lat, lng], {
            radius: 8,
            color: getColor(status, warrantyStatus),
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
