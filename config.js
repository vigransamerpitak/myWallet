// config.js - ไฟล์เก็บค่าเชื่อมต่อฐานข้อมูล Supabase
const SUPABASE_URL = "https://tseftsnzyrbcrajearxz.supabase.co/rest/v1/";
const SUPABASE_KEY = "sb_publishable_0cfkLjDHdpoDicbNNf68OA_ZWsZdPak";

// เริ่มต้นเชื่อมต่อ Supabase Client
const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);