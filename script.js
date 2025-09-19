/* ====== script.js (ส่วน hide/show เพิ่มท้ายไฟล์เดิม) ====== */
/* ...โค้ดเดิมของคุณทั้งหมดอยู่ด้านบน... */

// === Toggle ทั้งกองด้านขวา ===
const sideStack   = document.getElementById('side-stack');
const stackToggle = document.getElementById('stack-toggle');

function setStackHidden(hidden){
  sideStack.classList.toggle('hidden', hidden);
  // หมุนลูกศร: ใช้ CSS selector .side-stack.hidden ~ .stack-toggle
  stackToggle.setAttribute('aria-expanded', String(!hidden));
  // จำสถานะไว้
  try { localStorage.setItem('stackHidden', hidden ? '1' : '0'); } catch {}
}

// โหลดสถานะเดิม
try {
  const saved = localStorage.getItem('stackHidden');
  if (saved === '1') setStackHidden(true);
} catch {}

stackToggle.addEventListener('click', () => {
  setStackHidden(!sideStack.classList.contains('hidden'));
});

// === Toggle พับ/กางแต่ละ panel ===
document.querySelectorAll('.collapse-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const id = btn.getAttribute('data-collapse');
    const panel = document.getElementById(id);
    panel.classList.toggle('is-collapsed');
    const expanded = !panel.classList.contains('is-collapsed');
    btn.setAttribute('aria-expanded', String(expanded));
    // เปลี่ยนไอคอนเล็กน้อย
    btn.textContent = expanded ? '—' : '+';
    // จำสถานะแยก
    try { localStorage.setItem('collapse:'+id, expanded ? '0' : '1'); } catch {}
  });

  // โหลดสถานะเดิมของแต่ละการ์ด
  const id = btn.getAttribute('data-collapse');
  try {
    const saved = localStorage.getItem('collapse:'+id);
    if (saved === '1') {
      const panel = document.getElementById(id);
      panel.classList.add('is-collapsed');
      btn.setAttribute('aria-expanded', 'false');
      btn.textContent = '+';
    }
  } catch {}
});
