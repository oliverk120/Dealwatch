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

// Default RSS feed URLs
const defaultFeeds = [
    "https://news.google.com/rss/search?q=Private+Equity",
    "https://www.theglobeandmail.com/arc/outboundfeeds/rss/category/business",
    "https://www.cbc.ca/webfeed/rss/rss-business",
];

function fetchRSS(url) {
    const lib = url.startsWith("https") ? https : http;
    return new Promise((resolve, reject) => {
        lib.get(url, (rssRes) => {
            let data = "";
            rssRes.on("data", (chunk) => {
                data += chunk;
            });
            rssRes.on("end", () => {
                parseString(data, (err, result) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    resolve(result);
                });
            });
        }).on("error", reject);
    });
}

http.createServer((req, res) => {
    const urlObj = new URL(req.url, `http://${req.headers.host}`);
    const defaultCategories = [
        "News impacting middle market companies in North America",
        "Articles about tariffs and trade war related news",
    ];
    const defaultSubcategories = [
        [
            {
                title: "Richards Packaging",
                description:
                    "News relating the healthcare distribution market particularly related to consumables such as medical devices and supplies, medical spa distribution",
                keywords: ["medspa", "healthcare distributor"],
            },
            {
                title: "Level One Robotics and Controls",
                description:
                    "Robot and PLC programmers for the industrial automation space. Primarily involved in large automation projects in the automotive space for major OEMs including assembly and component plants in Mexico, Canada and the US. Major customers include Stellantis, GM, Ford, Tesla and Rivian. Particularly relating to new automotive model launches and model refreshes in North America. Additionally doing warehouse automation for symbotic and walmart",
                keywords: [
                    "GM",
                    "Stellantis",
                    "symbotic",
                    "Blue Oval City",
                    "Windsor Assembly Plant",
                    "Windsor Engine Plant",
                    "Windsor Transmission Plant",
                ],
            },
            {
                title: "Event Water Solutions",
                description:
                    "Providing drinking water to event venues across the US and Canada for music festivals and other events",
                keywords: ["event water solutions"],
            },
        ],
        [
            {
                title: "Private equity news",
                description:
                    "news about private equity companies acquiring firms in north america. Focused on middle market or lower middle market firms. Anything relating to private equity firm x acquiring another firm",
                keywords: ["acquired", "private equity"],
            },
        ],
    ];
    const defaultKeywords = [["inflation"], ["trade"], ["interest"]];

    const categories = defaultCategories.map((def, i) => {
        const idx = i + 1;
        const name = urlObj.searchParams.get(`category${idx}`) || def;

        const titles = urlObj.searchParams.getAll(`subcategory${idx}Title`);
        const descs = urlObj.searchParams.getAll(`subcategory${idx}Desc`);
        const kwParams = urlObj.searchParams.getAll(
            `subcategory${idx}Keywords`,
        );

        let subcategories = [];
        if (titles.length === 0) {
            subcategories = defaultSubcategories[i] || [];
        } else {
            for (let j = 0; j < titles.length; j++) {
                const kw = kwParams[j]
                    ? kwParams[j]
                          .split(",")
                          .map((k) => k.trim())
                          .filter((k) => k)
                    : [];
                subcategories.push({
                    title: titles[j],
                    description: descs[j] || "",
                    keywords: kw,
                });
            }
        }

        let keywordsParam = urlObj.searchParams.get(`catKeywords${idx}`);
        if (!keywordsParam && defaultKeywords[i]) {
            keywordsParam = defaultKeywords[i].join(",");
        }
        const keywords = keywordsParam
            ? keywordsParam
                  .split(",")
                  .map((k) => k.trim())
                  .filter((k) => k)
            : [];

        let allKeywords = [...keywords];
        subcategories.forEach((sub) => {
            allKeywords = allKeywords.concat(sub.keywords);
        });
        allKeywords = Array.from(new Set(allKeywords));

        return { name, subcategories, keywords, allKeywords };
    });

    const feedParams = urlObj.searchParams.getAll("feed");
    const feedUrls = feedParams.length > 0 ? feedParams : defaultFeeds;

    Promise.all(feedUrls.map((u) => fetchRSS(u).catch(() => null)))
        .then((results) => {
            let items = [];
            results.forEach((result, idx) => {
                const feedUrl = feedUrls[idx];
                let count = 0;
                if (
                    result &&
                    result.rss &&
                    result.rss.channel &&
                    result.rss.channel[0] &&
                    result.rss.channel[0].item
                ) {
                    const feedItems = result.rss.channel[0].item;
                    count = feedItems.length;
                    items = items.concat(feedItems.slice(0, 100));
                }
                console.log(
                    `Feed ${feedUrl} succeeded: ${!!result && count > 0} - items loaded: ${count}`,
                );
            });

            console.log(`Total items before embedding: ${items.length}`);

            if (items.length === 0) {
                throw new Error("No articles from feeds");
            }

            const embeddingTexts = [];
            categories.forEach((cat) => {
                embeddingTexts.push(cat.name);
                cat.subcategories.forEach((sub) =>
                    embeddingTexts.push(`${sub.title}\n\n${sub.description}`),
                );
            });

            return Promise.all(embeddingTexts.map(createEmbeddingPromise)).then(
                (embeds) => {
                    let pos = 0;
                    categories.forEach((cat) => {
                        cat.embedding = embeds[pos++];
                        cat.subEmbeddings = cat.subcategories.map(
                            () => embeds[pos++],
                        );
                    });

                    const articlePromises = items.map((it) => {
                        const articleText = `${it.title[0]}\n\n${
                            it.description ? it.description[0] : ""
                        }`;
                        const lowerText = articleText.toLowerCase();
                        const keywordMatches = categories.map((cat) =>
                            cat.allKeywords.filter((kw) =>
                                lowerText.includes(kw.toLowerCase()),
                            ),
                        );
                        return createEmbeddingPromise(articleText).then(
                            (articleEmb) => {
                                const sims = categories.map((cat) => {
                                    return {
                                        sim: cosineSimilarity(
                                            articleEmb,
                                            cat.embedding,
                                        ),
                                        subSims: cat.subEmbeddings.map(
                                            (subEmb) =>
                                                cosineSimilarity(
                                                    articleEmb,
                                                    subEmb,
                                                ),
                                        ),
                                    };
                                });
                                return { item: it, sims, keywordMatches };
                            },
                        );
                    });

                    return Promise.all(articlePromises)
                        .then((results) => {
                            return Promise.all(articlePromises).then(
                                (results) => {
                                    const categoryResults = categories.map(
                                        (cat, idx) => {
                                            return results
                                                .map(
                                                    ({
                                                        item,
                                                        sims,
                                                        keywordMatches,
                                                    }) => {
                                                        const similarity =
                                                            sims[idx].sim;
                                                        const subSimilarities =
                                                            sims[idx].subSims;
                                                        const composite =
                                                            Math.max(
                                                                similarity,
                                                                ...subSimilarities,
                                                            );
                                                        return {
                                                            item,
                                                            similarity,
                                                            subSimilarities,
                                                            keywords:
                                                                keywordMatches[
                                                                    idx
                                                                ],
                                                            composite,
                                                        };
                                                    },
                                                )
                                                .sort(
                                                    (a, b) =>
                                                        b.composite -
                                                        a.composite,
                                                );
                                        },
                                    );

                                    const formSections = categories
                                        .map((cat, idx) => {
                                            const subInputs = cat.subcategories
                                                .map(
                                                    (sub) => `
                                                    <div class="mb-2 flex flex-wrap items-center space-x-2">
                                                        <input class="border p-1 flex-1" type="text" name="subcategory${idx + 1}Title" value="${sub.title}" placeholder="Title" />
                                                        <textarea class="border p-1 flex-1" name="subcategory${idx + 1}Desc" placeholder="Description">${sub.description}</textarea>
                                                        <input class="border p-1 flex-1" type="text" name="subcategory${idx + 1}Keywords" value="${sub.keywords.join(", ")}" placeholder="Keywords" />
                                                        <button type="button" class="text-red-500 font-bold px-2" onclick="this.parentNode.remove()">&#x2716;</button>
                                                    </div>`,
                                                )
                                                .join("");
                                            return `
                                            <h3 class="text-lg font-semibold">Category ${idx + 1}</h3>
                                            <input class="border p-1 w-full mb-2" type="text" name="category${idx + 1}" value="${cat.name}" />
                                            <div id="subcategories${idx + 1}">
                                                ${subInputs}
                                            </div>
                                            <button type="button" class="bg-blue-500 text-white px-2 py-1 rounded mb-2" onclick="addSubcategory(${idx + 1})">Add Subcategory</button>
                                            <div class="mb-2">
                                                <label class="block">Category Keywords:</label>
                                                <input class="border p-1 w-full" type="text" name="catKeywords${idx + 1}" value="${cat.keywords.join(", ")}" />
                                            </div>
                                            <div class="mb-4">
                                                <label class="block">All Keywords:</label>
                                                <input class="border p-1 w-full" type="text" value="${cat.allKeywords.join(", ")}" readonly />
                                            </div>
                                        `;
                                        })
                                        .join("");

                                    const feedInputs = feedUrls
                                        .map(
                                            (u) =>
                                                `<input class="border p-1 w-full mb-2" type="text" name="feed" value="${u}" placeholder="RSS Feed URL" />`,
                                        )
                                        .join("");

                                    const formHtml = `
                                    <form method="GET" class="mb-6 space-y-4">
                                        <h3 class="text-lg font-semibold">RSS Feeds</h3>
                                        <div id="rssFeeds">
                                            ${feedInputs}
                                        </div>
                                        <button type="button" class="bg-blue-500 text-white px-2 py-1 rounded mb-2" onclick="addFeed()">+ Add Feed</button>
                                        ${formSections}
                                        <button type="submit" class="bg-green-600 text-white px-4 py-2 rounded">Load</button>
                                    </form>
                                `;

                                    const sections = categoryResults
                                        .map((catRes, idx) => {
                                            const headerCols = `
                                            <th class="border px-2 py-1 bg-gray-100">Article</th>
                                            <th class="border px-2 py-1 bg-gray-100">Similarity</th>
                                            <th class="border px-2 py-1 bg-gray-100">Keywords</th>
                                            ${categories[idx].subcategories
                                                .map(
                                                    (sub) =>
                                                        `<th class="border px-2 py-1 bg-gray-100">${sub.title}</th>`,
                                                )
                                                .join("")}
                                        `;
                                            const rows = catRes
                                                .map(
                                                    ({
                                                        item,
                                                        similarity,
                                                        subSimilarities,
                                                        keywords,
                                                        composite,
                                                    }) => {
                                                        let img = "";
                                                        if (
                                                            item[
                                                                "media:content"
                                                            ] &&
                                                            item[
                                                                "media:content"
                                                            ][0].$ &&
                                                            item[
                                                                "media:content"
                                                            ][0].$.url
                                                        ) {
                                                            img =
                                                                item[
                                                                    "media:content"
                                                                ][0].$.url;
                                                        } else if (
                                                            item.enclosure &&
                                                            item.enclosure[0] &&
                                                            item.enclosure[0].$
                                                                .url
                                                        ) {
                                                            img =
                                                                item
                                                                    .enclosure[0]
                                                                    .$.url;
                                                        }
                                                        const imgTag = img
                                                            ? `<img src="${img}" alt="" class="max-w-[100px] inline-block align-middle"/>`
                                                            : "";
                                                        const highlightClass =
                                                            composite > 0.8
                                                                ? ' class="bg-green-100"'
                                                                : "";
                                                        const tags = keywords
                                                            .map(
                                                                (kw) =>
                                                                    `<span class="tag" style="background-color:${stringToColor(kw)};">${kw}</span>`,
                                                            )
                                                            .join(" ");

                                                        const subCols =
                                                            subSimilarities
                                                                .map(
                                                                    (sim) =>
                                                                        `<td class="border px-2 py-1${sim >= 0.8 ? " font-bold bg-yellow-100" : ""}">${sim.toFixed(2)}</td>`,
                                                                )
                                                                .join("");
                                                        const simCell = `<td class="border px-2 py-1${similarity >= 0.8 ? " font-bold bg-yellow-100" : ""}">${similarity.toFixed(2)}</td>`;
                                                        return `<tr${highlightClass}><td class="border px-2 py-1">${imgTag} <a href="${item.link[0]}" target="_blank">${item.title[0]}</a></td>${simCell}<td class="border px-2 py-1">${tags}</td>${subCols}</tr>`;
                                                    },
                                                )
                                                .join("\n");

                                            return `
                                            <h2 class="text-xl font-semibold mb-2">Category ${idx + 1}: ${categories[idx].name}</h2>
                                            <table class="min-w-full border-collapse mb-10">
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
                                            .tag { padding: 2px 4px; border-radius: 3px; font-size: 0.8em; margin-left: 4px; display: inline-block; color: #000; }
                                        </style>
                                        <script src="https://cdn.tailwindcss.com"></script>
                                        <script>
        function addSubcategory(idx) {
                                                var container = document.getElementById('subcategories' + idx);
                                                var div = document.createElement('div');
                                                div.className = 'mb-2 flex flex-wrap items-center space-x-2';
                                                var title = document.createElement('input');
                                                title.type = 'text';
                                                title.name = 'subcategory' + idx + 'Title';
                                                title.placeholder = 'Title';
                                                title.className = 'border p-1 flex-1';
                                                div.appendChild(title);
                                                var desc = document.createElement('textarea');
                                                desc.name = 'subcategory' + idx + 'Desc';
                                                desc.placeholder = 'Description';
                                                desc.className = 'border p-1 flex-1';
                                                div.appendChild(desc);
                                                var kw = document.createElement('input');
                                                kw.type = 'text';
                                                kw.name = 'subcategory' + idx + 'Keywords';
                                                kw.placeholder = 'Keywords';
                                                kw.className = 'border p-1 flex-1';
                                                div.appendChild(kw);
                                                var btn = document.createElement('button');
                                                btn.type = 'button';
                                                btn.innerHTML = '&#x2716;';
                                                btn.className = 'text-red-500 font-bold px-2';
                                                btn.onclick = function(){ div.remove(); };
                                                div.appendChild(btn);
            container.appendChild(div);
       }
        function addFeed() {
            var container = document.getElementById('rssFeeds');
            var input = document.createElement('input');
            input.type = 'text';
            input.name = 'feed';
            input.placeholder = 'RSS Feed URL';
            input.className = 'border p-1 w-full mb-2';
            container.appendChild(input);
        }
                                        </script>
                                    </head>
                                    <body class="font-sans p-5">
                                        ${formHtml}
                                        ${sections}
                                    </body>
                                    </html>
                                `;

                                    res.writeHead(200, {
                                        "Content-Type": "text/html",
                                    });
                                    res.end(html);
                                },
                            );
                        })
                        .catch((error) => {
                            res.writeHead(500, {
                                "Content-Type": "text/plain",
                            });
                            res.end(
                                "Error processing articles: " + error.message,
                            );
                        });
                },
            );
        })
        .catch((error) => {
            res.writeHead(500, { "Content-Type": "text/plain" });
            res.end("Error processing articles: " + error.message);
        });
}).listen(3000, () => {
    console.log("Server running at http://localhost:3000/");
});
