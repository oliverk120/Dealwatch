const { scrapeItems } = require('../src/scraper');
const { initScrapedDB, saveScrapedArticle } = require('../src/scrapedDb');

async function run(url) {
  initScrapedDB();
  const { items } = await scrapeItems(url);
  for (const it of items) {
    await saveScrapedArticle(
      url,
      it.title,
      it.description || '',
      it.link,
      it.published || null,
    ).catch(() => {});
  }
}

const url = process.argv[2];
if (!url) {
  console.error('Usage: node index.js <url>');
  process.exit(1);
}

run(url)
  .then(() => {
    console.log('Scraping complete');
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
