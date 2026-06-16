# Security, Ethics & Handling

## Purpose

This repository is **defensive security research**. It documents an active marketplace
phishing-as-a-service operation and tracks its infrastructure so that researchers, CERTs, abuse
desks, hosting/registrar abuse teams, and impersonated brands can **detect, report, and take it
down**. It is **not** a tutorial, and it is **not** a working phishing kit.

## How the data was obtained

Everything here comes from **passive OSINT and static analysis of code the kit served publicly**:

- RDAP/WHOIS, Certificate Transparency logs, passive DNS, public internet-wide scanners, HTTP
  response headers, urlscan.io stored response bodies and screenshots, and DNS resolved via public
  resolvers (1.1.1.1 / 8.8.8.8).
- **No operator system was accessed, authenticated to, attacked, or actively probed.** The live
  tracker (`monitor/check.sh`) queries only third-party public APIs (CT logs, urlscan, DoH) — never
  the operators' hosts.

## About `kit-source/` — read this before cloning or redistributing

`kit-source/` contains the phishing kit's **own client-side JavaScript bundles** (decompressed and
raw), recovered from urlscan's public archive. This is **real malicious client code**. Two things to
understand:

- **It is client-side only.** There is **no backend, server, database, builder, or operator console**
  here. Without the operator's hidden server, these bundles **cannot function as a phishing site** —
  they are inert source for reading and signature extraction.
- **The dangerous subsystems are intentionally not reconstructed as runnable code.** The
  readable reconstruction in `kit-analysis/` documents architecture for human reading only and
  **deliberately omits** working payment-capture/validation and cloaking/evasion logic; those
  mechanisms are described at the analytical level in `docs/kit-code-analysis.md` (§7, §9), not
  rebuilt. Reconstruction files are **source documentation, not executable**.

**Do not** deploy, host, repackage, or otherwise operationalise any of this code. Handle
`kit-source/` as you would any malware sample.

## Repository visibility

Because `kit-source/` is live malicious code, treat distribution conservatively:

- **Recommended: keep this repository PRIVATE**, sharing access with named researchers / CERTs /
  abuse desks as needed.
- If you choose to make it public, be aware that GitHub's malware/abuse policies may flag or restrict
  it, and that publishing malicious code carries its own risk and responsibility. That is a deliberate
  decision for the repository owner — **this project does not auto-publish anything.**

## Indicators of real-world subjects

The reports and `indicators.csv` retain operational indicators needed for attribution and takedown —
notably the **operator-contact phone number** (an IOC) and fabricated **lure identities** used by the
kit (clearly labelled as fabricated). These are evidence about the operation, not personal data of any
reporting party. No data identifying a reporting individual is included.

## No secrets

API keys and local target files are excluded by `.gitignore` and stripped by `build-repo.sh`; the
analysis scripts in `tools/` read any keys from local, gitignored files and contain none. If you ever
find a credential committed here, please open an Issue so it can be rotated and purged.

## Reporting

To report related infrastructure or a correction, open an Issue or PR with the indicator and how you
found it — **passive sources only**. See `docs/reporting-and-takedown.md` for abuse/takedown contacts.
