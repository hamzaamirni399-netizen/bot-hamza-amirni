const axios = require('axios');

async function aiImgEditCommand(sock, chatId, msg, args, commands, userLang, match) {
    try {
        // Extract URL and prompt from match or args
        let url, prompt;
        if (match.includes('|')) {
            [url, prompt] = match.split('|').map(str => str.trim());
        } else if (args.length >= 2) {
            url = args[0];
            prompt = args.slice(1).join(" ");
        }

        if (!url || !prompt) {
            return sock.sendMessage(chatId, {
                text: "Please provide both an image URL and a prompt.\nFormat: *.ai-img-edit <url> | <prompt>* or *.ai-img-edit <url> <prompt>*"
            }, { quoted: msg });
        }

        // Validate URL
        if (!url.match(/^https?:\/\/.*\.(?:png|jpg|jpeg|gif)$/i)) {
            return sock.sendMessage(chatId, {
                text: "Please provide a valid image URL (png, jpg, jpeg, or gif)."
            }, { quoted: msg });
        }

        await sock.sendMessage(chatId, { text: "Processing your image... Please wait." }, { quoted: msg });

        const result = await img2img(url, prompt);

        if (!result) {
            throw new Error("No image data returned from API");
        }

        // Send the resulting image
        await sock.sendMessage(chatId, {
            image: { url: result },
            caption: `Image modified with prompt: "${prompt}"`
        }, { quoted: msg });

    } catch (error) {
        console.error('ai-img-edit error:', error);
        await sock.sendMessage(chatId, {
            text: "An error occurred while processing the image. Please try again later."
        }, { quoted: msg });
    }
}

async function img2img(url, prompt) {
    const { data } = await axios.post("https://vondyapi-proxy.com/images/", {
        model: "text-davinci-003",
        maxTokens: 3000,
        input: 'n0HQvTEEkUWWQVFhiW71y2ivBdv6SGth+IiWL0y0lDMUUWsJVWlbbr4h+Ik23FMFoFK0CZ67b3bPsmmxYDxK3o9X9mEZINpEgNE8lK2Fky7E/K/n1AHMUx4SWjr3ZgisE6tIGrvYW4yPrMp8xdeGDhgxdzxWkBAVoqCsInbMQJslEBtw+5kQCVdCxPRJVFDTSt+9tKnGF4yYutUNh+5hwjeBQyB8O4Fs3jpJqRloHq1Ki11cyAc0H6RNtrH/kI6Z2wksQNxKA829nuYgh5cW4xgtbgFFHunJuRsRSIinSZ8=',
        temperature: 0.5,
        e: true,
        summarizeInput: false,
        inHTML: false,
        size: "1024x1024",
        numImages: 1,
        useCredits: false,
        titan: false,
        quality: "standard",
        embedToken: null,
        edit: prompt,
        inputImageUrl: url,
        seed: 0,
        similarityStrength: 0.9045893528738,
        flux: true,
        pro: false,
        face: false,
        useGPT: false,
    });
    return data.data[0];
}

module.exports = aiImgEditCommand;
