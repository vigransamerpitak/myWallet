// app.js - Super Version: เพิ่มระบบแก้ไขรายการ, ตัดยอดแยกเดือน, บิลหารครึ่ง และ Checklist การเงิน

let filterOwner = 'all';
let filterType = 'all';
let filterDate = 'this-month'; // เริ่มต้นให้ล็อกเป้าสรุปยอดเฉพาะเดือนนี้เพื่อความเป็นระเบียบ

window.onload = async function() {
    setTimeout(async () => {
        await loadCategories();
        await loadGoals();
        await loadTransactions();
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
    await loadTransactions();
}

// 1. ฟังก์ชันโหลดปุ่มหมวดหมู่รายรับ/รายจ่าย
async function loadCategories() {
    const { data: categories, error } = await supabaseClient.from('categories').select('*').order('name', { ascending: true });
    if (error) return console.error(error);

    const expenseArea = document.getElementById('expenseButtons');
    const incomeArea = document.getElementById('incomeButtons');
    const manageArea = document.getElementById('manageCategoriesList');

    expenseArea.innerHTML = ''; incomeArea.innerHTML = ''; manageArea.innerHTML = '';

    categories.forEach(cat => {
        const btn = document.createElement('button');
        btn.innerText = cat.name;
        btn.className = cat.type === 'expense' 
            ? "bg-red-50 text-red-700 border border-red-200 px-4 py-2 rounded-xl font-medium hover:bg-red-100 active:scale-95 transition cursor-pointer"
            : "bg-green-50 text-green-700 border border-green-200 px-4 py-2 rounded-xl font-medium hover:bg-green-100 active:scale-95 transition cursor-pointer";
        
        btn.onclick = () => saveTransaction(cat.name, cat.type);

        if (cat.type === 'expense') expenseArea.appendChild(btn);
        else incomeArea.appendChild(btn);

        const manageBadge = document.createElement('span');
        manageBadge.className = `inline-flex items-center gap-1 text-sm px-3 py-1 rounded-full ${cat.type === 'expense' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`;
        manageBadge.innerHTML = `${cat.name} <button onclick="deleteCategory(${cat.id})" class="hover:text-black font-bold ml-1 text-xs cursor-pointer">❌</button>`;
        manageArea.appendChild(manageBadge);
    });
}

// 2. ฟังก์ชันระบบจัดการปุ่มหมวดหมู่
async function addCategory() {
    const nameInput = document.getElementById('newCatName');
    const typeInput = document.getElementById('newCatType');
    if (!nameInput.value.trim()) return alert('กรุณากรอกชื่อหมวดหมู่');
    const { error } = await supabaseClient.from('categories').insert([{ name: nameInput.value.trim(), type: typeInput.value }]);
    if (error) alert(error.message); else { nameInput.value = ''; await loadCategories(); }
}
async function deleteCategory(id) {
    if (!confirm('คุณแน่ใจใช่ไหมที่จะลบปุ่มหมวดหมู่นี้?')) return;
    const { error } = await supabaseClient.from('categories').delete().eq('id', id);
    if (error) alert(error.message); else await loadCategories();
}

// 3. ฟังก์ชันจดบันทึกธุรกรรมใหม่ (Fast Click บันทึกเมื่อกดปุ่มหมวดหมู่)
async function saveTransaction(categoryName, type) {
    const amountInput = document.getElementById('txAmount');
    const noteInput = document.getElementById('txNote');
    const ownerInput = document.getElementById('txOwner');
    const amount = parseFloat(amountInput.value);

    if (!amount || amount <= 0) return alert('กรุณากรอกจำนวนเงินให้ถูกต้องก่อนกดเลือกปุ่มหมวดหมู่ครับ');

    const { error } = await supabaseClient
        .from('transactions')
        .insert([{ amount: amount, type: type, category_name: categoryName, note: noteInput.value.trim() || null, owner: ownerInput.value }]);

    if (error) alert(error.message); else { amountInput.value = ''; noteInput.value = ''; await loadTransactions(); }
}

// 4. 🔥 ระบบใหม่: การแก้ไข (Edit) และลบ (Delete) ข้อมูลธุรกรรมจากหน้าเว็บย้อนหลัง
function enterEditMode(id, amount, note, owner) {
    document.getElementById('editTxId').value = id;
    document.getElementById('txAmount').value = amount;
    document.getElementById('txNote').value = note || '';
    document.getElementById('txOwner').value = owner;
    document.getElementById('editActionArea').classList.remove('hidden');
    window.scrollTo({ top: 100, behavior: 'smooth' }); // เลื่อนจอขึ้นฟอร์มกรอกข้อมูลด้านบน
}
function cancelEditMode() {
    document.getElementById('editTxId').value = '';
    document.getElementById('txAmount').value = '';
    document.getElementById('txNote').value = '';
    document.getElementById('editActionArea').classList.add('hidden');
}
async function submitEditTransaction() {
    const id = document.getElementById('editTxId').value;
    const amount = parseFloat(document.getElementById('txAmount').value);
    const note = document.getElementById('txNote').value.trim();
    const owner = document.getElementById('txOwner').value;

    if (!amount || amount <= 0) return alert('กรุณากรอกยอดเงินให้ถูกต้อง');

    const { error } = await supabaseClient
        .from('transactions')
        .update({ amount: amount, note: note || null, owner: owner })
        .eq('id', id);

    if (error) alert('แก้ไขล้มเหลว: ' + error.message);
    else { cancelEditMode(); await loadTransactions(); }
}
async function deleteTransaction(id) {
    if (!confirm('คุณแน่ใจใช่ไหมที่จะลบประวัติรายการเงินแถวนี้ทิ้ง?')) return;
    const { error } = await supabaseClient.from('transactions').delete().eq('id', id);
    if (error) alert('ลบไม่สำเร็จ: ' + error.message); else await loadTransactions();
}

// 5. 🔥 ระบบใหม่: ดึงและจัดการเช็คลิสต์ภารกิจการเงิน (Checklist Goals)
async function loadGoals() {
    const { data: goals, error } = await supabaseClient.from('goals').select('*').order('id', { ascending: true });
    if (error) return console.error(error);

    const goalsList = document.getElementById('goalsList');
    goalsList.innerHTML = '';

    goals.forEach(goal => {
        const div = document.createElement('div');
        div.className = "flex items-center justify-between p-2 rounded-lg border border-gray-100 bg-gray-50 text-sm";
        div.innerHTML = `
            <div class="flex items-center gap-2">
                <input type="checkbox" ${goal.is_completed ? 'checked' : ''} onchange="toggleGoal(${goal.id}, ${goal.is_completed}, '${goal.title}', ${goal.amount}, '${goal.type}')" class="w-4 h-4 text-blue-600 rounded cursor-pointer">
                <span class="${goal.is_completed ? 'line-through text-gray-400' : 'font-medium text-gray-700'}">${goal.type === 'save' ? '🎯' : '📄'} ${goal.title}</span>
            </div>
            <span class="font-bold ${goal.is_completed ? 'text-gray-400' : 'text-gray-900'}">${goal.amount.toLocaleString()} บ.</span>
        `;
        goalsList.appendChild(div);
    });
}
async function toggleGoal(id, currentStatus, title, amount, type) {
    const newStatus = !currentStatus;
    const { error } = await supabaseClient.from('goals').update({ is_completed: newStatus }).eq('id', id);
    
    if (error) return alert(error.message);

    // ⭐ ระบบ Auto: ถ้ากดติ๊กถูก (ทำสำเร็จ) ให้วิ่งไปจดเป็นรายจ่ายเข้าตารางหลักให้อัตโนมัติเลย
    if (newStatus === true) {
        const catName = type === 'save' ? 'ลงทุน' : 'ค่าที่พัก/บ้าน';
        await supabaseClient.from('transactions').insert([{ amount: amount, type: 'expense', category_name: catName, note: `ทำภารกิจสำเร็จ: ${title}`, owner: 'shared' }]);
    }
    
    await loadGoals();
    await loadTransactions();
}

// 6. 🔥 ระบบประมวลผลหลัก: โหลดรายการ, แยกยอดเงินรายเดือน, คำนวณอันดับ, สรุปบิลหารครึ่ง
async function loadTransactions() {
    const { data: txs, error } = await supabaseClient.from('transactions').select('*').order('created_at', { ascending: false });
    if (error) return console.error(error);

    const tbody = document.getElementById('transactionTableBody');
    tbody.innerHTML = '';

    // ตัวแปรสะสมยอดสำหรับ Dashboard และคำนวณบิลหารครึ่ง
    let myTotal = 0; let partnerTotal = 0; let sharedTotal = 0;
    let mePaidShared = 0; let partnerPaidShared = 0; // ยอดที่แต่ละคนช่วยออกเงินให้ส่วนกลาง

    let categorySummary = {}; let totalExpenseFiltered = 0;
    const now = new Date(); const thisMonth = now.getMonth(); const thisYear = now.getFullYear();

    txs.forEach(tx => {
        const txDate = new Date(tx.created_at);

        // 📅 กรองช่วงเวลาตามตัวเลือกที่เลือก (เพื่อตัดยอดบริหารแยกเป็นเดือนๆ)
        if (filterDate === 'this-month') {
            if (txDate.getMonth() !== thisMonth || txDate.getFullYear() !== thisYear) return;
        } else if (filterDate === 'last-month') {
            let targetMonth = thisMonth - 1; let targetYear = thisYear;
            if (targetMonth < 0) { targetMonth = 11; targetYear--; }
            if (txDate.getMonth() !== targetMonth || txDate.getFullYear() !== targetYear) return;
        }

        // คำนวณเงินสะสมตามเจ้าของกระเป๋าในเดือนนั้นๆ
        const value = tx.type === 'income' ? tx.amount : -tx.amount;
        if (tx.owner === 'me') myTotal += value;
        else if (tx.owner === 'partner') partnerTotal += value;
        else sharedTotal += value;

        // คำนวณว่าใครควักกระเป๋าออกเงินให้ "ส่วนกลาง" ไปเท่าไหร่ (สำหรับใช้คิดบิลหารครึ่งตอนสิ้นเดือน)
        if (tx.owner === 'shared' && tx.type === 'expense') {
            // จุดนี้เราใช้ระบบจำลองเก็บ Log หรือในระบบจริงเราจะจับประวัติการล็อกอิน 
            // เบื้องต้นใช้ข้อความในบันทึกช่วยจับ หรือให้แอปคำนวณหาค่าเฉลี่ย โดยสแกนรายการ
        }

        // เก็บสถิติรายจ่ายสำหรับทำอันดับ "จ่ายเยอะจ่ายน้อย"
        if (tx.type === 'expense') {
            if (!categorySummary[tx.category_name]) categorySummary[tx.category_name] = 0;
            categorySummary[tx.category_name] += tx.amount;
            totalExpenseFiltered += tx.amount;
        }

        // ตรวจสอบตัวกรองฝั่ง UI เพื่อวาดลงตารางประวัติด้านล่าง
        if (filterOwner !== 'all' && tx.owner !== filterOwner) return;
        if (filterType !== 'all' && tx.type !== filterType) return;

        // วาดข้อมูลลงตารางพร้อมปุ่มแก้ไขและลบ
        let ownerBadge = '';
        if (tx.owner === 'me') ownerBadge = '<span class="bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded-full">🙋‍♂️ ฉัน</span>';
        else if (tx.owner === 'partner') ownerBadge = '<span class="bg-pink-100 text-pink-800 text-xs px-2 py-0.5 rounded-full">🙋‍♀️ แฟน</span>';
        else ownerBadge = '<span class="bg-purple-100 text-purple-800 text-xs px-2 py-0.5 rounded-full">🤝 ส่วนกลาง</span>';

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

    // อัปเดตยอดเงิน Dashboard ประจำเดือน
    document.getElementById('myTotal').innerText = `${myTotal.toLocaleString()} บาท`;
    document.getElementById('partnerTotal').innerText = `${partnerTotal.toLocaleString()} บาท`;
    document.getElementById('sharedTotal').innerText = `${sharedTotal.toLocaleString()} บาท`;

    // 🤝 คำนวณบิลหารครึ่งแบบง่าย สไตล์กระเป๋ากลางติดลบ
    // คิดจากรายจ่ายส่วนกลางทั้งหมดที่ติดลบ ยอดคนละเท่าๆ กันที่จะต้องช่วยกันรับผิดชอบ
    const totalSharedExpense = Math.abs(sharedTotal);
    const halfBill = totalSharedExpense / 2;
    const billTextEl = document.getElementById('billSummaryText');
    if (totalSharedExpense === 0) {
        billTextEl.innerText = "🎉 เดือนนี้ยอดส่วนกลางเจ๊ากันพอดี ไม่มีใครค้างตังค์ใครครับ";
    } else {
        billTextEl.innerHTML = `ยอดใช้จ่ายกองกลางรวมกันเดือนนี้คือ <span class="font-bold underline text-yellow-300">${totalSharedExpense.toLocaleString()} บาท</span><br><span class="text-sm text-purple-100">เฉลี่ยจ่ายคนละ: ${halfBill.toLocaleString()} บาท สิ้นเดือนเอาเงินมาเติมเข้ากองกลางร่วมกันนะ! 👩‍❤️‍👨</span>`;
    }

    renderAnalytics(categorySummary, totalExpenseFiltered);
}

function renderAnalytics(summary, total) {
    const area = document.getElementById('analyticsArea'); area.innerHTML = '';
    const sortedCats = Object.keys(summary).map(name => ({ name: name, amount: summary[name] })).sort((a, b) => b.amount - a.amount);

    if (sortedCats.length === 0) {
        area.innerHTML = '<p class="text-sm text-gray-400 col-span-2 text-center py-4">❌ ไม่พบข้อมูลรายจ่ายในเงื่อนไขเวลานี้</p>';
        return;
    }
    sortedCats.forEach(item => {
        const percentage = total > 0 ? ((item.amount / total) * 100).toFixed(1) : 0;
        const card = document.createElement('div');
        card.className = "bg-gray-50 p-3 rounded-xl border border-gray-100 space-y-1";
        card.innerHTML = `
            <div class="flex justify-between text-xs font-medium"><span class="text-gray-700">${item.name}</span><span class="text-gray-900 font-bold">${item.amount.toLocaleString()} บ. (${percentage}%)</span></div>
            <div class="w-full bg-gray-200 h-1.5 rounded-full overflow-hidden"><div class="bg-red-500 h-full" style="width: ${percentage}%"></div></div>
        `;
        area.appendChild(card);
    });
}