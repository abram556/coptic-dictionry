/**
 * uploadResults.js — رفع ملف natiga.xlsx لقاعدة النتائج
 * للأدمن فقط
 */

const fs   = require('fs');
const path = require('path');
const { reloadResultsDb, resultsSize } = require('../lib/resultsDb');
const { downloadMediaMessage }         = require('@whiskeysockets/baileys');
const { isAdmin }                      = require('../lib/adminAuth');

const uploadSessions  = new Map();
const SESSION_TIMEOUT = 5 * 60 * 1000;
const NATIGA_PATH     = path.join(__dirname, '../data/natiga.xlsx');

async function uploadResultsCommand(sock, chatId, message, senderId) {
    try {
        uploadSessions.set(chatId, { senderId, timestamp: Date.now() });
        await sock.sendMessage(chatId, {
            text:
                `📂 *رفع ملف النتائج*\n\n` +
                `أرسل ملف *natiga.xlsx* الآن\n\n` +
                `📋 شروط الملف:\n` +
                `  • اسم الملف: natiga.xlsx\n` +
                `  • الورقة الأولى: level1 (المستوى الأول)\n` +
                `  • الورقة الثانية: level2 (المستوى الثاني)\n` +
                `  • العمود A: الرقم الكودي\n` +
                `  • العمود B: رابط الشهادة\n\n` +
                `📊 النتائج الحالية: المستوى1: ${resultsSize(1)} | المستوى2: ${resultsSize(2)}\n` +
                `⏳ المهلة: 5 دقائق`
        }, { quoted: message });
    } catch (err) {
        console.error('❌ uploadResultsCommand:', err);
    }
}

async function processNatigaXlsx(sock, chatId, message, senderId) {
    const docMsg =
        message.message?.documentMessage ||
        message.message?.documentWithCaptionMessage?.message?.documentMessage;
    if (!docMsg) return false;

    const fileName = docMsg.fileName || '';
    const mimeType = docMsg.mimetype || '';
    const isXlsx   =
        fileName.toLowerCase().endsWith('.xlsx') ||
        mimeType.includes('spreadsheet') ||
        mimeType.includes('excel') ||
        mimeType.includes('openxmlformats');

    if (!isXlsx) return false;

    try {
        await sock.sendMessage(chatId, { react: { text: '⏳', key: message.key } });

        const buffer = await downloadMediaMessage(
            message, 'buffer', {},
            { logger: require('pino')({ level: 'silent' }), reuploadRequest: sock.updateMediaMessage }
        );

        if (!buffer || buffer.length === 0) throw new Error('الملف فارغ');

        if (fs.existsSync(NATIGA_PATH)) {
            fs.copyFileSync(NATIGA_PATH, NATIGA_PATH.replace('.xlsx', `_backup_${Date.now()}.xlsx`));
        }
        fs.writeFileSync(NATIGA_PATH, buffer);

        const ok = reloadResultsDb();
        if (!ok) throw new Error('فشل في تحليل الملف — تأكد من وجود الورقتين level1 و level2');

        await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });
        await sock.sendMessage(chatId, {
            text:
                `✅ *تم رفع ملف النتائج بنجاح!*\n\n` +
                `🏆 المستوى الأول: *${resultsSize(1)} طالب*\n` +
                `🏆 المستوى الثاني: *${resultsSize(2)} طالب*\n` +
                `🕐 ${new Date().toLocaleString('ar-EG')}`
        }, { quoted: message });

    } catch (err) {
        console.error('❌ processNatigaXlsx:', err);
        await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
        await sock.sendMessage(chatId, {
            text: `❌ *خطأ في رفع ملف النتائج*\n\n${err.message}`
        }, { quoted: message });
    }
    return true;
}

async function handleResultsUploadReply(sock, chatId, message, senderId) {
    const session = uploadSessions.get(chatId);
    if (!session || session.senderId !== senderId || !isAdmin(senderId)) return false;
    if (Date.now() - session.timestamp > SESSION_TIMEOUT) {
        uploadSessions.delete(chatId);
        return false;
    }
    const docMsg =
        message.message?.documentMessage ||
        message.message?.documentWithCaptionMessage?.message?.documentMessage;
    if (!docMsg) return false;
    uploadSessions.delete(chatId);
    return await processNatigaXlsx(sock, chatId, message, senderId);
}

async function handleDirectResultsUpload(sock, chatId, message, senderId) {
    if (!isAdmin(senderId)) return false;
    const docMsg =
        message.message?.documentMessage ||
        message.message?.documentWithCaptionMessage?.message?.documentMessage;
    if (!docMsg) return false;
    const fileName = (docMsg.fileName || '').toLowerCase();
    if (!fileName.includes('natiga')) return false;
    const handled = await processNatigaXlsx(sock, chatId, message, senderId);
    if (handled) uploadSessions.delete(chatId);
    return handled;
}

function isWaitingForResultsUpload(chatId, senderId) {
    const s = uploadSessions.get(chatId);
    if (!s || s.senderId !== senderId) return false;
    if (Date.now() - s.timestamp > SESSION_TIMEOUT) {
        uploadSessions.delete(chatId);
        return false;
    }
    return true;
}

module.exports = { uploadResultsCommand, handleResultsUploadReply, isWaitingForResultsUpload, handleDirectResultsUpload };
