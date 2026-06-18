// app.js - Phase 1 Final Production Version (Smart Form Reset & Beautiful Error Handling)

let filterOwner = 'all';
let filterType = 'all';
let filterDate = 'this-month';
let currentUserRole = 'me'; // ค่าเริ่มต้น: me = ฉัน, partner = แฟน

// 🛠️ 1. โค้ดลับดักจับรหัส UID เพื่อล็อกหน้าเว็บให้เป็น "กระเป๋าส่วนตัว" ของคนที่กำลังล็อกอินออโต้
function initUserIdentity(userId) {
    const userDisplay = document.getElementById('userDisplay');
    const txOwnerInput = document.getElementById('txOwner');

    // 💡 คัดลอกรหัส User UID ยาวๆ จากหน้า Supabase Auth ของคุณเดฟมาแปะแทนที่ตรงนี้ได้เลยครับ
    if (userId === '4ffee1dd-ff34-47c0-a623-7dcc76d80c0f') {
        currentUserRole = 'me';
        userDisplay.innerHTML = `🙋‍♂️ ผู้ใช้งานระบบปัจจุบัน: <span class="text-primary">คุณเดฟ (แอดมิน)</span>`;
        if (txOwnerInput) txOwnerInput.value = 'me'; // ล็อกกระเป๋าส่วนตัวของฉันเป็นค่าเริ่มต้น
    } else {
        currentUserRole = 'partner';
        userDisplay.innerHTML = `🙋‍♀️ ผู้ใช้งานระบบปัจจุบัน: <span class="text-danger">คุณแฟนคนสวย</span>`;
        if (txOwnerInput) txOwnerInput.value = 'partner'; // ล็อกกระเป๋าส่วนตัวของแฟนเป็นค่าเริ่มต้น
    }
}

window.onload = function() {
    setTimeout(async () => {
        await loadCategories();
        await updateFilters();
    }, 400);
}

async function handleLogout() {
    await supabaseClient.auth.signOut();
    window.location.href = 'login.html';
}

async function updateFilters() {
    filterOwner = document.getElementById('filterOwner').value;
    filterType = document.getElementById('filterType').value;
    filterDate = document.getElementById('filterDate').value;
    
    await loadGoals();
    await loadTransactions();
}

// 🎨 ซ่อมระบบแจ้งเตือนให้รองรับทั้งความสำเร็จและ Error แบบละมุนตา ไม่ระเบิด Alert ดิบ
function showToast(message, icon = '✨', isError = false) {
    const toast = document.getElementById('toastNotification');
    const toastIcon = document.getElementById('toastIcon');
    const toastMessage = document.getElementById('toastMessage');
    
    toastIcon.innerText = icon;
    toastMessage.innerText = message;
    
    if (isError) {
        toast.classList.remove('bg-dark');
        toast.style.backgroundColor = '#dc3545'; // สีแดงแจ้งเตือน Error มินิมอล
    } else {
        toast.style.backgroundColor = '';
        toast.classList.add('bg-dark'); // สีเข้มปกติความสำเร็จ
    }
    
    toast.classList.add('show');
    setTimeout(() => { toast.classList.remove('show'); }, 3000);
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
        btn.className = cat.type === 'expense' 
            ? "btn btn-outline-danger btn-sm category-btn"
            : "btn btn-outline-success btn-sm category-btn";
        
        btn.onclick = () => saveTransaction(cat.name, cat.type);
        if (cat.type === 'expense') expenseArea.appendChild(btn);
        else incomeArea.appendChild(btn);
    });
}

async function saveTransaction(categoryName, type) {
    const amountInput = document.getElementById('txAmount');
    const noteInput = document.getElementById('txNote');
    const ownerInput = document.getElementById('txOwner');
    
    if (!ownerInput.value) return showToast('กรุณาเลือกกระเป๋าเงินด้วยครับ', '⚠️', true);

    const amount = parseFloat(amountInput.value);
    if (isNaN(amount) || amount <= 0) return showToast('กรุณากรอกจำนวนเงินให้ถูกต้องก่อนเลือกหมวดหมู่', '🔢', true);
    const finalAmount = parseFloat(amount.toFixed(2));

    const { error } = await supabaseClient
        .from('transactions')
        .insert([{ amount: finalAmount, type: type, category_name: categoryName, note: noteInput.value.trim() || null, owner: ownerInput.value }]);

    if (error) {
        showToast(`บันทึกไม่สำเร็จ: ${error.message}`, '❌', true);
    } else {
        amountInput.value = '';
        noteInput.value = '';
        
        // 🧠 ระบบเคลียร์ฟอร์มอัจฉริยะ: ค้างค่าดร็อปดาวน์ไว้ที่ "กระเป๋าส่วนตัว" ของตัวเองหลังจดเสร็จเสมอ ป้องกันการลืมเปลี่ยนกลับ
        ownerInput.value = currentUserRole === 'me' ? 'me' : 'partner';
        
        showToast('จดบันทึกเรียบร้อยแล้วจ้า! 💰', '✅');
        await loadTransactions();
    }
}

function enterEditMode(id, amount, note, owner) {
    document.getElementById('editTxId').value = id;
    document.getElementById('txAmount').value = parseFloat(amount).toFixed(2);
    document.getElementById('txNote').value = note || '';
    document.getElementById('txOwner').value = owner;
    
    const recordBox = document.getElementById('recordBox');
    recordBox.style.backgroundColor = '#fff3cd';
    recordBox.style.borderColor = '#ffc107';
    document.getElementById('recordBoxTitle').innerHTML = '<i class="bi bi-pencil-fill text-warning me-1"></i> แก้ไขข้อมูลรายการย้อนหลัง';

    document.getElementById('categoryActionArea').classList.add('d-none');
    document.getElementById('editActionArea').classList.remove('d-none');
    
    window.scrollTo({ top: 100, behavior: 'smooth' });
}

function cancelEditMode() {
    document.getElementById('editTxId').value = '';
    document.getElementById('txAmount').value = '';
    document.getElementById('txNote').value = '';
    
    // 🧠 กดยกเลิกปั๊บ ดีดกลับมากระเป๋าส่วนตัวออโต้
    document.getElementById('txOwner').value = currentUserRole === 'me' ? 'me' : 'partner';
    
    const recordBox = document.getElementById('recordBox');
    recordBox.style.backgroundColor = '#ffffff';
    recordBox.style.borderColor = 'transparent';
    document.getElementById('recordBoxTitle').innerHTML = '<i class="bi bi-plus-square-fill text-success me-2"></i> บันทึกรายการใหม่';

    document.getElementById('categoryActionArea').classList.remove('d-none');
    document.getElementById('editActionArea').classList.add('d-none');
}

async function submitEditTransaction() {
    const id = document.getElementById('editTxId').value;
    const amount = parseFloat(document.getElementById('txAmount').value);
    const note = document.getElementById('txNote').value.trim();
    const owner = document.getElementById('txOwner').value;

    if (!owner) return showToast('กรุณาเลือกกระเป๋าเงินด้วยครับ', '⚠️', true);
    if (isNaN(amount) || amount <= 0) return showToast('กรุณากรอกยอดเงินให้ถูกต้อง', '🔢', true);
    const finalAmount = parseFloat(amount.toFixed(2));

    const { error } = await supabaseClient.from('transactions').update({ amount: finalAmount, note: note || null, owner: owner }).eq('id', id);
    
    if (error) {
        showToast(`แก้ไขล้มเหลว: ${error.message}`, '❌', true);
    } else {
        cancelEditMode();
        showToast('อัปเดตข้อมูลแก้ไขเรียบร้อยแล้ว!', '💾');
        await loadTransactions();
    }
}

async function deleteTransaction(id) {
    if (!confirm('คุณแน่ใจใช่ไหมที่จะลบประวัติรายการเงินแถวนี้ทิ้งอย่างถาวร?')) return;
    const { error } = await supabaseClient.from('transactions').delete().eq('id', id);
    if (error) {
        showToast(`ลบไม่สำเร็จ: ${error.message}`, '❌', true);
    } else { 
        showToast('ลบรายการเงินทิ้งเรียบร้อย', '🗑️'); 
        await loadTransactions(); 
    }
}

async function createNewGoalFrontend() {
    const titleInput = document.getElementById('newGoalTitle');
    const amountInput = document.getElementById('newGoalAmount');
    const typeInput = document.getElementById('newGoalType');
    
    const title = titleInput.value.trim();
    const amount = parseFloat(amountInput.value);
    
    if (!title || isNaN(amount) || amount <= 0) return showToast('กรุณากรอกชื่อเควสและยอดเงินตั้งเป้าหมายให้ถูกต้องครับ', '⚠️', true);

    const now = new Date();
    const targetMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const { error } = await supabaseClient
        .from('goals')
        .insert([{ title: title, amount: amount, type: typeInput.value, goal_month: targetMonthStr, is_completed: false, is_failed: false }]);

    if (error) {
        showToast(`เพิ่มภารกิจล้มเหลว: ${error.message}`, '❌', true);
    } else {
        titleInput.value = ''; amountInput.value = '';
        showToast('เพิ่มภารกิจลงหน้าจอสำเร็จแล้ว!', '➕');
        await loadGoals();
    }
}

async function loadGoals() {
    const now = new Date();
    let targetMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    
    if (filterDate === 'last-month') {
        let prevMonth = now.getMonth() - 1; let prevYear = now.getFullYear();
        if (prevMonth < 0) { prevMonth = 11; prevYear--; }
        targetMonthStr = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}`;
    }

    document.getElementById('checklistMonthLabel').innerText = filterDate === 'all' ? 'ทุกช่วงเวลา' : `ประจำเดือน ${targetMonthStr}`;

    let query = supabaseClient.from('goals').select('*');
    if (filterDate !== 'all') { query = query.eq('goal_month', targetMonthStr); }
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

    const goalsList = document.getElementById('goalsList');
    goalsList.innerHTML = '';

    if (!goals || goals.length === 0) {
        goalsList.innerHTML = '<p class="text-xs text-gray-400 text-center py-4">ไม่มีภารกิจการเงินระบุไว้</p>';
        return;
    }

    goals.forEach(goal => {
        const div = document.createElement('div');
        div.className = "list-group-item d-flex justify-content-between align-items-center p-2 mb-1 bg-light rounded-3 border-0 text-sm shadow-2xs";
        
        let actionUI = '';
        if (goal.is_completed) {
            actionUI = `
                <div class="d-flex align-items-center gap-2">
                    <span class="badge bg-success">✅ สำเร็จ</span>
                    <button onclick="resetGoalStatus(${goal.id}, '${goal.title}')" class="btn btn-outline-secondary btn-sm py-0 px-1 text-xs cursor-pointer" style="border-radius:6px;">↩️ รีเซ็ต</button>
                </div>`;
        } else if (goal.is_failed) {
            actionUI = `
                <div class="d-flex align-items-center gap-2">
                    <span class="badge bg-secondary text-dark">❌ ข้าม</span>
                    <button onclick="resetGoalStatus(${goal.id}, '${goal.title}')" class="btn btn-outline-secondary btn-sm py-0 px-1 text-xs cursor-pointer" style="border-radius:6px;">↩️ รีเซ็ต</button>
                </div>`;
        } else {
            actionUI = `
                <div class="btn-group btn-group-sm" style="border-radius:8px; overflow:hidden;">
                    <button onclick="settleGoal(${goal.id}, 'success', '${goal.title}', ${goal.amount}, '${goal.type}')" class="btn btn-outline-success py-0.5 px-2 cursor-pointer">✅ ออมแล้ว</button>
                    <button onclick="settleGoal(${goal.id}, 'failed', '${goal.title}', ${goal.amount}, '${goal.type}')" class="btn btn-outline-danger py-0.5 px-2 cursor-pointer">❌ ข้าม</button>
                    <button onclick="deleteGoalFrontend(${goal.id})" class="btn btn-link text-muted p-0 px-1 ms-1 text-xs cursor-pointer" title="ลบถาวร">🗑️</button>
                </div>
            `;
        }

        div.innerHTML = `
            <div class="text-truncate me-2">
                <span class="${goal.is_completed ? 'text-decoration-line-through text-muted' : goal.is_failed ? 'text-decoration-line-through text-black-50 font-normal' : 'fw-semibold text-dark'}">${goal.type === 'save' ? '🎯' : '📄'} ${goal.title}</span>
            </div>
            <div class="d-flex align-items-center gap-2 shrink-0">
                <span class="fw-bold text-dark">${parseFloat(goal.amount).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บ.</span>
                ${actionUI}
            </div>
        `;
        goalsList.appendChild(div);
    });
}

async function settleGoal(id, status, title, amount, type) {
    if (status === 'success') {
        if (!confirm(`ยืนยันทำเควสสำเร็จ: "${title}"?\nระบบจะสร้างธุรกรรมออม/จ่ายเงินให้อัตโนมัติ`)) return;
        
        const { error } = await supabaseClient.from('goals').update({ is_completed: true, is_failed: false }).eq('id', id);
        if (error) return showToast(error.message, '❌', true);

        const finalAmount = parseFloat(parseFloat(amount).toFixed(2));
        const currentSharedOwner = currentUserRole === 'me' ? 'shared-me' : 'shared-partner';

        if (type === 'save') {
            await supabaseClient.from('transactions').insert([{ amount: finalAmount, type: 'income', category_name: 'ลงทุน', owner: 'emergency', note: `ภารกิจสำเร็จ: ${title}` }]);
            showToast('ย้ายเงินเข้าบัญชีฉุกเฉินแล้ว 🎯', '🎉');
        } else {
            await supabaseClient.from('transactions').insert([{ amount: finalAmount, type: 'expense', category_name: 'ค่าที่พัก/บ้าน', owner: currentSharedOwner, note: `จ่ายบิลออโต้: ${title}` }]);
            showToast('ตัดยอดบิลส่วนกลางเรียบร้อย 📄', '✅');
        }
    } else {
        if (!confirm(`เดือนนี้ล้มเหลว/ข้ามภารกิจ: "${title}" ใช่ไหม?`)) return;
        const { error } = await supabaseClient.from('goals').update({ is_completed: false, is_failed: true }).eq('id', id);
        if (error) return showToast(error.message, '❌', true);
        showToast('บันทึกสถิติข้ามเควสแล้ว ❌', '📁');
    }

    await loadGoals();
    await loadTransactions();
}

async function resetGoalStatus(id, title) {
    if (!confirm(`คุณต้องการยกเลิกสถานะของภารกิจ "${title}" เพื่อกลับไปเลือกกดติ๊กถูก/กากบาทใหม่ ใช่หรือไม่?`)) return;
    
    const { error } = await supabaseClient.from('goals').update({ is_completed: false, is_failed: false }).eq('id', id);
    if (error) return showToast(error.message, '❌', true);
    
    showToast('รีเซ็ตสถานะภารกิจกลับคืนเรียบร้อย', '↩️');
    await loadGoals();
}

async function deleteGoalFrontend(id) {
    if (!confirm('ต้องการลบภารกิจนี้ออกจากหน้าจอใช่ไหมครับ?')) return;
    const { error } = await supabaseClient.from('goals').delete().eq('id', id);
    if (error) {
        showToast(error.message, '❌', true);
    } else { 
        showToast('ลบภารกิจออกแล้ว', '🗑️'); 
        await loadGoals(); 
    }
}

async function loadTransactions() {
    const { data: txs, error } = await supabaseClient.from('transactions').select('*').order('created_at', { ascending: false });
    if (error) return console.error(error);

    const tbody = document.getElementById('transactionTableBody');
    tbody.innerHTML = '';

    let myTotal = 0; let partnerTotal = 0; let sharedTotal = 0; let emergencyTotal = 0;
    let totalMePaidShared = 0; let totalPartnerPaidShared = 0;

    let categorySummary = {}; let totalExpenseFiltered = 0;
    const now = new Date(); const thisMonth = now.getMonth(); const thisYear = now.getFullYear();

    txs.forEach(tx => {
        const txDate = new Date(tx.created_at);
        const txAmount = parseFloat(tx.amount);
        const value = tx.type === 'income' ? txAmount : -txAmount;

        if (tx.owner === 'me') myTotal += value;
        else if (tx.owner === 'partner') partnerTotal += value;
        else if (tx.owner === 'emergency') emergencyTotal += value;
        else if (tx.owner === 'shared' || tx.owner === 'shared-me' || tx.owner === 'shared-partner') {
            sharedTotal += value;
        }

        let isCurrentFilterMonth = false;
        if (filterDate === 'this-month') {
            if (txDate.getMonth() !== thisMonth || txDate.getFullYear() !== thisYear) return;
            isCurrentFilterMonth = true;
        } else if (filterDate === 'last-month') {
            let targetMonth = thisMonth - 1; let targetYear = thisYear;
            if (targetMonth < 0) { targetMonth = 11; targetYear--; }
            if (txDate.getMonth() !== targetMonth || txDate.getFullYear() !== targetYear) return;
            isCurrentFilterMonth = true;
        } else {
            isCurrentFilterMonth = true;
        }

        if (isCurrentFilterMonth && tx.type === 'expense') {
            if (tx.owner === 'shared-me') totalMePaidShared += txAmount;
            if (tx.owner === 'shared-partner') totalPartnerPaidShared += txAmount;
        }

        if (isCurrentFilterMonth && tx.type === 'expense') {
            if (!categorySummary[tx.category_name]) categorySummary[tx.category_name] = 0;
            categorySummary[tx.category_name] += txAmount;
            totalExpenseFiltered += txAmount;
        }

        if (filterOwner !== 'all') {
            if (filterOwner === 'shared' && !(tx.owner === 'shared' || tx.owner === 'shared-me' || tx.owner === 'shared-partner')) return;
            if (filterOwner === 'me' && tx.owner !== 'me') return;
            if (filterOwner === 'partner' && tx.owner !== 'partner') return;
            if (filterOwner === 'emergency' && tx.owner !== 'emergency') return;
        }
        if (filterType !== 'all' && tx.type !== filterType) return;

        let ownerBadge = '';
        if (tx.owner === 'me') ownerBadge = '<span class="badge bg-primary-subtle text-primary">🙋‍♂️ ฉัน</span>';
        else if (tx.owner === 'partner') ownerBadge = '<span class="badge bg-danger-subtle text-danger">🙋‍♀️ แฟน</span>';
        else if (tx.owner === 'emergency') ownerBadge = '<span class="badge bg-success text-white">🎯 ออมฉุกเฉิน</span>';
        else if (tx.owner === 'shared-me') ownerBadge = '<span class="badge bg-warning text-dark">🤝 ส่วนกลาง (ฉันจ่าย)</span>';
        else if (tx.owner === 'shared-partner') ownerBadge = '<span class="badge bg-warning text-dark">🤝 ส่วนกลาง (แฟนจ่าย)</span>';
        else ownerBadge = '<span class="badge bg-warning text-dark">🤝 ส่วนกลาง</span>';

        const dateStr = txDate.toLocaleString('th-TH', { hour12: false });
        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="small text-muted">${dateStr}</td>
            <td>${ownerBadge}</td>
            <td class="fw-medium ${tx.type === 'expense' ? 'text-danger' : 'text-success'}">${tx.type === 'expense' ? 'รายจ่าย 🔴' : 'รายรับ 🟢'}</td>
            <td class="fw-semibold">${tx.category_name}</td>
            <td class="fw-bold">${txAmount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท</td>
            <td class="text-muted small">${tx.note || '-'}</td>
            <td class="text-center whitespace-nowrap">
                <button onclick="enterEditMode(${tx.id}, ${txAmount}, '${tx.note || ''}', '${tx.owner}')" class="btn btn-outline-warning btn-sm py-0 px-2 cursor-pointer" style="border-radius:6px;">✏️ แก้</button>
                <button onclick="deleteTransaction(${tx.id})" class="btn btn-outline-danger btn-sm py-0 px-2 cursor-pointer" style="border-radius:6px;">🗑️ ลบ</button>
            </td>
        `;
        tbody.appendChild(row);
    });

    document.getElementById('myTotal').innerText = `${myTotal.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท`;
    document.getElementById('partnerTotal').innerText = `${partnerTotal.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท`;
    document.getElementById('sharedTotal').innerText = `${sharedTotal.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท`;
    document.getElementById('emergencyTotal').innerText = `${emergencyTotal.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท`;

    // 🛠️ ปรับลอจิกบิลหารครึ่ง: จัดกลุ่มแบบสมมาตร ปลอดภัยแม้ไม่มีข้อมูลกองกลาง
    const billTextEl = document.getElementById('billSummaryText');

    if (totalMePaidShared === 0 && totalPartnerPaidShared === 0) {
        billTextEl.innerHTML = `
            <div class="text-center py-2">
                🎉 ยังไม่มีรายจ่ายกองกลางร่วมกันในเดือนนี้<br>
                <span class="text-white-50 small" style="font-size: 0.8rem;">(ระบบจะช่วยหารครึ่งทันทีเมื่อจดรายการผ่านกระเป๋า "กองกลาง")</span>
            </div>
        `;
    } else {
        const grandSharedExpense = totalMePaidShared + totalPartnerPaidShared;
        const halfShare = grandSharedExpense / 2;
        let settlementResultText = "";

        if (totalMePaidShared > totalPartnerPaidShared) {
            const diff = totalMePaidShared - halfShare;
            settlementResultText = `🙋‍♀️ แฟนต้องโอนคืนให้คุณ: <span class="fw-bold text-warning fs-5">${diff.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท</span>`;
        } else if (totalPartnerPaidShared > totalMePaidShared) {
            const diff = totalPartnerPaidShared - halfShare;
            settlementResultText = `🙋‍♂️ คุณต้องโอนคืนให้แฟน: <span class="fw-bold text-warning fs-5">${diff.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท</span>`;
        } else {
            settlementResultText = `🤝 ยอดออกเงินคนละครึ่งเท่ากันเป๊ะ พอดิบพอดีจ้า!`;
        }

        billTextEl.innerHTML = `
            รายจ่ายกองกลางเดือนนี้รวม: <b>${grandSharedExpense.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บ.</b> (หารครึ่งคนละ ${halfShare.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บ.)<br>
            <div class="text-center mt-2 small text-white-50" style="font-size: 0.8rem;">
                • คุณควักจ่ายล่วงหน้าไป: ${totalMePaidShared.toLocaleString()} บ. | แฟนควักจ่ายล่วงหน้าไป: ${totalPartnerPaidShared.toLocaleString()} บ.
            </div>
            <hr class="my-2 text-white-50">
            <div class="text-center">${settlementResultText}</div>
        `;
    }

    renderAnalytics(categorySummary, totalExpenseFiltered);
}

function renderAnalytics(summary, total) {
    const area = document.getElementById('analyticsArea'); area.innerHTML = '';
    const sortedCats = Object.keys(summary).map(name => ({ name: name, amount: summary[name] })).sort((a, b) => b.amount - a.amount);

    if (sortedCats.length === 0) {
        area.innerHTML = '<p class="text-center text-muted py-3 w-100">❌ ไม่พบข้อมูลรายจ่ายในรอบเดือนนี้</p>';
        return;
    }
    sortedCats.forEach(item => {
        const percentage = total > 0 ? ((item.amount / total) * 100).toFixed(1) : 0;
        const col = document.createElement('div');
        col.className = "col-12 col-md-6";
        col.innerHTML = `
            <div class="bg-light p-3 rounded-3 border">
                <div class="d-flex justify-content-between small fw-bold mb-1">
                    <span class="text-dark">🛒 ${item.name}</span>
                    <span class="text-secondary">${item.amount.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บ. (${percentage}%)</span>
                </div>
                <div class="progress" style="height: 6px;">
                    <div class="progress-bar bg-danger" style="width: ${percentage}%"></div>
                </div>
            </div>
        `;
        area.appendChild(col);
    });
}