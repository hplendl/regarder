# Contributing

Thanks for helping with Cartouche. The project is a static web app: a configuration file in, a map
viewer out.

## Development

Requirements: Node.js 20 or newer.

```bash
npm install
npm run dev
```

The dev server listens on port 4317. The United States reference configuration loads unless
`public/config.json` exists or the URL has `?config=natural-hazards`.

Before you open a pull request:

```bash
npm run lint
npm run format:check
npm run typecheck
npm test
npm run build
```

`npm run format` rewrites files with Prettier.

## Changes that fit

- A bug in config validation, selection, export, print, or sign-in.
- A documented config option that a deployment actually needs.
- Clearer setup notes for ArcGIS Online or ArcGIS Enterprise, including SAML.

Please keep deployment-specific values out of the repository. New sample layers should be public
services that do not require a login. Do not add a client ID, token, private portal hostname, or
employer-specific data.

## Commit messages

Use a short imperative subject, with a body when the reason is not obvious:

```text
fix: page feature exports past the service record limit
```

## Pull requests

Describe what changed and how you checked it. Screenshots help for layout changes. The CI workflow
runs lint, typecheck, tests, and the production build.
