const http = require("http");
const https = require("https");
const { parseString } = require("xml2js");

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
        })
        .on("error", (err) => {
            res.writeHead(500, { "Content-Type": "text/plain" });
            res.end("Error fetching RSS feed: " + err.message);
        });
}).listen(3000, () => {
    console.log("Server running at http://localhost:3000/");
});
