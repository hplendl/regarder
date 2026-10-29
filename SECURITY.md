# Security policy

## Supported versions

| Version | Supported |
| ------- | --------- |
| 1.0.x   | Yes       |

## Reporting a vulnerability

Please report security issues privately through the GitHub Security Advisories tab on this
repository ("Report a vulnerability"). Do not open a public issue for an undisclosed vulnerability.

Include what you found, the version, and a way to reproduce it. You should hear back within a week.

## What not to put in the repository

Regarder is a static site. The browser talks to ArcGIS directly.

- Do not commit access tokens, refresh tokens, passwords, client secrets, or SAML certificates.
- An OAuth client ID is a public identifier, but a client ID registered to a private organization
  does not belong in this repository. Keep it in `public/config.json` (gitignored) or in `.env` as
  `VITE_ARCGIS_APP_ID`.
- Do not commit private service URLs, portal hostnames, or layer definitions that are not meant to
  be public. `config.example.json` uses placeholders and public sample services only.

## Application notes

The app treats a configuration file as data. Titles and field names are written as text, not as
HTML. Attribute queries only allow field names made of letters, numbers, underscores, and dots, and
string values are quoted. CSV export prefixes spreadsheet formulas so a text field cannot become an
Excel formula.

OAuth uses the ArcGIS Maps SDK authorization-code flow with PKCE. There is no client secret in the
app. Integrated Windows Authentication requests a portal token with the browser's existing session
and does not handle passwords itself.
