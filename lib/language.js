const fs = require('fs');
const path = require('path');
const settings = require('../settings');

// Path for storing language configuration
const LANG_CONFIG = path.join(__dirname, '../data/langConfig.json');
const LANG_DIR = path.join(__dirname, '../lang');

/**
 * Load the current language preference
 */
function getLanguage() {
    try {
        if (fs.existsSync(LANG_CONFIG)) {
            const data = JSON.parse(fs.readFileSync(LANG_CONFIG));
            return data.language || 'ar'; // Default to Arabic
        }
    } catch (error) {
        console.error('Error loading language config:', error);
    }
    return 'ar';
}

/**
 * Save the language preference
 */
function setLanguage(lang) {
    try {
        const supported = ['en', 'ar', 'ma'];
        if (!supported.includes(lang)) return false;

        let data = {};
        if (fs.existsSync(LANG_CONFIG)) {
            data = JSON.parse(fs.readFileSync(LANG_CONFIG));
        }
        data.language = lang;

        // Ensure data directory exists
        const dataDir = path.dirname(LANG_CONFIG);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        fs.writeFileSync(LANG_CONFIG, JSON.stringify(data, null, 2));
        return true;
    } catch (error) {
        console.error('Error saving language config:', error);
        return false;
    }
}

/**
 * Get a translation string
 */
/**
 * Get a translation string
 */
function t(keyPath, replacements = {}, lang = null) {
    // Priority: Explicit lang arg > Global Config > 'ar'
    const finalLang = lang || getLanguage();
    const langFile = path.join(LANG_DIR, `${finalLang}.json`);

    try {
        if (!fs.existsSync(langFile)) {
            // Fallback to English/Arabic if file missing
            const fallbackFile = path.join(LANG_DIR, 'ar.json');
            if (!fs.existsSync(fallbackFile)) return keyPath;
            return getNestedValue(JSON.parse(fs.readFileSync(fallbackFile)), keyPath, replacements);
        }

        const langData = JSON.parse(fs.readFileSync(langFile));
        return getNestedValue(langData, keyPath, replacements);
    } catch (error) {
        console.error('Error in translation helper:', error);
        return keyPath;
    }
}

/**
 * Helper to get nested value from object using dot notation
 */
function getNestedValue(obj, keyPath, replacements) {
    const keys = keyPath.split('.');
    let result = obj;

    for (const key of keys) {
        if (result && result[key]) {
            result = result[key];
        } else {
            return keyPath; // Return key if not found
        }
    }

    if (typeof result !== 'string') return keyPath;

    // Apply replacements
    let translated = result;

    // Merge default replacements (botName, prefix) with custom ones
    const finalReplacements = {
        botName: settings.botName || 'Hamza Amirni',
        prefix: settings.prefix || '.',
        botOwner: settings.botOwner || 'Hamza Amirni',
        ...replacements
    };

    for (const [key, value] of Object.entries(finalReplacements)) {
        translated = translated.replace(new RegExp('\\{' + key + '\\}', 'g'), value);
    }

    return translated;
}

const { getUser, setUserLanguage: setLogUserLang } = require('./userLogger');

module.exports = {
    getLanguage,
    setLanguage,
    t,
    getUserLanguage: async (userId) => {
        const user = getUser(userId);
        if (user && user.language) {
            return user.language;
        }
        return getLanguage(); // Fallback to global default
    },
    setUserLanguage: (userId, lang) => setLogUserLang(userId, lang)
};
