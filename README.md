# Onlywork.com

Static landing page for **Onlywork** — a contributor-style, remote-friendly
marketing site inspired by the information architecture of public pages like
[Atlas Capture](https://www.atlascapture.io/). This repo contains **original**
copy and styling; it is not affiliated with Atlas Capture.

## Contents

| File        | Purpose                          |
| ----------- | -------------------------------- |
| `index.html` | Page structure and content      |
| `styles.css` | Layout, theme, responsive rules |
| `script.js`  | Small UX helper (footer year)   |

## Preview locally

Open `index.html` in your browser, or serve the folder:

```bash
python -m http.server 8080
```

Then visit `http://127.0.0.1:8080/`.

## Create the GitHub repository

1. On GitHub: **New repository** → name it (for example `onlywork` or
   `onlywork-com`) → **Public** → **Create repository** (leave “Add a README”
   unchecked so you can push this history cleanly).
2. In this folder on your machine:

   ```bash
   git remote add origin https://github.com/<your-username>/<repo>.git
   git push -u origin main
   ```

3. Enable Pages (next section).

## Publish on GitHub Pages

This repository includes a [GitHub Actions](.github/workflows/pages.yml)
workflow that deploys **only** `index.html`, `styles.css`, and `script.js` to
**GitHub Pages** on every push to `main` (so documentation and workflow files
are never published as static assets). If you add images or other public files,
update the `cp` step in that workflow.

1. Create a new repository on GitHub and push this project (see **Push** below).
2. In the GitHub repo: **Settings** → **Pages** → **Build and deployment** →
   set **Source** to **GitHub Actions** (not “Deploy from a branch”).
3. Push to `main`. The **Actions** tab will show the deploy job; when it
   succeeds, Pages shows your live URL (usually
   `https://<user>.github.io/<repo>/`).

### Custom domain (e.g. onlywork.com)

1. **Settings** → **Pages** → **Custom domain** → enter `onlywork.com` (or
   `www.onlywork.com`).
2. Add the DNS records GitHub shows for your apex or subdomain.
3. Commit a file named `CNAME` at the repo root whose **only line** is your
   hostname, for example:

   ```text
   www.onlywork.com
   ```

4. Wait for the DNS check to pass and **Enforce HTTPS** when available.

## Repository layout

```text
.github/
  dependabot.yml      # Keeps Actions versions reasonably fresh
  workflows/
    pages.yml         # Static deploy to GitHub Pages
.editorconfig         # Basic formatting defaults
.gitattributes        # Normalizes line endings for contributors
.gitignore
CONTRIBUTING.md
LICENSE
README.md
SECURITY.md
index.html
styles.css
script.js
```

## License

MIT — see [LICENSE](LICENSE).
