const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const settings = require('../settings');

const scheduleFile = path.join(__dirname, '../data/group-schedule.json');

// Load schedule from file
function loadSchedule() {
    try {
        if (fs.existsSync(scheduleFile)) {
            return JSON.parse(fs.readFileSync(scheduleFile, 'utf8'));
        }
    } catch (error) {
        console.error('Error loading schedule:', error);
    }
    return {};
}

// Save schedule to file
function saveSchedule(schedule) {
    try {
        const dataDir = path.dirname(scheduleFile);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        fs.writeFileSync(scheduleFile, JSON.stringify(schedule, null, 2));
        return true;
    } catch (error) {
        console.error('Error saving schedule:', error);
        return false;
    }
}

// Set schedule for a group
function setGroupSchedule(groupId, openTime, closeTime) {
    const schedule = loadSchedule();
    schedule[groupId] = {
        openTime,  // Format: "HH:MM" (24-hour)
        closeTime, // Format: "HH:MM" (24-hour)
        enabled: true
    };
    return saveSchedule(schedule);
}

// Remove schedule for a group
function removeGroupSchedule(groupId) {
    const schedule = loadSchedule();
    delete schedule[groupId];
    return saveSchedule(schedule);
}

// Get schedule for a group
function getGroupSchedule(groupId) {
    const schedule = loadSchedule();
    return schedule[groupId] || null;
}

// Toggle schedule enabled/disabled
function toggleGroupSchedule(groupId, enabled) {
    const schedule = loadSchedule();
    if (schedule[groupId]) {
        schedule[groupId].enabled = enabled;
        return saveSchedule(schedule);
    }
    return false;
}

// Tracking to avoid duplicate actions on restart/reconnect
global.groupSchedLastAction = global.groupSchedLastAction || {};

// Start scheduler using node-cron (checks every minute)
function startScheduler(sock) {
    console.log('⏰ Group scheduler started');

    // Run every minute
    cron.schedule('* * * * *', async () => {
        try {
            const schedule = loadSchedule();

            // Fix Timezone Issue
            const now = new Date();
            const timeOptions = {
                timeZone: settings.timezone || 'Africa/Casablanca',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            };
            // Clean hidden characters (like \u200e) that toLocaleTimeString might add
            const currentTime = now.toLocaleTimeString('en-GB', timeOptions).replace(/[^\d:]/g, '');

            for (const [groupId, config] of Object.entries(schedule)) {
                if (!config.enabled) continue;

                try {
                    // Check if it's time to open
                    if (currentTime === config.openTime) {
                        const runKey = `${groupId}_open_${currentTime}_${new Date().toDateString()}`;
                        if (global.groupSchedLastAction[runKey]) continue;
                        global.groupSchedLastAction[runKey] = true;

                        const groupMetadata = await sock.groupMetadata(groupId).catch(() => null);
                        if (!groupMetadata) continue;

                        await sock.groupSettingUpdate(groupId, 'not_announcement');
                        console.log(`🔓 Opened group: ${groupId} at ${currentTime}`);

                        // Change subject to Open
                        let subject = groupMetadata.subject;
                        // Remove Closed indicators if present
                        subject = subject.replace(/🔒|🔴|🚫/g, '').trim();
                        // Add Open indicator if not present
                        if (!subject.includes('🔓')) {
                            subject = subject + ' 🔓';
                        }
                        await sock.groupUpdateSubject(groupId, subject).catch(e => console.log('Failed to update subject:', e.message));

                        await sock.sendMessage(groupId, {
                            text: `🔓 *المجموعة مفتوحة الآن*\n\n⏰ الوقت: ${config.openTime}\n💬 يمكن للجميع الآن إرسال الرسائل!\n\n🔒 وقت الإغلاق: ${config.closeTime}`
                        });
                    }

                    // Check if it's time to close
                    else if (currentTime === config.closeTime) {
                        const runKey = `${groupId}_close_${currentTime}_${new Date().toDateString()}`;
                        if (global.groupSchedLastAction[runKey]) continue;
                        global.groupSchedLastAction[runKey] = true;

                        const groupMetadata = await sock.groupMetadata(groupId).catch(() => null);
                        if (!groupMetadata) continue;

                        await sock.groupSettingUpdate(groupId, 'announcement');
                        console.log(`🔒 Closed group: ${groupId} at ${currentTime}`);

                        // Change subject to Closed
                        let subject = groupMetadata.subject;
                        // Remove Open indicators if present
                        subject = subject.replace(/🔓|🟢|✅/g, '').trim();
                        // Add Closed indicator if not present
                        if (!subject.includes('🔒')) {
                            subject = subject + ' 🔒';
                        }
                        await sock.groupUpdateSubject(groupId, subject).catch(e => console.log('Failed to update subject:', e.message));

                        await sock.sendMessage(groupId, {
                            text: `🔒 *المجموعة مغلقة الآن*\n\n⏰ الوقت: ${config.closeTime}\n🚫 يمكن للمشرفين فقط إرسال الرسائل\n\n🔓 وقت الفتح: ${config.openTime}`
                        });
                    }
                } catch (error) {
                    console.error(`Error processing group ${groupId}:`, error.message);
                }
            }
        } catch (error) {
            console.error('Error in group scheduler:', error);
        }
    });
}

module.exports = {
    setGroupSchedule,
    removeGroupSchedule,
    getGroupSchedule,
    toggleGroupSchedule,
    startScheduler,
    loadSchedule
};
