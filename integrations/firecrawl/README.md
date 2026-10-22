# Firecrawl for GoldFireDragonBrowser

The official npm SDK `@mendable/firecrawl-js` is installed through the root package.json. Run `npm install` and `npm run firecrawl:test`.

Configure server-only `FIRECRAWL_API_KEY` and `FIRECRAWL_ACCESS_TOKEN` on the deployment. POST `/api/firecrawl` with `Authorization: Bearer <FIRECRAWL_ACCESS_TOKEN>` and JSON `{"url":"https://example.org"}` to scrape a page to markdown. Never embed either token in public HTML or browser JavaScript. The API is deliberately not an anonymous scraping proxy. This integration does not enable the full Firecrawl service, free unlimited crawling, or automatic scanning of every visited page.

For public-browser integration, implement a user-authenticated server session first. The Firecrawl SDK requires an API key and may incur provider charges. Only scrape sites you are permitted to access. Vercel deployment/runtime is not verified.
