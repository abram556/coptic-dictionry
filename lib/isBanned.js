const fs = require('fs');
const path = require('path');

function isBanned(userId) {
    try {
        const list = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/banned.json'), 'utf8'));
        return list.includes(userId);
    } catch { return false; }
}

module.exports = { isBanned };
