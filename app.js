// app.js - Version 4.0 (Pagination, Export CSV, Monthly Trend Chart)

let filterOwner = 'all';
let filterType = 'all';
let filterDate = 'this-month';
let currentUserRole = 'me';
let isSaving = false; // 🔒 ป้องกันกดซ้ำ (Loading State)

// ✨ [ข้อ 6] Pagination State
let currentPage = 1;
const ROWS_PER_PAGE = 20;
let filteredTxsCache = []; // เก็บข้อมูลหลัง filter เพื่อใช้กับ pagination + export

function initUserIdentity(userId) {
    const userDisplay = document.getElementById('userDisplay');
    const txOwnerInput = document.getElementById('txOwner');
    if (userId === '4ffee1dd-ff34-47c0-a623-7dcc76d80c0f') {
        currentUserRole = 'me';
        userDisplay.innerHTML = `🙋‍♂️ ผู้ใช้งานระบบปัจจุบัน: <span class="text-primary">คุณเดฟ (แอดมิน)</span>`;
        if (txOwnerInput) txOwnerInput.value = 'me';
    } else {
        currentUserRole = 'partner';
        userDisplay.innerHTML = `🙋‍♀️ ผู้ใช้งานระบบปัจจุบัน: <span class="text-danger">คุณแฟนคนสวย</span>`;
        if (txOwnerInput) txOwnerInput.value = 'partner';
    }
}

window.onload = function () {
    setTimeout(async () => {
        try {
            setupSlipScannerListener(); // เปิดระบบดักจับและส่งสลิปให้ AI ประมวลผล
            // โหลดหมวดหมู่ และ โหลดตารางรายการเงินไปพร้อมๆ กัน ไม่ต้องรอคิว
            await Promise.all([loadCategories(), updateFilters()]);
        } catch (err) {
            console.error("Initialization Error:", err);
            showToast("เกิดข้อผิดพลาดในการโหลดข้อมูลเริ่มต้น กรุณารีเฟรชหน้าเว็บ", "⚠️", true);
        }
    }, 400);
}

// 🖼️ เทคนิคบีบอัดรูปภาพหน้าบ้านก่อนส่งขึ้น Cloud (~100KB)
function compressImage(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 800;
                let width = img.width; let height = img.height;

                if (width > MAX_WIDTH) {
                    height *= MAX_WIDTH / width; width = MAX_WIDTH;
                }
                canvas.width = width; canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                ctx.canvas.toBlob((blob) => {
                    resolve(new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() }));
                }, 'image/jpeg', 0.7);
            };
        };
    });
}

// ✨ [ข้อ 4] Helper: ล็อก/ปลดล็อกปุ่มหมวดหมู่ทั้งหมด ป้องกันกดซ้ำ
function setAllCategoryButtonsLoading(loading) {
    isSaving = loading;
    const allBtns = document.querySelectorAll('.category-btn');
    allBtns.forEach(btn => {
        btn.disabled = loading;
        if (loading) {
            btn.style.opacity = '0.6';
            btn.style.pointerEvents = 'none';
        } else {
            btn.style.opacity = '1';
            btn.style.pointerEvents = 'auto';
        }
    });
}

// ✨ [ข้อ 5] ฟังก์ชันยืนยันสแกนสลิป — เรียกจากปุ่ม "ยืนยันสแกน" ใน Preview
async function confirmSlipScan() {
    const previewArea = document.getElementById('slipPreviewArea');
    const statusEl = document.getElementById('slipLoadingStatus');
    const slipInput = document.getElementById('slipInput');
    const file = slipInput.files[0];
    if (!file) return;

    // ซ่อน preview แสดง loading
    previewArea.classList.add('d-none');
    statusEl.classList.remove('d-none');

    try {
        // 🔄 1. ดึงคีย์ลับจาก Supabase มาใช้งานแบบ Real-time
        const { data: secretData, error: secretError } = await supabaseClient
            .from('system_secrets')
            .select('key_value')
            .eq('key_name', 'GEMINI_API_KEY')
            .single();

        if (secretError || !secretData) {
            throw new Error("ระบบหา API Key ในฐานข้อมูลไม่เจอ กรุณาเช็คตาราง system_secrets ครับ");
        }

        const liveGeminiKey = secretData.key_value;

        // 2. บีบอัดรูปภาพ
        const compressedFile = await compressImage(file);

        // 3. อัปโหลดเข้าถังพักชั่วคราว Supabase Storage
        const fileExt = compressedFile.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

        const { data: uploadData, error: uploadError } = await supabaseClient
            .storage
            .from('slips')
            .upload(fileName, compressedFile);

        if (uploadError) throw uploadError;

        // 4. แปลงภาพสลิปเป็น Base64
        const base64Data = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.readAsDataURL(compressedFile);
            reader.onloadend = () => resolve(reader.result.split(',')[1]);
        });

        // 5. ส่งให้ Gemini ทำงาน — ✨ [ข้อ 3] Prompt ใหม่แกะข้อมูลเพิ่ม
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${liveGeminiKey}`;
        const promptPayload = {
            contents: [{
                parts: [
                    { text: `นี่คือรูปสลิปโอนเงินของธนาคารในไทย ให้แกะข้อมูลต่อไปนี้จากสลิป:
1. "amount" — ยอดเงินสุทธิที่โอนสำเร็จ (Total/Amount) เป็นตัวเลขทศนิยม เช่น 150.00
2. "date" — วันที่ทำรายการในรูปแบบ YYYY-MM-DD (เช่น 2026-06-19) ถ้าไม่มีให้ใส่ null
3. "receiver" — ชื่อผู้รับเงินหรือชื่อร้านค้า/บัญชีปลายทาง ถ้าไม่มีให้ใส่ null
4. "bank" — ชื่อธนาคาร/ช่องทางที่โอน (เช่น กสิกร, SCB, PromptPay) ถ้าไม่มีให้ใส่ null
5. "category_suggestion" — เดาหมวดหมู่รายจ่ายที่น่าจะเป็นไปได้มากที่สุด 1 ชื่อ เช่น "อาหาร", "ค่าเช่า", "ช้อปปิ้ง", "ค่าน้ำค่าไฟ" ถ้าเดาไม่ได้ให้ใส่ null

ตอบกลับเฉพาะ JSON เท่านั้น ตัวอย่าง:
{"amount": 150.00, "date": "2026-06-19", "receiver": "นาย ก", "bank": "กสิกร", "category_suggestion": "อาหาร"}` },
                    { inlineData: { mimeType: "image/jpeg", data: base64Data } }
                ]
            }],
            generationConfig: {
                responseMimeType: "application/json"
            }
        };

        // 🔄 Retry logic: ถ้าโดน rate limit (429) จะรอแล้วลองใหม่อัตโนมัติ สูงสุด 3 ครั้ง
        let resData = null;
        const MAX_RETRIES = 3;
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            const response = await fetch(geminiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(promptPayload) });
            resData = await response.json();

            if (response.status === 429 && attempt < MAX_RETRIES) {
                let waitSec = 30;
                const retryMatch = JSON.stringify(resData).match(/retry in ([\d.]+)s/i);
                if (retryMatch) waitSec = Math.ceil(parseFloat(retryMatch[1]));

                showToast(`⏳ API เกินโควต้าชั่วคราว รอ ${waitSec} วินาทีแล้วลองใหม่ครั้งที่ ${attempt + 1}...`, '🔄');
                await new Promise(r => setTimeout(r, waitSec * 1000));
                continue;
            }
            break;
        }

        if (!resData.candidates || resData.candidates.length === 0) {
            throw new Error(resData.error?.message || "Google Gemini ปฏิเสธการแกะโครงสร้างสลิปใบนี้");
        }

        const aiText = resData.candidates[0].content.parts[0].text.trim();
        const result = JSON.parse(aiText);

        // 6. ✨ [ข้อ 3] ใส่ข้อมูลเข้าฟอร์มออโต้ (แกะข้อมูลเพิ่มจาก AI)
        document.getElementById('txAmount').value = parseFloat(result.amount).toFixed(2);

        // สร้างโน้ตอัจฉริยะจากข้อมูลที่ AI แกะได้
        let smartNote = `[SLIP_URL:${fileName}]`;
        const infoParts = [];
        if (result.receiver) infoParts.push(`ผู้รับ: ${result.receiver}`);
        if (result.bank) infoParts.push(`ผ่าน: ${result.bank}`);
        if (result.date) infoParts.push(`วันที่: ${result.date}`);
        if (infoParts.length > 0) {
            smartNote += ` ${infoParts.join(' | ')}`;
        } else {
            smartNote += ' รอคุณระบุชื่อรายการจริง';
        }
        document.getElementById('txNote').value = smartNote;

        // แสดงผลลัพธ์ AI ให้ผู้ใช้เห็นใน Preview Area
        let aiResultHTML = `<div class="mt-2 p-2 bg-success bg-opacity-10 rounded-3 border border-success border-opacity-25">
            <p class="small fw-bold text-success mb-1">🤖 AI แกะข้อมูลสำเร็จ:</p>
            <ul class="list-unstyled small mb-0 text-dark">
                <li>💰 ยอดเงิน: <b>${parseFloat(result.amount).toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท</b></li>`;
        if (result.receiver) aiResultHTML += `<li>👤 ผู้รับ: <b>${result.receiver}</b></li>`;
        if (result.bank) aiResultHTML += `<li>🏦 ธนาคาร: <b>${result.bank}</b></li>`;
        if (result.date) aiResultHTML += `<li>📅 วันที่: <b>${result.date}</b></li>`;
        if (result.category_suggestion) aiResultHTML += `<li>🏷️ หมวดหมู่ที่แนะนำ: <b>${result.category_suggestion}</b></li>`;
        aiResultHTML += `</ul></div>`;

        previewArea.innerHTML = `
            <div class="text-center">
                <span class="text-success small fw-bold">✅ สแกนเรียบร้อย กรุณาเลือกกระเป๋าเงินและหมวดหมู่เพื่อบันทึก</span>
                ${aiResultHTML}
            </div>`;
        previewArea.classList.remove('d-none');

        showToast('AI แกะข้อมูลจากสลิปเรียบร้อยแล้วจ้า! กรุณากดเลือกกระเป๋าเงินและปุ่มหมวดหมู่เพื่อบันทึกต่อได้เลย', '🤖');

    } catch (err) {
        console.error(err);
        showToast(`ระบบสแกนสลิปขัดข้อง: ${err.message}`, '⚠️', true);
        previewArea.classList.add('d-none');
    } finally {
        statusEl.classList.add('d-none');
    }
}

// ✨ [ข้อ 5] ยกเลิก Preview สลิป
function cancelSlipPreview() {
    const slipInput = document.getElementById('slipInput');
    const previewArea = document.getElementById('slipPreviewArea');
    slipInput.value = '';
    previewArea.classList.add('d-none');
}

// ✨ [ข้อ 5] ดักจับสลิปเวอร์ชันใหม่ — แสดง Preview ก่อนส่ง AI
function setupSlipScannerListener() {
    const slipInput = document.getElementById('slipInput');
    if (!slipInput) return;

    slipInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // แสดง Preview รูปสลิปก่อนส่ง AI
        const previewArea = document.getElementById('slipPreviewArea');
        const reader = new FileReader();
        reader.onload = (event) => {
            previewArea.innerHTML = `
                <div class="text-center">
                    <p class="small fw-bold text-secondary mb-2">🖼️ ตรวจสอบรูปสลิปก่อนส่ง AI สแกน</p>
                    <img src="${event.target.result}" class="img-fluid rounded-3 border mb-2" style="max-height: 250px; object-fit: contain;" alt="Slip Preview">
                    <div class="d-flex justify-content-center gap-2 mt-2">
                        <button onclick="confirmSlipScan()" class="btn btn-success btn-sm fw-bold px-3 rounded-3">
                            <i class="bi bi-robot me-1"></i> ✅ ยืนยันส่งสแกน
                        </button>
                        <button onclick="cancelSlipPreview()" class="btn btn-outline-secondary btn-sm fw-bold px-3 rounded-3">
                            ❌ ยกเลิก
                        </button>
                    </div>
                </div>`;
            previewArea.classList.remove('d-none');
        };
        reader.readAsDataURL(file);
    });
}

async function handleLogout() {
    try {
        await supabaseClient.auth.signOut();
    } catch (err) {
        console.error("Logout Error:", err);
    } finally {
        window.location.href = 'login.html';
    }
}

async function updateFilters() {
    filterOwner = document.getElementById('filterOwner').value;
    filterType = document.getElementById('filterType').value;
    filterDate = document.getElementById('filterDate').value;
    // โหลดเป้าหมาย และ ธุรกรรม ไปพร้อมๆ กันเพื่อลดเวลาการรอคอย
    await Promise.all([loadGoals(), loadTransactions()]);
}

function showToast(message, icon = '✨', isError = false) {
    const toast = document.getElementById('toastNotification');
    const toastIcon = document.getElementById('toastIcon');
    const toastMessage = document.getElementById('toastMessage');
    toastIcon.innerText = icon; toastMessage.innerText = message;
    if (isError) { toast.classList.remove('bg-dark'); toast.style.backgroundColor = '#dc3545'; }
    else { toast.style.backgroundColor = ''; toast.classList.add('bg-dark'); }
    toast.classList.add('show'); setTimeout(() => { toast.classList.remove('show'); }, 3000);
}

async function loadCategories() {
    const { data: categories, error } = await supabaseClient.from('categories').select('*').order('name', { ascending: true });
    if (error) return console.error(error);
    const expenseArea = document.getElementById('expenseButtons');
    const incomeArea = document.getElementById('incomeButtons');
    expenseArea.innerHTML = ''; incomeArea.innerHTML = '';
    categories.forEach(cat => {
        const btn = document.createElement('button');
        btn.innerText = cat.name;
        btn.className = cat.type === 'expense' ? "btn btn-outline-danger btn-sm category-btn" : "btn btn-outline-success btn-sm category-btn";
        btn.onclick = () => saveTransaction(cat.name, cat.type);
        if (cat.type === 'expense') expenseArea.appendChild(btn); else incomeArea.appendChild(btn);
    });
}

// ✨ [ข้อ 4] saveTransaction พร้อม Loading State
async function saveTransaction(categoryName, type) {
    if (isSaving) return; // ป้องกันกดซ้ำ

    const amountInput = document.getElementById('txAmount');
    const noteInput = document.getElementById('txNote');
    const ownerInput = document.getElementById('txOwner');
    const slipInput = document.getElementById('slipInput');
    const previewArea = document.getElementById('slipPreviewArea');

    if (!ownerInput.value) return showToast('กรุณาเลือกกระเป๋าเงินด้วยครับ', '⚠️', true);
    const amount = parseFloat(amountInput.value);
    if (isNaN(amount) || amount <= 0) return showToast('กรุณากรอกจำนวนเงินให้ถูกต้องก่อนเลือกหมวดหมู่', '🔢', true);
    const finalAmount = parseFloat(amount.toFixed(2));

    // 🔒 ล็อกปุ่มทั้งหมด
    setAllCategoryButtonsLoading(true);

    let dbOwner = ownerInput.value;
    let finalNote = noteInput.value.trim();

    let finalCategory = categoryName;
    if (finalNote.includes('[SLIP_URL:')) {
        finalCategory = "สลิปรอระบุหมวดหมู่";
    }

    if (dbOwner === 'shared-me') { dbOwner = 'shared'; finalNote = finalNote ? `[จ่ายโดย: me] ${finalNote}` : `[จ่ายโดย: me]`; }
    else if (dbOwner === 'shared-partner') { dbOwner = 'shared'; finalNote = finalNote ? `[จ่ายโดย: partner] ${finalNote}` : `[จ่ายโดย: partner]`; }

    const { error } = await supabaseClient
        .from('transactions')
        .insert([{ amount: finalAmount, type: type, category_name: finalCategory, note: finalNote || null, owner: dbOwner }]);

    if (error) {
        showToast(`บันทึกไม่สำเร็จ: ${error.message}`, '❌', true);
    } else {
        amountInput.value = ''; noteInput.value = ''; if (slipInput) slipInput.value = '';
        if (previewArea) previewArea.classList.add('d-none');
        ownerInput.value = currentUserRole === 'me' ? 'me' : 'partner';
        showToast('จดบันทึกเรียบร้อยแล้วจ้า! 💰', '✅');
        await loadTransactions();
    }

    // 🔓 ปลดล็อกปุ่มทั้งหมด
    setAllCategoryButtonsLoading(false);
}

// ✨ [ข้อ 2] XSS Fix: ใช้ escapeForAttr() ป้องกันตัวอักษรพิเศษใน onclick attribute
function escapeForAttr(str) {
    if (!str) return '';
    return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function enterEditMode(id, amount, note, originalOwner) {
    document.getElementById('editTxId').value = id;
    document.getElementById('txAmount').value = parseFloat(amount).toFixed(2);

    let displayOwner = originalOwner;
    let displayNote = note || '';

    if (originalOwner === 'shared') {
        if (displayNote.startsWith('[จ่ายโดย: me]')) { displayOwner = 'shared-me'; displayNote = displayNote.replace('[จ่ายโดย: me] ', '').replace('[จ่ายโดย: me]', ''); }
        else if (displayNote.startsWith('[จ่ายโดย: partner]')) { displayOwner = 'shared-partner'; displayNote = displayNote.replace('[จ่ายโดย: partner] ', '').replace('[จ่ายโดย: partner]', ''); }
    }

    const existingSlipArea = document.getElementById('existingSlipArea');
    if (existingSlipArea) existingSlipArea.remove();

    if (displayNote.includes('[SLIP_URL:')) {
        const match = displayNote.match(/\[SLIP_URL:(.*?)\]/);
        if (match && match[1]) {
            const fileName = match[1];
            const { data } = supabaseClient.storage.from('slips').getPublicUrl(fileName);

            const infoDiv = document.createElement('div');
            infoDiv.id = 'existingSlipArea';
            infoDiv.className = 'mt-2 mb-2 p-2 bg-white rounded border text-center';
            infoDiv.innerHTML = `
                <span class="text-muted small d-block mb-1">🖼️ รูปสลิปต้นฉบับสำหรับการตรวจสอบย้อนหลัง</span>
                <a href="${data.publicUrl}" target="_blank" class="btn btn-xs btn-outline-info py-0 px-2 small" style="font-size:0.75rem;"><i class="bi bi-image"></i> คลิกขยายเปิดดูรูปสลิป</a>
            `;
            document.getElementById('recordBox').appendChild(infoDiv);
        }
    }

    document.getElementById('txNote').value = displayNote;
    document.getElementById('txOwner').value = displayOwner;

    const recordBox = document.getElementById('recordBox');
    recordBox.style.backgroundColor = '#fff3cd'; recordBox.style.borderColor = '#ffc107';
    document.getElementById('recordBoxTitle').innerHTML = '<i class="bi bi-pencil-fill text-warning me-1"></i> แก้ไขและระบุหมวดหมู่จริง';
    document.getElementById('categoryActionArea').classList.add('d-none');
    document.getElementById('editActionArea').classList.remove('d-none');
    window.scrollTo({ top: 100, behavior: 'smooth' });
}

function cancelEditMode() {
    document.getElementById('editTxId').value = ''; document.getElementById('txAmount').value = ''; document.getElementById('txNote').value = '';
    document.getElementById('txOwner').value = currentUserRole === 'me' ? 'me' : 'partner';
    const existingSlipArea = document.getElementById('existingSlipArea'); if (existingSlipArea) existingSlipArea.remove();
    const recordBox = document.getElementById('recordBox'); recordBox.style.backgroundColor = '#ffffff'; recordBox.style.borderColor = 'transparent';
    document.getElementById('recordBoxTitle').innerHTML = '<i class="bi bi-plus-square-fill text-success me-2"></i> บันทึกรายการใหม่';
    document.getElementById('categoryActionArea').classList.remove('d-none'); document.getElementById('editActionArea').classList.add('d-none');
}

// ✨ [ข้อ 4] submitEditTransaction พร้อม Loading State
async function submitEditTransaction() {
    const editBtn = document.querySelector('#editActionArea .btn-warning');
    if (editBtn) { editBtn.disabled = true; editBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> กำลังบันทึก...'; }

    const id = document.getElementById('editTxId').value;
    const amount = parseFloat(document.getElementById('txAmount').value);
    const note = document.getElementById('txNote').value.trim();
    const owner = document.getElementById('txOwner').value;

    if (!owner) { if (editBtn) { editBtn.disabled = false; editBtn.innerHTML = '💾 บันทึกการแก้ไข'; } return showToast('กรุณาเลือกกระเป๋าเงินด้วยครับ', '⚠️', true); }
    if (isNaN(amount) || amount <= 0) { if (editBtn) { editBtn.disabled = false; editBtn.innerHTML = '💾 บันทึกการแก้ไข'; } return showToast('กรุณากรอกยอดเงินให้ถูกต้อง', '🔢', true); }
    const finalAmount = parseFloat(amount.toFixed(2));

    // ดึงข้อมูลเดิมมาเช็คว่ามีสลิปผูกอยู่ไหม เพื่อเตรียมลบรูปคืนพื้นที่คลาวด์
    const { data: currentTx } = await supabaseClient.from('transactions').select('note, category_name').eq('id', id).single();
    let fileToDelete = null;
    if (currentTx && currentTx.note && currentTx.note.includes('[SLIP_URL:')) {
        const match = currentTx.note.match(/\[SLIP_URL:(.*?)\]/);
        if (match && match[1]) fileToDelete = match[1];
    }

    let dbOwner = owner;
    let finalNote = note;

    if (dbOwner === 'shared-me') { dbOwner = 'shared'; finalNote = finalNote ? `[จ่ายโดย: me] ${finalNote}` : `[จ่ายโดย: me]`; }
    else if (dbOwner === 'shared-partner') { dbOwner = 'shared'; finalNote = finalNote ? `[จ่ายโดย: partner] ${finalNote}` : `[จ่ายโดย: partner]`; }

    // 💡 ดึงหมวดหมู่ตามจริง
    let finalCategory = currentTx ? currentTx.category_name : 'ทั่วไป';
    if (finalCategory === "สลิปรอระบุหมวดหมู่" && !finalNote.includes('[SLIP_URL:')) {
        finalCategory = "ทั่วไป";
    }

    const { error: updateError } = await supabaseClient
        .from('transactions')
        .update({ amount: finalAmount, note: finalNote || null, owner: dbOwner, category_name: finalCategory })
        .eq('id', id);

    if (updateError) {
        showToast(`แก้ไขล้มเหลว: ${updateError.message}`, '❌', true);
    } else {
        // 🔥 ถ้าลบแท็กสลิปออกแล้ว สั่งทำลายรูปภาพใน Storage ทันที
        if (fileToDelete && !finalNote.includes('[SLIP_URL:')) {
            await supabaseClient.storage.from('slips').remove([fileToDelete]);
            console.log(`[Storage Purged] ลบไฟล์รูปสลิป ${fileToDelete} ออกเพื่อคืนพื้นที่ Storage เรียบร้อย`);
        }

        cancelEditMode();
        showToast('อัปเดตข้อมูลและลบรูปภาพสลิปคืนพื้นที่เรียบร้อยแล้วจ้า!', '💾');
        await loadTransactions();
    }

    if (editBtn) { editBtn.disabled = false; editBtn.innerHTML = '💾 บันทึกการแก้ไข'; }
}

async function deleteTransaction(id) {
    if (!confirm('คุณแน่ใจใช่ไหมที่จะลบประวัติรายการเงินแถวนี้ทิ้งอย่างถาวร?')) return;

    // ✨ [ข้อ 4] ล็อกปุ่มลบที่กด
    const deleteBtn = document.querySelector(`[data-delete-id="${id}"]`);
    if (deleteBtn) { deleteBtn.disabled = true; deleteBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>'; }

    const { data: currentTx } = await supabaseClient.from('transactions').select('note').eq('id', id).single();
    if (currentTx && currentTx.note && currentTx.note.includes('[SLIP_URL:')) {
        const match = currentTx.note.match(/\[SLIP_URL:(.*?)\]/);
        if (match && match[1]) await supabaseClient.storage.from('slips').remove([match[1]]);
    }

    const { error } = await supabaseClient.from('transactions').delete().eq('id', id);
    if (error) showToast(`ลบไม่สำเร็จ: ${error.message}`, '❌', true); else { showToast('ลบรายการเงินทิ้งเรียบร้อย', '🗑️'); await loadTransactions(); }
}

async function createNewGoalFrontend() {
    const titleInput = document.getElementById('newGoalTitle'); const amountInput = document.getElementById('newGoalAmount'); const typeInput = document.getElementById('newGoalType');
    const title = titleInput.value.trim(); const amount = parseFloat(amountInput.value);
    if (!title || isNaN(amount) || amount <= 0) return showToast('กรุณากรอกชื่อเควสและยอดเงินตั้งเป้าหมายให้ถูกต้องครับ', '⚠️', true);
    const now = new Date(); const targetMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const { error } = await supabaseClient.from('goals').insert([{ title: title, amount: amount, type: typeInput.value, goal_month: targetMonthStr, is_completed: false, is_failed: false }]);
    if (error) showToast(`เพิ่มภารกิจล้มเหลว: ${error.message}`, '❌', true); else { titleInput.value = ''; amountInput.value = ''; showToast('เพิ่มภารกิจลงหน้าจอสำเร็จแล้ว!', '➕'); await loadGoals(); }
}

async function loadGoals() {
    const now = new Date(); let targetMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    if (filterDate === 'last-month') { let prevMonth = now.getMonth() - 1; let prevYear = now.getFullYear(); if (prevMonth < 0) { prevMonth = 11; prevYear--; } targetMonthStr = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}`; }
    document.getElementById('checklistMonthLabel').innerText = filterDate === 'all' ? 'ทุกช่วงเวลา' : `ประจำเดือน ${targetMonthStr}`;
    let query = supabaseClient.from('goals').select('*'); if (filterDate !== 'all') { query = query.eq('goal_month', targetMonthStr); }
    let { data: goals, error } = await query.order('id', { ascending: true });
    if (error) return console.error(error);
    if (goals.length === 0 && filterDate !== 'all') {
        const defaultGoals = [
            { title: 'ออมเงินกองกลางไปเที่ยวญี่ปุ่น', amount: 2000, type: 'save', goal_month: targetMonthStr },
            { title: 'จ่ายค่าส่วนกลางคอนโด', amount: 1500, type: 'bill', goal_month: targetMonthStr },
            { title: 'หยอดกระปุกสำรองฉุกเฉินเพิ่ม', amount: 1000, type: 'save', goal_month: targetMonthStr }
        ];
        const { data: insertedData, error: insertError } = await supabaseClient.from('goals').insert(defaultGoals).select();
        if (!insertError) { goals = insertedData; showToast(`สร้าง Checklist เดือน ${targetMonthStr} ออโต้จ้า!`, '🎉'); }
    }
    const goalsList = document.getElementById('goalsList'); goalsList.innerHTML = '';
    if (!goals || goals.length === 0) { goalsList.innerHTML = '<p class="text-xs text-gray-400 text-center py-4">ไม่มีภารกิจการเงินระบุไว้</p>'; return; }
    goals.forEach(goal => {
        const safeTitle = escapeForAttr(goal.title);
        const div = document.createElement('div'); div.className = "list-group-item d-flex justify-content-between align-items-center p-2 mb-1 bg-light rounded-3 border-0 text-sm shadow-2xs";
        let actionUI = '';
        if (goal.is_completed) { actionUI = `<div class="d-flex align-items-center gap-2"><span class="badge bg-success">✅ สำเร็จ</span><button onclick="resetGoalStatus(${goal.id}, '${safeTitle}')" class="btn btn-outline-secondary btn-sm py-0 px-1 text-xs cursor-pointer" style="border-radius:6px;">↩️ รีเซ็ต</button></div>`; }
        else if (goal.is_failed) { actionUI = `<div class="d-flex align-items-center gap-2"><span class="badge bg-secondary text-dark">❌ ข้าม</span><button onclick="resetGoalStatus(${goal.id}, '${safeTitle}')" class="btn btn-outline-secondary btn-sm py-0 px-1 text-xs cursor-pointer" style="border-radius:6px;">↩️ รีเซ็ต</button></div>`; }
        else { actionUI = `<div class="btn-group btn-group-sm" style="border-radius:8px; overflow:hidden;"><button onclick="settleGoal(${goal.id}, 'success', '${safeTitle}', ${goal.amount}, '${goal.type}')" class="btn btn-outline-success py-0.5 px-2 cursor-pointer">✅ ออมแล้ว</button><button onclick="settleGoal(${goal.id}, 'failed', '${safeTitle}', ${goal.amount}, '${goal.type}')" class="btn btn-outline-danger py-0.5 px-2 cursor-pointer">❌ ข้าม</button><button onclick="deleteGoalFrontend(${goal.id})" class="btn btn-link text-muted p-0 px-1 ms-1 text-xs cursor-pointer" title="ลบถาวร">🗑️</button></div>`; }
        div.innerHTML = `<div class="text-truncate me-2"><span class="${goal.is_completed ? 'text-decoration-line-through text-muted' : goal.is_failed ? 'text-decoration-line-through text-black-50 font-normal' : 'fw-semibold text-dark'}">${goal.type === 'save' ? '🎯' : '📄'} ${goal.title}</span></div><div class="d-flex align-items-center gap-2 shrink-0"><span class="fw-bold text-dark">${parseFloat(goal.amount).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บ.</span>${actionUI}</div>`;
        goalsList.appendChild(div);
    });
}

async function settleGoal(id, status, title, amount, type) {
    if (status === 'success') {
        if (!confirm(`ยืนยันทำเควสสำเร็จ: "${title}"?\nระบบจะสร้างธุรกรรมออม/จ่ายเงินให้อัตโนมัติ`)) return;
        const { error } = await supabaseClient.from('goals').update({ is_completed: true, is_failed: false }).eq('id', id);
        if (error) return showToast(error.message, '❌', true);
        const finalAmount = parseFloat(parseFloat(amount).toFixed(2));
        if (type === 'save') { await supabaseClient.from('transactions').insert([{ amount: finalAmount, type: 'income', category_name: 'ลงทุน', owner: 'emergency', note: `ภารกิจสำเร็จ: ${title}` }]); showToast('ย้ายเงินเข้าบัญชีฉุกเฉินแล้ว 🎯', '🎉'); }
        else { let noteWithTag = `[จ่ายโดย: ${currentUserRole === 'me' ? 'me' : 'partner'}] จ่ายบิลออโต้: ${title}`; await supabaseClient.from('transactions').insert([{ amount: finalAmount, type: 'expense', category_name: 'ค่าที่พัก/บ้าน', owner: 'shared', note: noteWithTag }]); showToast('ตัดยอดบิลส่วนกลางเรียบร้อย 📄', '✅'); }
    } else {
        if (!confirm(`เดือนนี้ล้มเหลว/ข้ามภารกิจ: "${title}" ใช่ไหม?`)) return;
        const { error } = await supabaseClient.from('goals').update({ is_completed: false, is_failed: true }).eq('id', id);
        if (error) return showToast(error.message, '❌', true); showToast('บันทึกสถิติข้ามเควสแล้ว ❌', '📁');
    }
    await loadGoals(); await loadTransactions();
}

async function resetGoalStatus(id, title) {
    if (!confirm(`คุณต้องการยกเลิกสถานะของภารกิจ "${title}" เพื่อกลับไปเลือกกดติ๊กถูก/กากบาทใหม่ ใช่หรือไม่?`)) return;
    const { error } = await supabaseClient.from('goals').update({ is_completed: false, is_failed: false }).eq('id', id);
    if (error) return showToast(error.message, '❌', true); showToast('รีเซ็ตสถานะภารกิจกลับคืนเรียบร้อย', '↩️');
    await loadGoals();
}

async function deleteGoalFrontend(id) { if (!confirm('ต้องการลบภารกิจนี้ออกจากหน้าจอใช่ไหมครับ?')) return; const { error } = await supabaseClient.from('goals').delete().eq('id', id); if (error) showToast(error.message, '❌', true); else { showToast('ลบภารกิจออกแล้ว', '🗑️'); await loadGoals(); } }

async function loadTransactions() {
    const { data: txs, error } = await supabaseClient.from('transactions').select('*').order('created_at', { ascending: false });
    if (error) return console.error(error);
    const tbody = document.getElementById('transactionTableBody'); tbody.innerHTML = '';

    let myTotal = 0; let partnerTotal = 0; let sharedTotal = 0; let emergencyTotal = 0;
    let totalMePaidShared = 0; let totalPartnerPaidShared = 0;
    let categorySummary = {}; let totalExpenseFiltered = 0;
    const now = new Date(); const thisMonth = now.getMonth(); const thisYear = now.getFullYear();

    // ✨ [ข้อ 6] เก็บ filtered rows สำหรับ pagination + export
    filteredTxsCache = [];

    txs.forEach(tx => {
        const txDate = new Date(tx.created_at); const txAmount = parseFloat(tx.amount); const value = tx.type === 'income' ? txAmount : -txAmount;

        let exactOwner = tx.owner; let cleanNote = tx.note || '';
        if (tx.owner === 'shared') {
            if (cleanNote.startsWith('[จ่ายโดย: me]')) { exactOwner = 'shared-me'; cleanNote = cleanNote.replace('[จ่ายโดย: me] ', '').replace('[จ่ายโดย: me]', ''); }
            else if (cleanNote.startsWith('[จ่ายโดย: partner]')) { exactOwner = 'shared-partner'; cleanNote = cleanNote.replace('[จ่ายโดย: partner] ', '').replace('[จ่ายโดย: partner]', ''); }
        }

        if (tx.owner === 'me') myTotal += value;
        else if (tx.owner === 'partner') partnerTotal += value;
        else if (tx.owner === 'emergency') emergencyTotal += value;
        else if (tx.owner === 'shared') sharedTotal += value;

        let isCurrentFilterMonth = false;
        if (filterDate === 'this-month') { if (txDate.getMonth() !== thisMonth || txDate.getFullYear() !== thisYear) return; isCurrentFilterMonth = true; }
        else if (filterDate === 'last-month') { let targetMonth = thisMonth - 1; let targetYear = thisYear; if (targetMonth < 0) { targetMonth = 11; targetYear--; } if (txDate.getMonth() !== targetMonth || txDate.getFullYear() !== targetYear) return; isCurrentFilterMonth = true; }
        else { isCurrentFilterMonth = true; }

        if (isCurrentFilterMonth && tx.type === 'expense') {
            if (exactOwner === 'shared-me') totalMePaidShared += txAmount;
            if (exactOwner === 'shared-partner') totalPartnerPaidShared += txAmount;
        }

        let passOwnerFilter = true;
        if (filterOwner !== 'all') {
            if (filterOwner === 'shared' && !(exactOwner === 'shared' || exactOwner === 'shared-me' || exactOwner === 'shared-partner')) passOwnerFilter = false;
            if (filterOwner === 'me' && exactOwner !== 'me') passOwnerFilter = false;
            if (filterOwner === 'partner' && exactOwner !== 'partner') passOwnerFilter = false;
            if (filterOwner === 'emergency' && exactOwner !== 'emergency') passOwnerFilter = false;
        }
        let passTypeFilter = true; if (filterType !== 'all' && tx.type !== filterType) passTypeFilter = false;

        if (isCurrentFilterMonth && passOwnerFilter && passTypeFilter && tx.type === 'expense') {
            if (!categorySummary[tx.category_name]) categorySummary[tx.category_name] = 0;
            categorySummary[tx.category_name] += txAmount; totalExpenseFiltered += txAmount;
        }

        if (!passOwnerFilter || !passTypeFilter || !isCurrentFilterMonth) return;

        // เก็บเข้า cache สำหรับ pagination
        filteredTxsCache.push({ tx, txDate, txAmount, exactOwner, cleanNote });
    });

    // ✨ [ข้อ 6] Pagination: แสดงเฉพาะหน้าปัจจุบัน
    const totalPages = Math.max(1, Math.ceil(filteredTxsCache.length / ROWS_PER_PAGE));
    if (currentPage > totalPages) currentPage = totalPages;
    const startIdx = (currentPage - 1) * ROWS_PER_PAGE;
    const endIdx = startIdx + ROWS_PER_PAGE;
    const pageItems = filteredTxsCache.slice(startIdx, endIdx);

    pageItems.forEach(({ tx, txDate, txAmount, exactOwner, cleanNote }) => {
        let ownerBadge = '';
        if (exactOwner === 'me') ownerBadge = '<span class="badge bg-primary-subtle text-primary">🙋‍♂️ ฉัน</span>';
        else if (exactOwner === 'partner') ownerBadge = '<span class="badge bg-danger-subtle text-danger">🙋‍♀️ แฟน</span>';
        else if (exactOwner === 'emergency') ownerBadge = '<span class="badge bg-success text-white">🎯 ออมฉุกเฉิน</span>';
        else if (exactOwner === 'shared-me') ownerBadge = '<span class="badge bg-warning text-dark">🤝 ส่วนกลาง (ฉันจ่าย)</span>';
        else if (exactOwner === 'shared-partner') ownerBadge = '<span class="badge bg-warning text-dark">🤝 ส่วนกลาง (แฟนจ่าย)</span>';
        else ownerBadge = '<span class="badge bg-warning text-dark">🤝 ส่วนกลาง</span>';

        let displayNoteText = cleanNote;
        if (displayNoteText.includes('[SLIP_URL:')) {
            displayNoteText = displayNoteText.replace(/\[SLIP_URL:.*?\]/g, '').trim() || '📷 แนบไฟล์สลิป (คลิก ✏️ แก้ เพื่อลงหมวดหมู่จริง)';
        }

        const safeNote = escapeForAttr(tx.note || '');
        const safeOwner = escapeForAttr(tx.owner);

        const dateStr = txDate.toLocaleString('th-TH', { hour12: false });
        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="small text-muted">${dateStr}</td>
            <td>${ownerBadge}</td>
            <td class="fw-medium ${tx.type === 'expense' ? 'text-danger' : 'text-success'}">${tx.type === 'expense' ? 'รายจ่าย 🔴' : 'รายรับ 🟢'}</td>
            <td class="fw-semibold ${tx.category_name === 'สลิปรอระบุหมวดหมู่' ? 'text-warning' : ''}">
                ${tx.category_name === 'สลิปรอระบุหมวดหมู่' ? '⏳ รอระบุหมวดหมู่' : tx.category_name}
            </td>
            <td class="fw-bold">${txAmount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท</td>
            <td class="text-muted small">${displayNoteText || '-'}</td>
            <td class="text-center whitespace-nowrap">
                <button onclick="enterEditMode(${tx.id}, ${txAmount}, '${safeNote}', '${safeOwner}')" class="btn btn-outline-warning btn-sm py-0 px-2 cursor-pointer" style="border-radius:6px;">✏️ แก้</button>
                <button onclick="deleteTransaction(${tx.id})" data-delete-id="${tx.id}" class="btn btn-outline-danger btn-sm py-0 px-2 cursor-pointer" style="border-radius:6px;">🗑️ ลบ</button>
            </td>
        `;
        tbody.appendChild(row);
    });

    // ✨ [ข้อ 6] Render Pagination Controls
    renderPaginationControls(totalPages);

    document.getElementById('myTotal').innerText = `${myTotal.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท`;
    document.getElementById('partnerTotal').innerText = `${partnerTotal.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท`;
    document.getElementById('sharedTotal').innerText = `${sharedTotal.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท`;
    document.getElementById('emergencyTotal').innerText = `${emergencyTotal.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท`;

    const billTextEl = document.getElementById('billSummaryText');
    if (totalMePaidShared === 0 && totalPartnerPaidShared === 0) {
        billTextEl.innerHTML = `<div class="text-center py-2">🎉 ยังไม่มีรายจ่ายกองกลางร่วมกันในเดือนนี้<br><span class="text-white-50 small" style="font-size: 0.8rem;">(ระบบจะช่วยหารครึ่งทันทีเมื่อจดรายการผ่านกระเป๋า "กองกลาง")</span></div>`;
    } else {
        const grandSharedExpense = totalMePaidShared + totalPartnerPaidShared; const halfShare = grandSharedExpense / 2; let settlementResultText = "";
        if (totalMePaidShared > totalPartnerPaidShared) { const diff = totalMePaidShared - halfShare; settlementResultText = `🙋‍♀️ แฟนต้องโอนคืนให้คุณ: <span class="fw-bold text-warning fs-5">${diff.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท</span>`; }
        else if (totalPartnerPaidShared > totalMePaidShared) { const diff = totalPartnerPaidShared - halfShare; settlementResultText = `🙋‍♂️ คุณต้องโอนคืนให้แฟน: <span class="fw-bold text-warning fs-5">${diff.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท</span>`; }
        else { settlementResultText = `🤝 ยอดออกเงินคนละครึ่งเท่ากันเป๊ะ พอดิบพอดีจ้า!`; }
        billTextEl.innerHTML = `รายจ่ายกองกลางเดือนนี้รวม: <b>${grandSharedExpense.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บ.</b> (หารครึ่งคนละ ${halfShare.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บ.)<br><div class="text-center mt-2 small text-white-50" style="font-size: 0.8rem;">• คุณควักจ่ายล่วงหน้าไป: ${totalMePaidShared.toLocaleString()} บ. | แฟนควักจ่ายล่วงหน้าไป: ${totalPartnerPaidShared.toLocaleString()} บ.</div><hr class="my-2 text-white-50"><div class="text-center">${settlementResultText}</div>`;
    }
    renderAnalytics(categorySummary, totalExpenseFiltered);

    // ✨ [ข้อ 8] สร้างกราฟแนวโน้มรายเดือนจากข้อมูลทั้งหมด
    renderMonthlyTrend(txs);
}

// ✨ [ข้อ 6] Pagination Controls
function renderPaginationControls(totalPages) {
    const area = document.getElementById('paginationArea');
    if (!area) return;
    if (totalPages <= 1) { area.innerHTML = `<span class="text-muted small">ทั้งหมด ${filteredTxsCache.length} รายการ</span>`; return; }

    let html = `<div class="d-flex justify-content-between align-items-center flex-wrap gap-2">`;
    html += `<span class="text-muted small">แสดง ${((currentPage - 1) * ROWS_PER_PAGE) + 1}-${Math.min(currentPage * ROWS_PER_PAGE, filteredTxsCache.length)} จาก ${filteredTxsCache.length} รายการ</span>`;
    html += `<nav><ul class="pagination pagination-sm mb-0">`;

    // ปุ่มก่อนหน้า
    html += `<li class="page-item ${currentPage === 1 ? 'disabled' : ''}">`;
    html += `<a class="page-link" href="#" onclick="goToPage(${currentPage - 1}); return false;">‹</a></li>`;

    // เลขหน้า (แสดงสูงสุด 5 หน้ารอบหน้าปัจจุบัน)
    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages, startPage + 4);
    if (endPage - startPage < 4) startPage = Math.max(1, endPage - 4);

    for (let i = startPage; i <= endPage; i++) {
        html += `<li class="page-item ${i === currentPage ? 'active' : ''}">`;
        html += `<a class="page-link" href="#" onclick="goToPage(${i}); return false;">${i}</a></li>`;
    }

    // ปุ่มถัดไป
    html += `<li class="page-item ${currentPage === totalPages ? 'disabled' : ''}">`;
    html += `<a class="page-link" href="#" onclick="goToPage(${currentPage + 1}); return false;">›</a></li>`;

    html += `</ul></nav></div>`;
    area.innerHTML = html;
}

function goToPage(page) {
    currentPage = page;
    loadTransactions();
}

// ✨ [ข้อ 7] Export CSV — ดาวน์โหลดรายงานตามตัวกรองปัจจุบัน
function exportCSV() {
    if (filteredTxsCache.length === 0) {
        return showToast('ไม่มีข้อมูลให้ส่งออก กรุณาเปลี่ยนตัวกรองแล้วลองใหม่', '⚠️', true);
    }

    // BOM สำหรับ UTF-8 เพื่อให้ Excel เปิดภาษาไทยได้ถูกต้อง
    const BOM = '\uFEFF';
    const headers = ['วันที่', 'กระเป๋า', 'ประเภท', 'หมวดหมู่', 'จำนวนเงิน', 'บันทึก'];
    const rows = filteredTxsCache.map(({ tx, txDate, txAmount, exactOwner }) => {
        const ownerMap = { 'me': 'ฉัน', 'partner': 'แฟน', 'shared': 'กองกลาง', 'shared-me': 'กองกลาง (ฉันจ่าย)', 'shared-partner': 'กองกลาง (แฟนจ่าย)', 'emergency': 'ออมฉุกเฉิน' };
        const dateStr = txDate.toLocaleString('th-TH', { hour12: false });
        let note = (tx.note || '').replace(/\[SLIP_URL:.*?\]/g, '').replace(/\[จ่ายโดย:.*?\]/g, '').trim();
        // Escape double quotes in CSV
        note = note.replace(/"/g, '""');
        return [
            `"${dateStr}"`,
            `"${ownerMap[exactOwner] || exactOwner}"`,
            `"${tx.type === 'expense' ? 'รายจ่าย' : 'รายรับ'}"`,
            `"${tx.category_name}"`,
            txAmount.toFixed(2),
            `"${note}"`
        ].join(',');
    });

    const csvContent = BOM + headers.join(',') + '\n' + rows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const now = new Date();
    link.href = url;
    link.download = `รายงานการเงิน_${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    showToast(`ส่งออก ${filteredTxsCache.length} รายการเป็นไฟล์ CSV เรียบร้อย!`, '📥');
}

// ✨ [ข้อ 8] กราฟแนวโน้มรายเดือน (6 เดือนย้อนหลัง)
function renderMonthlyTrend(allTxs) {
    const area = document.getElementById('monthlyTrendArea');
    if (!area) return;

    // คำนวณ 6 เดือนย้อนหลังรวมเดือนปัจจุบัน
    const now = new Date();
    const months = [];
    for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push({ year: d.getFullYear(), month: d.getMonth(), label: `${d.toLocaleString('th-TH', { month: 'short' })} ${d.getFullYear() + 543}` });
    }

    // นับยอดรายรับ/รายจ่ายแต่ละเดือน
    const monthlyData = months.map(m => ({ ...m, income: 0, expense: 0 }));
    allTxs.forEach(tx => {
        const txDate = new Date(tx.created_at);
        const txAmount = parseFloat(tx.amount);
        const idx = monthlyData.findIndex(m => m.year === txDate.getFullYear() && m.month === txDate.getMonth());
        if (idx === -1) return;
        if (tx.type === 'income') monthlyData[idx].income += txAmount;
        else monthlyData[idx].expense += txAmount;
    });

    // หาค่า max สำหรับ scale แท่ง
    const maxVal = Math.max(...monthlyData.map(m => Math.max(m.income, m.expense)), 1);

    let html = `<div class="d-flex align-items-end justify-content-between gap-1" style="height: 180px; padding-bottom: 4px;">`;

    monthlyData.forEach((m, i) => {
        const incomeH = Math.max(2, (m.income / maxVal) * 150);
        const expenseH = Math.max(2, (m.expense / maxVal) * 150);
        const isCurrentMonth = (i === monthlyData.length - 1);

        html += `<div class="d-flex flex-column align-items-center flex-fill" style="min-width: 0;">`;
        // แท่งคู่ (รายรับ + รายจ่าย)
        html += `<div class="d-flex align-items-end gap-1 mb-1" style="height: 155px;">`;
        // แท่งรายรับ (เขียว)
        html += `<div title="รายรับ: ${m.income.toLocaleString('th-TH', { minimumFractionDigits: 0 })} บ." style="width: 14px; height: ${incomeH}px; background: linear-gradient(180deg, #34d399, #059669); border-radius: 4px 4px 0 0; transition: height 0.4s ease;"></div>`;
        // แท่งรายจ่าย (แดง)
        html += `<div title="รายจ่าย: ${m.expense.toLocaleString('th-TH', { minimumFractionDigits: 0 })} บ." style="width: 14px; height: ${expenseH}px; background: linear-gradient(180deg, #f87171, #dc2626); border-radius: 4px 4px 0 0; transition: height 0.4s ease;"></div>`;
        html += `</div>`;
        // ชื่อเดือน
        html += `<span class="text-center small ${isCurrentMonth ? 'fw-bold text-primary' : 'text-muted'}" style="font-size: 0.65rem; line-height: 1.1;">${m.label}</span>`;
        html += `</div>`;
    });

    html += `</div>`;

    // Legend + สรุปตัวเลข
    const thisMonthData = monthlyData[monthlyData.length - 1];
    const lastMonthData = monthlyData[monthlyData.length - 2];
    let trendText = '';
    if (lastMonthData && lastMonthData.expense > 0) {
        const diff = thisMonthData.expense - lastMonthData.expense;
        const pct = ((diff / lastMonthData.expense) * 100).toFixed(0);
        if (diff > 0) trendText = `<span class="text-danger">📈 รายจ่ายเดือนนี้เพิ่มขึ้น ${Math.abs(pct)}% จากเดือนก่อน</span>`;
        else if (diff < 0) trendText = `<span class="text-success">📉 รายจ่ายเดือนนี้ลดลง ${Math.abs(pct)}% จากเดือนก่อน</span>`;
        else trendText = `<span class="text-muted">➡️ รายจ่ายเท่ากับเดือนก่อน</span>`;
    }

    html += `<div class="d-flex justify-content-between align-items-center mt-2 px-1">`;
    html += `<div class="d-flex gap-3 small">`;
    html += `<span><span style="display:inline-block;width:10px;height:10px;background:#059669;border-radius:2px;margin-right:4px;"></span>รายรับ</span>`;
    html += `<span><span style="display:inline-block;width:10px;height:10px;background:#dc2626;border-radius:2px;margin-right:4px;"></span>รายจ่าย</span>`;
    html += `</div>`;
    if (trendText) html += `<span class="small fw-medium">${trendText}</span>`;
    html += `</div>`;

    area.innerHTML = html;
}

function renderAnalytics(summary, total) {
    const area = document.getElementById('analyticsArea'); area.innerHTML = '';
    const sortedCats = Object.keys(summary).map(name => ({ name: name, amount: summary[name] })).sort((a, b) => b.amount - a.amount);
    if (sortedCats.length === 0) { area.innerHTML = '<p class="text-center text-muted py-3 w-100 mb-0">❌ ไม่พบสัดส่วนข้อมูลรายจ่ายตามตัวกรองนี้</p>'; return; }
    sortedCats.forEach(item => {
        const percentage = total > 0 ? ((item.amount / total) * 100).toFixed(1) : 0; const col = document.createElement('div'); col.className = "col-12 col-md-6";
        col.innerHTML = `<div class="bg-light p-3 rounded-3 border"><div class="d-flex justify-content-between small fw-bold mb-1"><span class="text-dark">🛒 ${item.name === 'สลิปรอระบุหมวดหมู่' ? '⏳ รอระบุหมวดหมู่' : item.name}</span><span class="text-secondary">${item.amount.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บ. (${percentage}%)</span></div><div class="progress" style="height: 6px;"><div class="progress-bar ${item.name === 'สลิปรอระบุหมวดหมู่' ? 'bg-warning' : 'bg-danger'}" style="width: ${percentage}%"></div></div></div>`;
        area.appendChild(col);
    });
}