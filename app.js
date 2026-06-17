// app.js - Phase 1 Ultimate: รองรับ 4 กระเป๋า, แก้ไขข้อมูล, บันลึกเควสสำเร็จ/กากบาท, CRUD Checklist หน้าเว็บ

let filterOwner = 'all';
let filterType = 'all';
let filterDate = 'this-month';

window.onload = async function() {
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

function showToast(message, icon = '✨') {
    const toast = document.getElementById('toastNotification');
    document.getElementById('toastIcon').innerText = icon;
    document.getElementById('toastMessage').innerText = message;
    
    // เปิดแสดงผลสไตล์ Bootstrap
    toast.classList.add('show');

    setTimeout(() => {
        toast.classList.remove('show');
    }, 2500);
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
            ? "bg-red-50 text-red-700 border border-red-200 px-4 py-2 rounded-xl font-medium hover:bg-red-100 active:scale-95 transition cursor-pointer"
            : "bg-green-50 text-green-700 border border-green-200 px-4 py-2 rounded-xl font-medium hover:bg-green-100 active:scale-95 transition cursor-pointer";
        
        btn.onclick = () => saveTransaction(cat.name, cat.type);
        if (cat.type === 'expense') expenseArea.appendChild(btn);
        else incomeArea.appendChild(btn);
    });
}

async function saveTransaction(categoryName, type) {
    const amountInput = document.getElementById('txAmount');
    const noteInput = document.getElementById('txNote');
    const ownerInput = document.getElementById('txOwner');
    const amount = parseFloat(amountInput.value);

    if (isNaN(amount) || amount <= 0) return alert('กรุณากรอกจำนวนเงินให้ถูกต้องก่อนเลือกหมวดหมู่');
    const finalAmount = parseFloat(amount.toFixed(2));

    const { error } = await supabaseClient
        .from('transactions')
        .insert([{ amount: finalAmount, type: type, category_name: categoryName, note: noteInput.value.trim() || null, owner: ownerInput.value }]);

    if (error) {
        alert(error.message);
    } else {
        amountInput.value = '';
        noteInput.value = '';
        showToast('จดบันทึกเรียบร้อยแล้วจ้า! 💰', '✅');
        await loadTransactions();
    }
}

// ✏️ ระบบแก้ไขและลบประวัติรายการเงิน
function enterEditMode(id, amount, note, owner) {
    document.getElementById('editTxId').value = id;
    document.getElementById('txAmount').value = parseFloat(amount).toFixed(2);
    document.getElementById('txNote').value = note || '';
    document.getElementById('txOwner').value = owner;
    
    // ส่องไฟสีส้มสไตล์สว่างนวลของ Bootstrap 5
    const recordBox = document.getElementById('recordBox');
    recordBox.classList.remove('bg-white');
    recordBox.style.backgroundColor = '#fff3cd'; // สีเหลือง Warning อ่อนๆ
    recordBox.style.borderColor = '#ffc107';
    document.getElementById('recordBoxTitle').innerText = '✏️ แก้ไขข้อมูลรายการย้อนหลัง';

    document.getElementById('categoryActionArea').classList.add('d-none');
    document.getElementById('editActionArea').classList.remove('d-none');
    
    window.scrollTo({ top: 100, behavior: 'smooth' });
}

function cancelEditMode() {
    document.getElementById('editTxId').value = '';
    document.getElementById('txAmount').value = '';
    document.getElementById('txNote').value = '';
    
    const recordBox = document.getElementById('recordBox');
    recordBox.style.backgroundColor = '#ffffff';
    recordBox.style.borderColor = 'transparent';
    document.getElementById('recordBoxTitle').innerText = '✍️ บันทึกรายการใหม่';

    document.getElementById('categoryActionArea').classList.remove('d-none');
    document.getElementById('editActionArea').classList.add('d-none');
}

async function submitEditTransaction() {
    const id = document.getElementById('editTxId').value;
    const amount = parseFloat(document.getElementById('txAmount').value);
    const note = document.getElementById('txNote').value.trim();
    const owner = document.getElementById('txOwner').value;

    if (isNaN(amount) || amount <= 0) return alert('กรุณากรอกยอดเงินให้ถูกต้อง');
    const finalAmount = parseFloat(amount.toFixed(2));

    const { error } = await supabaseClient.from('transactions').update({ amount: finalAmount, note: note || null, owner: owner }).eq('id', id);
    
    if (error) {
        alert('แก้ไขล้มเหลว: ' + error.message);
    } else {
        cancelEditMode();
        showToast('อัปเดตข้อมูลแก้ไขเรียบร้อยแล้ว!', '💾');
        await loadTransactions();
    }
}

async function deleteTransaction(id) {
    if (!confirm('คุณแน่ใจใช่ไหมที่จะลบประวัติรายการเงินแถวนี้ทิ้งอย่างถาวร?')) return;
    const { error } = await supabaseClient.from('transactions').delete().eq('id', id);
    if (error) alert('ลบไม่สำเร็จ: ' + error.message); else { showToast('ลบรายการเงินทิ้งเรียบร้อย', '🗑️'); await loadTransactions(); }
}

// 🎯 🔥 ฟีเจอร์เฟส 1: เพิ่มภารกิจใหม่เข้าเดือนปัจจุบันแบบเรียลไทม์จากหน้าจอ
async function createNewGoalFrontend() {
    const titleInput = document.getElementById('newGoalTitle');
    const amountInput = document.getElementById('newGoalAmount');
    const typeInput = document.getElementById('newGoalType');
    
    const title = titleInput.value.trim();
    const amount = parseFloat(amountInput.value);
    
    if (!title || isNaN(amount) || amount <= 0) return alert('กรุณากรอกชื่อเควสและยอดเงินตั้งเป้าหมายให้ถูกต้องครับ');

    const now = new Date();
    const targetMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const { error } = await supabaseClient
        .from('goals')
        .insert([{ title: title, amount: amount, type: typeInput.value, goal_month: targetMonthStr, is_completed: false, is_failed: false }]);

    if (error) {
        alert(error.message);
    } else {
        titleInput.value = ''; amountInput.value = '';
        showToast('เพิ่มภารกิจลงหน้าจอสำเร็จแล้ว!', '➕');
        await loadGoals();
    }
}

// 🎯 🔥 ระบบโหลดเควสย้อนหลัง และจัดการติ๊กถูก/กากบาท
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

    // ระบบโคลนเควสกรณีขึ้นเดือนใหม่แล้วยังว่างเปล่า
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
        div.className = "flex items-center justify-between p-2 rounded-lg border border-gray-100 bg-gray-50 text-xs";
        
        // 🎨 ออกแบบปุ่มติ๊กถูก / กากบาท และล็อกประวัติย้อนหลังถ้าตัดสินใจสถานะไปแล้ว
        let actionUI = '';
        if (goal.is_completed) {
            actionUI = `<span class="text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">✅ สำเร็จ</span>`;
        } else if (goal.is_failed) {
            actionUI = `<span class="text-red-600 font-bold bg-red-50 px-2 py-0.5 rounded-md border border-red-200">❌ ล้มเหลว</span>`;
        } else {
            // เควสที่ยังว่างอยู่ -> เปิดปุ่มให้เลือกว่าจะ ติ๊กถูก หรือ กากบาท
            actionUI = `
                <div class="space-x-1 whitespace-nowrap">
                    <button onclick="settleGoal(${goal.id}, 'success', '${goal.title}', ${goal.amount}, '${goal.type}')" class="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded font-medium hover:bg-emerald-100 cursor-pointer">✅ ออมแล้ว</button>
                    <button onclick="settleGoal(${goal.id}, 'failed', '${goal.title}', ${goal.amount}, '${goal.type}')" class="bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 rounded font-medium hover:bg-red-100 cursor-pointer">❌ ข้าม</button>
                    <button onclick="deleteGoalFrontend(${goal.id})" class="text-gray-400 hover:text-black font-bold ml-1 text-xs cursor-pointer" title="ลบเควสนี้ทิ้ง">🗑️</button>
                </div>
            `;
        }

        div.innerHTML = `
            <div class="flex items-center gap-1.5 truncate">
                <span class="${goal.is_completed ? 'line-through text-gray-400' : goal.is_failed ? 'line-through text-gray-300' : 'font-semibold text-gray-700'}">${goal.type === 'save' ? '🎯' : '📄'} ${goal.title}</span>
            </div>
            <div class="flex items-center gap-3 shrink-0">
                <span class="font-bold text-gray-800">${parseFloat(goal.amount).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บ.</span>
                ${actionUI}
            </div>
        `;
        goalsList.appendChild(div);
    });
}

// 🔥 ระบบประมวลผลการกดปุ่ม "ออมแล้ว" หรือ "ข้าม (กากบาท)"
async function settleGoal(id, status, title, amount, type) {
    if (status === 'success') {
        if (!confirm(`ยืนยันทำเควสสำเร็จ: "${title}"?\nระบบจะล็อกยอดโอนเงินเข้าบัญชีให้ทันที`)) return;
        
        const { error } = await supabaseClient.from('goals').update({ is_completed: true }).eq('id', id);
        if (error) return alert(error.message);

        const finalAmount = parseFloat(parseFloat(amount).toFixed(2));
        if (type === 'save') {
            await supabaseClient.from('transactions').insert([{ amount: finalAmount, type: 'income', category_name: 'ลงทุน', owner: 'emergency', note: `ภารกิจสำเร็จ: ${title}` }]);
            showToast('ย้ายเงินเข้าบัญชีฉุกเฉินแล้ว 🎯', '🎉');
        } else {
            await supabaseClient.from('transactions').insert([{ amount: finalAmount, type: 'expense', category_name: 'ค่าที่พัก/บ้าน', owner: 'shared', note: `จ่ายบิลออโต้: ${title}` }]);
            showToast('ตัดยอดบิลส่วนกลางเรียบร้อย 📄', '✅');
        }
    } else {
        if (!confirm(`เดือนนี้ไม่ได้ออม/ไม่ได้จ่ายรายการ: "${title}" ใช่ไหม?\nระบบจะขึ้นเครื่องหมายกากบาทเป็นประวัติความล้มเหลวไว้ครับ`)) return;
        const { error } = await supabaseClient.from('goals').update({ is_failed: true }).eq('id', id);
        if (error) return alert(error.message);
        showToast('บันทึกสถิติข้ามเควสแล้ว ❌', '📁');
    }

    await loadGoals();
    await loadTransactions();
}

// 🔥 ปุ่มกดลบเควสออกจากตารางหน้าบ้านตรงๆ
async function deleteGoalFrontend(id) {
    if (!confirm('ต้องการลบภารกิจนี้ออกจากหน้าจอใช่ไหมครับ?')) return;
    const { error } = await supabaseClient.from('goals').delete().eq('id', id);
    if (error) alert(error.message); else { showToast('ลบภารกิจออกแล้ว', '🗑️'); await loadGoals(); }
}

async function loadTransactions() {
    const { data: txs, error } = await supabaseClient.from('transactions').select('*').order('created_at', { ascending: false });
    if (error) return console.error(error);

    const tbody = document.getElementById('transactionTableBody');
    tbody.innerHTML = '';

    let myTotal = 0; let partnerTotal = 0; let sharedTotal = 0; let emergencyTotal = 0;
    let categorySummary = {}; let totalExpenseFiltered = 0;
    const now = new Date(); const thisMonth = now.getMonth(); const thisYear = now.getFullYear();

    txs.forEach(tx => {
        const txDate = new Date(tx.created_at);
        const txAmount = parseFloat(tx.amount);
        const value = tx.type === 'income' ? txAmount : -txAmount;

        if (tx.owner === 'me') myTotal += value;
        else if (tx.owner === 'partner') partnerTotal += value;
        else if (tx.owner === 'shared') sharedTotal += value;
        else if (tx.owner === 'emergency') emergencyTotal += value;

        if (filterDate === 'this-month') {
            if (txDate.getMonth() !== thisMonth || txDate.getFullYear() !== thisYear) return;
        } else if (filterDate === 'last-month') {
            let targetMonth = thisMonth - 1; let targetYear = thisYear;
            if (targetMonth < 0) { targetMonth = 11; targetYear--; }
            if (txDate.getMonth() !== targetMonth || txDate.getFullYear() !== targetYear) return;
        }

        if (tx.type === 'expense') {
            if (!categorySummary[tx.category_name]) categorySummary[tx.category_name] = 0;
            categorySummary[tx.category_name] += txAmount;
            totalExpenseFiltered += txAmount;
        }

        if (filterOwner !== 'all' && tx.owner !== filterOwner) return;
        if (filterType !== 'all' && tx.type !== filterType) return;

        let ownerBadge = '';
        if (tx.owner === 'me') ownerBadge = '<span class="bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded-full">🙋‍♂️ ฉัน</span>';
        else if (tx.owner === 'partner') ownerBadge = '<span class="bg-pink-100 text-pink-800 text-xs px-2 py-0.5 rounded-full">🙋‍♀️ แฟน</span>';
        else if (tx.owner === 'shared') ownerBadge = '<span class="bg-purple-100 text-purple-800 text-xs px-2 py-0.5 rounded-full">🤝 ส่วนกลาง</span>';
        else ownerBadge = '<span class="bg-emerald-100 text-emerald-800 text-xs px-2 py-0.5 rounded-full">🎯 ออมฉุกเฉิน</span>';

        const dateStr = txDate.toLocaleString('th-TH', { hour12: false });
        const row = document.createElement('tr');
        row.className = "text-sm";
        row.innerHTML = `
            <td class="py-2.5 text-gray-400">${dateStr}</td>
            <td class="py-2.5">${ownerBadge}</td>
            <td class="py-2.5 font-medium ${tx.type === 'expense' ? 'text-red-500' : 'text-green-500'}">${tx.type === 'expense' ? 'รายจ่าย 🔴' : 'รายรับ 🟢'}</td>
            <td class="py-2.5 font-medium">${tx.category_name}</td>
            <td class="py-2.5 font-bold">${txAmount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท</td>
            <td class="py-2.5 text-gray-500 text-xs">${tx.note || '-'}</td>
            <td class="py-2.5 text-center space-x-1 whitespace-nowrap">
                <button onclick="enterEditMode(${tx.id}, ${txAmount}, '${tx.note || ''}', '${tx.owner}')" class="text-xs bg-yellow-50 text-yellow-700 border border-yellow-200 px-2 py-1 rounded hover:bg-yellow-100 cursor-pointer">✏️ แก้</button>
                <button onclick="deleteTransaction(${tx.id})" class="text-xs bg-red-50 text-red-700 border border-red-200 px-2 py-1 rounded hover:bg-red-100 cursor-pointer">🗑️ ลบ</button>
            </td>
        `;
        tbody.appendChild(row);
    });

    document.getElementById('myTotal').innerText = `${myTotal.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท`;
    document.getElementById('partnerTotal').innerText = `${partnerTotal.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท`;
    document.getElementById('sharedTotal').innerText = `${sharedTotal.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท`;
    document.getElementById('emergencyTotal').innerText = `${emergencyTotal.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท`;

    const totalSharedExpense = Math.abs(sharedTotal);
    const halfBill = totalSharedExpense / 2;
    const billTextEl = document.getElementById('billSummaryText');
    if (totalSharedExpense === 0) {
        billTextEl.innerText = "🎉 ยอดส่วนกลางเจ๊ากันพอดี ไม่มีใครค้างตังค์ใครครับ";
    } else {
        billTextEl.innerHTML = `รายจ่ายกองกลางรวมสะสม: <span class="font-bold underline text-yellow-300">${totalSharedExpense.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท</span><br><span class="text-xs text-purple-100">เฉลี่ยควักเนื้อกระเป๋าคนละ: ${halfBill.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท เพื่อให้กองกลางสมดุลครับ 👩‍❤️‍👨</span>`;
    }

    renderAnalytics(categorySummary, totalExpenseFiltered);
}

function renderAnalytics(summary, total) {
    const area = document.getElementById('analyticsArea'); area.innerHTML = '';
    const sortedCats = Object.keys(summary).map(name => ({ name: name, amount: summary[name] })).sort((a, b) => b.amount - a.amount);

    if (sortedCats.length === 0) {
        area.innerHTML = '<p class="text-sm text-gray-400 col-span-2 text-center py-4">❌ ไม่พบข้อมูลรายจ่ายในรอบเดือนนี้</p>';
        return;
    }
    sortedCats.forEach(item => {
        const percentage = total > 0 ? ((item.amount / total) * 100).toFixed(1) : 0;
        const card = document.createElement('div');
        card.className = "bg-gray-50 p-3 rounded-xl border border-gray-100 space-y-1";
        card.innerHTML = `
            <div class="flex justify-between text-xs font-medium"><span class="text-gray-700">🛒 ${item.name}</span><span class="text-gray-900 font-bold">${item.amount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บ. (${percentage}%)</span></div>
            <div class="w-full bg-gray-200 h-1.5 rounded-full overflow-hidden"><div class="bg-red-500 h-full" style="width: ${percentage}%"></div></div>
        `;
        area.appendChild(card);
    });
}