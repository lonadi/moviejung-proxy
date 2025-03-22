const express = require("express");
const axios = require("axios");
const cors = require("cors");
const cheerio = require("cheerio");

const app = express();
app.use(cors());

// 🔹 Allowed video sources
const allowedHosts = ["vidsrc.xyz", "edgedeliverynetwork.com", "vidsrc.cc", "vidlink.pro", "player.smashy.stream"];

// example uses

// vidlink.pro
// https://vidlink.pro/movie/945961?primaryColor=11214b&secondaryColor=a2a2a2&iconColor=eefdec&icons=vid&player=default&title=true&autoplay=true&nextbutton=false

// https://player.smashy.stream/movie/945961
// 🔹 Dynamic Proxy Middleware
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

        // Inject JS to bypass iframe restrictions
        content = content.replace(
            "</body>",
            `<script>
                Object.defineProperty(window, "self", { get: () => window.top });
                console.log("🔓 Sandbox bypass injected.");
            </script></body>`
        );

        // 🔹 Remove security headers that block embedding
        res.setHeader("Content-Type", "text/html");
        res.removeHeader("X-Frame-Options");
        res.removeHeader("Content-Security-Policy");

        res.send(content);
    } catch (error) {
        console.error("Proxy Error:", error.message);
        res.status(500).json({ error: "Failed to fetch content" });
    }
});

// 🔹 Secure Fetch & Sanitize using Cheerio
async function fetchAndSanitize(url) {
    const response = await axios.get(url, {
        headers: { "User-Agent": "Mozilla/5.0" },
    });

    const $ = cheerio.load(response.data);

    // 🔹 Remove Histats Scripts, Images, Links, and Divs
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

    // 🔹 Remove Inline Scripts Containing Histats
    $("script").each((_, el) => {
        const scriptContent = $(el).html();
        if (scriptContent && /histats/i.test(scriptContent)) {
            $(el).remove();
        }
    });

   // 🔹 Modify the SmashyPlayer script to remove "sandbox" mentions
   await Promise.all(
    $("script").map(async (_, el) => {
        const src = $(el).attr("src");
        if (src && src.includes("https://smashyplayer.top/assets/index-BYnhesei.js")) {
            console.log("🛠️ Modifying script:", src);
            
            try {
                const scriptResponse = await axios.get(src);
                let modifiedScript = scriptResponse.data.replace(/sandboxed?|Sandboxed?/g, ""); // Remove sandbox mentions

                $(el).remove(); // Remove original script
                $("body").append(`<script>${modifiedScript}</script>`); // Inject modified script

            } catch (err) {
                console.error("⚠️ Failed to fetch script for modification:", err.message);
            }
        }
    })
);

// 🔹 Set Body Background to Black
    $("body").attr("style", "background-color: black !important; color: white !important;");

    // 🔹 Resize & Filter Video Iframes
    $("iframe").each((_, el) => {
        const src = $(el).attr("src");

        if (!src || src.includes("ads") || src.includes("redirect") || src.includes("tracker")) {
            $(el).remove();
        } else if (!allowedHosts.some((host) => src.includes(host))) {
            $(el).remove();
        } else {
            // ✅ Append autoplay parameter
            const autoplaySrc = src.includes("?") ? `${src}&autoplay=1` : `${src}?autoplay=1`;
            $(el).attr("src", autoplaySrc);

            // ✅ Resize Allowed Iframes
            $(el).attr("width", "100%");
            $(el).attr("height", "400px"); // Set height in pixels
            $(el).attr("style", "border:none;");
            $(el).attr("allow", "autoplay; encrypted-media; fullscreen; picture-in-picture");
        }
    });

    // 🔹 Remove JavaScript Redirects
    $("script").each((_, el) => {
        const scriptContent = $(el).html();
        if (/window\.location|document\.location|location\.href|setTimeout|redirect|eval|atob/i.test(scriptContent)) {
            $(el).remove();
        }
    });

    // 🔹 Remove META Redirects
    $('meta[http-equiv="refresh"]').remove();

    return $.html();
}

// Start server (Only for local testing)
if (process.env.NODE_ENV !== "production") {
    const PORT = 5000;
    app.listen(PORT, () => console.log(`🚀 Proxy running on http://localhost:${PORT}`));
}

module.exports = app;
