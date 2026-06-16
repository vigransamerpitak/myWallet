// app.js - ฟังก์ชันควบคุมเวอร์ชันใช้งานร่วมกับแฟน

window.onload = async function() {
    await loadCategories();
    await loadTransactions();
}

async function loadCategories() {
    const { data: categories, error } = await supabase
        .from('categories')
        .select('*')
        .order('name', { ascending: true });

    if (error) return alert('เกิดข้อผิดพลาดในการดึงข้อมูลหมวดหมู่: ' + error.message);

    const expenseArea = document.getElementById('expenseButtons');
    const incomeArea = document.getElementById('incomeButtons');
    const manageArea = document.getElementById('manageCategoriesList');

    expenseArea.innerHTML = '';
    incomeArea.innerHTML = '';
    manageArea.innerHTML = '';

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

async function addCategory() {
    const nameInput = document.getElementById('newCatName');
    const typeInput = document.getElementById('newCatType');

    if (!nameInput.value.trim()) return alert('กรุณากรอกชื่อหมวดหมู่');

    const { error } = await supabase
        .from('categories')
        .insert([{ name: nameInput.value.trim(), type: typeInput.value }]);

    if (error) {
        alert('ไม่สามารถเพิ่มได้: ' + error.message);
    } else {
        nameInput.value = '';
        await loadCategories();
    }
}

async function deleteCategory(id) {
    if (!confirm('คุณแน่ใจใช่ไหมที่จะลบปุ่มหมวดหมู่นี้?')) return;
    const { error } = await supabase.from('categories').delete().eq('id', id);
    if (error) alert('ลบไม่สำเร็จ: ' + error.message);
    else await loadCategories();
}

// ฟังก์ชันบันทึกรายรับรายจ่ายแบบระบุเจ้าของเงินได้ด้วย
async function saveTransaction(categoryName, type) {
    const amountInput = document.getElementById('txAmount');
    const noteInput = document.getElementById('txNote');
    const ownerInput = document.getElementById('txOwner');
    const amount = parseFloat(amountInput.value);

    if (!amount || amount <= 0) return alert('กรุณากรอกจำนวนเงินให้ถูกต้องก่อนกดเลือกปุ่มหมวดหมู่ครับ');

    const { error } = await supabase
        .from('transactions')
        .insert([{ 
            amount: amount, 
            type: type, 
            category_name: categoryName, 
            note: noteInput.value.trim() || null,
            owner: ownerInput.value
        }]);

    if (error) {
        alert('บันทึกรายการล้มเหลว: ' + error.message);
    } else {
        amountInput.value = '';
        noteInput.value = '';
        await loadTransactions();
    }
}

async function loadTransactions() {
    // ดึงข้อมูลรายการล่าสุด 50 รายการมาคำนวณและแสดงผล
    const { data: txs, error } = await supabase
        .from('transactions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

    if (error) return console.error(error);

    const tbody = document.getElementById('transactionTableBody');
    tbody.innerHTML = '';

    // ตัวแปรเก็บยอดรวมสุทธิแต่ละกระเป๋า (คิดแบบ รายรับ ลบ รายจ่าย)
    let myTotal = 0;
    let partnerTotal = 0;
    let sharedTotal = 0;

    txs.forEach(tx => {
        // คำนวณยอดเงินแยกตามกระเป๋า
        const value = tx.type === 'income' ? tx.amount : -tx.amount;
        if (tx.owner === 'me') myTotal += value;
        else if (tx.owner === 'partner') partnerTotal += value;
        else sharedTotal += value;

        // จัดการหน้าตาป้ายชื่อกระเป๋าเงิน
        let ownerBadge = '';
        if (tx.owner === 'me') ownerBadge = '<span class="bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded-full">🙋‍♂️ ฉัน</span>';
        else if (tx.owner === 'partner') ownerBadge = '<span class="bg-pink-100 text-pink-800 text-xs px-2 py-0.5 rounded-full">🙋‍♀️ แฟน</span>';
        else ownerBadge = '<span class="bg-purple-100 text-purple-800 text-xs px-2 py-0.5 rounded-full">🤝 ส่วนกลาง</span>';

        const date = new Date(tx.created_at).toLocaleString('th-TH', { hour12: false });
        const row = document.createElement('tr');
        row.className = "text-sm";
        row.innerHTML = `
            <td class="py-2.5 text-gray-400">${date}</td>
            <td class="py-2.5">${ownerBadge}</td>
            <td class="py-2.5 font-medium ${tx.type === 'expense' ? 'text-red-500' : 'text-green-500'}">${tx.type === 'expense' ? 'รายจ่าย 🔴' : 'รายรับ 🟢'}</td>
            <td class="py-2.5 font-medium">${tx.category_name}</td>
            <td class="py-2.5 font-bold">${tx.amount.toLocaleString()} บาท</td>
            <td class="py-2.5 text-gray-500 text-xs">${tx.note || '-'}</td>
        `;
        tbody.appendChild(row);
    });

    // อัปเดตยอดเงินขึ้น Dashboard ด้านบนสุด
    document.getElementById('myTotal').innerText = `${myTotal.toLocaleString()} บาท`;
    document.getElementById('partnerTotal').innerText = `${partnerTotal.toLocaleString()} บาท`;
    document.getElementById('sharedTotal').innerText = `${sharedTotal.toLocaleString()} บาท`;
}