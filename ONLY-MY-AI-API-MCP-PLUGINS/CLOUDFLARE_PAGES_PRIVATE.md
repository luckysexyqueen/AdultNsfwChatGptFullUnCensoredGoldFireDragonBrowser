# Private GitHub repository + Cloudflare Pages Free

This project can keep its **GitHub source private** while deploying a **public static dashboard** through Cloudflare Pages. Cloudflare Pages does not run the MCP server: deploy the Worker separately.

## Setup (GitHub Actions / Direct Upload)

1. In Cloudflare dashboard > Workers & Pages > Create > Pages, create a **Direct Upload** project. Note its project name.
2. In Cloudflare, create an API token with **Cloudflare Pages: Edit** permissions for the account.
3. In GitHub repository > Settings > Secrets and variables > Actions, add secrets:
   - `CLOUDFLARE_API_TOKEN`: Cloudflare API token (never commit it).
   - `CLOUDFLARE_ACCOUNT_ID`: Cloudflare account ID.
4. Add repository variable `CLOUDFLARE_PAGES_PROJECT` with your actual Pages project name.
5. Optional: add `MCP_PUBLIC_URL` as a repository variable with the **public HTTPS** Worker endpoint; do not add secrets or API tokens.
6. Open Actions > **Cloudflare Pages dashboard** > Run workflow, or push changes to `main`.

The workflow runs `npm run pages:build` and publishes `dist-pages` using Wrangler. If the Pages project variable is absent, the deployment job skips. Cloudflare Pages serves a public `*.pages.dev` URL even when GitHub source is private.

**Alternative:** Connect the private GitHub repository directly using Cloudflare Pages **Connect to Git**. Configure build command `npm run pages:build`, output directory `dist-pages`, production branch `main`, and optional environment variable `MCP_PUBLIC_URL`. If you use this alternative, disable the GitHub Actions deployment to avoid duplicate deployments. Git-connected Pages projects cannot later switch to Direct Upload.

## Add API specifications later

Upload public-safe OpenAPI YAML or JSON to `specs/` later. Do not commit API credentials or private tokens. A new spec is **not automatically a deployed MCP server** until validated, bundled and the Worker is deployed.

## Preservation / security

No existing user files in `custom/`, `patches/`, or `projects/` are changed by this configuration. The GitHub Pages workflow was replaced with Cloudflare Pages deployment; the existing Workers workflow remains separate. A private GitHub repository does **not** make the Cloudflare Pages site private. Add Cloudflare Access if the site itself must be restricted.

## Repository privacy

Change repository visibility separately in GitHub Settings > General > Danger Zone > Change repository visibility > Private. Verify visibility before uploading sensitive specs.
