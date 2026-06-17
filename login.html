<!DOCTYPE html>
<html lang="th">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>เข้าสู่ระบบ - คู่รักนักออม</title>
    <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
    <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
    <script src="config.js" defer></script>
    <script>
        // ถ้าล็อกอินค้างไว้อยู่แล้ว ให้เด้งไปหน้าหลักทันที ไม่ต้องล็อกอินซ้ำ
        window.onload = async function() {
            // รอให้ config.js โหลดตัวแปร supabaseClient เสร็จก่อนแป๊บหนึ่ง
            setTimeout(async () => {
                const { data } = await supabaseClient.auth.getSession();
                if (data.session) {
                    window.location.href = 'index.html';
                }
            }, 500);
        }

        async function handleLogin(e) {
            e.preventDefault();
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            const btn = document.getElementById('loginBtn');

            btn.innerText = 'กำลังเข้าสู่ระบบ...';
            btn.disabled = true;

            const { data, error } = await supabaseClient.auth.signInWithPassword({
                email: email,
                password: password,
            });

            if (error) {
                alert('ล็อกอินไม่สำเร็จ: ' + error.message);
                btn.innerText = 'เข้าสู่ระบบ';
                btn.disabled = false;
            } else {
                // ล็อกอินสำเร็จ พาวิ่งไปหน้าหลัก
                window.location.href = 'index.html';
            }
        }
    </script>
</head>
<body class="bg-gray-100 min-h-screen flex items-center justify-center p-4">

    <div class="max-w-md w-full bg-white p-8 rounded-2xl shadow-md space-y-6">
        <div class="text-center">
            <h1 class="text-3xl font-bold text-gray-800">👩‍❤️‍👨 คู่รักนักออม</h1>
            <p class="text-gray-500 mt-2">กรุณาเข้าสู่ระบบเพื่อจัดการรายรับ-รายจ่าย</p>
        </div>

        <form onsubmit="handleLogin(event)" class="space-y-4">
            <div>
                <label class="block text-sm font-medium text-gray-600 mb-1">อีเมล</label>
                <input type="email" id="email" required placeholder="your-email@example.com" class="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500">
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-600 mb-1">รหัสผ่าน</label>
                <input type="password" id="password" required placeholder="••••••••" class="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500">
            </div>
            <button type="submit" id="loginBtn" class="w-full bg-blue-600 text-white font-medium py-2.5 rounded-lg hover:bg-blue-700 transition cursor-pointer">เข้าสู่ระบบ</button>
        </form>
    </div>

</body>
</html>