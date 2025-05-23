const http = require("http");
const https = require("https");
const fs = require("fs");
const { parseString } = require("xml2js");

function loadEnv(path) {
    try {
        const content = fs.readFileSync(path, "utf8");
        content.split(/\r?\n/).forEach((line) => {
            const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
            if (match) {
                let value = match[2].trim();
                if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
                    value = value.slice(1, -1);
                }
                process.env[match[1]] = value;
            }
        });
    } catch (err) {
        // ignore missing env file
    }
}

loadEnv(".env");

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

// RSS feed URL
const rssUrl =
    "https://news.google.com/rss/search?q=Business%20News&hl=en-US&gl=US&ceid=US:en";

http.createServer((req, res) => {
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
                        let embeddingSection = "";
                        if (!embedErr && embedResult && embedResult.data && embedResult.data[0] && embedResult.data[0].embedding) {
                            const snippet = JSON.stringify(embedResult.data[0].embedding.slice(0, 10), null, 2);
                            embeddingSection = `<h2>Embedding (first 10 values)</h2><div class="json-block">${snippet}</div>`;
                        } else if (embedErr) {
                            embeddingSection = `<p>Error generating embedding: ${embedErr.message}</p>`;
                        }

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
                            ${embeddingSection}
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
        })
        .on("error", (err) => {
            res.writeHead(500, { "Content-Type": "text/plain" });
            res.end("Error fetching RSS feed: " + err.message);
        });
}).listen(3000, () => {
    console.log("Server running at http://localhost:3000/");
});
