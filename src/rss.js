const { parseString } = require('xml2js');

async function fetchRSS(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch RSS: ${response.status} ${response.statusText}`);
    }
    const data = await response.text();
    return new Promise((resolve, reject) => {
        // Some feeds include unescaped characters like '&'.
        // Use non-strict parsing so xml2js can handle them.
        parseString(data, { strict: false }, (err, result) => {
            if (err) {
                reject(err);
                return;
            }
            resolve(result);
        });
    });
}

module.exports = { fetchRSS };
