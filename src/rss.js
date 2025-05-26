const { parseString } = require('xml2js');

async function fetchRSS(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch RSS: ${response.status} ${response.statusText}`);
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

module.exports = { fetchRSS };
