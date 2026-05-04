/**
 * buttons.js — مساعد إرسال الأزرار والقوائم الاحترافية
 * ─────────────────────────────────────────────────────────────
 * يوفر دوال لإرسال أزرار Inline أو قائمة عادية كـ fallback
 * ─────────────────────────────────────────────────────────────
 */

/**
 * إرسال رسالة مع أزرار Inline (Baileys)
 * @param {object} sock
 * @param {string} chatId
 * @param {object} quoted - رسالة الاقتباس
 * @param {string} headerText - نص العنوان
 * @param {string} bodyText - نص الجسم
 * @param {string} footerText - نص التذييل
 * @param {Array}  buttons - مصفوفة { id, text }
 */
async function sendButtons(sock, chatId, quoted, headerText, bodyText, footerText, buttons) {
    try {
        const btns = buttons.map(b => ({
            buttonId:   b.id,
            buttonText: { displayText: b.text },
            type: 1
        }));

        await sock.sendMessage(chatId, {
            text:    bodyText,
            footer:  footerText,
            buttons: btns,
            headerType: 1,
            header: { hasMediaAttachment: false }
        }, { quoted });

    } catch (err) {
        // fallback: إرسال نص عادي إذا لم تدعم الأزرار
        const lines = buttons.map(b => `  • ${b.text}  →  ${b.id}`).join('\n');
        await sock.sendMessage(chatId, {
            text: `${headerText ? headerText + '\n\n' : ''}${bodyText}\n\n${lines}${footerText ? '\n\n' + footerText : ''}`
        }, { quoted });
    }
}

/**
 * إرسال رسالة مع قائمة (List Message)
 * @param {object} sock
 * @param {string} chatId
 * @param {object} quoted
 * @param {string} title
 * @param {string} body
 * @param {string} footer
 * @param {string} btnText - نص زر القائمة
 * @param {Array}  sections - [{ title, rows: [{ id, title, description }] }]
 */
async function sendListMessage(sock, chatId, quoted, title, body, footer, btnText, sections) {
    try {
        await sock.sendMessage(chatId, {
            listMessage: {
                title,
                description: body,
                footerText:  footer,
                buttonText:  btnText,
                listType:    1,
                sections
            }
        }, { quoted });

    } catch (err) {
        // fallback نصي
        let text = `${title}\n\n${body}\n`;
        for (const sec of sections) {
            text += `\n*${sec.title}*\n`;
            for (const row of sec.rows) {
                text += `  • *${row.title}*${row.description ? ' — ' + row.description : ''}\n`;
            }
        }
        if (footer) text += `\n${footer}`;
        await sock.sendMessage(chatId, { text }, { quoted });
    }
}

module.exports = { sendButtons, sendListMessage };
