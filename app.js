// app.js - Version 4.0 (Pagination, Export CSV, Monthly Trend Chart)

let filterOwner = 'all';
let filterType = 'all';
let filterDate = 'this-month';
let currentUserRole = 'me';
let isSaving = false; // 🔒 ป้องกันกดซ้ำ (Loading State)
let currentSortField = 'date';
let currentSortOrder = 'desc';

// ✨ [ข้อ 6] Pagination State
let currentPage = 1;
const ROWS_PER_PAGE = 20;
let filteredTxsCache = []; // เก็บข้อมูลหลัง filter เพื่อใช้กับ pagination + export

let loadedTxsCache = []; // เก็บประวัติรายการดิบทั้งหมด
let loadedGoalsCache = []; // เก็บรายการเควสเป้าหมายดิบทั้งหมด
let recurringBills = []; // เก็บข้อมูลบิลประจำรายเดือน
let currentTotalMePaidShared = 0; // ยอดรวมที่คุณโบ๊ทสำรองจ่ายไป
let currentTotalPartnerPaidShared = 0; // ยอดรวมที่คุณเอิร์นสำรองจ่ายไป

function setNoteTag(tagText) {
    const input = document.getElementById('txNote');
    if (input) input.value = tagText;
}

function updateEmergencyTarget(val) {
    let num = parseFloat(val);
    if (isNaN(num) || num <= 0) num = 50000;
    localStorage.setItem('emergencyTarget', num);
    document.getElementById('emergencyTargetInput').value = num;
    calculateEmergencyProgress();
}

function initEmergencyTargetTitle() {
    const input = document.getElementById('emergencyTargetTitleInput');
    if (!input) return;
    const saved = localStorage.getItem('emergencyTargetTitle') || 'เงินออมสำรองฉุกเฉิน';
    input.value = saved;
    syncEmergencyLabels();
}

function updateEmergencyTargetTitle(val) {
    let clean = val.trim();
    if (!clean) clean = "เงินออมสำรองฉุกเฉิน";
    localStorage.setItem('emergencyTargetTitle', clean);
    const input = document.getElementById('emergencyTargetTitleInput');
    if (input) input.value = clean;
    syncEmergencyLabels();
    
    // รีโหลดหน้าจอเพื่อให้ badges ในประวัติเปลี่ยนชื่อเป้าหมายทันที
    loadTransactions();
}

function syncEmergencyLabels() {
    const saved = localStorage.getItem('emergencyTargetTitle') || 'เงินออมสำรองฉุกเฉิน';
    
    // 1. อัปเดตหัวข้อการ์ดกระเป๋าเงินฉุกเฉินบน Dashboard
    const labelWalletEmergency = document.getElementById('labelWalletEmergency');
    if (labelWalletEmergency) {
        labelWalletEmergency.innerText = `${saved} 🎯`;
    }
    
    // 2. อัปเดตตัวเลือกในกล่องจดบันทึก
    const optOwnerEmergency = document.getElementById('optOwnerEmergency');
    if (optOwnerEmergency) {
        optOwnerEmergency.innerText = `🚨 บัญชีออม (${saved})`;
    }
    
    // 3. อัปเดตตัวเลือกกรองในประวัติการทำรายการ
    const filterEmergency = document.getElementById('filterEmergency');
    if (filterEmergency) {
        filterEmergency.innerText = `🎯 เฉพาะ${saved}`;
    }

    // 4. อัปเดตหัวข้อของกราฟสะสมเงินออม
    const labelChartEmergency = document.getElementById('labelChartEmergency');
    if (labelChartEmergency) {
        labelChartEmergency.innerText = saved;
    }
}

function getGoalIcon(type) {
    if (type === 'save') return '🎯';
    if (type === 'save_travel') return '✈️';
    if (type === 'save_shopping') return '🛍️';
    if (type === 'save_gift') return '🎁';
    return '📄';
}

function calculateEmergencyProgress() {
    const totalEl = document.getElementById('emergencyTotal');
    if (!totalEl) return;
    const currentVal = parseFloat(totalEl.innerText.replace(/[^0-9.-]+/g,"")) || 0;
    const targetVal = parseFloat(localStorage.getItem('emergencyTarget')) || 50000;
    
    const targetInput = document.getElementById('emergencyTargetInput');
    if (targetInput) targetInput.value = targetVal;

    const pct = Math.min(100, Math.max(0, (currentVal / targetVal) * 100)).toFixed(1);
    
    const progressBar = document.getElementById('emergencyProgressBar');
    if (progressBar) {
        progressBar.style.width = `${pct}%`;
        progressBar.innerText = `${pct}%`;
    }
    
    const currentText = document.getElementById('emergencyProgressCurrentText');
    if (currentText) {
        currentText.innerText = `${currentVal.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท`;
    }
    
    const remainingText = document.getElementById('emergencyProgressRemainingText');
    if (remainingText) {
        const diff = targetVal - currentVal;
        if (diff <= 0) {
            remainingText.innerHTML = `<span class="text-success fw-bold">🎉 บรรลุเป้าหมายการออมสำเร็จ!</span>`;
        } else {
            remainingText.innerText = `ยังขาดอีก: ${diff.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท`;
        }
    }
}

function calculateAIInsights(txs, totalMePaidShared, totalPartnerPaidShared, goals) {
    const contentEl = document.getElementById('aiInsightContent');
    if (!contentEl) return;

    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();

    // กรองเฉพาะเดือนนี้ที่เป็นรายจ่าย
    const currentMonthExpenses = txs.filter(tx => {
        const d = new Date(tx.created_at);
        return d.getMonth() === thisMonth && d.getFullYear() === thisYear && tx.type === 'expense';
    });

    // 1. หมวดหมู่ที่จ่ายเยอะสุด
    const catSum = {};
    let totalExp = 0;
    currentMonthExpenses.forEach(tx => {
        const amt = parseFloat(tx.amount);
        catSum[tx.category_name] = (catSum[tx.category_name] || 0) + amt;
        totalExp += amt;
    });

    let highestCatName = "";
    let highestCatAmt = 0;
    for (let c in catSum) {
        if (catSum[c] > highestCatAmt) {
            highestCatAmt = catSum[c];
            highestCatName = c;
        }
    }

    const insights = [];

    // ข้อที่ 1: หมวดหมู่รายจ่ายยอดฮิต
    if (highestCatName && totalExp > 0) {
        const pct = ((highestCatAmt / totalExp) * 100).toFixed(0);
        insights.push(`💡 เดือนนี้เราใช้จ่ายกับหมวด <b>${getCategoryEmoji(highestCatName)}</b> เยอะที่สุดนะ คิดเป็น <b>${pct}%</b> ของรายจ่ายรวม`);
    } else {
        insights.push(`💡 บันทึกรายจ่ายเพิ่มเติมเดือนนี้เพื่อให้ระบบเริ่มคำนวณและวิเคราะห์สถิตินะครับ`);
    }

    // ข้อที่ 2: บิลกองกลางสำรองจ่าย
    if (totalMePaidShared > 0 || totalPartnerPaidShared > 0) {
        if (totalMePaidShared > totalPartnerPaidShared) {
            const diff = totalMePaidShared - (totalMePaidShared + totalPartnerPaidShared)/2;
            insights.push(`🤝 เดือนนี้คุณโบ๊ทช่วยจ่ายเงินกองกลางล่วงหน้าไปมากกว่าคุณเอิร์น <b>${diff.toLocaleString('th-TH', { maximumFractionDigits: 2 })} บ.</b>`);
        } else if (totalPartnerPaidShared > totalMePaidShared) {
            const diff = totalPartnerPaidShared - (totalMePaidShared + totalPartnerPaidShared)/2;
            insights.push(`🤝 เดือนนี้คุณเอิร์นช่วยจ่ายเงินกองกลางล่วงหน้าไปมากกว่าคุณโบ๊ท <b>${diff.toLocaleString('th-TH', { maximumFractionDigits: 2 })} บ.</b>`);
        } else {
            insights.push(`🤝 ยอดหารบิลกองกลางส่วนกลางอยู่ในเกณฑ์เท่ากันเป๊ะพอดีเลยครับ`);
        }
    }

    // ข้อที่ 3: เควสภารกิจ
    if (goals && goals.length > 0) {
        const completedCount = goals.filter(g => g.is_completed).length;
        if (completedCount > 0) {
            insights.push(`🎯 ยอดเยี่ยมมาก! เราช่วยกันฝากและเคลียร์เควสเงินสำเร็จไปแล้ว <b>${completedCount} ภารกิจ</b> เก่งมากจ้า!`);
        } else {
            insights.push(`🎯 มีเควสออม/จ่ายเงินกองกลางคอยอยู่อีก <b>${goals.length} ภารกิจ</b> ลุยกันเลย!`);
        }
    }

    contentEl.innerHTML = `<ul class="mb-0 ps-3 d-flex flex-column gap-1.5">${insights.map(ins => `<li>${ins}</li>`).join('')}</ul>`;
}

function updateInsightsAndProgress() {
    calculateEmergencyProgress();
    calculateAIInsights(loadedTxsCache, currentTotalMePaidShared, currentTotalPartnerPaidShared, loadedGoalsCache);
}

// === ฟังก์ชันสำหรับระบบ UI/UX แท็บ, โหมดถนอมสายตา และการจัดการยอดเงิน ===
function switchTab(tabId) {
    const sections = document.querySelectorAll('.tab-section');
    sections.forEach(s => s.classList.add('d-none'));

    const activeSection = document.getElementById(`section-${tabId}`);
    if (activeSection) activeSection.classList.remove('d-none');

    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => btn.classList.remove('active'));

    const activeBtn = document.getElementById(`tab-${tabId}`);
    if (activeBtn) activeBtn.classList.add('active');

    localStorage.setItem('activeTab', tabId);
}

function toggleDarkMode() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const targetTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', targetTheme);
    localStorage.setItem('theme', targetTheme);
    updateDarkModeToggleIcon(targetTheme);
}

function updateDarkModeToggleIcon(theme) {
    const toggleBtn = document.getElementById('darkModeToggle');
    if (!toggleBtn) return;
    if (theme === 'dark') {
        toggleBtn.innerHTML = '<i class="bi bi-sun-fill text-warning"></i>';
    } else {
        toggleBtn.innerHTML = '<i class="bi bi-moon-stars-fill text-dark"></i>';
    }
}

function getCategoryEmoji(name) {
    if (!name) return '📦 อื่นๆ';
    const clean = name.trim();
    const mapping = {
        'อาหาร': '🍔 อาหาร',
        'เครื่องดื่ม': '☕ เครื่องดื่ม',
        'ช้อปปิ้ง': '🛍️ ช้อปปิ้ง',
        'ชอปปิ้ง': '🛍️ ช้อปปิ้ง',
        'เดินทาง': '🚗 เดินทาง',
        'ค่าเดินทาง': '🚗 ค่าเดินทาง',
        'ค่าบ้าน': '🏠 ค่าบ้าน/ที่พัก',
        'ค่าที่พัก/บ้าน': '🏠 ค่าบ้าน/ที่พัก',
        'ค่าน้ำค่าไฟ': '💡 ค่าน้ำค่าไฟ',
        'ความบันเทิง': '🎬 ความบันเทิง',
        'สุขภาพ': '🏥 สุขภาพ',
        'ของใช้ส่วนตัว': '🧼 ของใช้ส่วนตัว',
        'ลงทุน': '📈 ลงทุน',
        'เงินเดือน': '💵 เงินเดือน',
        'โบนัส': '🎁 โบนัส',
        'สลิปรอระบุหมวดหมู่': '⏳ รอระบุหมวดหมู่',
        'ทั่วไป': '📦 ทั่วไป',
        'ท่องเที่ยว': '✈️ ท่องเที่ยว',
        'ค่าโทรศัพท์/เน็ต': '📱 ค่าโทรศัพท์/เน็ต',
        'ของใช้ในบ้าน': '🧹 ของใช้ในบ้าน',
        'ของขวัญ': '💝 ของขวัญ',
        'การศึกษา': '📚 การศึกษา',
        'อื่นๆ': '📦 อื่นๆ'
    };
    return mapping[clean] || `🏷️ ${clean}`;
}

function adjustAmount(val) {
    const input = document.getElementById('txAmount');
    if (!input) return;
    let currentVal = parseFloat(input.value) || 0;
    input.value = (currentVal + val).toFixed(2);
}

function clearAmount() {
    const input = document.getElementById('txAmount');
    if (input) input.value = '';
}

function initUserIdentity(userId) {
    const userDisplay = document.getElementById('userDisplay');
    const txOwnerInput = document.getElementById('txOwner');
    const nameMe = localStorage.getItem('nameMe') || 'คุณโบ๊ท';
    const namePartner = localStorage.getItem('namePartner') || 'คุณเอิร์น';
    if (userId === '4ffee1dd-ff34-47c0-a623-7dcc76d80c0f') {
        currentUserRole = 'me';
        userDisplay.innerHTML = `🙋‍♂️ ผู้ใช้งานระบบปัจจุบัน: <span class="text-primary">${nameMe}</span>`;
        if (txOwnerInput) txOwnerInput.value = 'me';
    } else {
        currentUserRole = 'partner';
        userDisplay.innerHTML = `🙋‍♀️ ผู้ใช้งานระบบปัจจุบัน: <span class="text-danger">${namePartner}</span>`;
        if (txOwnerInput) txOwnerInput.value = 'partner';
    }
}

function initAutoSaveSettings() {
    const autoSaveToggle = document.getElementById('autoSaveToggle');
    const autoSavePercent = document.getElementById('autoSavePercent');
    const autoSaveSettings = document.getElementById('autoSaveSettings');
    
    if (!autoSaveToggle || !autoSavePercent) return;
    
    const enabled = localStorage.getItem('autoSaveEnabled') === 'true';
    const percent = localStorage.getItem('autoSavePercent') || '10';
    
    autoSaveToggle.checked = enabled;
    autoSavePercent.value = percent;
    
    if (enabled) {
        autoSaveSettings.classList.remove('d-none');
    } else {
        autoSaveSettings.classList.add('d-none');
    }
    
    autoSavePercent.addEventListener('change', (e) => {
        let val = parseInt(e.target.value) || 10;
        if (val < 1) val = 1;
        if (val > 100) val = 100;
        e.target.value = val;
        localStorage.setItem('autoSavePercent', val);
    });

    // จัดการแสดง/ซ่อนฟิลด์วัตถุประสงค์การออม
    const txOwner = document.getElementById('txOwner');
    if (txOwner) {
        txOwner.addEventListener('change', (e) => {
            const purposeArea = document.getElementById('emergencyPurposeArea');
            if (purposeArea) {
                if (e.target.value === 'emergency') {
                    purposeArea.classList.remove('d-none');
                } else {
                    purposeArea.classList.add('d-none');
                }
            }
        });
    }
}

function toggleAutoSaveUI() {
    const autoSaveToggle = document.getElementById('autoSaveToggle');
    const autoSaveSettings = document.getElementById('autoSaveSettings');
    if (!autoSaveToggle || !autoSaveSettings) return;
    
    const enabled = autoSaveToggle.checked;
    if (enabled) {
        autoSaveSettings.classList.remove('d-none');
    } else {
        autoSaveSettings.classList.add('d-none');
    }
    localStorage.setItem('autoSaveEnabled', enabled);
}

window.onload = function () {
    setTimeout(async () => {
        try {
            setupSlipScannerListener(); // เปิดระบบดักจับและส่งสลิปให้ AI ประมวลผล
            
            // คืนค่าแท็บล่าสุด หรือ หน้าแรก
            const activeTab = localStorage.getItem('activeTab') || 'dashboard';
            switchTab(activeTab);

            // คืนค่าธีมล่าสุด
            const savedTheme = localStorage.getItem('theme') || 'light';
            updateDarkModeToggleIcon(savedTheme);

            // โหลดตั้งค่าระบบหักออมอัตโนมัติ
            initAutoSaveSettings();

            // โหลดตั้งค่าหัวข้อเป้าหมายออมฉุกเฉิน
            initEmergencyTargetTitle();

            // โหลดตั้งค่าชื่อผู้ใช้งานแบบไดนามิก
            initDynamicNames();

            // โหลดรายการบิลประจำรายเดือน
            initRecurringBills();

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

// ✨ Batch Slip Scanner — รองรับเลือกหลายรูปพร้อมกัน
let pendingSlipFiles = []; // ไฟล์ที่รอสแกน

// ฟังก์ชันประมวลผลสลิป 1 ใบ (ใช้ร่วมกันทั้ง single/batch)
async function processSingleSlip(file, liveGeminiKey) {
    // บีบอัดรูป
    const compressedFile = await compressImage(file);

    // อัปโหลดเข้า Supabase Storage
    const fileExt = compressedFile.name.split('.').pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
    const { error: uploadError } = await supabaseClient.storage.from('slips').upload(fileName, compressedFile);
    if (uploadError) throw uploadError;

    // แปลงเป็น Base64
    const base64Data = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(compressedFile);
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
    });

    // ส่ง Gemini
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
        generationConfig: { responseMimeType: "application/json" }
    };

    // Retry logic
    let resData = null;
    const MAX_RETRIES = 3;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        const response = await fetch(geminiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(promptPayload) });
        resData = await response.json();
        if (response.status === 429 && attempt < MAX_RETRIES) {
            let waitSec = 30;
            const retryMatch = JSON.stringify(resData).match(/retry in ([\d.]+)s/i);
            if (retryMatch) waitSec = Math.ceil(parseFloat(retryMatch[1]));
            showToast(`⏳ API เกินโควต้า รอ ${waitSec} วินาที...`, '🔄');
            await new Promise(r => setTimeout(r, waitSec * 1000));
            continue;
        }
        break;
    }

    if (!resData.candidates || resData.candidates.length === 0) {
        throw new Error(resData.error?.message || "AI ปฏิเสธการแกะสลิปใบนี้");
    }

    const aiText = resData.candidates[0].content.parts[0].text.trim();
    const result = JSON.parse(aiText);
    return { ...result, fileName };
}

// ยืนยันสแกนสลิป (single หรือ batch)
async function confirmSlipScan() {
    if (pendingSlipFiles.length === 0) return;

    const previewArea = document.getElementById('slipPreviewArea');
    const statusEl = document.getElementById('slipLoadingStatus');
    const slipInput = document.getElementById('slipInput');
    const isBatch = pendingSlipFiles.length > 1;

    previewArea.classList.add('d-none');
    statusEl.classList.remove('d-none');

    try {
        // ดึง API Key ครั้งเดียว ใช้กับทุกใบ
        const { data: secretData, error: secretError } = await supabaseClient
            .from('system_secrets').select('key_value').eq('key_name', 'GEMINI_API_KEY').single();
        if (secretError || !secretData) throw new Error("ระบบหา API Key ไม่เจอ กรุณาเช็คตาราง system_secrets");
        const liveGeminiKey = secretData.key_value;

        if (isBatch) {
            // === Batch Mode: สแกนทีละใบ + auto-save ===
            const totalFiles = pendingSlipFiles.length;
            let successCount = 0;
            let failCount = 0;
            const results = [];

            for (let i = 0; i < totalFiles; i++) {
                // อัปเดต loading status
                statusEl.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> 🤖 กำลังสแกนสลิปใบที่ ${i + 1} จาก ${totalFiles}...`;

                try {
                    const result = await processSingleSlip(pendingSlipFiles[i], liveGeminiKey);

                    // สร้างโน้ตอัจฉริยะ
                    let smartNote = `[SLIP_URL:${result.fileName}]`;
                    const infoParts = [];
                    if (result.receiver) infoParts.push(`ผู้รับ: ${result.receiver}`);
                    if (result.bank) infoParts.push(`ผ่าน: ${result.bank}`);
                    if (result.date) infoParts.push(`วันที่: ${result.date}`);
                    smartNote += infoParts.length > 0 ? ` ${infoParts.join(' | ')}` : ' สแกนจากสลิป (Batch)';

                    // Auto-save ลง Supabase ทันที
                    let dbOwner = document.getElementById('txOwner').value || 'me';
                    let finalNote = smartNote;
                    if (dbOwner === 'shared-me') { dbOwner = 'shared'; finalNote = `[จ่ายโดย: me] ${finalNote}`; }
                    else if (dbOwner === 'shared-partner') { dbOwner = 'shared'; finalNote = `[จ่ายโดย: partner] ${finalNote}`; }

                    await supabaseClient.from('transactions').insert([{
                        amount: parseFloat(parseFloat(result.amount).toFixed(2)),
                        type: 'expense',
                        category_name: 'สลิปรอระบุหมวดหมู่',
                        note: finalNote,
                        owner: dbOwner,
                        created_at: new Date().toISOString()
                    }]);

                    results.push({ success: true, amount: result.amount, receiver: result.receiver });
                    successCount++;
                } catch (err) {
                    console.error(`Slip ${i + 1} error:`, err);
                    results.push({ success: false, error: err.message });
                    failCount++;
                }

                // รอ 2 วินาทีระหว่างแต่ละใบ เพื่อหลีกเลี่ยง rate limit
                if (i < totalFiles - 1) {
                    await new Promise(r => setTimeout(r, 2000));
                }
            }

            // แสดงสรุปผล Batch
            let summaryHTML = `<div class="text-center"><p class="fw-bold text-dark mb-2">📊 สรุปผลสแกน ${totalFiles} สลิป</p>`;
            summaryHTML += `<div class="d-flex justify-content-center gap-3 mb-2">`;
            summaryHTML += `<span class="badge bg-success px-3 py-2">✅ สำเร็จ ${successCount} ใบ</span>`;
            if (failCount > 0) summaryHTML += `<span class="badge bg-danger px-3 py-2">❌ ล้มเหลว ${failCount} ใบ</span>`;
            summaryHTML += `</div>`;

            // แสดงรายละเอียดแต่ละใบ
            summaryHTML += `<div class="text-start mt-2">`;
            results.forEach((r, idx) => {
                if (r.success) {
                    summaryHTML += `<div class="small text-success mb-1">✅ ใบที่ ${idx + 1}: ${parseFloat(r.amount).toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท${r.receiver ? ` → ${r.receiver}` : ''}</div>`;
                } else {
                    summaryHTML += `<div class="small text-danger mb-1">❌ ใบที่ ${idx + 1}: ${r.error}</div>`;
                }
            });
            summaryHTML += `</div></div>`;

            previewArea.innerHTML = summaryHTML;
            previewArea.classList.remove('d-none');
            showToast(`สแกน Batch เสร็จ! สำเร็จ ${successCount}/${totalFiles} ใบ`, '🤖');
            await loadTransactions();

        } else {
            // === Single Mode: แกะข้อมูลใส่ฟอร์ม ===
            const result = await processSingleSlip(pendingSlipFiles[0], liveGeminiKey);

            document.getElementById('txAmount').value = parseFloat(result.amount).toFixed(2);
            let smartNote = `[SLIP_URL:${result.fileName}]`;
            const infoParts = [];
            if (result.receiver) infoParts.push(`ผู้รับ: ${result.receiver}`);
            if (result.bank) infoParts.push(`ผ่าน: ${result.bank}`);
            if (result.date) infoParts.push(`วันที่: ${result.date}`);
            smartNote += infoParts.length > 0 ? ` ${infoParts.join(' | ')}` : ' รอคุณระบุชื่อรายการจริง';
            document.getElementById('txNote').value = smartNote;

            // แสดงผลลัพธ์ AI
            let aiResultHTML = `<div class="mt-2 p-2 bg-success bg-opacity-10 rounded-3 border border-success border-opacity-25">
                <p class="small fw-bold text-success mb-1">🤖 AI แกะข้อมูลสำเร็จ:</p>
                <ul class="list-unstyled small mb-0 text-dark">
                    <li>💰 ยอดเงิน: <b>${parseFloat(result.amount).toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท</b></li>`;
            if (result.receiver) aiResultHTML += `<li>👤 ผู้รับ: <b>${result.receiver}</b></li>`;
            if (result.bank) aiResultHTML += `<li>🏦 ธนาคาร: <b>${result.bank}</b></li>`;
            if (result.date) aiResultHTML += `<li>📅 วันที่: <b>${result.date}</b></li>`;
            if (result.category_suggestion) aiResultHTML += `<li>🏷️ หมวดหมู่แนะนำ: <b>${result.category_suggestion}</b></li>`;
            aiResultHTML += `</ul></div>`;

            previewArea.innerHTML = `<div class="text-center">
                <span class="text-success small fw-bold">✅ สแกนเรียบร้อย กรุณาเลือกกระเป๋าเงินและหมวดหมู่เพื่อบันทึก</span>
                ${aiResultHTML}</div>`;
            previewArea.classList.remove('d-none');
            showToast('AI แกะข้อมูลจากสลิปเรียบร้อย! กรุณากดเลือกหมวดหมู่เพื่อบันทึก', '🤖');
        }

    } catch (err) {
        console.error(err);
        showToast(`ระบบสแกนสลิปขัดข้อง: ${err.message}`, '⚠️', true);
        previewArea.classList.add('d-none');
    } finally {
        statusEl.classList.add('d-none');
        statusEl.innerHTML = `<span class="spinner-border spinner-border-sm me-1" role="status"></span> กำลังใช้ AI ถอดรหัสยอดเงินจากสลิปสักครู่...`;
        pendingSlipFiles = [];
        slipInput.value = '';
    }
}

// ลบรูปสลิปออกจากคิว preview
function removeSlipFromQueue(index) {
    pendingSlipFiles.splice(index, 1);
    if (pendingSlipFiles.length === 0) {
        cancelSlipPreview();
    } else {
        renderSlipPreviews();
    }
}

// ยกเลิก Preview ทั้งหมด
function cancelSlipPreview() {
    const slipInput = document.getElementById('slipInput');
    const previewArea = document.getElementById('slipPreviewArea');
    slipInput.value = '';
    pendingSlipFiles = [];
    previewArea.classList.add('d-none');
}

// แสดง Preview รูปทั้งหมดที่เลือก
function renderSlipPreviews() {
    const previewArea = document.getElementById('slipPreviewArea');
    const count = pendingSlipFiles.length;

    let html = `<p class="small fw-bold text-secondary mb-2 text-center">🖼️ ตรวจสอบรูปสลิป ${count} ใบก่อนส่ง AI สแกน</p>`;
    html += `<div class="d-flex flex-wrap gap-2 justify-content-center mb-3">`;

    pendingSlipFiles.forEach((file, idx) => {
        const url = URL.createObjectURL(file);
        html += `<div class="position-relative" style="width: 100px; height: 100px;">
            <img src="${url}" class="rounded-3 border" style="width: 100%; height: 100%; object-fit: cover;" alt="Slip ${idx + 1}">
            <button onclick="removeSlipFromQueue(${idx})" class="btn btn-danger btn-sm position-absolute top-0 end-0 p-0 d-flex align-items-center justify-content-center" style="width: 20px; height: 20px; border-radius: 50%; font-size: 0.6rem; transform: translate(30%, -30%);">✕</button>
            <span class="position-absolute bottom-0 start-50 translate-middle-x badge bg-dark bg-opacity-75 rounded-pill" style="font-size: 0.6rem;">${idx + 1}</span>
        </div>`;
    });

    html += `</div>`;

    // ข้อความแจ้งเตือน batch mode
    if (count > 1) {
        html += `<div class="alert alert-info py-2 px-3 rounded-3 border-0 small mb-3 text-center">
            <i class="bi bi-info-circle me-1"></i> <b>โหมด Batch:</b> AI จะสแกนทีละใบแล้วบันทึกรายจ่ายให้อัตโนมัติ (รอระบุหมวดหมู่ภายหลัง)
            <br><span class="text-muted">⏱️ ใช้เวลาประมาณ ${count * 5}-${count * 35} วินาที ขึ้นอยู่กับ API โควต้า</span>
        </div>`;
    }

    html += `<div class="d-flex justify-content-center gap-2">
        <button onclick="confirmSlipScan()" class="btn btn-success btn-sm fw-bold px-3 rounded-3">
            <i class="bi bi-robot me-1"></i> ✅ ยืนยันสแกน${count > 1 ? `ทั้ง ${count} ใบ` : ''}
        </button>
        <button onclick="cancelSlipPreview()" class="btn btn-outline-secondary btn-sm fw-bold px-3 rounded-3">
            ❌ ยกเลิก
        </button>
    </div>`;

    previewArea.innerHTML = html;
    previewArea.classList.remove('d-none');
}

// ดักจับเลือกไฟล์ — รองรับ multiple
function setupSlipScannerListener() {
    const slipInput = document.getElementById('slipInput');
    if (!slipInput) return;

    slipInput.addEventListener('change', (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        pendingSlipFiles = files;
        renderSlipPreviews();
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

function triggerCelebration() {
    // 🔊 เล่นเสียงความสำเร็จ (Cash register)
    try {
        const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2019/2019-84.wav');
        audio.volume = 0.35;
        audio.play().catch(e => console.log("Audio play blocked by browser policy"));
    } catch (e) {
        console.warn("Audio element failed to load or play", e);
    }

    if (typeof confetti !== 'function') return;

    // ยิง Confetti แบบพิเศษผสม Emojis
    try {
        const scalar = 2.5;
        const shapes = [
            confetti.shapeFromText({ text: '💰', scalar }),
            confetti.shapeFromText({ text: '❤️', scalar }),
            confetti.shapeFromText({ text: '✨', scalar }),
            confetti.shapeFromText({ text: '💵', scalar }),
            confetti.shapeFromText({ text: '🎉', scalar })
        ];

        // ยิงจากซ้ายและขวาประสานกัน
        confetti({
            particleCount: 40,
            angle: 60,
            spread: 60,
            origin: { x: 0, y: 0.75 },
            shapes: shapes,
            scalar: scalar
        });

        confetti({
            particleCount: 40,
            angle: 120,
            spread: 60,
            origin: { x: 1, y: 0.75 },
            shapes: shapes,
            scalar: scalar
        });
    } catch (err) {
        // Fallback เป็น confetti มาตรฐานถ้าเกิดข้อผิดพลาดกับ shapeFromText
        console.warn("Falling back to standard confetti", err);
        confetti({
            particleCount: 80,
            spread: 70,
            origin: { y: 0.6 }
        });
    }
}

async function loadCategories() {
    const { data: categories, error } = await supabaseClient.from('categories').select('*').order('name', { ascending: true });
    if (error) return console.error(error);
    const expenseArea = document.getElementById('expenseButtons');
    const incomeArea = document.getElementById('incomeButtons');
    expenseArea.innerHTML = ''; incomeArea.innerHTML = '';
    categories.forEach(cat => {
        const btn = document.createElement('button');
        btn.innerText = getCategoryEmoji(cat.name);
        btn.className = cat.type === 'expense' ? "btn btn-outline-danger btn-sm category-btn" : "btn btn-outline-success btn-sm category-btn";
        btn.onclick = () => saveTransaction(cat.name, cat.type);
        if (cat.type === 'expense') expenseArea.appendChild(btn); else incomeArea.appendChild(btn);
    });

    // 🏷️ โหลดรายการตัวเลือกใส่ในดร็อปดาวน์แก้ไขด้วยกลุ่ม <optgroup>
    const txCategorySelect = document.getElementById('txCategory');
    if (txCategorySelect) {
        txCategorySelect.innerHTML = '';
        
        const expenseGroup = document.createElement('optgroup');
        expenseGroup.label = '🔴 หมวดหมู่รายจ่าย';
        const incomeGroup = document.createElement('optgroup');
        incomeGroup.label = '🟢 หมวดหมู่รายรับ';
        
        categories.forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat.name;
            opt.innerText = getCategoryEmoji(cat.name);
            if (cat.type === 'expense') {
                expenseGroup.appendChild(opt);
            } else {
                incomeGroup.appendChild(opt);
            }
        });
        
        txCategorySelect.appendChild(expenseGroup);
        txCategorySelect.appendChild(incomeGroup);
    }
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

    // 🎯 ดึงและแนบวัตถุประสงค์การออมย่อยในโน้ต (เฉพาะเมื่อเป็นกระเป๋าเงินออมฉุกเฉิน)
    const savingPurposeInput = document.getElementById('txSavingPurpose');
    if (dbOwner === 'emergency' && savingPurposeInput) {
        const purposeVal = savingPurposeInput.value.trim();
        if (purposeVal) {
            finalNote = finalNote ? `[ออมเพื่อ: ${purposeVal}] ${finalNote}` : `[ออมเพื่อ: ${purposeVal}]`;
        }
    }

    // 🎯 ถ้าเป็นธุรกรรมโอนเข้า/ถอนออกจากบัญชีออมฉุกเฉิน ให้แนบสัญลักษณ์และผูกคู่โอน
    let isEmergencyTransfer = false;
    let emergencyTransferNote = '';
    if (dbOwner === 'emergency') {
        isEmergencyTransfer = true;
        const tag = type === 'income' ? '[โอนเข้าออมฉุกเฉิน]' : '[ถอนจากออมฉุกเฉิน]';
        finalNote = finalNote ? `${tag} ${finalNote}` : tag;
        emergencyTransferNote = finalNote;
    }

    let finalCategory = categoryName;

    if (dbOwner === 'shared-me') { dbOwner = 'shared'; finalNote = finalNote ? `[จ่ายโดย: me] ${finalNote}` : `[จ่ายโดย: me]`; }
    else if (dbOwner === 'shared-partner') { dbOwner = 'shared'; finalNote = finalNote ? `[จ่ายโดย: partner] ${finalNote}` : `[จ่ายโดย: partner]`; }

    const { error } = await supabaseClient
        .from('transactions')
        .insert([{
            amount: finalAmount,
            type: type,
            category_name: finalCategory,
            note: finalNote || null,
            owner: dbOwner,
            created_at: new Date().toISOString()
        }]);

    if (error) {
        showToast(`บันทึกไม่สำเร็จ: ${error.message}`, '❌', true);
    } else {
        amountInput.value = ''; noteInput.value = ''; if (slipInput) slipInput.value = '';
        if (savingPurposeInput) {
            savingPurposeInput.value = '';
            document.getElementById('emergencyPurposeArea').classList.add('d-none');
        }
        if (previewArea) previewArea.classList.add('d-none');
        ownerInput.value = currentUserRole === 'me' ? 'me' : 'partner';
        showToast('จดบันทึกเรียบร้อยแล้วจ้า! 💰', '✅');
        cancelSlipPreview();

        // 🎯 ถ้าโอนเงินฉุกเฉิน ให้สร้างรายการฝาก/ถอนคู่กันในกระเป๋าส่วนตัวด้วย
        if (isEmergencyTransfer) {
            const personalType = type === 'income' ? 'expense' : 'income';
            await supabaseClient.from('transactions').insert([{
                amount: finalAmount,
                type: personalType,
                category_name: 'ลงทุน',
                note: emergencyTransferNote,
                owner: currentUserRole,
                created_at: new Date().toISOString()
            }]);
            const actionText = type === 'income' ? 'นำฝากเข้า' : 'ถอนออกจาก';
            showToast(`${actionText}บัญชีออมและปรับเงินในกระเป๋าส่วนตัวเรียบร้อย! 🚨`, '🎯');
        }

        // ⚙️ ระบบหักออมอัตโนมัติเมื่อมีรายรับ
        const autoSaveEnabled = localStorage.getItem('autoSaveEnabled') === 'true';
        if (autoSaveEnabled && type === 'income' && (dbOwner === 'me' || dbOwner === 'partner')) {
            const pct = parseInt(localStorage.getItem('autoSavePercent')) || 10;
            const autoSaveAmt = parseFloat(((finalAmount * pct) / 100).toFixed(2));
            if (autoSaveAmt > 0) {
                const nameMe = localStorage.getItem('nameMe') || 'คุณโบ๊ท';
                const namePartner = localStorage.getItem('namePartner') || 'คุณเอิร์น';
                const ownerName = dbOwner === 'me' ? nameMe : namePartner;
                
                // 1. สร้างรายการรายจ่ายหักออกจากกระเป๋าเดิม
                const deductNote = `[หักออมอัตโนมัติ ${pct}%] ส่งเข้าบัญชีออมฉุกเฉิน`;
                await supabaseClient.from('transactions').insert([{
                    amount: autoSaveAmt,
                    type: 'expense',
                    category_name: 'ลงทุน',
                    note: deductNote,
                    owner: dbOwner,
                    created_at: new Date().toISOString()
                }]);

                // 2. สร้างรายการรายรับเพิ่มเข้าบัญชีออมฉุกเฉิน
                const addNote = `เงินออมอัตโนมัติ ${pct}% จากรายรับของ${ownerName}`;
                await supabaseClient.from('transactions').insert([{
                    amount: autoSaveAmt,
                    type: 'income',
                    category_name: 'ลงทุน',
                    note: addNote,
                    owner: 'emergency',
                    created_at: new Date().toISOString()
                }]);
                
                showToast(`หักออมอัตโนมัติ ${pct}% (${autoSaveAmt.toLocaleString()} บ.) เข้าคลังเรียบร้อย! 🎯`, '🎯');
            }
        }

        triggerCelebration();
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

function enterEditMode(id, amount, note, originalOwner, originalCategory) {
    // เปลี่ยนหน้าแท็บไปยังหน้าจดบันทึกก่อน เพื่อให้เห็นฟอร์มแก้ไข
    switchTab('record');

    document.getElementById('editTxId').value = id;
    document.getElementById('txAmount').value = parseFloat(amount).toFixed(2);

    let displayOwner = originalOwner;
    let displayNote = note || '';

    // 🎯 แยกแยะวัตถุประสงค์การออมย่อย
    let displaySavingPurpose = '';
    if (originalOwner === 'emergency') {
        const matchPurpose = displayNote.match(/\[ออมเพื่อ:\s*(.*?)\]/);
        if (matchPurpose && matchPurpose[1]) {
            displaySavingPurpose = matchPurpose[1];
            displayNote = displayNote.replace(/\[ออมเพื่อ:\s*.*?\]\s*/, '');
        }
        document.getElementById('emergencyPurposeArea').classList.remove('d-none');
    } else {
        document.getElementById('emergencyPurposeArea').classList.add('d-none');
    }
    const savingPurposeInput = document.getElementById('txSavingPurpose');
    if (savingPurposeInput) savingPurposeInput.value = displaySavingPurpose;

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

    // แสดงพื้นที่เลือกหมวดหมู่รายการสำหรับโหมดแก้ไข
    const editCategoryArea = document.getElementById('editCategoryArea');
    if (editCategoryArea) editCategoryArea.classList.remove('d-none');
    
    const txCategorySelect = document.getElementById('txCategory');
    if (txCategorySelect) txCategorySelect.value = originalCategory || 'ทั่วไป';

    const recordBox = document.getElementById('recordBox');
    recordBox.style.backgroundColor = '#fff3cd'; recordBox.style.borderColor = '#ffc107';
    document.getElementById('recordBoxTitle').innerHTML = '<i class="bi bi-pencil-fill text-warning me-1"></i> แก้ไขและระบุหมวดหมู่จริง';
    document.getElementById('categoryActionArea').classList.add('d-none');
    document.getElementById('editActionArea').classList.remove('d-none');
    window.scrollTo({ top: 100, behavior: 'smooth' });
}

function cancelEditMode() {
    document.getElementById('editTxId').value = ''; document.getElementById('txAmount').value = ''; document.getElementById('txNote').value = '';
    const savingPurposeInput = document.getElementById('txSavingPurpose');
    if (savingPurposeInput) {
        savingPurposeInput.value = '';
        document.getElementById('emergencyPurposeArea').classList.add('d-none');
    }
    document.getElementById('txOwner').value = currentUserRole === 'me' ? 'me' : 'partner';
    
    // ซ่อนพื้นที่เลือกหมวดหมู่ในโหมดปกติ
    const editCategoryArea = document.getElementById('editCategoryArea');
    if (editCategoryArea) editCategoryArea.classList.add('d-none');

    const existingSlipArea = document.getElementById('existingSlipArea'); if (existingSlipArea) existingSlipArea.remove();
    const recordBox = document.getElementById('recordBox'); recordBox.style.backgroundColor = '#ffffff'; recordBox.style.borderColor = 'transparent';
    document.getElementById('recordBoxTitle').innerHTML = '<i class="bi bi-plus-square-fill text-success me-2"></i> บันทึกรายการใหม่';
    document.getElementById('categoryActionArea').classList.remove('d-none'); document.getElementById('editActionArea').classList.add('d-none');
    cancelSlipPreview();
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

    // ดึงข้อมูลเดิมมาเช็คคู่โอน สลิป และประเภทข้อมูล
    const { data: currentTx } = await supabaseClient.from('transactions').select('note, amount, category_name, owner, type').eq('id', id).single();
    let fileToDelete = null;
    let oldNote = '';
    let oldAmount = 0;
    if (currentTx) {
        oldNote = currentTx.note || '';
        oldAmount = currentTx.amount || 0;
        if (currentTx.note && currentTx.note.includes('[SLIP_URL:')) {
            const match = currentTx.note.match(/\[SLIP_URL:(.*?)\]/);
            if (match && match[1]) fileToDelete = match[1];
        }
    }

    let dbOwner = owner;
    let finalNote = note;

    // 🎯 ดึงและแนบวัตถุประสงค์การออมย่อยในโน้ต (เฉพาะเมื่อเป็นกระเป๋าเงินออมฉุกเฉิน)
    const savingPurposeInput = document.getElementById('txSavingPurpose');
    if (dbOwner === 'emergency' && savingPurposeInput) {
        const purposeVal = savingPurposeInput.value.trim();
        if (purposeVal) {
            finalNote = finalNote ? `[ออมเพื่อ: ${purposeVal}] ${finalNote}` : `[ออมเพื่อ: ${purposeVal}]`;
        }
    }

    const oldOwner = currentTx ? currentTx.owner : null;
    const oldType = currentTx ? currentTx.type : null;
    const wasEmergencyTransfer = (oldNote && (oldNote.includes('[โอนเข้าออมฉุกเฉิน]') || oldNote.includes('[ถอนจากออมฉุกเฉิน]')));

    // ดักดูถ้าเดิมไม่ใช่รายการโอนฉุกเฉิน แต่แก้ไขใหม่ให้กลายเป็นกระเป๋าฉุกเฉิน
    if (!wasEmergencyTransfer && dbOwner === 'emergency') {
        const tag = oldType === 'income' ? '[โอนเข้าออมฉุกเฉิน]' : '[ถอนจากออมฉุกเฉิน]';
        if (!finalNote.includes(tag)) {
            finalNote = finalNote ? `${tag} ${finalNote}` : tag;
        }
    }

    if (dbOwner === 'shared-me') { dbOwner = 'shared'; finalNote = finalNote ? `[จ่ายโดย: me] ${finalNote}` : `[จ่ายโดย: me]`; }
    else if (dbOwner === 'shared-partner') { dbOwner = 'shared'; finalNote = finalNote ? `[จ่ายโดย: partner] ${finalNote}` : `[จ่ายโดย: partner]`; }

    // 💡 ดึงหมวดหมู่ตามจริงจากดร็อปดาวน์ที่ผู้ใช้เลือกแก้ไข
    const txCategorySelect = document.getElementById('txCategory');
    let finalCategory = txCategorySelect ? txCategorySelect.value : (currentTx ? currentTx.category_name : 'ทั่วไป');
    
    // ทุกรายการโอนเงินสะสมฉุกเฉินจะต้องอยู่ในหมวดหมู่ "ลงทุน" เสมอเพื่อความเสถียร
    if (dbOwner === 'emergency') {
        finalCategory = 'ลงทุน';
    }

    // ถ้าผู้ใช้ลบรูปสลิปออก ให้เปลี่ยนเป็นทั่วไปหากหมวดหมู่เดิมคือสลิปตกค้าง
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

        // 🎯 อัปเดต/จัดการคู่โอน
        if (wasEmergencyTransfer) {
            let isBroken = false;
            if (oldOwner === 'emergency' && dbOwner !== 'emergency') {
                isBroken = true;
            } else if ((oldOwner === 'me' || oldOwner === 'partner') && (dbOwner === 'emergency' || dbOwner === 'shared')) {
                isBroken = true;
            }

            if (isBroken) {
                // ลบรายการคู่โอนออกเนื่องจากกระเป๋าเงินถูกแก้ไขจนไม่สอดคล้อง
                await supabaseClient.from('transactions')
                    .delete()
                    .eq('note', oldNote)
                    .eq('amount', oldAmount)
                    .neq('id', id);
                console.log("[Transfer Sync] Deleted paired transaction because owner was changed, breaking the transfer.");
            } else {
                // อัปเดตรายการคู่โอนตามปกติ (เปลี่ยนยอดและโน้ตตามกัน)
                let tag = oldNote.includes('[โอนเข้าออมฉุกเฉิน]') ? '[โอนเข้าออมฉุกเฉิน]' : '[ถอนจากออมฉุกเฉิน]';
                let cleanNewNote = finalNote.replace(/\[โอนเข้าออมฉุกเฉิน\]\s*/, '').replace(/\[ถอนจากออมฉุกเฉิน\]\s*/, '');
                let newNoteWithTag = cleanNewNote ? `${tag} ${cleanNewNote}` : tag;
                
                await supabaseClient.from('transactions')
                    .update({ amount: finalAmount, note: newNoteWithTag })
                    .eq('note', oldNote)
                    .eq('amount', oldAmount)
                    .neq('id', id);
            }
        } else {
            // ถ้าเดิมไม่ใช่รายการโอนเงินฉุกเฉิน แต่ตอนนี้เปลี่ยนมาเลือกกระเป๋าเงินฉุกเฉิน ให้สร้างคู่โอนให้ด้วย
            if (dbOwner === 'emergency') {
                const personalType = oldType === 'income' ? 'expense' : 'income';
                await supabaseClient.from('transactions').insert([{
                    amount: finalAmount,
                    type: personalType,
                    category_name: 'ลงทุน',
                    note: finalNote,
                    owner: currentUserRole,
                    created_at: new Date().toISOString()
                }]);
                console.log("[Transfer Sync] Converted transaction to emergency transfer and created paired transaction.");
            }
        }

        cancelEditMode();
        showToast('อัปเดตข้อมูลและปรับยอดกระเป๋าเงินคู่โอนเรียบร้อยแล้วจ้า!', '💾');
        triggerCelebration();
        await loadTransactions();
    }

    if (editBtn) { editBtn.disabled = false; editBtn.innerHTML = '💾 บันทึกการแก้ไข'; }
}

async function deleteTransaction(id) {
    if (!confirm('คุณแน่ใจใช่ไหมที่จะลบประวัติรายการเงินแถวนี้ทิ้งอย่างถาวร?\n(หากเป็นรายการโอนเงินข้ามบัญชี รายการเงินฝั่งคู่โอนจะถูกลบออกด้วยอัตโนมัติ)')) return;

    // ✨ [ข้อ 4] ล็อกปุ่มลบที่กด
    const deleteBtn = document.querySelector(`[data-delete-id="${id}"]`);
    if (deleteBtn) { deleteBtn.disabled = true; deleteBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>'; }

    const { data: currentTx } = await supabaseClient.from('transactions').select('note, amount').eq('id', id).single();
    if (currentTx) {
        if (currentTx.note && currentTx.note.includes('[SLIP_URL:')) {
            const match = currentTx.note.match(/\[SLIP_URL:(.*?)\]/);
            if (match && match[1]) await supabaseClient.storage.from('slips').remove([match[1]]);
        }
        
        // ลบรายการคู่โอนของมันด้วย (ถ้ามีโอนเข้า/ถอนออกจากออมฉุกเฉิน)
        if (currentTx.note && (currentTx.note.includes('[โอนเข้าออมฉุกเฉิน]') || currentTx.note.includes('[ถอนจากออมฉุกเฉิน]'))) {
            await supabaseClient.from('transactions').delete().eq('note', currentTx.note).eq('amount', currentTx.amount);
        }
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
    if (error) showToast(`เพิ่มภารกิจล้มเหลว: ${error.message}`, '❌', true); else { titleInput.value = ''; amountInput.value = ''; showToast('เพิ่มภารกิจลงหน้าจอสำเร็จแล้ว!', '➕'); triggerCelebration(); await loadGoals(); }
}

async function loadGoals() {
    const goalsList = document.getElementById('goalsList');
    if (goalsList) {
        goalsList.innerHTML = `
            <div class="skeleton-pulse d-flex flex-column gap-2">
                <div class="bg-secondary bg-opacity-10 rounded" style="height: 32px; width: 100%;"></div>
                <div class="bg-secondary bg-opacity-10 rounded" style="height: 32px; width: 100%;"></div>
            </div>
        `;
    }
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
    goalsList.innerHTML = '';
    if (!goals || goals.length === 0) { goalsList.innerHTML = '<p class="text-xs text-gray-400 text-center py-4">ไม่มีภารกิจการเงินระบุไว้</p>'; return; }
    goals.forEach(goal => {
        const safeTitle = escapeForAttr(goal.title);
        const div = document.createElement('div'); div.className = "list-group-item d-flex justify-content-between align-items-center p-2 mb-1 bg-light rounded-3 border-0 text-sm shadow-2xs";
        let actionUI = '';
        if (goal.is_completed) { actionUI = `<div class="d-flex align-items-center gap-2"><span class="badge bg-success">✅ สำเร็จ</span><button onclick="resetGoalStatus(${goal.id}, '${safeTitle}')" class="btn btn-outline-secondary btn-sm py-0 px-1 text-xs cursor-pointer" style="border-radius:6px;">↩️ รีเซ็ต</button></div>`; }
        else if (goal.is_failed) { actionUI = `<div class="d-flex align-items-center gap-2"><span class="badge bg-secondary text-dark">❌ ข้าม</span><button onclick="resetGoalStatus(${goal.id}, '${safeTitle}')" class="btn btn-outline-secondary btn-sm py-0 px-1 text-xs cursor-pointer" style="border-radius:6px;">↩️ รีเซ็ต</button></div>`; }
        else { actionUI = `<div class="btn-group btn-group-sm" style="border-radius:8px; overflow:hidden;"><button onclick="settleGoal(${goal.id}, 'success', '${safeTitle}', ${goal.amount}, '${goal.type}')" class="btn btn-outline-success py-0.5 px-2 cursor-pointer">✅ ออมแล้ว</button><button onclick="settleGoal(${goal.id}, 'failed', '${safeTitle}', ${goal.amount}, '${goal.type}')" class="btn btn-outline-danger py-0.5 px-2 cursor-pointer">❌ ข้าม</button><button onclick="deleteGoalFrontend(${goal.id})" class="btn btn-link text-muted p-0 px-1 ms-1 text-xs cursor-pointer" title="ลบถาวร">🗑️</button></div>`; }
        div.innerHTML = `<div class="text-truncate me-2"><span class="${goal.is_completed ? 'text-decoration-line-through text-muted' : goal.is_failed ? 'text-decoration-line-through text-black-50 font-normal' : 'fw-semibold text-dark'}">${getGoalIcon(goal.type)} ${goal.title}</span></div><div class="d-flex align-items-center gap-2 shrink-0"><span class="fw-bold text-dark">${parseFloat(goal.amount).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บ.</span>${actionUI}</div>`;
        goalsList.appendChild(div);
    });
    loadedGoalsCache = goals || [];
    updateInsightsAndProgress();
}

async function settleGoal(id, status, title, amount, type) {
    let realTitle = title;
    let realAmount = amount;
    let realType = type;
    
    // ดึงข้อมูลจริงจาก DB เพื่อป้องกันปัญหาการแปลงอักขระ HTML (HTML Entity) ใน onclick
    const { data: goalData, error: fetchError } = await supabaseClient
        .from('goals')
        .select('title, amount, type')
        .eq('id', id)
        .single();
        
    if (!fetchError && goalData) {
        realTitle = goalData.title;
        realAmount = goalData.amount;
        realType = goalData.type;
    }

    if (status === 'success') {
        if (!confirm(`ยืนยันทำเควสสำเร็จ: "${realTitle}"?\nระบบจะสร้างธุรกรรมออม/จ่ายเงินให้อัตโนมัติ`)) return;
        const { error } = await supabaseClient.from('goals').update({ is_completed: true, is_failed: false }).eq('id', id);
        if (error) return showToast(error.message, '❌', true);
        const finalAmount = parseFloat(parseFloat(realAmount).toFixed(2));
        if (realType.startsWith('save')) { 
            let emoji = '🎯';
            if (realType === 'save_travel') emoji = '✈️';
            else if (realType === 'save_shopping') emoji = '🛍️';
            else if (realType === 'save_gift') emoji = '🎁';
            
            // 1. หักเงินออมจากกระเป๋าผู้ใช้จริงที่กดเคลียร์ภารกิจ
            await supabaseClient.from('transactions').insert([{
                amount: finalAmount,
                type: 'expense',
                category_name: 'ลงทุน',
                owner: currentUserRole,
                note: `[หักเงินออมภารกิจ] ${realTitle}`,
                created_at: new Date().toISOString()
            }]);

            // 2. โอนเพิ่มยอดเข้าสู่กระเป๋าเป้าหมายเงินออมสะสม
            await supabaseClient.from('transactions').insert([{
                amount: finalAmount,
                type: 'income',
                category_name: 'ลงทุน',
                owner: 'emergency',
                note: `ภารกิจสำเร็จ: ${realTitle}`,
                created_at: new Date().toISOString()
            }]); 
            showToast(`ย้ายเงินเข้าบัญชีออมสำเร็จ ${emoji}`, '🎉'); 
        }
        else {
            let noteWithTag = `[จ่ายโดย: ${currentUserRole === 'me' ? 'me' : 'partner'}] จ่ายบิลออโต้: ${realTitle}`;
            await supabaseClient.from('transactions').insert([{
                amount: finalAmount,
                type: 'expense',
                category_name: 'ค่าที่พัก/บ้าน',
                owner: 'shared',
                note: noteWithTag,
                created_at: new Date().toISOString()
            }]);
            showToast('ตัดยอดบิลส่วนกลางเรียบร้อย 📄', '✅');
        }
        triggerCelebration();
    } else {
        if (!confirm(`เดือนนี้ล้มเหลว/ข้ามภารกิจ: "${realTitle}" ใช่ไหม?`)) return;
        const { error } = await supabaseClient.from('goals').update({ is_completed: false, is_failed: true }).eq('id', id);
        if (error) return showToast(error.message, '❌', true); showToast('บันทึกสถิติข้ามเควสแล้ว ❌', '📁');
    }
    await loadGoals(); await loadTransactions();
}

async function resetGoalStatus(id, title) {
    let realTitle = title;
    
    // ดึงข้อมูลจริงจาก DB เพื่อความแม่นยำ ป้องกันปัญหา HTML Escape
    const { data: goalData, error: fetchError } = await supabaseClient
        .from('goals')
        .select('title')
        .eq('id', id)
        .single();
        
    if (!fetchError && goalData) {
        realTitle = goalData.title;
    }

    if (!confirm(`คุณต้องการยกเลิกสถานะของภารกิจ "${realTitle}" เพื่อกลับไปเลือกกดติ๊กถูก/กากบาทใหม่ ใช่หรือไม่?\n(ระบบจะลบรายการเงินที่สร้างขึ้นโดยอัตโนมัติออกให้ด้วย)`)) return;
    
    // 1. อัปเดตสถานะของเควสภารกิจให้กลับเป็นร่างปกติ
    const { error: goalError } = await supabaseClient.from('goals').update({ is_completed: false, is_failed: false }).eq('id', id);
    if (goalError) return showToast(goalError.message, '❌', true);

    // 2. ลบธุรกรรมรายรับ/รายจ่ายที่ระบบเคยสร้างออโต้ออกไปเพื่อกู้คืนยอดสะสมและเงินคงเหลือ
    const notePattern1 = `ภารกิจสำเร็จ: ${realTitle}`;
    const notePatternDeduct = `[หักเงินออมภารกิจ] ${realTitle}`;
    const notePatternMe = `[จ่ายโดย: me] จ่ายบิลออโต้: ${realTitle}`;
    const notePatternPartner = `[จ่ายโดย: partner] จ่ายบิลออโต้: ${realTitle}`;
    
    const { error: txError } = await supabaseClient
        .from('transactions')
        .delete()
        .in('note', [notePattern1, notePatternDeduct, notePatternMe, notePatternPartner]);

    if (txError) {
        console.warn("Could not delete associated transactions:", txError);
    }

    showToast('รีเซ็ตสถานะภารกิจและลบรายการเงินคืนค่าเรียบร้อย', '↩️');
    await loadGoals();
    await loadTransactions();
}

async function deleteGoalFrontend(id) { if (!confirm('ต้องการลบภารกิจนี้ออกจากหน้าจอใช่ไหมครับ?')) return; const { error } = await supabaseClient.from('goals').delete().eq('id', id); if (error) showToast(error.message, '❌', true); else { showToast('ลบภารกิจออกแล้ว', '🗑️'); await loadGoals(); } }

async function loadTransactions() {
    const tbody = document.getElementById('transactionTableBody');
    if (tbody) {
        tbody.innerHTML = `
            <tr class="skeleton-pulse">
                <td colspan="7" class="text-center py-4 text-muted">
                    <span class="spinner-border spinner-border-sm me-2" role="status"></span>
                    กำลังโหลดข้อมูลธุรกรรมย้อนหลัง...
                </td>
            </tr>
        `;
    }
    const billTextEl = document.getElementById('billSummaryText');
    if (billTextEl) {
        billTextEl.innerHTML = `
            <div class="skeleton-pulse py-1">
                <div class="bg-white bg-opacity-25 rounded mx-auto mb-2" style="height: 14px; width: 60%;"></div>
                <div class="bg-white bg-opacity-20 rounded mx-auto" style="height: 10px; width: 80%;"></div>
            </div>
        `;
    }
    const monthlyTrendArea = document.getElementById('monthlyTrendArea');
    if (monthlyTrendArea) {
        monthlyTrendArea.innerHTML = `
            <div class="skeleton-pulse d-flex align-items-end justify-content-between gap-2 px-3 py-4" style="height: 150px;">
                <div class="bg-secondary bg-opacity-10 rounded-top" style="height: 40%; width: 12%;"></div>
                <div class="bg-secondary bg-opacity-10 rounded-top" style="height: 70%; width: 12%;"></div>
                <div class="bg-secondary bg-opacity-10 rounded-top" style="height: 55%; width: 12%;"></div>
                <div class="bg-secondary bg-opacity-10 rounded-top" style="height: 90%; width: 12%;"></div>
                <div class="bg-secondary bg-opacity-10 rounded-top" style="height: 30%; width: 12%;"></div>
                <div class="bg-secondary bg-opacity-10 rounded-top" style="height: 80%; width: 12%;"></div>
            </div>
        `;
    }
    const savingsTrendArea = document.getElementById('savingsTrendArea');
    if (savingsTrendArea) {
        savingsTrendArea.innerHTML = `
            <div class="skeleton-pulse d-flex align-items-end justify-content-between gap-2 px-3 py-4" style="height: 150px;">
                <div class="bg-secondary bg-opacity-10 rounded-top" style="height: 25%; width: 12%;"></div>
                <div class="bg-secondary bg-opacity-10 rounded-top" style="height: 45%; width: 12%;"></div>
                <div class="bg-secondary bg-opacity-10 rounded-top" style="height: 60%; width: 12%;"></div>
                <div class="bg-secondary bg-opacity-10 rounded-top" style="height: 75%; width: 12%;"></div>
                <div class="bg-secondary bg-opacity-10 rounded-top" style="height: 90%; width: 12%;"></div>
                <div class="bg-secondary bg-opacity-10 rounded-top" style="height: 95%; width: 12%;"></div>
            </div>
        `;
    }
    const aiInsightContent = document.getElementById('aiInsightContent');
    if (aiInsightContent) {
        aiInsightContent.innerHTML = `
            <div class="skeleton-pulse d-flex flex-column gap-2 py-1">
                <div class="bg-secondary bg-opacity-10 rounded" style="height: 12px; width: 85%;"></div>
                <div class="bg-secondary bg-opacity-10 rounded" style="height: 12px; width: 70%;"></div>
                <div class="bg-secondary bg-opacity-10 rounded" style="height: 12px; width: 90%;"></div>
            </div>
        `;
    }

    const { data: txs, error } = await supabaseClient.from('transactions').select('*').order('created_at', { ascending: false });
    if (error) return console.error(error);
    if (tbody) tbody.innerHTML = '';

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
        else if (tx.owner === 'shared') {
            sharedTotal += value;
            // สะท้อนเงินคงเหลือในกระเป๋าโบ๊ท/เอิร์น ตามยอดที่ควักล่วงหน้าไปจริง
            if (tx.type === 'expense') {
                if (exactOwner === 'shared-me') myTotal -= txAmount;
                else if (exactOwner === 'shared-partner') partnerTotal -= txAmount;
            }
        }

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

    // 🔄 ดำเนินการเรียงลำดับข้อมูลตามที่ผู้เลือก (Sort column)
    filteredTxsCache.sort((a, b) => {
        let valA, valB;
        if (currentSortField === 'date') {
            valA = a.txDate.getTime();
            valB = b.txDate.getTime();
        } else if (currentSortField === 'owner') {
            valA = a.exactOwner;
            valB = b.exactOwner;
        } else if (currentSortField === 'type') {
            valA = a.tx.type;
            valB = b.tx.type;
        } else if (currentSortField === 'category') {
            valA = a.tx.category_name;
            valB = b.tx.category_name;
        } else if (currentSortField === 'amount') {
            valA = a.txAmount;
            valB = b.txAmount;
        } else {
            valA = a.txDate.getTime();
            valB = b.txDate.getTime();
        }

        if (valA < valB) return currentSortOrder === 'asc' ? -1 : 1;
        if (valA > valB) return currentSortOrder === 'asc' ? 1 : -1;
        return 0;
    });

    // ✨ [ข้อ 6] Pagination: แสดงเฉพาะหน้าปัจจุบัน
    const totalPages = Math.max(1, Math.ceil(filteredTxsCache.length / ROWS_PER_PAGE));
    if (currentPage > totalPages) currentPage = totalPages;
    const startIdx = (currentPage - 1) * ROWS_PER_PAGE;
    const endIdx = startIdx + ROWS_PER_PAGE;
    const pageItems = filteredTxsCache.slice(startIdx, endIdx);

    const nameMe = localStorage.getItem('nameMe') || 'คุณโบ๊ท';
    const namePartner = localStorage.getItem('namePartner') || 'คุณเอิร์น';
    const emergencyTitle = localStorage.getItem('emergencyTargetTitle') || 'เงินออมสำรองฉุกเฉิน';

    pageItems.forEach(({ tx, txDate, txAmount, exactOwner, cleanNote }) => {
        let ownerBadge = '';
        if (exactOwner === 'me') ownerBadge = `<span class="badge bg-primary-subtle text-primary">🙋‍♂️ ${nameMe}</span>`;
        else if (exactOwner === 'partner') ownerBadge = `<span class="badge bg-danger-subtle text-danger">🙋‍♀️ ${namePartner}</span>`;
        else if (exactOwner === 'emergency') ownerBadge = `<span class="badge bg-success text-white">🎯 ${emergencyTitle}</span>`;
        else if (exactOwner === 'shared-me') ownerBadge = `<span class="badge bg-warning text-dark">🤝 กองกลาง (${nameMe}จ่าย)</span>`;
        else if (exactOwner === 'shared-partner') ownerBadge = `<span class="badge bg-warning text-dark">🤝 กองกลาง (${namePartner}จ่าย)</span>`;
        else ownerBadge = '<span class="badge bg-warning text-dark">🤝 กองกลาง</span>';

        let displayNoteText = cleanNote;
        if (displayNoteText.includes('[SLIP_URL:')) {
            displayNoteText = displayNoteText.replace(/\[SLIP_URL:.*?\]/g, '').trim() || '📷 แนบไฟล์สลิป (คลิก ✏️ แก้ เพื่อลงหมวดหมู่จริง)';
        }

        const safeNote = escapeForAttr(tx.note || '');
        const safeOwner = escapeForAttr(tx.owner);
        const safeCategory = escapeForAttr(tx.category_name || 'ทั่วไป');

        const dateStr = txDate.toLocaleString('th-TH', { hour12: false });
        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="small text-muted">${dateStr}</td>
            <td>${ownerBadge}</td>
            <td class="fw-medium ${tx.type === 'expense' ? 'text-danger' : 'text-success'}">${tx.type === 'expense' ? 'รายจ่าย 🔴' : 'รายรับ 🟢'}</td>
            <td class="fw-semibold ${tx.category_name === 'สลิปรอระบุหมวดหมู่' ? 'text-warning' : ''}">
                ${tx.category_name === 'สลิปรอระบุหมวดหมู่' ? '⏳ รอระบุหมวดหมู่' : getCategoryEmoji(tx.category_name)}
            </td>
            <td class="fw-bold">${txAmount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท</td>
            <td class="text-muted small">${displayNoteText || '-'}</td>
            <td class="text-center whitespace-nowrap">
                <button onclick="enterEditMode(${tx.id}, ${txAmount}, '${safeNote}', '${safeOwner}', '${safeCategory}')" class="btn btn-outline-warning btn-sm py-0 px-2 cursor-pointer" style="border-radius:6px;">✏️ แก้</button>
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

    const billSummaryTextEl = document.getElementById('billSummaryText');
    if (totalMePaidShared === 0 && totalPartnerPaidShared === 0) {
        if (billSummaryTextEl) billSummaryTextEl.innerHTML = `<div class="text-center py-2">🎉 ยังไม่มีรายจ่ายกองกลางร่วมกันในเดือนนี้<br><span class="text-white-50 small" style="font-size: 0.8rem;">(ระบบจะช่วยหารครึ่งทันทีเมื่อจดรายการผ่านกระเป๋า "กองกลาง")</span></div>`;
    } else {
        const grandSharedExpense = totalMePaidShared + totalPartnerPaidShared; const halfShare = grandSharedExpense / 2; let settlementResultText = "";
        if (totalMePaidShared > totalPartnerPaidShared) { const diff = totalMePaidShared - halfShare; settlementResultText = `🙋‍♀️ คุณเอิร์น ต้องโอนคืนให้ คุณโบ๊ท: <span class="fw-bold text-warning fs-5">${diff.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท</span>`; }
        else if (totalPartnerPaidShared > totalMePaidShared) { const diff = totalPartnerPaidShared - halfShare; settlementResultText = `🙋‍♂️ คุณโบ๊ท ต้องโอนคืนให้ คุณเอิร์น: <span class="fw-bold text-warning fs-5">${diff.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท</span>`; }
        else { settlementResultText = `🤝 ยอดออกเงินคนละครึ่งเท่ากันเป๊ะ พอดิบพอดีจ้า!`; }
        if (billSummaryTextEl) billSummaryTextEl.innerHTML = `รายจ่ายกองกลางเดือนนี้รวม: <b>${grandSharedExpense.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บ.</b> (หารครึ่งคนละ ${halfShare.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บ.)<br><div class="text-center mt-2 small text-white-50" style="font-size: 0.8rem;">• คุณโบ๊ท ควักจ่ายล่วงหน้าไป: ${totalMePaidShared.toLocaleString()} บ. | คุณเอิร์น ควักจ่ายล่วงหน้าไป: ${totalPartnerPaidShared.toLocaleString()} บ.</div><hr class="my-2 text-white-50"><div class="text-center">${settlementResultText}</div>`;
    }
    renderAnalytics(categorySummary, totalExpenseFiltered);

    // ✨ [ข้อ 8] สร้างกราฟแนวโน้มรายเดือนจากข้อมูลทั้งหมด
    renderMonthlyTrend(txs);
    renderSavingsTrend(txs);
    updateMilestones(txs);

    loadedTxsCache = txs || [];
    currentTotalMePaidShared = totalMePaidShared;
    currentTotalPartnerPaidShared = totalPartnerPaidShared;
    updateInsightsAndProgress();
    updateSortHeadersUI();
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
        const nameMe = localStorage.getItem('nameMe') || 'คุณโบ๊ท';
        const namePartner = localStorage.getItem('namePartner') || 'คุณเอิร์น';
        const emergencyTitle = localStorage.getItem('emergencyTargetTitle') || 'เงินออมสำรองฉุกเฉิน';
        const ownerMap = { 
            'me': nameMe, 
            'partner': namePartner, 
            'shared': 'กองกลาง', 
            'shared-me': `กองกลาง (${nameMe}จ่าย)`, 
            'shared-partner': `กองกลาง (${namePartner}จ่าย)`, 
            'emergency': emergencyTitle 
        };
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

    let html = `<div class="d-flex align-items-end justify-content-between gap-1" style="height: 195px; padding-bottom: 4px;">`;

    monthlyData.forEach((m, i) => {
        const incomeH = Math.max(2, (m.income / maxVal) * 125);
        const expenseH = Math.max(2, (m.expense / maxVal) * 125);
        const isCurrentMonth = (i === monthlyData.length - 1);

        html += `<div class="d-flex flex-column align-items-center flex-fill" style="min-width: 0;">`;
        
        // 1. ตัวเลขรายรับ/รายจ่ายซ้อนกันแนวตั้ง ป้องกันการชนกันแนวนอน
        html += `<div class="d-flex flex-column align-items-center mb-1 text-center" style="font-size: 0.55rem; line-height: 1.2; min-height: 28px; justify-content: end;">`;
        if (m.income > 0) {
            html += `<span class="text-success fw-bold" title="รายรับ: ${m.income.toLocaleString()} บาท">+${m.income.toLocaleString('th-TH', { maximumFractionDigits: 0 })}</span>`;
        } else {
            html += `<span class="text-success text-opacity-50" style="opacity: 0.4;">0</span>`;
        }
        if (m.expense > 0) {
            html += `<span class="text-danger fw-bold" title="รายจ่าย: ${m.expense.toLocaleString()} บาท">-${m.expense.toLocaleString('th-TH', { maximumFractionDigits: 0 })}</span>`;
        } else {
            html += `<span class="text-danger text-opacity-50" style="opacity: 0.4;">0</span>`;
        }
        html += `</div>`;

        // 2. แท่งคู่ (รายรับ + รายจ่าย)
        html += `<div class="d-flex align-items-end gap-1 mb-1" style="height: 130px;">`;
        // แท่งรายรับ (เขียว)
        html += `<div title="รายรับ: ${m.income.toLocaleString('th-TH', { minimumFractionDigits: 0 })} บ." style="width: 14px; height: ${incomeH}px; background: linear-gradient(180deg, #34d399, #059669); border-radius: 4px 4px 0 0; transition: height 0.4s ease;"></div>`;
        // แท่งรายจ่าย (แดง)
        html += `<div title="รายจ่าย: ${m.expense.toLocaleString('th-TH', { minimumFractionDigits: 0 })} บ." style="width: 14px; height: ${expenseH}px; background: linear-gradient(180deg, #f87171, #dc2626); border-radius: 4px 4px 0 0; transition: height 0.4s ease;"></div>`;
        html += `</div>`;
        
        // 3. ชื่อเดือน
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
        col.innerHTML = `<div class="bg-light p-3 rounded-3 border"><div class="d-flex justify-content-between small fw-bold mb-1"><span class="text-dark">${item.name === 'สลิปรอระบุหมวดหมู่' ? '⏳ รอระบุหมวดหมู่' : getCategoryEmoji(item.name)}</span><span class="text-secondary">${item.amount.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บ. (${percentage}%)</span></div><div class="progress" style="height: 6px;"><div class="progress-bar ${item.name === 'สลิปรอระบุหมวดหมู่' ? 'bg-warning' : 'bg-danger'}" style="width: ${percentage}%"></div></div></div>`;
        area.appendChild(col);
    });
}

function renderSavingsTrend(allTxs) {
    const area = document.getElementById('savingsTrendArea');
    if (!area) return;

    const now = new Date();
    const months = [];
    for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push({ 
            year: d.getFullYear(), 
            month: d.getMonth(), 
            label: `${d.toLocaleString('th-TH', { month: 'short' })} ${d.getFullYear() + 543}`,
            endTimestamp: new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999).getTime()
        });
    }

    const savingsData = months.map(m => {
        let balance = 0;
        allTxs.forEach(tx => {
            const txTime = new Date(tx.created_at).getTime();
            if (tx.owner === 'emergency' && txTime <= m.endTimestamp) {
                const amt = parseFloat(tx.amount);
                balance += (tx.type === 'income' ? amt : -amt);
            }
        });
        return { ...m, balance: Math.max(0, balance) };
    });

    const maxVal = Math.max(...savingsData.map(m => m.balance), 1000);

    let html = `<div class="d-flex align-items-end justify-content-between gap-1" style="height: 180px; padding-bottom: 4px;">`;

    savingsData.forEach((m, i) => {
        const barH = Math.max(2, (m.balance / maxVal) * 120); // Keep space for the labels
        const isCurrentMonth = (i === savingsData.length - 1);

        html += `<div class="d-flex flex-column align-items-center flex-fill" style="min-width: 0;">`;
        let displayAmt = m.balance.toLocaleString('th-TH', { maximumFractionDigits: 0 });
        html += `<span class="text-success fw-bold mb-1" style="font-size: 0.65rem; white-space: nowrap;">${displayAmt} บ.</span>`;
        html += `<div title="ยอดสะสม: ${m.balance.toLocaleString()} บาท" style="width: 24px; height: ${barH}px; background: linear-gradient(180deg, #10b981, #047857); border-radius: 6px 6px 0 0; transition: height 0.4s ease; cursor: pointer;"></div>`;
        html += `<span class="text-center small mt-1 ${isCurrentMonth ? 'fw-bold text-success' : 'text-muted'}" style="font-size: 0.65rem; line-height: 1.1;">${m.label}</span>`;
        html += `</div>`;
    });

    html += `</div>`;
    
    let growthText = '';
    const firstMonth = savingsData[0];
    const lastMonth = savingsData[savingsData.length - 1];
    if (firstMonth && lastMonth) {
        const diff = lastMonth.balance - firstMonth.balance;
        if (diff > 0) {
            growthText = `<span class="text-success"><i class="bi bi-graph-up-arrow"></i> 6 เดือนที่ผ่านมาออมเพิ่มขึ้น +${diff.toLocaleString()} บาท</span>`;
        } else if (diff < 0) {
            growthText = `<span class="text-danger"><i class="bi bi-graph-down-arrow"></i> ยอดออมลดลงจาก 6 เดือนก่อน -${Math.abs(diff).toLocaleString()} บาท</span>`;
        } else {
            growthText = `<span class="text-muted">ยอดออมสะสมคงที่</span>`;
        }
    }
    
    html += `<div class="d-flex justify-content-between align-items-center mt-2 px-1">`;
    html += `<span class="small text-muted">สะสม ณ สิ้นเดือน</span>`;
    if (growthText) html += `<span class="small fw-medium">${growthText}</span>`;
    html += `</div>`;

    area.innerHTML = html;
}

// 🔄 ระบบเรียงลำดับหัวข้อประวัติการทำรายการ (Click-to-Sort)
function toggleSort(field) {
    if (currentSortField === field) {
        currentSortOrder = currentSortOrder === 'asc' ? 'desc' : 'asc';
    } else {
        currentSortField = field;
        currentSortOrder = 'asc';
    }
    currentPage = 1;
    loadTransactions();
}

function updateSortHeadersUI() {
    const fields = ['date', 'owner', 'type', 'category', 'amount'];
    fields.forEach(field => {
        const iconEl = document.getElementById(`sort-icon-${field}`);
        if (iconEl) {
            if (currentSortField === field) {
                iconEl.innerText = currentSortOrder === 'asc' ? ' ▲' : ' ▼';
                iconEl.className = 'text-primary fw-bold ms-1';
            } else {
                iconEl.innerText = '';
                iconEl.className = '';
            }
        }
    });
}

// ⚙️ ระบบตั้งค่าชื่อและข้อมูลผู้ใช้แบบไดนามิกฝั่งหน้าบ้าน
function initDynamicNames() {
    const inputMe = document.getElementById('inputNameMe');
    const inputPartner = document.getElementById('inputNamePartner');
    
    const nameMe = localStorage.getItem('nameMe') || 'คุณโบ๊ท';
    const namePartner = localStorage.getItem('namePartner') || 'คุณเอิร์น';
    
    if (inputMe) inputMe.value = nameMe;
    if (inputPartner) inputPartner.value = namePartner;
    
    applyDynamicNames();
}

function saveDynamicNames() {
    const nameMe = document.getElementById('inputNameMe').value.trim() || 'คุณโบ๊ท';
    const namePartner = document.getElementById('inputNamePartner').value.trim() || 'คุณเอิร์น';
    
    localStorage.setItem('nameMe', nameMe);
    localStorage.setItem('namePartner', namePartner);
    
    applyDynamicNames();
    
    // โหลดข้อมูลประวัติและเควสอัปเดตการแสดงผลใหม่
    loadTransactions();
    loadGoals();
}

function applyDynamicNames() {
    const nameMe = localStorage.getItem('nameMe') || 'คุณโบ๊ท';
    const namePartner = localStorage.getItem('namePartner') || 'คุณเอิร์น';
    
    // อัปเดตการ์ดกระเป๋าเงินบน Dashboard
    const labelWalletMe = document.getElementById('labelWalletMe');
    if (labelWalletMe) labelWalletMe.innerText = `กระเป๋า${nameMe} 🙋‍♂️`;
    
    const labelWalletPartner = document.getElementById('labelWalletPartner');
    if (labelWalletPartner) labelWalletPartner.innerText = `กระเป๋า${namePartner} 🙋‍♀️`;
    
    // อัปเดตตัวเลือกในกล่องดรอปดาวน์
    const optOwnerMe = document.getElementById('optOwnerMe');
    if (optOwnerMe) optOwnerMe.innerText = `🙋‍♂️ กระเป๋าส่วนตัว (${nameMe})`;
    
    const optOwnerPartner = document.getElementById('optOwnerPartner');
    if (optOwnerPartner) optOwnerPartner.innerText = `🙋‍♀️ กระเป๋าส่วนตัว (${namePartner})`;
    
    const optOwnerSharedMe = document.getElementById('optOwnerSharedMe');
    if (optOwnerSharedMe) optOwnerSharedMe.innerText = `🤝 เงินกองกลาง (${nameMe} ออกก่อน)`;
    
    const optOwnerSharedPartner = document.getElementById('optOwnerSharedPartner');
    if (optOwnerSharedPartner) optOwnerSharedPartner.innerText = `🤝 เงินกองกลาง (${namePartner} ออกก่อน)`;
    
    // อัปเดตตัวกรองกระเป๋าเงินในประวัติ
    const filterMe = document.querySelector("#filterOwner option[value='me']");
    if (filterMe) filterMe.innerText = `🙋‍♂️ เฉพาะของ${nameMe}`;
    
    const filterPartner = document.querySelector("#filterOwner option[value='partner']");
    if (filterPartner) filterPartner.innerText = `🙋‍♀️ เฉพาะของ${namePartner}`;
    
    // อัปเดตชื่อผู้ใช้งานระบบปัจจุบัน
    const userDisplay = document.getElementById('userDisplay');
    if (userDisplay) {
        if (currentUserRole === 'me') {
            userDisplay.innerHTML = `🙋‍♂️ ผู้ใช้งานระบบปัจจุบัน: <span class="text-primary">${nameMe}</span>`;
        } else {
            userDisplay.innerHTML = `🙋‍♀️ ผู้ใช้งานระบบปัจจุบัน: <span class="text-danger">${namePartner}</span>`;
        }
    }

    // อัปเดตบิลรายเดือนกับเป้าหมายเหรียญรางวัลให้ใช้ชื่อใหม่ทันที
    if (typeof renderRecurringBills === 'function') renderRecurringBills();
    if (typeof updateMilestones === 'function') updateMilestones(loadedTxsCache);
}

function toggleSettingsPanel() {
    const body = document.getElementById('settingsPanelBody');
    const icon = document.getElementById('settingsToggleIcon');
    if (!body || !icon) return;
    if (body.classList.contains('d-none')) {
        body.classList.remove('d-none');
        icon.innerHTML = 'คลิกเพื่อย่อ <i class="bi bi-chevron-up"></i>';
    } else {
        body.classList.add('d-none');
        icon.innerHTML = 'คลิกเพื่อเปิดดู <i class="bi bi-chevron-down"></i>';
    }
}

// =========================================================================
// 📅 บิลประจำรายเดือน & ค่าบริการรายรอบ (Recurring Bills & Subscriptions)
// =========================================================================

function initRecurringBills() {
    const saved = localStorage.getItem('recurringBills');
    if (!saved) {
        // ค่าตั้งต้นที่มักใช้ร่วมกันของคู่รัก
        const defaultBills = [
            { title: "Netflix 📺", amount: 419, dueDay: 15, share: "shared-me", history: {} },
            { title: "Spotify Family 🎵", amount: 209, dueDay: 20, share: "shared-partner", history: {} },
            { title: "ค่าไฟห้องคอนโด ⚡", amount: 1500, dueDay: 5, share: "shared-me", history: {} }
        ];
        localStorage.setItem('recurringBills', JSON.stringify(defaultBills));
        recurringBills = defaultBills;
    } else {
        try {
            recurringBills = JSON.parse(saved);
        } catch (e) {
            recurringBills = [];
        }
    }
    renderRecurringBills();
}

function toggleBillForm(show) {
    const form = document.getElementById('addBillForm');
    if (form) {
        if (show) {
            form.classList.remove('d-none');
        } else {
            form.classList.add('d-none');
            // ล้างฟิลด์ในฟอร์ม
            document.getElementById('billTitleInput').value = '';
            document.getElementById('billAmountInput').value = '';
            document.getElementById('billDueInput').value = '15';
            document.getElementById('billShareInput').value = 'shared-me';
        }
    }
}

function saveNewBill() {
    const title = document.getElementById('billTitleInput').value.trim();
    const amount = parseFloat(document.getElementById('billAmountInput').value);
    const dueDay = parseInt(document.getElementById('billDueInput').value);
    const share = document.getElementById('billShareInput').value;

    if (!title) return showToast('กรุณากรอกชื่อบริการด้วยครับ', '⚠️', true);
    if (isNaN(amount) || amount <= 0) return showToast('กรุณากรอกยอดเงินให้ถูกต้อง', '🔢', true);
    if (isNaN(dueDay) || dueDay < 1 || dueDay > 31) return showToast('กรุณากรอกดิววันที่ระหว่าง 1 - 31', '📅', true);

    const newBill = {
        title: title,
        amount: parseFloat(amount.toFixed(2)),
        dueDay: dueDay,
        share: share,
        history: {}
    };

    recurringBills.push(newBill);
    localStorage.setItem('recurringBills', JSON.stringify(recurringBills));
    toggleBillForm(false);
    renderRecurringBills();
    showToast('เพิ่มรายการบิลประจำเรียบร้อยแล้วจ้า! 📅', '✅');
}

function deleteBill(index) {
    if (!confirm(`ต้องการลบรายการบิล "${recurringBills[index].title}" ใช่หรือไม่?`)) return;
    recurringBills.splice(index, 1);
    localStorage.setItem('recurringBills', JSON.stringify(recurringBills));
    renderRecurringBills();
    showToast('ลบรายการบิลเรียบร้อยแล้ว', '🗑️');
}

function getCategoryForBill(title) {
    const lower = title.toLowerCase();
    if (lower.includes('ไฟ') || lower.includes('น้ำ') || lower.includes('เน็ต') || lower.includes('บ้าน') || lower.includes('คอนโด') || lower.includes('📺') || lower.includes('netflix') || lower.includes('disney')) {
        return 'ค่าที่พัก/บ้าน';
    }
    if (lower.includes('รถ') || lower.includes('น้ำมัน') || lower.includes('เดินทาง') || lower.includes('⛽')) {
        return 'เดินทาง';
    }
    return 'อื่นๆ';
}

async function payBill(index) {
    const bill = recurringBills[index];
    const nameMe = localStorage.getItem('nameMe') || 'คุณโบ๊ท';
    const namePartner = localStorage.getItem('namePartner') || 'คุณเอิร์น';
    
    if (!confirm(`ยืนยันจ่ายบิลประจำเดือนสำหรับ: "${bill.title}" ยอดเงิน ${bill.amount.toLocaleString()} บาท?\n(ระบบจะสร้างธุรกรรมรายจ่ายให้อัตโนมัติ)`)) return;

    // คำนวณรหัสรอบเดือนปัจจุบัน (เช่น 06-2026)
    const now = new Date();
    const monthYearKey = `${(now.getMonth()+1).toString().padStart(2, '0')}-${now.getFullYear()}`;

    // 1. เพิ่มข้อมูลธุรกรรมในฐานข้อมูล
    let dbOwner = bill.share;
    let finalNote = `[จ่ายบิลประจำ] ${bill.title}`;
    
    if (dbOwner === 'shared-me') {
        dbOwner = 'shared';
        finalNote = `[จ่ายโดย: me] ${finalNote}`;
    } else if (dbOwner === 'shared-partner') {
        dbOwner = 'shared';
        finalNote = `[จ่ายโดย: partner] ${finalNote}`;
    }

    const { error } = await supabaseClient.from('transactions').insert([{
        amount: bill.amount,
        type: 'expense',
        category_name: getCategoryForBill(bill.title),
        note: finalNote,
        owner: dbOwner,
        created_at: now.toISOString()
    }]);

    if (error) {
        return showToast(`บันทึกจ่ายบิลล้มเหลว: ${error.message}`, '❌', true);
    }

    // 2. อัปเดตประวัติการจ่ายลงใน LocalStorage
    bill.history[monthYearKey] = true;
    localStorage.setItem('recurringBills', JSON.stringify(recurringBills));

    showToast(`จ่ายบิล ${bill.title} และลงบันทึกรายจ่ายเรียบร้อย! 🎉`, '💳');
    triggerCelebration();
    renderRecurringBills();
    await loadTransactions();
}

function renderRecurringBills() {
    const list = document.getElementById('recurringBillsList');
    if (!list) return;

    if (recurringBills.length === 0) {
        list.innerHTML = `<p class="text-center text-muted py-4 small mb-0">💡 ยังไม่มีรายการบิลประจำ คลิกปุ่ม "ตั้งค่าบิล" ด้านบนเพื่อเพิ่มได้เลยครับ</p>`;
        return;
    }

    const now = new Date();
    const monthYearKey = `${(now.getMonth()+1).toString().padStart(2, '0')}-${now.getFullYear()}`;
    const nameMe = localStorage.getItem('nameMe') || 'คุณโบ๊ท';
    const namePartner = localStorage.getItem('namePartner') || 'คุณเอิร์น';

    list.innerHTML = '';
    recurringBills.forEach((bill, idx) => {
        const isPaidThisMonth = bill.history[monthYearKey] === true;
        
        let shareText = '';
        if (bill.share === 'shared-me') shareText = `🤝 กองกลาง (${nameMe} จ่ายก่อน)`;
        else if (bill.share === 'shared-partner') shareText = `🤝 กองกลาง (${namePartner} จ่ายก่อน)`;
        else if (bill.share === 'me') shareText = `🙋‍♂️ กระเป๋า ${nameMe} จ่ายเดี่ยว`;
        else if (bill.share === 'partner') shareText = `🙋‍♀️ กระเป๋า ${namePartner} จ่ายเดี่ยว`;

        const row = document.createElement('div');
        row.className = "d-flex align-items-center justify-content-between p-2 mb-2 bg-light rounded-3 text-xs";
        row.style.backgroundColor = "var(--light-bg)";
        row.style.border = "1px solid var(--card-border)";
        
        let actionHTML = '';
        if (isPaidThisMonth) {
            actionHTML = `<span class="badge bg-success-subtle text-success py-1 px-2.5 rounded-pill fw-bold"><i class="bi bi-check-circle-fill me-1"></i> จ่ายแล้ว</span>`;
        } else {
            actionHTML = `<button onclick="payBill(${idx})" class="btn btn-success btn-xs py-1 px-2.5 fw-bold cursor-pointer rounded-pill shadow-xs">💳 จ่ายแล้ว</button>`;
        }

        row.innerHTML = `
            <div class="text-truncate me-2" style="max-width: 65%;">
                <span class="fw-bold text-dark d-flex align-items-center" style="font-size: 0.8rem; color: var(--text-dark) !important;">
                    ${bill.title}
                    <span onclick="deleteBill(${idx})" class="text-muted ms-2 cursor-pointer small" style="opacity:0.5; font-size: 0.7rem;" title="ลบบิลประจำนี้">🗑️</span>
                </span>
                <span class="text-muted small d-block mt-0.5" style="font-size: 0.65rem;">ดิววันที่ ${bill.dueDay} • ${shareText}</span>
            </div>
            <div class="d-flex align-items-center gap-2 shrink-0">
                <span class="fw-bold text-dark" style="font-size: 0.8rem; color: var(--text-dark) !important;">${parseFloat(bill.amount).toLocaleString('th-TH')} บ.</span>
                ${actionHTML}
            </div>
        `;
        list.appendChild(row);
    });
}

// =========================================================================
// 🏆 ถ้วยรางวัลการออมคู่รัก (Milestones & Achievements)
// =========================================================================

function updateMilestones(allTxs) {
    const area = document.getElementById('coupleMilestonesArea');
    if (!area) return;
    if (!allTxs) allTxs = [];

    // 1. คำนวณยอดเงินสะสมในคลังออมฉุกเฉิน
    let emergencyBalance = 0;
    allTxs.forEach(tx => {
        if (tx.owner === 'emergency') {
            const amt = parseFloat(tx.amount);
            emergencyBalance += (tx.type === 'income' ? amt : -amt);
        }
    });

    // 2. คำนวณยอดรายจ่ายแชร์ส่วนกลางประจำเดือนนี้
    const now = new Date();
    let sharedExpenseThisMonth = 0;
    allTxs.forEach(tx => {
        const txDate = new Date(tx.created_at);
        if (tx.owner === 'shared' && tx.type === 'expense' && txDate.getMonth() === now.getMonth() && txDate.getFullYear() === now.getFullYear()) {
            sharedExpenseThisMonth += parseFloat(tx.amount);
        }
    });

    const emergencyTarget = parseFloat(localStorage.getItem('emergencyTarget')) || 50000;
    const nameMe = localStorage.getItem('nameMe') || 'คุณโบ๊ท';
    const namePartner = localStorage.getItem('namePartner') || 'คุณเอิร์น';

    // 3. กำหนดข้อมูล Milestone แต่ละขั้น
    const milestones = [
        {
            id: "sprout",
            icon: "🥉",
            title: "ต้นรักแรกออม",
            desc: "ออมเงินคลังแตะ 5,000 บ.",
            target: 5000,
            current: emergencyBalance,
            isUnlocked: emergencyBalance >= 5000,
            displayProgress: `สะสมแล้ว: ${Math.min(5000, Math.max(0, emergencyBalance)).toLocaleString()} บ.`
        },
        {
            id: "shield",
            icon: "🥈",
            title: "ผู้พิทักษ์กระเป๋า",
            desc: "ออมเงินคลังแตะ 20,000 บ.",
            target: 20000,
            current: emergencyBalance,
            isUnlocked: emergencyBalance >= 20000,
            displayProgress: `สะสมแล้ว: ${Math.min(20000, Math.max(0, emergencyBalance)).toLocaleString()} บ.`
        },
        {
            id: "palace",
            icon: "🥇",
            title: "เศรษฐีสร้างตัว",
            desc: `ออมเงินคลังครบเป้าหมายหลัก`,
            target: emergencyTarget,
            current: emergencyBalance,
            isUnlocked: emergencyBalance >= emergencyTarget,
            displayProgress: `สะสมแล้ว: ${Math.min(emergencyTarget, Math.max(0, emergencyBalance)).toLocaleString()} บ.`
        },
        {
            id: "frugal",
            icon: "💎",
            title: `${nameMe} & ${namePartner} ประหยัดเก่ง`,
            desc: `รายจ่ายกองกลางต่ำกว่า 10,000 บ.`,
            target: 10000,
            current: sharedExpenseThisMonth,
            isUnlocked: sharedExpenseThisMonth > 0 && sharedExpenseThisMonth < 10000,
            displayProgress: sharedExpenseThisMonth === 0 ? "ยังไม่มีรายจ่ายกองกลาง" : `รายจ่ายเดือนนี้: ${sharedExpenseThisMonth.toLocaleString()} บ.`
        }
    ];

    // 4. เรนเดอร์การ์ด Milestone
    area.innerHTML = '';
    milestones.forEach(m => {
        const card = document.createElement('div');
        
        if (m.isUnlocked) {
            card.className = "milestone-badge text-center p-2 rounded-4 shadow-xs unlocked animated-bounce";
            card.style.background = "linear-gradient(135deg, #fffbeb, #fef3c7)";
            card.style.borderColor = "#f59e0b";
            card.title = `${m.title}: ${m.desc} (ปลดล็อคสำเร็จแล้ว! 🎉)`;
            
            card.innerHTML = `
                <div class="milestone-icon fs-2">${m.icon}</div>
                <div class="fw-bold mt-1 milestone-title" style="font-size: 0.7rem; line-height: 1.1; color: #78350f;">${m.title}</div>
                <span class="small d-block text-muted mt-0.5" style="font-size: 0.55rem; color: #b45309 !important;">${m.displayProgress}</span>
                <span class="badge bg-success text-white rounded-pill mt-1" style="font-size: 0.55rem; padding: 1px 6px;">🔓 สำเร็จ</span>
            `;
        } else {
            card.className = "milestone-badge text-center p-2 rounded-4 locked";
            card.title = `${m.title}: ${m.desc} (ยังทำไม่สำเร็จ 🔒)`;
            
            let statusText = '🔒 ล็อค';
            if (m.id === 'frugal' && sharedExpenseThisMonth >= 10000) {
                statusText = '❌ เกินงบ';
            }

            card.innerHTML = `
                <div class="milestone-icon fs-2" style="opacity: 0.5;">${m.icon}</div>
                <div class="fw-bold mt-1 text-muted" style="font-size: 0.7rem; line-height: 1.1;">${m.title}</div>
                <span class="small d-block text-muted mt-0.5" style="font-size: 0.55rem; opacity: 0.75;">${m.displayProgress}</span>
                <span class="badge bg-secondary text-dark rounded-pill mt-1" style="font-size: 0.55rem; padding: 1px 6px;">${statusText}</span>
            `;
        }
        
        area.appendChild(card);
    });
}