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

function stringToColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 70%, 80%)`;
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
    const defaultKeywords = [
        ["apple", "trump"],
        [],
        [],
    ];

    const categories = defaultCategories.map((def, i) => {
        const idx = i + 1;
        const name = urlObj.searchParams.get(`category${idx}`) || def;
        const subcategories = urlObj.searchParams.getAll(`subcategory${idx}`);
        const keywordsRaw = urlObj.searchParams.getAll(`keyword${idx}`);
        const keywords = keywordsRaw.length ? keywordsRaw : defaultKeywords[i];
        return { name, subcategories, keywords };
    });

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

                    const embeddingTexts = [];
                    categories.forEach((cat) => {
                        embeddingTexts.push(cat.name);
                        cat.subcategories.forEach((sub) => embeddingTexts.push(sub));
                        cat.keywords.forEach((kw) => embeddingTexts.push(kw));
                    });

                    Promise.all(embeddingTexts.map(createEmbeddingPromise))
                        .then((embeds) => {
                            let pos = 0;
                            categories.forEach((cat) => {
                                cat.embedding = embeds[pos++];
                                cat.subEmbeddings = cat.subcategories.map(() => embeds[pos++]);
                                cat.keywordEmbeddings = cat.keywords.map(() => embeds[pos++]);
                            });

                            const articlePromises = items.map((it) => {
                                const articleText = `${it.title[0]}\n\n${it.description ? it.description[0] : ""}`;
                                return createEmbeddingPromise(articleText).then((articleEmb) => {
                                    const sims = categories.map((cat) => {
                                        return {
                                            sim: cosineSimilarity(articleEmb, cat.embedding),
                                            subSims: cat.subEmbeddings.map((subEmb) => cosineSimilarity(articleEmb, subEmb)),
                                            keywordSims: cat.keywordEmbeddings.map((kEmb) => cosineSimilarity(articleEmb, kEmb)),
                                        };
                                    });
                                    return { item: it, sims };
                                });
                            });

                            return Promise.all(articlePromises).then((results) => {
                                const categoryResults = categories.map((cat, idx) => {
                                    return results
                                        .map(({ item, sims }) => {
                                            const similarity = sims[idx].sim;
                                            const subSimilarities = sims[idx].subSims;
                                            const keywordSimilarities = sims[idx].keywordSims;
                                            const composite = Math.max(similarity, ...subSimilarities);
                                            return {
                                                item,
                                                similarity,
                                                subSimilarities,
                                                keywordSimilarities,
                                                composite,
                                            };
                                        })
                                        .sort((a, b) => b.composite - a.composite);
                                });

                                const formSections = categories
                                    .map((cat, idx) => {
                                        const subInputs = cat.subcategories
                                            .map(
                                                (sub) => `
                                                    <div>
                                                        <input type="text" name="subcategory${idx + 1}" value="${sub}" />
                                                        <button type="button" onclick="this.parentNode.remove()">Remove</button>
                                                    </div>`
                                            )
                                            .join("");
                                        const keywordInputs = cat.keywords
                                            .map(
                                                (kw) => `
                                                    <div>
                                                        <input type="text" name="keyword${idx + 1}" value="${kw}" />
                                                        <button type="button" onclick="this.parentNode.remove()">Remove</button>
                                                    </div>`
                                            )
                                            .join("");
                                        return `
                                            <h3>Category ${idx + 1}</h3>
                                            <input type="text" name="category${idx + 1}" value="${cat.name}" />
                                            <div id="subcategories${idx + 1}">
                                                ${subInputs}
                                            </div>
                                            <button type="button" onclick="addSubcategory(${idx + 1})">Add Subcategory</button>
                                            <div id="keywords${idx + 1}">
                                                ${keywordInputs}
                                            </div>
                                            <button type="button" onclick="addKeyword(${idx + 1})">Add Keyword</button>
                                            <br/><br/>
                                        `;
                                    })
                                    .join("");

                                const formHtml = `
                                    <form method="GET" style="margin-bottom:20px;">
                                        ${formSections}
                                        <button type="submit">Submit</button>
                                    </form>
                                `;

                                const sections = categoryResults
                                    .map((catRes, idx) => {
                                        const headerCols = `
                                            <th>Article</th>
                                            <th>Similarity</th>
                                            ${categories[idx].subcategories
                                                .map((sub) => `<th>${sub}</th>`)
                                                .join("")}
                                        `;
                                        const rows = catRes
                                            .map(({ item, similarity, subSimilarities, keywordSimilarities, composite }) => {
                                                let img = "";
                                                if (
                                                    item["media:content"] &&
                                                    item["media:content"][0].$ &&
                                                    item["media:content"][0].$.url
                                                ) {
                                                    img = item["media:content"][0].$.url;
                                                } else if (
                                                    item.enclosure &&
                                                    item.enclosure[0] &&
                                                    item.enclosure[0].$.url
                                                ) {
                                                    img = item.enclosure[0].$.url;
                                                }
                                                const imgTag = img
                                                    ? `<img src="${img}" alt="" style="max-width: 100px; vertical-align: middle;"/>`
                                                    : "";
                                                const highlight =
                                                    composite > 0.8
                                                        ? ' style="background-color: #c8e6c9;"'
                                                        : "";
                                                const tags = categories[idx].keywords
                                                    .map((kw, kwIdx) =>
                                                        keywordSimilarities[kwIdx] >= 0.8
                                                            ? `<span class="tag" style="background-color:${stringToColor(kw)};">${kw}</span>`
                                                            : "",
                                                    )
                                                    .join(" ");

                                                const subCols = subSimilarities
                                                    .map((sim) => `<td>${sim.toFixed(2)}</td>`)
                                                    .join("");
                                                return `<tr${highlight}><td>${imgTag} <a href="${item.link[0]}" target="_blank">${item.title[0]}</a> ${tags}</td><td>${similarity.toFixed(2)}</td>${subCols}</tr>`;
                                            })
                                            .join("\n");

                                        return `
                                            <h2>Category ${idx + 1}: ${categories[idx].name}</h2>
                                            <table>
                                                <tr>
                                                    ${headerCols}
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
                                            body { font-family: Arial; padding:20px; }
                                          table { border-collapse: collapse; width: 100%; margin-bottom: 40px; }
                                          th, td { border: 1px solid #ddd; padding: 8px; }
                                          th { background-color: #f2f2f2; }
                                          .tag { padding: 2px 4px; border-radius: 3px; font-size: 0.8em; margin-left: 4px; display: inline-block; color: #000; }
                                        </style>
                                        <script>
                                            function addSubcategory(idx) {
                                                var container = document.getElementById('subcategories' + idx);
                                                var div = document.createElement('div');
                                                var input = document.createElement('input');
                                                input.type = 'text';
                                                input.name = 'subcategory' + idx;
                                                div.appendChild(input);
                                                var btn = document.createElement('button');
                                                btn.type = 'button';
                                                btn.textContent = 'Remove';
                                                btn.onclick = function(){ div.remove(); };
                                                div.appendChild(btn);
                                                container.appendChild(div);
                                            }
                                            function addKeyword(idx) {
                                                var container = document.getElementById('keywords' + idx);
                                                var div = document.createElement('div');
                                                var input = document.createElement('input');
                                                input.type = 'text';
                                                input.name = 'keyword' + idx;
                                                div.appendChild(input);
                                                var btn = document.createElement('button');
                                                btn.type = 'button';
                                                btn.textContent = 'Remove';
                                                btn.onclick = function(){ div.remove(); };
                                                div.appendChild(btn);
                                                container.appendChild(div);
                                            }
                                        </script>
                                    </head>
                                    <body>
                                        ${formHtml}
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
