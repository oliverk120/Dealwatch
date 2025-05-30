const http = require('http');
const { URL } = require('url');
const fs = require('fs');
const path = require('path');
const { fetchRSS } = require('./rss');
const { createEmbeddingPromise } = require('./embeddings');
const { cosineSimilarity } = require('./similarity');
const { FilterManager } = require('./filters/filterManager');
const {
    initDB,
    saveArticle,
    getArticles,
    getArticleByLink,
    addFeed,
    getFeeds,
    deleteFeed,
} = require('./db');

const mainTemplate = fs.readFileSync(
    path.join(__dirname, 'templates', 'main.html'),
    'utf8',
);
const databaseTemplate = fs.readFileSync(
    path.join(__dirname, 'templates', 'database.html'),
    'utf8',
);
const experimentTemplate = fs.readFileSync(
    path.join(__dirname, 'templates', 'experiment.html'),
    'utf8',
);
const feedsTemplate = fs.readFileSync(
    path.join(__dirname, 'templates', 'feeds.html'),
    'utf8',
);

function stringToColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 70%, 80%)`;
}

const defaultFeeds = [
    'https://news.google.com/rss/search?q=Private+Equity',
    'https://www.theglobeandmail.com/arc/outboundfeeds/rss/category/business',
    'https://www.cbc.ca/webfeed/rss/rss-business',
];

function createServer() {
    return http.createServer((req, res) => {
        const urlObj = new URL(req.url, `http://${req.headers.host}`);

        if (urlObj.pathname === '/articles') {
            getArticles()
                .then((rows) => {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(rows));
                })
                .catch(() => {
                    res.writeHead(500, { 'Content-Type': 'text/plain' });
                    res.end('Error retrieving articles');
                });
            return;
        }
        if (urlObj.pathname === '/database') {
            getArticles()
                .then((rows) => {
                    const rowsHtml = rows
                        .map((r) => {
                            const imgTag = r.image
                                ? `<img src="${r.image}" class="max-w-[100px]"/>`
                                : '';
                            const embShort = r.embedding
                                ? JSON.parse(r.embedding)
                                      .slice(0, 3)
                                      .map((n) => n.toFixed(2))
                                      .join(', ') + '...'
                                : '';
                            return `<tr><td class="border px-2 py-1">${r.id}</td><td class="border px-2 py-1">${imgTag}</td><td class="border px-2 py-1"><a href="${r.link}" target="_blank">${r.title}</a></td><td class="border px-2 py-1"><a href="${r.link}" target="_blank">${r.link}</a></td><td class="border px-2 py-1">${r.published || ''}</td><td class="border px-2 py-1 text-xs">${embShort}</td></tr>`;
                        })
                        .join('');
                    const html = databaseTemplate.replace('{{rows}}', rowsHtml);
                    res.writeHead(200, { 'Content-Type': 'text/html' });
                    res.end(html);
                })
                .catch(() => {
                    res.writeHead(500, { 'Content-Type': 'text/plain' });
                    res.end('Error retrieving articles');
                });
            return;
        }
        if (urlObj.pathname === '/feeds') {
            if (req.method === 'POST') {
                let body = '';
                req.on('data', (c) => (body += c.toString()));
                req.on('end', () => {
                    const params = new URLSearchParams(body);
                    const url = params.get('url');
                    if (!url) {
                        res.writeHead(400, { 'Content-Type': 'text/plain' });
                        res.end('Missing url');
                        return;
                    }
                    addFeed(url)
                        .then(() => {
                            res.writeHead(302, { Location: '/feeds' });
                            res.end();
                        })
                        .catch(() => {
                            res.writeHead(500, { 'Content-Type': 'text/plain' });
                            res.end('Error adding feed');
                        });
                });
                return;
            }
            if (req.method === 'DELETE') {
                const id = parseInt(urlObj.searchParams.get('id'), 10);
                deleteFeed(id)
                    .then(() => {
                        res.writeHead(200, { 'Content-Type': 'text/plain' });
                        res.end('ok');
                    })
                    .catch(() => {
                        res.writeHead(500, { 'Content-Type': 'text/plain' });
                        res.end('Error deleting feed');
                    });
                return;
            }
            getFeeds()
                .then((rows) => {
                    const rowsHtml = rows
                        .map(
                            (r) =>
                                `<tr><td class="border px-2 py-1">${r.id}</td><td class="border px-2 py-1">${r.url}</td><td class="border px-2 py-1">${r.last_fetched || ''}</td><td class="border px-2 py-1"><button onclick="deleteFeed(${r.id})" class="text-red-600">Delete</button></td></tr>`,
                        )
                        .join('');
                    const html = feedsTemplate.replace('{{rows}}', rowsHtml);
                    res.writeHead(200, { 'Content-Type': 'text/html' });
                    res.end(html);
                })
                .catch(() => {
                    res.writeHead(500, { 'Content-Type': 'text/plain' });
                    res.end('Error retrieving feeds');
                });
            return;
        }
        if (urlObj.pathname === '/' || urlObj.pathname === '/experiment') {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(experimentTemplate);
            return;
        }
        if (urlObj.pathname === '/experiment/search') {
            const text = urlObj.searchParams.get('text') || '';
            const kwParam = urlObj.searchParams.get('keywords') || '';
            const keywords = kwParam
                .split(',')
                .map((k) => k.trim())
                .filter((k) => k);
            const threshold = parseFloat(urlObj.searchParams.get('threshold') || '0');
            const feedUrl = urlObj.searchParams.get('feed');

            const handleRows = (rows) => {
                const limited = rows.slice(0, 50);

                const processWithEmbedding = (emb) => {
                    const manager = new FilterManager({
                        keywords,
                        queryEmbedding: emb,
                        threshold,
                    });

                    const all = limited.map((r, idx) => {
                        const { reasons, similarity } = manager.apply(r);
                        const match = reasons.some((reason) => reason.startsWith('keywords'));
                        return {
                            id: r.id || idx + 1,
                            title: r.title,
                            link: r.link,
                            similarity,
                            match,
                        };
                    });

                    all.sort((a, b) => (b.similarity || 0) - (a.similarity || 0));
                    const filtered = all.filter(
                        (r) => r.similarity === null || r.similarity >= threshold,
                    );
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(
                        JSON.stringify({ total: all.length, filtered: filtered.length, results: filtered }),
                    );
                };

                if (!text) {
                    processWithEmbedding(null);
                    return;
                }

                createEmbeddingPromise(text)
                    .then(processWithEmbedding)
                    .catch((err) => {
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: err.message }));
                    });
            };

            if (feedUrl) {
                fetchRSS(feedUrl)
                    .then((result) => {
                        let items = [];
                        if (
                            result &&
                            result.rss &&
                            result.rss.channel &&
                            result.rss.channel[0] &&
                            result.rss.channel[0].item
                        ) {
                            items = result.rss.channel[0].item.slice(0, 50);
                        }
                        const rows = items.map((it, i) => {
                            const title = (it.title && it.title[0]) || '';
                            const desc = (it.description && it.description[0]) || '';
                            const link = (it.link && it.link[0]) || '';
                            return {
                                id: i + 1,
                                title,
                                link,
                                text: `${title}\n\n${desc}`,
                            };
                        });
                        return Promise.all(
                            rows.map((r) =>
                                createEmbeddingPromise(r.text)
                                    .then((emb) => {
                                        r.embedding = emb;
                                    })
                                    .catch(() => {
                                        r.embedding = null;
                                    }),
                            ),
                        ).then(() => handleRows(rows));
                    })
                    .catch((err) => {
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: err.message }));
                    });
            } else {
                getArticles()
                    .then(handleRows)
                    .catch((err) => {
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: err.message }));
                    });
            }
            return;
        }
        const defaultCategories = [
            'Newpoint Capital Partners Deals',
            'Middle market private equity firms acquires',
        ];
        const defaultSubcategories = [
            [
                {
                    title: 'Richards Packaging',
                    description:
                        'News relating the healthcare distribution market particularly related to consumables such as medical devices and supplies, medical spa distribution',
                    keywords: ['medspa', 'healthcare distributor'],
                },
                {
                    title: 'Level One Robotics and Controls',
                    description:
                        'Robot and PLC programmers for the industrial automation space. Primarily involved in large automation projects in the automotive space for major OEMs including assembly and component plants in Mexico, Canada and the US. Major customers include Stellantis, GM, Ford, Tesla and Rivian. Particularly relating to new automotive model launches and model refreshes in North America. Additionally doing warehouse automation for symbotic and walmart',
                    keywords: [
                        'GM',
                        'Stellantis',
                        'symbotic',
                        'Blue Oval City',
                        'Windsor Assembly Plant',
                        'Windsor Engine Plant',
                        'Windsor Transmission Plant',
                    ],
                },
                {
                    title: 'Event Water Solutions',
                    description:
                        'Providing drinking water to event venues across the US and Canada for music festivals and other events',
                    keywords: ['event water solutions'],
                },
            ],
            [
                {
                    title: 'Private equity news',
                    description:
                        'news about private equity companies acquiring firms in north america. Focused on middle market or lower middle market firms. Anything relating to private equity firm x acquiring another firm',
                    keywords: ['acquired', 'private equity'],
                },
            ],
        ];
        const defaultKeywords = [['inflation'], ['trade'], ['interest']];

        const categories = defaultCategories.map((def, i) => {
            const idx = i + 1;
            const name = urlObj.searchParams.get(`category${idx}`) || def;

            const titles = urlObj.searchParams.getAll(`subcategory${idx}Title`);
            const descs = urlObj.searchParams.getAll(`subcategory${idx}Desc`);
            const kwParams = urlObj.searchParams.getAll(`subcategory${idx}Keywords`);

            let subcategories = [];
            if (titles.length === 0) {
                subcategories = defaultSubcategories[i] || [];
            } else {
                for (let j = 0; j < titles.length; j++) {
                    const kw = kwParams[j]
                        ? kwParams[j]
                              .split(',')
                              .map((k) => k.trim())
                              .filter((k) => k)
                        : [];
                    subcategories.push({
                        title: titles[j],
                        description: descs[j] || '',
                        keywords: kw,
                    });
                }
            }

            let keywordsParam = urlObj.searchParams.get(`catKeywords${idx}`);
            if (!keywordsParam && defaultKeywords[i]) {
                keywordsParam = defaultKeywords[i].join(',');
            }
            const keywords = keywordsParam
                ? keywordsParam
                      .split(',')
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

        const feedParams = urlObj.searchParams.getAll('feed');
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
                        const feedItems = result.rss.channel[0].item.slice(0, 50);
                        items = items.concat(feedItems);
                    }
                });

                if (items.length === 0) {
                    throw new Error('No articles from feeds');
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
                            cat.subEmbeddings = cat.subcategories.map(() => embeds[pos++]);
                        });

                        const articlePromises = items.map((it) => {
                            const articleText = `${it.title[0]}\n\n${it.description ? it.description[0] : ''}`;
                            let img = '';
                            if (
                                it['media:content'] &&
                                it['media:content'][0] &&
                                it['media:content'][0].$.url
                            ) {
                                img = it['media:content'][0].$.url;
                            } else if (
                                it.enclosure &&
                                it.enclosure[0] &&
                                it.enclosure[0].$.url
                            ) {
                                img = it.enclosure[0].$.url;
                            }
                            let published = '';
                            if (it.pubDate && it.pubDate[0]) published = it.pubDate[0];
                            else if (it.published && it.published[0]) published = it.published[0];
                            else if (it['dc:date'] && it['dc:date'][0]) published = it['dc:date'][0];
                            let pubIso = new Date().toISOString();
                            if (published) {
                                const d = new Date(published);
                                if (!isNaN(d.getTime())) pubIso = d.toISOString();
                            }

                            const lowerText = articleText.toLowerCase();
                            const keywordMatches = categories.map((cat) =>
                                cat.allKeywords.filter((kw) => lowerText.includes(kw.toLowerCase())),
                            );

                            return getArticleByLink(it.link[0])
                                .catch(() => null)
                                .then((row) => {
                                    if (row && row.embedding) {
                                        return JSON.parse(row.embedding);
                                    }
                                    return createEmbeddingPromise(articleText).then((emb) => {
                                        saveArticle(it.title[0], it.link[0], emb, img, pubIso).catch(() => {});
                                        return emb;
                                    });
                                })
                                .then((articleEmb) => {
                                    const sims = categories.map((cat) => {
                                        return {
                                            sim: cosineSimilarity(articleEmb, cat.embedding),
                                            subSims: cat.subEmbeddings.map((subEmb) =>
                                                cosineSimilarity(articleEmb, subEmb),
                                            ),
                                        };
                                    });
                                    return { item: it, sims, keywordMatches };
                                });
                        });

                        return Promise.all(articlePromises)
                            .then((results) => {
                                const categoryResults = categories.map((cat, idx) => {
                                    const mapped = results.map(({ item, sims, keywordMatches }) => {
                                        const similarity = sims[idx].sim;
                                        const subSimilarities = sims[idx].subSims;
                                        const composite = Math.max(
                                            similarity,
                                            ...subSimilarities,
                                        );
                                        return {
                                            item,
                                            similarity,
                                            subSimilarities,
                                            keywords: keywordMatches[idx],
                                            composite,
                                        };
                                    });

                                    const highComposite = mapped
                                        .filter((r) => r.composite >= 0.8)
                                        .sort((a, b) => b.composite - a.composite);

                                    const others = mapped.filter((r) => r.composite < 0.8);
                                    const keywordSorted = others
                                        .filter((r) => r.keywords.length > 0)
                                        .sort((a, b) => b.keywords.length - a.keywords.length);

                                    const remaining = others
                                        .filter((r) => r.keywords.length === 0)
                                        .sort((a, b) => b.composite - a.composite)
                                        .slice(0, 5);

                                    return [...highComposite, ...keywordSorted, ...remaining];
                                });

                                const formSections = categories
                                    .map((cat, idx) => {
                                        const subInputs = cat.subcategories
                                            .map(
                                                (sub) => `
                                                    <div class="mb-2 flex flex-wrap items-center space-x-2">
                                                        <input class="border p-1 flex-1" type="text" name="subcategory${idx + 1}Title" value="${sub.title}" placeholder="Title" />
                                                        <textarea class="border p-1 flex-1" name="subcategory${idx + 1}Desc" placeholder="Description">${sub.description}</textarea>
                                                        <input class="border p-1 flex-1" type="text" name="subcategory${idx + 1}Keywords" value="${sub.keywords.join(', ')}" placeholder="Keywords" />
                                                        <button type="button" class="text-red-500 font-bold px-2" onclick="this.parentNode.remove()">&#x2716;</button>
                                                    </div>`,
                                            )
                                            .join('');
                                        return `
                                            <section class="mb-4 border p-2">
                                                <div class="flex items-center space-x-2 mb-2">
                                                    <h3 class="text-lg font-semibold">Category ${idx + 1}</h3>
                                                    <input class="border p-1 flex-1" type="text" name="category${idx + 1}" value="${cat.name}" />
                                                </div>
                                                <details class="mb-2">
                                                    <summary class="cursor-pointer bg-gray-100 p-1 rounded">Subcategories & Keywords</summary>
                                                    <div class="p-2" id="subcategories${idx + 1}">
                                                        ${subInputs}
                                                    </div>
                                                    <button type="button" class="bg-blue-500 text-white px-2 py-1 rounded mb-2" onclick="addSubcategory(${idx + 1})">Add Subcategory</button>
                                                    <div class="mb-2">
                                                        <label class="block">Category Keywords:</label>
                                                        <input class="border p-1 w-full" type="text" name="catKeywords${idx + 1}" value="${cat.keywords.join(', ')}" />
                                                    </div>
                                                    <div class="mb-4">
                                                        <label class="block">All Keywords:</label>
                                                        <input class="border p-1 w-full" type="text" value="${cat.allKeywords.join(', ')}" readonly />
                                                    </div>
                                                </details>
                                            </section>
                                        `;
                                    })
                                    .join('');

                                const feedInputs = feedUrls
                                    .map(
                                        (u) =>
                                            `<input class="border p-1 w-full mb-2" type="text" name="feed" value="${u}" placeholder="RSS Feed URL" />`,
                                    )
                                    .join('');

                                const formHtml = `
                                    <form method="GET" class="mb-6 space-y-4">
                                        <h3 class="text-lg font-semibold">RSS Feeds</h3>
                                        <div id="rssFeeds">
                                            ${feedInputs}
                                        </div>
                                        <button type="button" class="bg-blue-500 text-white px-2 py-1 rounded mb-2" onclick="addFeed()">+ Add Feed</button>
                                        <button type="submit" class="bg-green-600 text-white px-4 py-2 rounded mb-4">Load</button>
                                        ${formSections}
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
                                                .join('')}
                                        `;
                                        const rows = catRes
                                            .map(
                                                ({ item, similarity, subSimilarities, keywords, composite }) => {
                                                    let img = '';
                                                    if (
                                                        item['media:content'] &&
                                                        item['media:content'][0].$ &&
                                                        item['media:content'][0].$.url
                                                    ) {
                                                        img = item['media:content'][0].$.url;
                                                    } else if (
                                                        item.enclosure &&
                                                        item.enclosure[0] &&
                                                        item.enclosure[0].$.url
                                                    ) {
                                                        img = item.enclosure[0].$.url;
                                                    }
                                                    const imgTag = img
                                                        ? `<img src="${img}" alt="" class="max-w-[100px] inline-block align-middle"/>`
                                                        : '';
                                                    const highlightClass = composite > 0.8 ? ' class="bg-green-100"' : '';
                                                    const tags = keywords
                                                        .map(
                                                            (kw) =>
                                                                `<span class="tag" style="background-color:${stringToColor(kw)};">${kw}</span>`,
                                                        )
                                                        .join(' ');

                                                    const subCols = subSimilarities
                                                        .map(
                                                            (sim) =>
                                                                `<td class="border px-2 py-1${sim >= 0.8 ? ' font-bold bg-yellow-100' : ''}">${sim.toFixed(2)}</td>`,
                                                        )
                                                        .join('');
                                                    const simCell = `<td class="border px-2 py-1${similarity >= 0.8 ? ' font-bold bg-yellow-100' : ''}">${similarity.toFixed(2)}</td>`;
                                                    return `<tr${highlightClass}><td class="border px-2 py-1">${imgTag} <a href="${item.link[0]}" target="_blank">${item.title[0]}</a></td>${simCell}<td class="border px-2 py-1">${tags}</td>${subCols}</tr>`;
                                                },
                                            )
                                            .join('\n');

                                        const cat = categories[idx];
                                        const subList = cat.subcategories
                                            .map(
                                                (sub) =>
                                                    `<li><strong>${sub.title}</strong> - ${sub.description} (${sub.keywords.join(', ')})</li>`,
                                            )
                                            .join('');
                                        const kwTags = cat.keywords
                                            .map((kw) => `<span class="tag" style="background-color:${stringToColor(kw)};">${kw}</span>`)
                                            .join(' ');
                                        return `
                                            <details class="mb-10" open>
                                                <summary class="cursor-pointer flex items-center space-x-2 mb-2">
                                                    <h2 class="text-xl font-semibold">Category ${idx + 1}</h2>
                                                    <span>${cat.name}</span>
                                                </summary>
                                                <div class="p-2">
                                                    <details class="mb-2">
                                                        <summary class="cursor-pointer bg-gray-100 p-1 rounded">Subcategories & Keywords</summary>
                                                        <div class="p-2">
                                                            <div class="mb-2"><strong>Category Keywords:</strong> ${kwTags}</div>
                                                            <ul class="list-disc pl-5">${subList}</ul>
                                                        </div>
                                                    </details>
                                                    <table class="min-w-full border-collapse mb-4">
                                                        <tr>
                                                            ${headerCols}
                                                        </tr>
                                                        ${rows}
                                                    </table>
                                                </div>
                                            </details>
                                        `;
                                    })
                                    .join('');

                                const html = mainTemplate
                                    .replace('{{formHtml}}', formHtml)
                                    .replace('{{sections}}', sections);

                                res.writeHead(200, {
                                    'Content-Type': 'text/html',
                                });
                                res.end(html);
                            })
                            .catch((error) => {
                                res.writeHead(500, {
                                    'Content-Type': 'text/plain',
                                });
                                res.end('Error processing articles: ' + error.message);
                            });
                    },
                );
            })
            .catch((error) => {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('Error processing articles: ' + error.message);
            });
    });
}

function startServer(port = 3000) {
    initDB();
    const server = createServer();
    server.listen(port, () => {
        console.log(`Server running at http://localhost:${port}/`);
    });
    return server;
}

module.exports = { createServer, startServer };
