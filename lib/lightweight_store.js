const fs = require('fs');
const path = require('path');

const STORE_FILE = path.join(__dirname, '../baileys_store.json');

let MAX_MESSAGES = 20;
try {
    const settings = require('../settings.js');
    if (settings.maxStoreMessages && typeof settings.maxStoreMessages === 'number') {
        MAX_MESSAGES = settings.maxStoreMessages;
    }
} catch (e) {}

const store = {
    messages: {},
    contacts: {},
    chats: {},

    readFromFile() {
        try {
            if (fs.existsSync(STORE_FILE)) {
                const data = JSON.parse(fs.readFileSync(STORE_FILE, 'utf-8'));
                this.contacts = data.contacts || {};
                this.chats    = data.chats    || {};
                this.messages = data.messages || {};
                this.cleanupData();
            }
        } catch (e) {
            console.warn('⚠️ Failed to read store:', e.message);
        }
    },

    writeToFile() {
        try {
            fs.writeFileSync(STORE_FILE, JSON.stringify({
                contacts: this.contacts,
                chats:    this.chats,
                messages: this.messages
            }));
        } catch (e) {
            console.warn('⚠️ Failed to write store:', e.message);
        }
    },

    cleanupData() {
        if (this.messages) {
            Object.keys(this.messages).forEach(jid => {
                if (typeof this.messages[jid] === 'object' && !Array.isArray(this.messages[jid])) {
                    this.messages[jid] = Object.values(this.messages[jid]).slice(-MAX_MESSAGES);
                }
            });
        }
    },

    bind(ev) {
        ev.on('messages.upsert', ({ messages }) => {
            messages.forEach(msg => {
                if (!msg.key?.remoteJid) return;
                const jid = msg.key.remoteJid;
                this.messages[jid] = this.messages[jid] || [];
                this.messages[jid].push(msg);
                if (this.messages[jid].length > MAX_MESSAGES) {
                    this.messages[jid] = this.messages[jid].slice(-MAX_MESSAGES);
                }
            });
        });

        ev.on('contacts.update', (contacts) => {
            contacts.forEach(contact => {
                if (contact.id) {
                    this.contacts[contact.id] = {
                        id:   contact.id,
                        name: contact.notify || contact.name || ''
                    };
                }
            });
        });

        ev.on('chats.set', (chats) => {
            this.chats = {};
            chats.forEach(chat => {
                this.chats[chat.id] = { id: chat.id, subject: chat.subject || '' };
            });
        });
    },

    async loadMessage(jid, id) {
        return this.messages[jid]?.find(m => m.key.id === id) || null;
    }
};

module.exports = store;
