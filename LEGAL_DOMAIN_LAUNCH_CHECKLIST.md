# ULTOR ESPORTS – Legal & Custom-Domain Launch Checklist

Stand: 10.11.2026

## Current verified deployment state

- GitHub repository: `UltorStrate/Ultor-Esports-2.0`
- Production/default branch at review time: `main`
- Separate preparation branch: `feature/legal-domain-launch`
- Cloudflare Worker name: `ultor-esports-2-0`
- Worker entry point: `src/worker.js`
- Current public Worker URL: `https://ultor-esports-2-0.yoriba03.workers.dev`
- Current `BETTER_AUTH_URL` in `wrangler.jsonc`: the same `workers.dev` URL
- Static assets: repository root, bound as `ASSETS`; `run_worker_first` is enabled.
- Data services: Cloudflare D1 (`ultor-cms`) and R2 (`ultor-media`).

The `main` branch has not been changed or deployed as part of this preparation.

## Legal pages

- `/imprint/index.html` already exists on `main`. Its operator and contact details are prefilled. The operator identity, business designation, postal address and email must be reconfirmed by the operator before launch.
- `/privacy/index.html` did not exist on `main`, although the homepage footer already links to `/privacy/`.
- A first privacy-policy draft was added on `feature/legal-domain-launch`. It is marked noindex and explicitly identifies itself as an internal draft. Do not publish this draft as final until all checks below are completed.
- Both pages use the existing ULTOR legal styling in `/imprint/imprint.css`.

### Legal facts and decisions to confirm

1. Confirm that the operator details in the current imprint remain accurate.
2. Confirm legal form / business status, commercial-register entry if any, and VAT ID or other business ID if one has been issued. Only applicable details belong in the imprint.
3. Confirm whether a telephone number is available for direct contact and whether the existing email route is monitored.
4. Decide and verify the required consumer-dispute-resolution wording for the actual business and shop model. Do not add an obsolete EU ODR-platform link.
5. Check whether a data protection officer is required, including the employee-count threshold and any special processing circumstances.
6. Review Cloudflare's actual contracting entity, signed Data Processing Addendum, sub-processors, international-transfer safeguards and enabled products in the account.
7. Set and document actual log, CMS-account, audit-log and test-order retention/deletion periods. Do not invent periods.
8. Confirm whether the Google Fonts CDN requests are retained. Prefer self-hosting the Barlow Condensed and Inter font files; if external requests remain, document the actual legal basis, recipients and transfer safeguards.
9. Test the deployed site in a clean browser profile and record actual cookies, localStorage, third-party scripts and network destinations.
10. The public contact page currently contains external social links rather than a contact form. If a form or newsletter is added, update the privacy policy before activating it.
11. The cart currently uses browser localStorage key `ultor_shop_cart_v1`. Verify the actual user-facing behavior and whether it is strictly necessary for the requested cart function.
12. The checkout code is test-only: real payments and Printful order submission are explicitly disabled. If production checkout, payment, shipping or fulfillment is activated later, update the legal information before activation.

## Custom-domain connection (Cloudflare)

The operator confirmed on 10.11.2026 that `ultor-esports.com` is the intended registered domain and that they have access to its DNS management. The project is prepared to use `https://ultor-esports.com` as the canonical hostname. Cloudflare zone activation and registrar nameserver delegation have not been independently verified from the repository.

Once confirmed:

1. The preparation branch now contains Wrangler Custom Domain routes for `ultor-esports.com` and `www.ultor-esports.com`, with `previews_enabled: false`. It sets `BETTER_AUTH_URL` to `https://ultor-esports.com` and redirects `www` to the apex hostname in the Worker.
2. Cloudflare requires an active zone for the domain. On deployment, the Custom Domain configuration should create the corresponding DNS records and TLS certificates. Do not add competing A/CNAME records manually.
3. Verify the Cloudflare zone shows **Active** and that the authoritative nameservers at the registrar are exactly the two nameservers assigned in the Cloudflare zone. If not active, finish activation before deploying the custom-domain routes.
4. The preparation branch changes Better Auth's trusted-origin list to use `env.BETTER_AUTH_URL` and preserves the existing `workers.dev` origin for rollback/testing. `BETTER_AUTH_SECRET` remains a secret and must never be committed.
5. Merge the reviewed preparation branch and deploy only after Cloudflare confirms the zone is active and legal sign-off is complete. Re-check environment variables and bindings after deployment.

## Post-deployment smoke test

- [ ] Canonical hostname loads the homepage over HTTPS.
- [ ] Alternate hostname redirects to the chosen canonical hostname (if configured).
- [ ] `/imprint/` and `/privacy/` return the final approved pages.
- [ ] All footer links resolve correctly.
- [ ] `/admin/login.html` loads and existing CMS login works on the new hostname.
- [ ] CMS registration/approval, session persistence and logout work on the new hostname.
- [ ] News, teams, partners and shop APIs work.
- [ ] R2 media loads correctly.
- [ ] Checkout remains disabled or test-only until real payment and fulfillment are configured.
- [ ] No worker configuration, secret, database identifier, or internal API file is publicly exposed.
- [ ] Browser network/storage review and legal review are complete.

## Current stop conditions

The exact domain and DNS-account access have been confirmed by the operator. The following checks remain before calling the site fully launch-ready:
- Confirm that the `ultor-esports.com` zone is **Active** in Cloudflare and the registrar delegation matches its assigned nameservers.
- Confirm any existing MX, TXT, SPF, DKIM, DMARC and verification records remain intact; do not change nameservers without copying the current DNS zone and preserving mail records.
- Reconfirm the operator details in the imprint and resolve any applicable register, VAT/business-ID, consumer-dispute and MStV statements.
- Review Cloudflare's actual DPA/sub-processors/international-transfer terms and set/document actual log and CMS deletion periods.
- Either self-host Google Fonts or finalize the privacy notice for the external fonts requests.
- Complete browser storage/network audit, shop test and CMS login checks on the custom domain.
- The privacy page is currently a noindex working draft until the above privacy-specific checks have been confirmed.
