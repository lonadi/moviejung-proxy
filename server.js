const express = require("express");
const axios = require("axios");
const cors = require("cors");
const { JSDOM } = require("jsdom");

const app = express();
app.use(cors());

// 🔹 Allowed video sources
const allowedHosts = ["vidsrc.xyz", "edgedeliverynetwork.com", "vidsrc.cc"];

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

        res.setHeader("Content-Type", "text/html");
        res.send(content);
    } catch (error) {
        console.error("Proxy Error:", error.message);
        res.status(500).json({ error: "Failed to fetch content" });
    }
});

// 🔹 Secure Fetch & Sanitize
async function fetchAndSanitize(url) {
    const response = await axios.get(url, {
        headers: { "User-Agent": "Mozilla/5.0" },
    });

    let content = response.data;
    const dom = new JSDOM(content, { runScripts: "outside-only" });
    const { document } = dom.window;

    // 🔹 REMOVE Histats Tracking Scripts & Images
    document.querySelectorAll("script, img").forEach((el) => {
        if (el.src && el.src.includes("histats")) {
            el.remove();
        }
        if (el.textContent && el.textContent.includes("histats")) {
            el.remove();
        }
    });

    // 🔹 Resize Video Frames
    document.querySelectorAll("iframe").forEach((iframe) => {
        let src = iframe.getAttribute("src");
    
        if (!src || src.includes("ads") || src.includes("redirect") || src.includes("tracker")) {
            iframe.remove(); // 🚫 Remove Bad Iframes
        } else if (!allowedHosts.some(host => src.includes(host))) {
            iframe.remove(); // 🚫 Remove Non-Whitelisted Iframes
        } else {
            // ✅ Append autoplay parameter
            const autoplaySrc = src.includes("?") ? `${src}&autoplay=1` : `${src}?autoplay=1`;
            iframe.setAttribute("src", autoplaySrc);
    
            // ✅ Resize Allowed Iframes
            iframe.setAttribute("width", "100%");
            iframe.setAttribute("height", "300px");
            iframe.setAttribute("padding", "0");
            iframe.setAttribute("style", "border:none;");
            iframe.setAttribute("allow", "autoplay; encrypted-media; fullscreen"); // Allow autoplay
        }
    });
    
    // 🔹 Remove JavaScript Redirects
    document.querySelectorAll("script").forEach((script) => {
        if (
            script.textContent.match(/window\.location|document\.location|location\.href|setTimeout|redirect|eval|atob/i)
        ) {
            script.remove();
        }
    });

    // 🔹 Remove META Redirects
    document.querySelectorAll('meta[http-equiv="refresh"]').forEach((meta) => meta.remove());

    return dom.serialize();
}

// Start server (Only for local testing)
if (process.env.NODE_ENV !== "production") {
    const PORT = 5000;
    app.listen(PORT, () => console.log(`🚀 Proxy running on http://localhost:${PORT}`));
}

module.exports = app;
