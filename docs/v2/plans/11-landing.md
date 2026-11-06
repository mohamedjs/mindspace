# 11 Landing page and GitHub Action

## Goal
A static site in `apps/site` explaining MindSpace, deployed to GitHub Pages by GitHub Actions.

## Content
Hero, how it works (talk, notes, map), Meeting Mode, Bring Your Own AI, pricing from `seed.sql`, download links, FAQ, footer. English and Egyptian-market Arabic with RTL, chosen from the browser language with a manual switch. Use real claims from `README.md` only. No invented testimonials, user numbers or logos.

## Links
One config file `apps/site/src/links.ts` holds iOS, Android, Chrome extension and web app URLs. An empty value renders "Coming soon", never a dead link.

## Pages
Also add `privacy.html` and `terms.html`, marked as drafts needing legal review. The privacy page must truthfully cover audio, third-party AI providers and meeting recording.

## Build
Plain Vite, no framework. Base path comes from `SITE_BASE`, default `/mindspace/`. Must score well on mobile, with no external trackers.

## Action
`.github/workflows/site.yml`: on push to `main` touching `apps/site/**`, plus `workflow_dispatch`. Uses `actions/configure-pages`, `actions/upload-pages-artifact`, `actions/deploy-pages`, with least-privilege permissions, and installs only that workspace.

## Acceptance checks
```
docker compose run --rm dev npm run build -w @mindspace/site
```
Validate the workflow YAML. Check that all internal links resolve.

## Decisions
