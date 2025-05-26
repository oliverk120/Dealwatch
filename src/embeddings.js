const https = require('https');

function createEmbedding(text, callback) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        callback(new Error('OPENAI_API_KEY environment variable not set'));
        return;
    }

    const options = {
        hostname: 'api.openai.com',
        path: '/v1/embeddings',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
        },
    };

    const req = https.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => {
            body += chunk;
        });
        res.on('end', () => {
            try {
                const result = JSON.parse(body);
                callback(null, result);
            } catch (e) {
                callback(e);
            }
        });
    });
    req.on('error', (err) => callback(err));

    req.write(
        JSON.stringify({
            input: text,
            model: 'text-embedding-ada-002',
        }),
    );
    req.end();
}

function createEmbeddingPromise(text) {
    return new Promise((resolve, reject) => {
        createEmbedding(text, (err, result) => {
            if (err) {
                reject(err);
                return;
            }
            if (!result || !result.data || !result.data[0]) {
                reject(new Error('No embedding data'));
                return;
            }
            resolve(result.data[0].embedding);
        });
    });
}

module.exports = { createEmbedding, createEmbeddingPromise };
