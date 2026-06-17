// app.js - Ultimate Version: พร้อมระบบ Toast Alert และ UI โหมดแก้ไขแบบมือโปร

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

// 🍞 ฟังก์ชันเรียกใช้ Toast แจ้งเตือนแวบๆ มุมขวาของจอ
function showToast(message, icon = '✨') {
    const toast = document.getElementById('toastNotification');
    document.getElementById('toastIcon').innerText = icon;
    document.getElementById('toastMessage').innerText = message;
    
    // แสดงผล
    toast.classList.remove('translate-y-20', 'opacity-0');
    toast.classList.add('translate-y-0', 'opacity-100');

    // ซ่อนตัวอัตโนมัติภายใน 2.5 วินาที
    setTimeout(() => {
        toast.classList.remove('translate-y-0', 'opacity-100');
        toast.classList.add('translate-y-20', 'opacity-0');
    }, 250);
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

    if (!amount || amount <= 0) return alert('กรุณากรอกจำนวนเงินให้ถูกต้องก่อนเลือกหมวดหมู่');

    const { error } = await supabaseClient
        .from('transactions')
        .insert([{ amount: amount, type: type, category_name: categoryName, note: noteInput.value.trim() || null, owner: ownerInput.value }]);

    if (error) {
        alert(error.message);
    } else {
        amountInput.value = '';
        noteInput.value = '';
        showToast('จดบันทึกเรียบร้อยแล้วจ้า! 💰', '✅');
        await loadTransactions();
    }
}

// ✏️ ระบบโหมดแก้ไขแบบส่องไฟสปอตไลท์ (เปลี่ยนสีกรอบและซ่อนปุ่มหมวดหมู่ป้องกันการกดสับสน)
function enterEditMode(id, amount, note, owner) {
    document.getElementById('editTxId').value = id;
    document.getElementById('txAmount').value = amount;
    document.getElementById('txNote').value = note || '';
    document.getElementById('txOwner').value = owner;
    
    // ปรับหน้าตาฟอร์มให้เป็นธีมสีเหลืองโหมดแก้ไขชัดเจน
    const recordBox = document.getElementById('recordBox');
    recordBox.classList.remove('bg-white', 'border-transparent');
    recordBox.classList.add('bg-yellow-50/50', 'border-yellow-400');
    document.getElementById('recordBoxTitle').innerText = '✏️ แก้ไขข้อมูลรายการย้อนหลัง';

    // ซ่อนโซนปุ่มหมวดหมู่ชั่วคราวเพื่อบังคับให้ผู้ใช้ต้องกดบันทึกหรือยกเลิกเท่านั้น
    document.getElementById('categoryActionArea').classList.add('hidden');
    document.getElementById('editActionArea').classList.remove('hidden');
    
    window.scrollTo({ top: 100, behavior: 'smooth' });
}

function cancelEditMode() {
    document.getElementById('editTxId').value = '';
    document.getElementById('txAmount').value = '';
    document.getElementById('txNote').value = '';
    
    // คืนค่าฟอร์มกลับเป็นหน้าตาบันทึกปกติ
    const recordBox = document.getElementById('recordBox');
    recordBox.classList.remove('bg-yellow-50/50', 'border-yellow-400');
    recordBox.classList.add('bg-white', 'border-transparent');
    document.getElementById('recordBoxTitle').innerText = '✍️ บันทึกรายการใหม่';

    document.getElementById('categoryActionArea').classList.remove('hidden');
    document.getElementById('editActionArea').classList.add('hidden');
}

async function submitEditTransaction() {
    const id = document.getElementById('editTxId').value;
    const amount = parseFloat(document.getElementById('txAmount').value);
    const note = document.getElementById('txNote').value.trim();
    const owner = document.getElementById('txOwner').value;

    if (!amount || amount <= 0) return alert('กรุณากรอกยอดเงินให้ถูกต้อง');

    const { error } = await supabaseClient.from('transactions').update({ amount: amount, note: note || null, owner: owner }).eq('id', id);
    
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
    if (error) {
        alert('ลบไม่สำเร็จ: ' + error.message);
    } else {
        showToast('ลบรายการเงินทิ้งเรียบร้อย', '🗑️');
        await loadTransactions();
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
    const { data: goals, error } = await query.order('id', { ascending: true });

    if (error) return console.error(error);
    const goalsList = document.getElementById('goalsList');
    goalsList.innerHTML = '';

    if (goals.length === 0) {
        goalsList.innerHTML = '<p class="text-xs text-gray-400 text-center py-4">ไม่มีภารกิจการเงินถูกกำหนดไว้ในเดือนนี้</p>';
        return;
    }

    goals.forEach(goal => {
        const div = document.createElement('div');
        div.className = "flex items-center justify-between p-2 rounded-lg border border-gray-100 bg-gray-50 text-xs";
        div.innerHTML = `
            <div class="flex items-center gap-2">
                <input type="checkbox" ${goal.is_completed ? 'checked disabled' : ''} onchange="toggleGoal(${goal.id}, '${goal.title}', ${goal.amount}, '${goal.type}')" class="w-4 h-4 text-emerald-600 rounded cursor-pointer disabled:opacity-60">
                <span class="${goal.is_completed ? 'line-through text-gray-400 font-normal' : 'font-semibold text-gray-700'}">${goal.type === 'save' ? '🎯 [ออม]' : '📄 [บิล]'} ${goal.title}</span>
            </div>
            <span class="font-bold ${goal.is_completed ? 'text-emerald-600' : 'text-gray-900'}">${goal.amount.toLocaleString()} บ.</span>
        `;
        goalsList.appendChild(div);
    });
}

async function toggleGoal(id, title, amount, type) {
    if(!confirm(`ยืนยันการทำภารกิจสำเร็จ: "${title}" ใช่หรือไม่?\nระบบจะทำธุรกรรมล็อกเงินให้อัตโนมัติ`)) {
        await loadGoals(); return;
    }

    const { error } = await supabaseClient.from('goals').update({ is_completed: true }).eq('id', id);
    if (error) return alert(error.message);

    if (type === 'save') {
        await supabaseClient.from('transactions').insert([{ amount: amount, type: 'income', category_name: 'ลงทุน', owner: 'emergency', note: `ภารกิจสำเร็จ: ${title}` }]);
        showToast('ภารกิจสำเร็จ! ย้ายเงินเข้าคลังฉุกเฉินแล้ว 🎯', '🎉');
    } else {
        await supabaseClient.from('transactions').insert([{ amount: amount, type: 'expense', category_name: 'ค่าที่พัก/บ้าน', owner: 'shared', note: `จ่ายบิลออโต้: ${title}` }]);
        showToast('จ่ายบิลสำเร็จและตัดยอดกองกลางแล้ว 📄', '✅');
    }
    
    await loadGoals();
    await updateFilters();
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
        const value = tx.type === 'income' ? tx.amount : -tx.amount;

        // บันทึกยอดกระเป๋าทั้ง 4 แบบเรียลไทม์ (คำนวณสะสมถังหลัก)
        if (tx.owner === 'me') myTotal += value;
        else if (tx.owner === 'partner') partnerTotal += value;
        else if (tx.owner === 'shared') sharedTotal += value;
        else if (tx.owner === 'emergency') emergencyTotal += value;

        // ตัวกรองบริหารแยกเป็นเดือนๆ 
        if (filterDate === 'this-month') {
            if (txDate.getMonth() !== thisMonth || txDate.getFullYear() !== thisYear) return;
        } else if (filterDate === 'last-month') {
            let targetMonth = thisMonth - 1; let targetYear = thisYear;
            if (targetMonth < 0) { targetMonth = 11; targetYear--; }
            if (txDate.getMonth() !== targetMonth || txDate.getFullYear() !== targetYear) return;
        }

        // เก็บยอดสำหรับวิเคราะห์
        if (tx.type === 'expense') {
            if (!categorySummary[tx.category_name]) categorySummary[tx.category_name] = 0;
            categorySummary[tx.category_name] += tx.amount;
            totalExpenseFiltered += tx.amount;
        }

        // ฟิลเตอร์แสดงตารางด้านล่าง
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
            <td class="py-2.5 font-bold">${tx.amount.toLocaleString()} บาท</td>
            <td class="py-2.5 text-gray-500 text-xs">${tx.note || '-'}</td>
            <td class="py-2.5 text-center space-x-1 whitespace-nowrap">
                <button onclick="enterEditMode(${tx.id}, ${tx.amount}, '${tx.note || ''}', '${tx.owner}')" class="text-xs bg-yellow-50 text-yellow-700 border border-yellow-200 px-2 py-1 rounded hover:bg-yellow-100 cursor-pointer">✏️ แก้</button>
                <button onclick="deleteTransaction(${tx.id})" class="text-xs bg-red-50 text-red-700 border border-red-200 px-2 py-1 rounded hover:bg-red-100 cursor-pointer">🗑️ ลบ</button>
            </td>
        `;
        tbody.appendChild(row);
    });

    document.getElementById('myTotal').innerText = `${myTotal.toLocaleString()} บาท`;
    document.getElementById('partnerTotal').innerText = `${partnerTotal.toLocaleString()} บาท`;
    document.getElementById('sharedTotal').innerText = `${sharedTotal.toLocaleString()} บาท`;
    document.getElementById('emergencyTotal').innerText = `${emergencyTotal.toLocaleString()} บาท`;

    const totalSharedExpense = Math.abs(sharedTotal);
    const halfBill = totalSharedExpense / 2;
    const billTextEl = document.getElementById('billSummaryText');
    if (totalSharedExpense === 0) {
        billTextEl.innerText = "🎉 ยอดส่วนกลางเจ๊ากันพอดี ไม่มีใครค้างตังค์ใครครับ";
    } else {
        billTextEl.innerHTML = `รายจ่ายกองกลางรวมสะสม: <span class="font-bold underline text-yellow-300">${totalSharedExpense.toLocaleString()} บาท</span><br><span class="text-xs text-purple-100">เฉลี่ยควักเนื้อกระเป๋าคนละ: ${halfBill.toLocaleString()} บาท เพื่อให้กองกลางสมดุลครับ 👩‍❤️‍👨</span>`;
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
            <div class="flex justify-between text-xs font-medium"><span class="text-gray-700">🛒 ${item.name}</span><span class="text-gray-900 font-bold">${item.amount.toLocaleString()} บ. (${percentage}%)</span></div>
            <div class="w-full bg-gray-200 h-1.5 rounded-full overflow-hidden"><div class="bg-red-500 h-full" style="width: ${percentage}%"></div></div>
        `;
        area.appendChild(card);
    });
}