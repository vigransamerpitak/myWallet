// app.js - ฟังก์ชันควบคุมการทำงานของหน้าเว็บทั้งหมด

// 1. สั่งให้ทำงานทันทีเมื่อเปิดหน้าเว็บ
window.onload = async function() {
    await loadCategories();
    await loadTransactions();
}

// 2. ฟังก์ชันดึงข้อมูลหมวดหมู่มาสร้างเป็นปุ่มกด
async function loadCategories() {
    const { data: categories, error } = await supabase
        .from('categories')
        .select('*')
        .order('name', { ascending: true });

    if (error) return alert('เกิดข้อผิดพลาดในการดึงข้อมูลหมวดหมู่: ' + error.message);

    const expenseArea = document.getElementById('expenseButtons');
    const incomeArea = document.getElementById('incomeButtons');
    const manageArea = document.getElementById('manageCategoriesList');

    // ล้างข้อมูลเก่าบนหน้าจอ
    expenseArea.innerHTML = '';
    incomeArea.innerHTML = '';
    manageArea.innerHTML = '';

    categories.forEach(cat => {
        // สร้างปุ่มบันทึกเงินด้านบน
        const btn = document.createElement('button');
        btn.innerText = cat.name;
        btn.className = cat.type === 'expense' 
            ? "bg-red-50 text-red-700 border border-red-200 px-4 py-2 rounded-xl font-medium hover:bg-red-100 active:scale-95 transition cursor-pointer"
            : "bg-green-50 text-green-700 border border-green-200 px-4 py-2 rounded-xl font-medium hover:bg-green-100 active:scale-95 transition cursor-pointer";
        
        btn.onclick = () => saveTransaction(cat.name, cat.type);

        if (cat.type === 'expense') expenseArea.appendChild(btn);
        else incomeArea.appendChild(btn);

        // สร้างปุ่มลบหมวดหมู่หลังบ้าน
        const manageBadge = document.createElement('span');
        manageBadge.className = `inline-flex items-center gap-1 text-sm px-3 py-1 rounded-full ${cat.type === 'expense' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`;
        manageBadge.innerHTML = `${cat.name} <button onclick="deleteCategory(${cat.id})" class="hover:text-black font-bold ml-1 text-xs cursor-pointer">❌</button>`;
        manageArea.appendChild(manageBadge);
    });
}

// 3. ฟังก์ชันเพิ่มหมวดหมู่ใหม่ (สร้างปุ่มแบบ Dynamic)
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

// 4. ฟังก์ชันลบหมวดหมู่ปุ่มกด
async function deleteCategory(id) {
    if (!confirm('คุณแน่ใจใช่ไหมที่จะลบปุ่มหมวดหมู่นี้?')) return;
    const { error } = await supabase.from('categories').delete().eq('id', id);
    if (error) alert('ลบไม่สำเร็จ: ' + error.message);
    else await loadCategories();
}

// 5. ฟังก์ชันบันทึกธุรกรรมรายรับ-รายจ่าย
async function saveTransaction(categoryName, type) {
    const amountInput = document.getElementById('txAmount');
    const noteInput = document.getElementById('txNote');
    const amount = parseFloat(amountInput.value);

    if (!amount || amount <= 0) return alert('กรุณากรอกจำนวนเงินให้ถูกต้องก่อนกดเลือกปุ่มหมวดหมู่ครับ');

    const { error } = await supabase
        .from('transactions')
        .insert([{ 
            amount: amount, 
            type: type, 
            category_name: categoryName, 
            note: noteInput.value.trim() || null 
        }]);

    if (error) {
        alert('บันทึกรายการล้มเหลว: ' + error.message);
    } else {
        amountInput.value = '';
        noteInput.value = '';
        await loadTransactions();
    }
}

// 6. ฟังก์ชันดึงประวัติธุรกรรมมาโชว์ในตาราง
async function loadTransactions() {
    const { data: txs, error } = await supabase
        .from('transactions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

    if (error) return console.error(error);

    const tbody = document.getElementById('transactionTableBody');
    tbody.innerHTML = '';

    txs.forEach(tx => {
        const date = new Date(tx.created_at).toLocaleString('th-TH', { hour12: false });
        const row = document.createElement('tr');
        row.className = "text-sm";
        row.innerHTML = `
            <td class="py-2.5 text-gray-400">${date}</td>
            <td class="py-2.5 font-medium ${tx.type === 'expense' ? 'text-red-500' : 'text-green-500'}">${tx.type === 'expense' ? 'รายจ่าย 🔴' : 'รายรับ 🟢'}</td>
            <td class="py-2.5 font-medium">${tx.category_name}</td>
            <td class="py-2.5 font-bold">${tx.amount.toLocaleString()} บาท</td>
            <td class="py-2.5 text-gray-500 text-xs">${tx.note || '-'}</td>
        `;
        tbody.appendChild(row);
    });
}