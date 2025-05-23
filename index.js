const http = require("http");
const https = require("https");
const { parseString } = require("xml2js");
const { URL } = require("url");

function createEmbedding(text, callback) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        callback(new Error("OPENAI_API_KEY environment variable not set"));
        return;
    }

    const options = {
        hostname: "api.openai.com",
        path: "/v1/embeddings",
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
        },
    };

    const req = https.request(options, (res) => {
        let body = "";
        res.on("data", (chunk) => {
            body += chunk;
        });
        res.on("end", () => {
            try {
                const result = JSON.parse(body);
                callback(null, result);
            } catch (e) {
                callback(e);
            }
        });
    });
    req.on("error", (err) => callback(err));

    req.write(JSON.stringify({
        input: text,
        model: "text-embedding-ada-002",
    }));
    req.end();
}

function cosineSimilarity(vec1, vec2) {
    const dot = vec1.reduce((sum, v, i) => sum + v * vec2[i], 0);
    const norm1 = Math.sqrt(vec1.reduce((sum, v) => sum + v * v, 0));
    const norm2 = Math.sqrt(vec2.reduce((sum, v) => sum + v * v, 0));
    if (!norm1 || !norm2) return 0;
    return dot / (norm1 * norm2);
}

// RSS feed URL
const rssUrl =
    "https://news.google.com/rss/search?q=Business%20News&hl=en-US&gl=US&ceid=US:en";

http.createServer((req, res) => {
    const urlObj = new URL(req.url, `http://${req.headers.host}`);
    const categoryText = urlObj.searchParams.get("category") || "inflation";
    https
        .get(rssUrl, (rssRes) => {
            let data = "";

            rssRes.on("data", (chunk) => {
                data += chunk;
            });

            rssRes.on("end", () => {
                parseString(data, (err, result) => {
                    if (err) {
                        res.writeHead(500, { "Content-Type": "text/plain" });
                        res.end("Failed to parse RSS feed");
                        return;
                    }

                    const item = result.rss.channel[0].item[0]; // Only the first article
                    const articleText = `${item.title[0]}\n\n${item.description ? item.description[0] : ""}`;

                    createEmbedding(articleText, (embedErr, embedResult) => {
                        if (embedErr || !embedResult || !embedResult.data || !embedResult.data[0]) {
                            res.writeHead(500, { "Content-Type": "text/plain" });
                            res.end("Error generating article embedding: " + (embedErr ? embedErr.message : "No data"));
                            return;
                        }

                        const articleEmbedding = embedResult.data[0].embedding;
                        createEmbedding(categoryText, (catErr, catResult) => {
                            if (catErr || !catResult || !catResult.data || !catResult.data[0]) {
                                res.writeHead(500, { "Content-Type": "text/plain" });
                                res.end("Error generating category embedding: " + (catErr ? catErr.message : "No data"));
                                return;
                            }

                            const categoryEmbedding = catResult.data[0].embedding;
                            const similarity = cosineSimilarity(articleEmbedding, categoryEmbedding);
                            const threshold = 0.75;

                            if (similarity < threshold) {
                                res.writeHead(200, { "Content-Type": "text/plain" });
                                res.end(`Article does not match category \"${categoryText}\" (similarity ${similarity.toFixed(2)})`);
                                return;
                            }

                            const snippet = JSON.stringify(articleEmbedding.slice(0, 10), null, 2);
                            const html = `
                        <html>
                        <head>
                            <title>Business News - First Article</title>
                            <style>
                                body { font-family: Arial; padding: 20px; }
                                .json-block { margin-top: 20px; background: #f0f0f0; padding: 10px; border-radius: 5px; white-space: pre-wrap; }
                            </style>
                        </head>
                        <body>
                            <h1>${item.title[0]}</h1>
                            <p><a href="${item.link[0]}" target="_blank">Read full article</a></p>
                            <p><strong>Published:</strong> ${item.pubDate[0]}</p>
                            <p><strong>Similarity to \"${categoryText}\"</strong>: ${similarity.toFixed(2)}</p>
                            <h2>Embedding (first 10 values)</h2><div class="json-block">${snippet}</div>
                            <hr>
                            <h2>Raw JSON</h2>
                            <div class="json-block">${JSON.stringify(item, null, 2)}</div>
                        </body>
                        </html>
                    `;

                            res.writeHead(200, { "Content-Type": "text/html" });
                            res.end(html);
                        });
                    });
                });
            });
        })
        .on("error", (err) => {
            res.writeHead(500, { "Content-Type": "text/plain" });
            res.end("Error fetching RSS feed: " + err.message);
        });
}).listen(3000, () => {
    console.log("Server running at http://localhost:3000/");
});
