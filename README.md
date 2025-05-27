# Dealwatch

A simple Node.js application that fetches RSS feeds, computes embeddings using the OpenAI API and categorises articles. Articles and their embeddings are persisted in a SQLite database.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
   (The `better-sqlite3` package requires native build tools.)

2. Copy `.env.example` to `.env` and fill in your OpenAI API key:
   ```bash
   cp .env.example .env
   # edit .env
   ```

3. (Optional) Set `DB_PATH` in your environment to override the default `articles.sqlite` location.

## Running

Start the server:

```bash
npm start
```

## Tests

Run the unit tests with:

```bash
npm test
```

The tests create a temporary SQLite database under `/tmp` and remove it when finished.
