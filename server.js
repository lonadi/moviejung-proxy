const express = require("express");
const axios = require("axios");
const cors = require("cors");
const { createProxyMiddleware } = require("http-proxy-middleware");
const { JSDOM } = require("jsdom");

const app = express();
app.use(cors());

// 🔹 Allowed video sources
const allowedHosts = [
    "vidsrc.xyz",
    "edgedeliverynetwork.com"
    // "vidsrc.cc"
];

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

// 🔹 Secure Fetch with Redirect Blocking (Keeps Video iFrames)
async function fetchAndSanitize(url) {
    const response = await axios.get(url, {
        headers: { "User-Agent": "Mozilla/5.0" },
    });

    let content = response.data;
    const dom = new JSDOM(content, { runScripts: "outside-only" });
    const { document } = dom.window;

    // 🔹 Strip ALL JavaScript-Based Redirects
    document.querySelectorAll("script").forEach((script) => {
        if (
            script.textContent.match(/window\.location|document\.location|top\.location|self\.location|location\.href|setTimeout|setInterval|redirect|eval|atob/i)
        ) {
            script.remove();
        }
    });

    // 🔹 Remove META Redirects
    document.querySelectorAll('meta[http-equiv="refresh"]').forEach((meta) => meta.remove());

    // 🔹 Remove ALL Redirecting Links
    document.querySelectorAll("a[href*='ads'], a[href*='redirect'], a[href*='track'], a[href*='out'], a[href*='exit']").forEach((link) => link.remove());

    // ✅ **Keep Only Video iFrames, Block Suspicious Ones**
    document.querySelectorAll("iframe").forEach((iframe) => {
        const src = iframe.getAttribute("src");
        if (!src || src.includes("ads") || src.includes("redirect") || src.includes("tracker")) {
            iframe.remove(); // 🚫 Remove Bad Iframes
        } else if (!allowedHosts.some(host => src.includes(host))) {
            iframe.remove(); // 🚫 Remove Non-Whitelisted Iframes
        }
    });

    // 🔹 Remove Hidden Forms That Auto-Submit
    document.querySelectorAll("form").forEach((form) => {
        if (form.action.includes("redirect") || form.action.includes("ads")) {
            form.remove();
        }
    });

    // 🔹 Remove Event-Based Redirects
    ["onclick", "onmouseover", "onload", "onmouseenter"].forEach((event) => {
        document.body.removeAttribute(event);
        document.querySelectorAll("*").forEach((el) => el.removeAttribute(event));
    });

    // 🔹 Block CSS-Based Redirects (display: none, visibility: hidden, etc.)
    document.querySelectorAll("style, link[rel='stylesheet']").forEach((style) => {
        if (style.innerHTML.match(/display\s*:\s*none|visibility\s*:\s*hidden|position\s*:\s*absolute/i)) {
            style.remove();
        }
    });

    // 🔹 Block XHR/Fetch Redirects
    document.querySelectorAll("script").forEach((script) => {
        if (script.textContent.match(/XMLHttpRequest|fetch\(/i)) {
            script.remove();
        }
    });

    return dom.serialize();
}

// 🔹 Proxy Middleware for Static Content
// app.use(
//     "/static",
//     createProxyMiddleware({
//         target: "https://vidsrc.cc",
//         changeOrigin: true,
//         onProxyReq: (proxyReq, req, res) => {
//             console.log(`Proxying request: ${req.url}`);
//         }
//     })
// );

// Start server (Only for local testing)
if (process.env.NODE_ENV !== "production") {
    const PORT = 5000;
    app.listen(PORT, () => console.log(`🚀 Proxy running on http://localhost:${PORT}`));
}

module.exports = app;
