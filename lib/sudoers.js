const fs = require('fs');
const path = require('path');

const SUDO_FILE = path.join(__dirname, '../data/sudoers.json');

// Ensure the sudo file exists
if (!fs.existsSync(SUDO_FILE)) {
    if (!fs.existsSync(path.dirname(SUDO_FILE))) {
        fs.mkdirSync(path.dirname(SUDO_FILE), { recursive: true });
    }
    fs.writeFileSync(SUDO_FILE, JSON.stringify([], null, 2));
}

function getSudoers() {
    try {
        if (!fs.existsSync(SUDO_FILE)) return [];
        const data = fs.readFileSync(SUDO_FILE, 'utf8');
        return JSON.parse(data || '[]');
    } catch (error) {
        console.error('Error reading sudo file:', error.message);
        return [];
    }
}

function addSudoer(userId, name) {
    try {
        const cleanId = userId.split(':')[0].split('@')[0] + '@s.whatsapp.net';
        const sudoers = getSudoers();
        
        if (sudoers.find(s => s.id === cleanId)) {
            return { status: false, message: 'هذا المستخدم مشرف بالفعل!' };
        }

        sudoers.push({
            id: cleanId,
            name: name || 'مشرف بوت',
            addedAt: new Date().toISOString()
        });

        fs.writeFileSync(SUDO_FILE, JSON.stringify(sudoers, null, 2));
        return { status: true, message: `✅ تم إضافة ${name} كمشرف!` };
    } catch (error) {
        console.error('Error adding sudoer:', error);
        return { status: false, message: 'حدث خطأ أثناء إضافة المشرف.' };
    }
}

function removeSudoer(userId) {
    try {
        const cleanId = userId.split(':')[0].split('@')[0] + '@s.whatsapp.net';
        let sudoers = getSudoers();
        
        const index = sudoers.findIndex(s => s.id === cleanId);
        if (index === -1) {
            return { status: false, message: 'هذا المستخدم ليس مشرفاً!' };
        }

        const name = sudoers[index].name;
        sudoers = sudoers.filter(s => s.id !== cleanId);

        fs.writeFileSync(SUDO_FILE, JSON.stringify(sudoers, null, 2));
        return { status: true, message: `✅ تم حذف ${name} من قائمة المشرفين!` };
    } catch (error) {
        console.error('Error removing sudoer:', error);
        return { status: false, message: 'حدث خطأ أثناء حذف المشرف.' };
    }
}

function isSudo(userId) {
    try {
        const cleanId = userId.split(':')[0].split('@')[0] + '@s.whatsapp.net';
        const sudoers = getSudoers();
        return sudoers.some(s => s.id === cleanId);
    } catch (e) {
        return false;
    }
}

module.exports = {
    getSudoers,
    addSudoer,
    removeSudoer,
    isSudo
};
