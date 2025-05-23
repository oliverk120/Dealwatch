const https = require('https');

// RSS feed for business news search results
const rssUrl = 'https://news.google.com/rss/search?q=Business%20News&hl=en-US&gl=US&ceid=US:en';

https.get(rssUrl, (res) => {
    let data = '';

    res.on('data', (chunk) => {
        data += chunk;
    });

    res.on('end', () => {
        console.log(data);
    });
}).on('error', (err) => {
    console.error('Error fetching RSS feed:', err.message);
});
