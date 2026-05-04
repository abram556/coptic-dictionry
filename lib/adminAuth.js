/**
 * adminAuth.js — نظام التحقق من الأدمن
 * ─────────────────────────────────────────────────────────────
 * الأمر: /admin 44  ← يمنح صلاحيات أدمن كاملة
 * الأمر: /logout   ← يلغي صلاحيات الأدمن
 * ─────────────────────────────────────────────────────────────
 */

const settings = require('../settings');

// الأدمنز المتحقق منهم: senderId → true
const verifiedAdmins = new Set();

function isAdmin(senderId) {
    return verifiedAdmins.has(senderId);
}

function grantAdmin(senderId) {
    verifiedAdmins.add(senderId);
}

function revokeAdmin(senderId) {
    verifiedAdmins.delete(senderId);
}

/**
 * التحقق من أمر /admin <secret>
 * يقبل: /admin 44
 */
function isValidAdminCommand(text) {
    const secret = settings.adminSecret || '';
    const match  = text.trim().match(/^\/admin\s+(.+)$/i);
    if (!match) return false;
    return match[1].trim() === secret;
}

module.exports = { isAdmin, grantAdmin, revokeAdmin, isValidAdminCommand };
