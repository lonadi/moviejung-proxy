const express = require("express");
const axios = require("axios");
const cors = require("cors");
const cheerio = require("cheerio");

const app = express();
app.use(cors());

// Allowed video sources
const allowedHosts = ["vidsrc.xyz", "edgedeliverynetwork.com", "vidsrc.cc", "embed.su"];

// Dynamic Proxy Middleware for Video Content
app.use("/proxy", async (req, res) => {
    const videoUrl = req.query.url;

    if (!videoUrl) {
        return res.status(400).json({ error: "Missing video URL" });
    }

    try {
        const parsedUrl = new URL(videoUrl);
        const hostname = parsedUrl.hostname;

        if (!allowedHosts.includes(hostname)) {
            return res.status(403).json({ error: "Forbidden host" });
        }

        let content = await fetchAndSanitize(videoUrl);

        res.setHeader("Content-Type", "text/html");
        res.send(content);
    } catch (error) {
        console.error("Proxy Error:", error.message);
        res.status(500).json({ error: "Failed to fetch content" });
    }
});

// Secure Fetch & Sanitize using Cheerio
async function fetchAndSanitize(url) {
    const response = await axios.get(url, {
        headers: { "User-Agent": "Mozilla/5.0" },
    });

    const $ = cheerio.load(response.data);

    // Remove Histats Scripts, Images, Links, and Divs
    $("script, img, a, div, span").each((_, el) => {
        const content = $(el).html();
        const src = $(el).attr("src");
        const href = $(el).attr("href");

        if (
            (src && src.includes("histats")) ||
            (href && href.includes("histats")) ||
            (content && content.toLowerCase().includes("histats"))
        ) {
            $(el).remove();
        }
    });

    // Remove Inline Scripts Containing Histats
    $("script").each((_, el) => {
        const scriptContent = $(el).html();
        if (scriptContent && /histats/i.test(scriptContent)) {
            $(el).remove();
        }
    });

    // Set Body Background to Black
    $("body").attr("style", "background-color: black !important; color: white !important;");

    // Resize & Filter Video Iframes
    $("iframe").each((_, el) => {
        const src = $(el).attr("src");

        if (!src || src.includes("ads") || src.includes("redirect") || src.includes("tracker")) {
            $(el).remove();
        } else if (!allowedHosts.some((host) => src.includes(host))) {
            $(el).remove();
        } else {
            // Append autoplay parameter
            const autoplaySrc = src.includes("?") ? `${src}&autoplay=1` : `${src}?autoplay=1`;
            $(el).attr("src", autoplaySrc);

            // Resize Allowed Iframes
            $(el).attr("width", "100%");
            $(el).attr("height", "400px"); // Set height in pixels
            $(el).attr("style", "border:none;");
            $(el).attr("allow", "autoplay; encrypted-media; fullscreen; picture-in-picture");
        }
    });

    // Remove JavaScript Redirects
    $("script").each((_, el) => {
        const scriptContent = $(el).html();
        if (/window\.location|document\.location|location\.href|setTimeout|redirect|eval|atob/i.test(scriptContent)) {
            $(el).remove();
        }
    });

    // Remove META Redirects
    $('meta[http-equiv="refresh"]').remove();

    // Inject Required Static Files Directly from Embed.su
    $("head").append(`
        <link rel="stylesheet" type="text/css" href="https://embed.su/static/player.css?v1.0.61">
        <script src="https://embed.su/static/player.js?v1.0.61" defer></script>
        <script src="https://embed.su/static/react.js?v1.0.61" defer></script>
        <script src="https://embed.su/static/hls.js?v1.0.61" defer></script>
    `);

    return $.html();
}

// Start server (Only for local testing)
if (process.env.NODE_ENV !== "production") {
    const PORT = 5000;
    app.listen(PORT, () => console.log(`🚀 Proxy running on http://localhost:${PORT}`));
}

module.exports = app;
