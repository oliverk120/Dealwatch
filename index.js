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
            Authorization: `Bearer ${apiKey}`,
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

    req.write(
        JSON.stringify({
            input: text,
            model: "text-embedding-ada-002",
        }),
    );
    req.end();
}

function cosineSimilarity(vec1, vec2) {
    const dot = vec1.reduce((sum, v, i) => sum + v * vec2[i], 0);
    const norm1 = Math.sqrt(vec1.reduce((sum, v) => sum + v * v, 0));
    const norm2 = Math.sqrt(vec2.reduce((sum, v) => sum + v * v, 0));
    if (!norm1 || !norm2) return 0;
    return dot / (norm1 * norm2);
}

function createEmbeddingPromise(text) {
    return new Promise((resolve, reject) => {
        createEmbedding(text, (err, result) => {
            if (err) {
                reject(err);
                return;
            }
            if (!result || !result.data || !result.data[0]) {
                reject(new Error("No embedding data"));
                return;
            }
            resolve(result.data[0].embedding);
        });
    });
}

// RSS feed URL
const rssUrl =
    "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10001147";

http.createServer((req, res) => {
    const urlObj = new URL(req.url, `http://${req.headers.host}`);
    const defaultCategories = [
        "Articles economic inflation or the impact of tariffs on the economy",
        "Trade and tariff news",
        "Interest rate outlook",
    ];
    const categoryTexts = [
        urlObj.searchParams.get("category1") || defaultCategories[0],
        urlObj.searchParams.get("category2") || defaultCategories[1],
        urlObj.searchParams.get("category3") || defaultCategories[2],
    ];

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

                    const items = result.rss.channel[0].item.slice(0, 10);

                    Promise.all(categoryTexts.map(createEmbeddingPromise))
                        .then((categoryEmbeddings) => {
                            const promises = items.map((it) => {
                                const articleText = `${it.title[0]}\n\n${it.description ? it.description[0] : ""}`;
                                return createEmbeddingPromise(articleText).then(
                                    (articleEmb) => {
                                        const sims = categoryEmbeddings.map((ce) =>
                                            cosineSimilarity(articleEmb, ce),
                                        );
                                        return { item: it, similarities: sims };
                                    },
                                );
                            });

                            return Promise.all(promises).then((results) => {
                                const categoryResults = categoryEmbeddings.map((_, idx) => {
                                    return results
                                        .map(({ item: it, similarities }) => ({
                                            item: it,
                                            similarity: similarities[idx],
                                        }))
                                        .sort((a, b) => b.similarity - a.similarity);
                                });

                                const sections = categoryResults
                                    .map((catRes, idx) => {
                                        const rows = catRes
                                            .map(({ item: it, similarity }) => {
                                                let img = "";
                                                if (
                                                    it["media:content"] &&
                                                    it["media:content"][0].$ &&
                                                    it["media:content"][0].$.url
                                                ) {
                                                    img = it["media:content"][0].$.url;
                                                } else if (
                                                    it.enclosure &&
                                                    it.enclosure[0] &&
                                                    it.enclosure[0].$.url
                                                ) {
                                                    img = it.enclosure[0].$.url;
                                                }
                                                const imgTag = img
                                                    ? `<img src="${img}" alt="" style="max-width: 100px; vertical-align: middle;"/>`
                                                    : "";
                                                const highlight =
                                                    similarity > 0.8
                                                        ? ' style="background-color: #c8e6c9;"'
                                                        : '';
                                                return `<tr${highlight}><td>${imgTag} <a href="${it.link[0]}" target="_blank">${it.title[0]}</a></td><td>${similarity.toFixed(2)}</td></tr>`;
                                            })
                                            .join("\n");

                                        const hiddenInputs = categoryTexts
                                            .map((txt, j) =>
                                                j === idx
                                                    ? ""
                                                    : `<input type="hidden" name="category${j + 1}" value="${categoryTexts[j]}" />`
                                            )
                                            .join("");
                                        const form = `
                                            <form method="GET" style="margin-bottom:20px;">
                                                Category ${idx + 1}: <input type="text" name="category${idx + 1}" value="${categoryTexts[idx]}" />
                                                ${hiddenInputs}
                                                <button type="submit">Submit</button>
                                            </form>
                                        `;
                                        return `
                                            <h2>Category ${idx + 1}: ${categoryTexts[idx]}</h2>
                                            ${form}
                                            <table>
                                                <tr>
                                                    <th>Article</th>
                                                    <th>Similarity</th>
                                                </tr>
                                                ${rows}
                                            </table>
                                        `;
                                    })
                                    .join("<br/>");

                                const html = `
                                    <html>
                                    <head>
                                        <title>Business News - Top Matches</title>
                                        <style>
                                            body { font-family: Arial; padding: 20px; }
                                            table { border-collapse: collapse; width: 100%; margin-bottom: 40px; }
                                            th, td { border: 1px solid #ddd; padding: 8px; }
                                            th { background-color: #f2f2f2; }
                                        </style>
                                    </head>
                                    <body>
                                        ${sections}
                                    </body>
                                    </html>
                                `;

                                res.writeHead(200, {
                                    "Content-Type": "text/html",
                                });
                                res.end(html);
                            });
                        })
                        .catch((error) => {
                            res.writeHead(500, {
                                "Content-Type": "text/plain",
                            });
                            res.end(
                                "Error processing articles: " + error.message,
                            );
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
