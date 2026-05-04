/**
 * uploadSubscribers.js — رفع ملف subscribers.xlsx لقاعدة المشتركين
 * نفس بنية uploadLearn.js بالضبط
 * للأدمن فقط
 */

const fs   = require('fs');
const path = require('path');
const { importSubscribersFromXlsx, subscribersCount } = require('../lib/subscribersDb');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { isAdmin }              = require('../lib/adminAuth');

const uploadSessions  = new Map();
const SESSION_TIMEOUT = 5 * 60 * 1000;
const SUBS_PATH       = path.join(__dirname, '../data/subscribers.json');

// ── أمر /uploadsubs ──────────────────────────────────────────
async function uploadSubscribersCommand(sock, chatId, message, senderId) {
    try {
        uploadSessions.set(chatId, { senderId, timestamp: Date.now() });
        await sock.sendMessage(chatId, {
            text:
                `📂 *رفع ملف المشتركين*\n\n` +
                `أرسل ملف *subscribers.xlsx* الآن\n\n` +
                `📋 شروط الملف:\n` +
                `  • العمود A: رقم الواتساب\n` +
                `  • العمود B: الاسم\n` +
                `  • العمود C: أول تفاعل\n` +
                `  • العمود D: آخر تفاعل\n\n` +
                `📊 المشتركون الحاليون: ${subscribersCount()}\n` +
                `⏳ المهلة: 5 دقائق`
        }, { quoted: message });
    } catch (err) {
        console.error('❌ uploadSubscribersCommand:', err);
    }
}

// ── معالجة الملف المرفوع ─────────────────────────────────────
async function _processSubscribersXlsx(sock, chatId, message, senderId) {
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

        const result = importSubscribersFromXlsx(buffer);

        if (!result.success) throw new Error(result.error || 'فشل معالجة الملف');

        await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });
        await sock.sendMessage(chatId, {
            text:
                `✅ *تم رفع ملف المشتركين بنجاح!*\n\n` +
                `➕ مُضاف: *${result.imported}*\n` +
                `⏭️ متخطَّى: *${result.skipped}*\n` +
                `👥 الإجمالي: *${subscribersCount()}*\n` +
                `🕐 ${new Date().toLocaleString('ar-EG')}`
        }, { quoted: message });

    } catch (err) {
        console.error('❌ _processSubscribersXlsx:', err);
        await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
        await sock.sendMessage(chatId, {
            text: `❌ *خطأ في رفع ملف المشتركين*\n\n${err.message}`
        }, { quoted: message });
    }
    return true;
}

// ── معالجة الرد بعد أمر /uploadsubs ──────────────────────────
async function handleSubscribersUploadReply(sock, chatId, message, senderId) {
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
    return await _processSubscribersXlsx(sock, chatId, message, senderId);
}

// ── رفع مباشر بدون أوامر ─────────────────────────────────────
async function handleDirectSubscribersUpload(sock, chatId, message, senderId) {
    if (!isAdmin(senderId)) return false;
    const docMsg =
        message.message?.documentMessage ||
        message.message?.documentWithCaptionMessage?.message?.documentMessage;
    if (!docMsg) return false;
    const fileName = (docMsg.fileName || '').toLowerCase();
    if (!fileName.includes('subs') && !fileName.includes('مشترك')) return false;
    const handled = await _processSubscribersXlsx(sock, chatId, message, senderId);
    if (handled) uploadSessions.delete(chatId);
    return handled;
}

// ── هل ننتظر ملف؟ ────────────────────────────────────────────
function isWaitingForSubscribersUpload(chatId, senderId) {
    const s = uploadSessions.get(chatId);
    if (!s || s.senderId !== senderId) return false;
    if (Date.now() - s.timestamp > SESSION_TIMEOUT) {
        uploadSessions.delete(chatId);
        return false;
    }
    return true;
}

module.exports = {
    uploadSubscribersCommand,
    handleSubscribersUploadReply,
    handleDirectSubscribersUpload,
    isWaitingForSubscribersUpload
};