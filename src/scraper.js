const { URL } = require('url');
const builder = require('xmlbuilder');

async function scrapeLinks(targetUrl) {
    const res = await fetch(targetUrl);
    if (!res.ok) {
        throw new Error(`Failed to fetch: ${res.status} ${res.statusText}`);
    }
    const html = await res.text();

    const anchorRegex = /<a\s+[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi;
    const seen = new Set();
    const items = [];
    let match;
    while ((match = anchorRegex.exec(html))) {
        const link = new URL(match[1], targetUrl).href;
        const text = match[2].replace(/<[^>]*>/g, '').trim();
        if (!text || seen.has(link)) continue;
        seen.add(link);
        items.push({ title: text, link });
        if (items.length >= 10) break;
    }
    return items;
}

async function scrapeToRSS(targetUrl) {
    const items = await scrapeLinks(targetUrl);

    const rss = builder
        .create('rss', { version: '1.0', encoding: 'UTF-8' })
        .att('version', '2.0');
    const channel = rss.ele('channel');
    channel.ele('title', targetUrl);
    channel.ele('link', targetUrl);
    channel.ele('description', `Generated feed for ${targetUrl}`);

    for (const item of items) {
        const it = channel.ele('item');
        it.ele('title', item.title);
        it.ele('link', item.link);
    }

    return rss.end({ pretty: true });
}

module.exports = { scrapeToRSS, scrapeLinks };
