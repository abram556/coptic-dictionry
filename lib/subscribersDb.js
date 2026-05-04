/**
 * subscribersDb.js — قاعدة بيانات المشتركين
 * ─────────────────────────────────────────────────────────────
 * نفس بنية MYBOT_PRO_v7 بالضبط + إصلاح Baileys v7
 *
 * الإصلاح الجوهري:
 *   Baileys v7 يرسل JID بشكل: 201234567890:5@s.whatsapp.net
 *   بدلاً من:                  201234567890@s.whatsapp.net
 *   الحل: نحذف الجزء :5 قبل استخراج رقم الهاتف
 * ─────────────────────────────────────────────────────────────
 */

const fs   = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, '../data/subscribers.json');

let subscribers = {};

// ── تحميل البيانات عند البدء ────────────────────────────────
function loadSubscribers() {
    try {
        if (fs.existsSync(DB_FILE)) {
            subscribers = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        } else {
            subscribers = {};
            saveSubscribers();
        }
    } catch (e) {
        console.warn('⚠️ فشل تحميل subscribers.json:', e.message);
        subscribers = {};
    }
}

// ── حفظ البيانات ────────────────────────────────────────────
function saveSubscribers() {
    try {
        const dir = path.dirname(DB_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(DB_FILE, JSON.stringify(subscribers, null, 2));
        return true;
    } catch (e) {
        console.warn('⚠️ فشل حفظ subscribers.json:', e.message);
        return false;
    }
}

// ── استخراج رقم الهاتف (إصلاح Baileys v7) ─────────────────
// 201234567890:5@s.whatsapp.net → 201234567890
function extractPhone(jid) {
    if (!jid) return '';
    const withoutDevice = jid.replace(/:\d+@/, '@');
    return withoutDevice.split('@')[0].replace(/[^0-9]/g, '');
}

// ── تسجيل/تحديث مشترك ──────────────────────────────────────
function registerSubscriber(jid, name) {
    if (!jid || jid === 'status@broadcast') return;
    if (jid.endsWith('@g.us')) return;

    const phone = extractPhone(jid);
    if (!phone || phone.length < 6) return;

    const now = new Date().toISOString();

    if (subscribers[jid]) {
        subscribers[jid].lastSeen = now;
        if (name && !subscribers[jid].name) subscribers[jid].name = name;
    } else {
        subscribers[jid] = {
            jid,
            phone,
            name:      name || '',
            firstSeen: now,
            lastSeen:  now
        };
        console.log(`✅ مشترك جديد: ${phone} (${name || 'بدون اسم'}) — الإجمالي: ${Object.keys(subscribers).length}`);
    }

    saveSubscribers();
}

// ── تسجيل الاستخدام ──────────────────────────────────────────
function registerUsage(jid, section, source) {
    registerSubscriber(jid, '', source);
}

// ── تسجيل تلقائي ────────────────────────────────────────────
function autoRegisterIfNeeded(jid, name, source) {
    registerSubscriber(jid, name || '', source);
}

// ── إحصائيات المستخدم ────────────────────────────────────────
function getUserStats(jid) {
    return subscribers[jid] || null;
}

// ── حذف مشترك ───────────────────────────────────────────────
function removeSubscriber(jid) {
    if (subscribers[jid]) {
        delete subscribers[jid];
        saveSubscribers();
        return true;
    }
    return false;
}

// ── عدد المشتركين ────────────────────────────────────────────
function subscribersCount() {
    return Object.keys(subscribers).length;
}

// ── قائمة جميع المشتركين ────────────────────────────────────
function getAllSubscribers() {
    return Object.values(subscribers);
}

// ── تصدير كـ xlsx buffer ─────────────────────────────────────
function exportSubscribersXlsx() {
    try {
        const XLSX = require('xlsx');
        const rows = [['رقم الواتساب', 'الاسم', 'أول تفاعل', 'آخر تفاعل']];
        for (const sub of Object.values(subscribers)) {
            rows.push([
                sub.phone,
                sub.name      || '—',
                sub.firstSeen ? new Date(sub.firstSeen).toLocaleString('ar-EG') : '—',
                sub.lastSeen  ? new Date(sub.lastSeen).toLocaleString('ar-EG')  : '—'
            ]);
        }
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(rows);
        ws['!cols'] = [{ wch: 20 }, { wch: 25 }, { wch: 25 }, { wch: 25 }];
        XLSX.utils.book_append_sheet(wb, ws, 'المشتركون');
        return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    } catch (e) {
        console.error('❌ فشل تصدير subscribers xlsx:', e.message);
        return null;
    }
}

// ── استيراد من xlsx ──────────────────────────────────────────
function importSubscribersFromXlsx(buffer) {
    try {
        const XLSX = require('xlsx');
        const wb   = XLSX.read(buffer, { type: 'buffer' });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

        if (rows.length < 2) return { success: false, error: 'لا توجد بيانات في الملف' };

        let imported = 0;
        let skipped  = 0;

        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || !row[0]) { skipped++; continue; }

            const phone = String(row[0]).replace(/[^0-9]/g, '');
            if (phone.length < 6) { skipped++; continue; }

            const name      = row[1] ? String(row[1]).replace('—', '').trim() : '';
            const firstSeen = new Date().toISOString();
            const jid       = `${phone}@s.whatsapp.net`;

            if (!subscribers[jid]) {
                subscribers[jid] = { jid, phone, name, firstSeen, lastSeen: firstSeen };
                imported++;
            }
        }

        saveSubscribers();
        return { success: true, imported, skipped, total: subscribersCount() };
    } catch (e) {
        console.error('❌ فشل استيراد subscribers xlsx:', e.message);
        return { success: false, error: e.message };
    }
}

// ── إعادة تحميل ─────────────────────────────────────────────
function reloadSubscribersDb() {
    loadSubscribers();
    return true;
}

loadSubscribers();

module.exports = {
    registerSubscriber,
    registerUsage,
    autoRegisterIfNeeded,
    getUserStats,
    removeSubscriber,
    subscribersCount,
    getAllSubscribers,
    exportSubscribersXlsx,
    importSubscribersFromXlsx,
    reloadSubscribersDb
};