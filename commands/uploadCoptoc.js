/**
 * uploadCoptoc.js — رفع ملف coptic.xlsx كقاعدة بيانات القاموس
 * للأدمن فقط
 */

const fs   = require('fs');
const path = require('path');
const { reloadCoptocDb, coptocSize } = require('../lib/coptocDb');
const { downloadMediaMessage }       = require('@whiskeysockets/baileys');
const { isAdmin }                    = require('../lib/adminAuth');

const uploadSessions  = new Map();
const SESSION_TIMEOUT = 5 * 60 * 1000;
const COPTOC_PATH     = path.join(__dirname, '../data/coptic.xlsx');

async function uploadCoptocCommand(sock, chatId, message, senderId) {
    try {
        uploadSessions.set(chatId, { senderId, timestamp: Date.now() });
        await sock.sendMessage(chatId, {
            text:
                `📂 *رفع ملف القاموس*\n\n` +
                `أرسل ملف *coptic.xlsx* الآن\n\n` +
                `📋 شروط الملف:\n` +
                `  • اسم الملف: coptic.xlsx\n` +
                `  • اسم الورقة: sheet1\n` +
                `  • العمود A: كلمات مفصولة بفواصل\n` +
                `  • العمود B: روابط Google Drive للصوتيات\n\n` +
                `📊 السجلات الحالية: ${coptocSize()}\n` +
                `⏳ المهلة: 5 دقائق`
        }, { quoted: message });
    } catch (err) {
        console.error('❌ uploadCoptocCommand:', err);
    }
}

async function processCoptocXlsx(sock, chatId, message, senderId) {
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

        if (fs.existsSync(COPTOC_PATH)) {
            fs.copyFileSync(COPTOC_PATH, COPTOC_PATH.replace('.xlsx', `_backup_${Date.now()}.xlsx`));
        }
        fs.writeFileSync(COPTOC_PATH, buffer);

        const ok = reloadCoptocDb();
        if (!ok) throw new Error('فشل في تحليل الملف — تأكد من صحة الأعمدة والورقة sheet1');

        await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });
        await sock.sendMessage(chatId, {
            text:
                `✅ *تم رفع ملف القاموس بنجاح!*\n\n` +
                `📊 الكلمات المُحمَّلة: *${coptocSize()}*\n` +
                `🕐 ${new Date().toLocaleString('ar-EG')}`
        }, { quoted: message });

    } catch (err) {
        console.error('❌ processCoptocXlsx:', err);
        await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
        await sock.sendMessage(chatId, {
            text: `❌ *خطأ في رفع ملف القاموس*\n\n${err.message}`
        }, { quoted: message });
    }
    return true;
}

async function handleCoptocUploadReply(sock, chatId, message, senderId) {
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
    return await processCoptocXlsx(sock, chatId, message, senderId);
}

async function handleDirectCoptocUpload(sock, chatId, message, senderId) {
    if (!isAdmin(senderId)) return false;
    const docMsg =
        message.message?.documentMessage ||
        message.message?.documentWithCaptionMessage?.message?.documentMessage;
    if (!docMsg) return false;
    const fileName = (docMsg.fileName || '').toLowerCase();
    if (!fileName.includes('coptic')) return false;
    const handled = await processCoptocXlsx(sock, chatId, message, senderId);
    if (handled) uploadSessions.delete(chatId);
    return handled;
}

function isWaitingForCoptocUpload(chatId, senderId) {
    const s = uploadSessions.get(chatId);
    if (!s || s.senderId !== senderId) return false;
    if (Date.now() - s.timestamp > SESSION_TIMEOUT) {
        uploadSessions.delete(chatId);
        return false;
    }
    return true;
}

module.exports = {
    uploadCoptocCommand,
    handleCoptocUploadReply,
    isWaitingForCoptocUpload,
    handleDirectCoptocUpload
};
