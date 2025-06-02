const { URL } = require('url');
const builder = require('xmlbuilder');

const RULES_PRNEWSWIRE = {
    title: '<h3> text minus <small>',
    description: '<p class="remove-outline">',
    link: 'href attribute of <a> tag',
    published: '<h3><small> text; if only time, today\'s date used',
};

function parsePrnewswire(html, baseUrl) {
    const regex = /<a[^>]+href="([^"]+)"[^>]*>\s*<h3[^>]*>([\s\S]*?)<\/h3>\s*<p class="remove-outline">([\s\S]*?)<\/p>/gi;
    const items = [];
    let match;
    while ((match = regex.exec(html))) {
        const link = new URL(match[1], baseUrl).href;
        const h3Html = match[2];
        const smallMatch = /<small[^>]*>(.*?)<\/small>/i.exec(h3Html);
        let published = '';
        if (smallMatch) {
            published = smallMatch[1].replace(/ET/, '').trim();
            if (/^\d{1,2}:\d{2}/.test(published)) {
                const today = new Date().toISOString().split('T')[0];
                published = `${today} ${published}`;
            }
            const d = new Date(published);
            if (!isNaN(d.getTime())) published = d.toISOString();
        }
        let titleHtml = h3Html.replace(/<small[^>]*>.*?<\/small>/i, '');
        const title = titleHtml.replace(/<[^>]*>/g, '').trim();
        const description = match[3].replace(/<[^>]*>/g, '').trim();
        items.push({ title, link, description, published });
        if (items.length >= 10) break;
    }
    return { items, rules: RULES_PRNEWSWIRE };
}

async function scrapeItems(targetUrl) {
    const res = await fetch(targetUrl);
    if (!res.ok) {
        throw new Error(`Failed to fetch: ${res.status} ${res.statusText}`);
    }
    const html = await res.text();

    const parsed = new URL(targetUrl);
    if (/\.prnewswire\.com$/.test(parsed.hostname)) {
        return parsePrnewswire(html, parsed);
    }

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
    const rules = {
        title: 'text content of <a> tag',
        link: 'href attribute of <a> tag',
        description: '',
        published: '',
    };
    return { items, rules };
}

function buildRSS(targetUrl, items) {
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

async function scrapeToRSS(targetUrl) {
    const { items } = await scrapeItems(targetUrl);
    return buildRSS(targetUrl, items);
}

module.exports = { scrapeToRSS, scrapeItems, buildRSS, parsePrnewswire };
