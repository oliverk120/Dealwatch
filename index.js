const http = require("http");
const https = require("https");
const { parseString } = require("xml2js");
const { URL } = require("url");
const {
    renderForm,
    renderSections,
    renderPage,
} = require("./src/templates");

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

// Default RSS feed URLs
const defaultFeeds = [
    "https://news.google.com/rss/search?q=Private+Equity",
    "https://www.theglobeandmail.com/arc/outboundfeeds/rss/category/business",
    "https://www.cbc.ca/webfeed/rss/rss-business",
];

async function fetchRSS(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(
            `Failed to fetch RSS: ${response.status} ${response.statusText}`,
        );
    }
    const data = await response.text();
    return new Promise((resolve, reject) => {
        parseString(data, (err, result) => {
            if (err) {
                reject(err);
                return;
            }
            resolve(result);
        });
    });
}

http.createServer((req, res) => {
    const urlObj = new URL(req.url, `http://${req.headers.host}`);
    const defaultCategories = [
        "Newpoint Capital Partners Deals",
        "Middle market private equity firms acquires",
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
            results.forEach((result) => {
                if (
                    result &&
                    result.rss &&
                    result.rss.channel &&
                    result.rss.channel[0] &&
                    result.rss.channel[0].item
                ) {
                    items = items.concat(
                        result.rss.channel[0].item.slice(0, 50),
                    );
                }
            });

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

                                    const formHtml = renderForm(categories, feedUrls);
                                    const sections = renderSections(categoryResults, categories);
                                    const html = renderPage(formHtml, sections);

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
