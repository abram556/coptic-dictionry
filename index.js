/**
 * index.js — مركز اللغة القبطية v7
 */

require('./settings');
const { Boom }  = require('@hapi/boom');
const fs        = require('fs');
const chalk     = require('chalk');
const {
    handleMessages,
    handleGroupParticipantUpdate,
    handleStatus
} = require('./main');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    jidDecode,
    jidNormalizedUser,
    makeCacheableSignalKeyStore,
    delay
} = require('@whiskeysockets/baileys');
const NodeCache = require('node-cache');
const pino      = require('pino');
const readline  = require('readline');
const { rmSync, existsSync } = require('fs');

const store    = require('./lib/lightweight_store');
const settings = require('./settings');

store.readFromFile();
setInterval(() => store.writeToFile(), settings.storeWriteInterval || 10000);

setInterval(() => { if (global.gc) global.gc(); }, 60_000);
setInterval(() => {
    const used = process.memoryUsage().rss / 1024 / 1024;
    if (used > 400) {
        console.log(chalk.red('⚠️ RAM مرتفع — إعادة تشغيل...'));
        process.exit(1);
    }
}, 30_000);

global.botname = settings.botName;

const pairingCode = true;
const useMobile   = process.argv.includes('--mobile');

const rl = process.stdin.isTTY
    ? readline.createInterface({ input: process.stdin, output: process.stdout })
    : null;
const question = (t) => rl
    ? new Promise(r => rl.question(t, r))
    : Promise.resolve(settings.ownerNumber);

async function startBot() {
    const { version }          = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState('./session');
    const msgRetryCounterCache = new NodeCache();

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: !pairingCode,
        browser: ['Ubuntu', 'Chrome', '20.0.04'],
        auth: {
            creds: state.creds,
            keys:  makeCacheableSignalKeyStore(
                state.keys,
                pino({ level: 'fatal' }).child({ level: 'fatal' })
            )
        },
        markOnlineOnConnect:           true,
        generateHighQualityLinkPreview: true,
        syncFullHistory:               false,
        getMessage: async (key) => {
            const jid = jidNormalizedUser(key.remoteJid);
            const msg = await store.loadMessage(jid, key.id);
            return msg?.message || '';
        },
        msgRetryCounterCache,
        defaultQueryTimeoutMs: undefined
    });

    store.bind(sock.ev);

    sock.ev.on('messages.upsert', async chatUpdate => {
        try {
            const mek = chatUpdate.messages[0];
            if (!mek.message) return;
            mek.message = Object.keys(mek.message)[0] === 'ephemeralMessage'
                ? mek.message.ephemeralMessage.message
                : mek.message;
            if (mek.key?.remoteJid === 'status@broadcast') return;
            if (mek.key.id.startsWith('BAE5') && mek.key.id.length === 16) return;
            if (sock?.msgRetryCounterCache) sock.msgRetryCounterCache.clear();
            await handleMessages(sock, chatUpdate);
        } catch (err) {
            console.error('❌ messages.upsert:', err);
        }
    });

    sock.decodeJid = (jid) => {
        if (!jid) return jid;
        if (/:\d+@/gi.test(jid)) {
            const d = jidDecode(jid) || {};
            return d.user && d.server ? `${d.user}@${d.server}` : jid;
        }
        return jid;
    };
    sock.ev.on('contacts.update', update => {
        for (const c of update) {
            const id = sock.decodeJid(c.id);
            if (store?.contacts) store.contacts[id] = { id, name: c.notify };
        }
    });
    sock.public = true;

    if (pairingCode && !sock.authState.creds.registered) {
        if (useMobile) throw new Error('Cannot use pairing code with mobile api');

        let phoneNumber = await question(
            chalk.bgBlack(chalk.greenBright(
                `\nأدخل رقم واتساب الخاص بك 😍\n(بدون + أو مسافات، مثال: 201114884405): `
            ))
        );
        phoneNumber = phoneNumber.replace(/[^0-9]/g, '');

        setTimeout(async () => {
            try {
                let code = await sock.requestPairingCode(phoneNumber);
                code = code?.match(/.{1,4}/g)?.join('-') || code;
                console.log(chalk.bgGreen.black(`\n╔══════════════════════════╗`));
                console.log(chalk.bgGreen.black(`   كود الإقران: ${code}   `));
                console.log(chalk.bgGreen.black(`╚══════════════════════════╝\n`));
                console.log(chalk.yellow('1. افتح واتساب'));
                console.log(chalk.yellow('2. الإعدادات ← الأجهزة المرتبطة'));
                console.log(chalk.yellow('3. ربط جهاز ← أدخل الكود أعلاه\n'));
            } catch (err) {
                console.error('❌ خطأ في كود الإقران:', err);
            }
        }, 3000);
    }

    sock.ev.on('connection.update', async (s) => {
        const { connection, lastDisconnect } = s;

        if (connection === 'open') {
            console.log(chalk.green('\n✅ بوت مركز اللغة القبطية متصل!'));
            console.log(chalk.cyan('══════════════════════════════════'));
            console.log(chalk.magenta(`🤖 البوت   : ${settings.botName}`));
            console.log(chalk.magenta(`👑 المالك  : ${settings.ownerNumber}`));
            console.log(chalk.magenta(`🔒 الأدمن : /admin ${settings.adminSecret}`));
            console.log(chalk.cyan('══════════════════════════════════\n'));

            const botJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
            await sock.sendMessage(botJid, {
                text:
                    `✅ *${settings.botName}*\n\n` +
                    `البوت متصل بنجاح!\n` +
                    `⏰ ${new Date().toLocaleString('ar-EG')}\n` +
                    `📋 اكتب /menu للبدء`
            }).catch(() => {});
        }

        if (connection === 'close') {
            const code = lastDisconnect?.error?.output?.statusCode;
            if (code === DisconnectReason.loggedOut || code === 401) {
                try { rmSync('./session', { recursive: true, force: true }); } catch {}
                console.log(chalk.red('🔴 انتهت الجلسة — أعد المصادقة.'));
                startBot();
            } else {
                console.log(chalk.yellow('🔄 إعادة الاتصال...'));
                setTimeout(startBot, 3000);
            }
        }
    });

    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('group-participants.update', async (update) => {
        await handleGroupParticipantUpdate(sock, update);
    });

    return sock;
}

startBot().catch(err => {
    console.error('❌ خطأ فادح:', err);
    process.exit(1);
});

process.on('uncaughtException',  err => console.error('❌ Uncaught:', err));
process.on('unhandledRejection', err => console.error('❌ Unhandled:', err));
