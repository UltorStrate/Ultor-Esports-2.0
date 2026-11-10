# ULTOR ESPORTS – Website Launch & Legal Checklist

Stand: 10.11.2026

## Current release state

- Repository: `UltorStrate/Ultor-Esports-2.0`
- Production branch: `main`
- Latest privacy/site release: [PR #4](https://github.com/UltorStrate/Ultor-Esports-2.0/pull/4), merged on 10.11.2026
- Release commit: `9fb6189b8495c81ef89f51df994e78182108a057`
- Worker: `ultor-esports-2-0`
- Worker entry point: `src/worker.js`
- Safe public hostname: `https://ultor-esports-2-0.yoriba03.workers.dev`
- Wrangler explicitly keeps `workers_dev: true`.
- Canonical custom domain is not yet configured. Keep the workers.dev address enabled until the custom domain is verified.

## Public website and legal pages

- `/imprint/` exists and identifies Yorik Bastuck as operator under the business designation ULTOR ESPORTS.
- The imprint now also names Yorik Bastuck as responsible for journalistic-editorial content under § 18 Abs. 2 MStV.
- `/privacy/` is present in `main`, indexed (`index, follow`), and no longer marked as an internal draft.
- The supervisory authority is identified as BayLDA with its official website link; its postal address is intentionally not repeated.
- External Google Fonts requests have been removed from public pages. System font fallbacks are used.
- The ULTOR favicon is referenced across the public pages and CMS pages.
- The public contact page currently uses social links rather than a contact form.

## Shop – current test-only state

- The catalogue and shop UI remain accessible.
- The technical test checkout remains configured as test mode.
- Test orders are stored in D1 as unpaid / unfulfilled / on hold.
- Payments remain disabled.
- Customer test orders and shipping addresses are not submitted to Printful.
- The Printful connection is currently used for authorized product/variant catalog synchronization only.
- Do not enable real checkout, payments, order fulfillment, shipping labels or customer-order submission until the commercial/legal prerequisites and the final service-provider privacy information have been completed.
- The privacy notice must be updated before real checkout is activated.

## Custom domain – remaining Cloudflare task

The operator confirmed that `ultor-esports.com` is the intended registered domain and that DNS management access is available. The previous Wrangler Custom Domain attempt failed with Cloudflare API error 10082 (“Can't infer zone from route”) because the Worker account could not identify an active DNS zone for the domain. The Worker screenshot showed no custom domains and no routes.

1. In the same Cloudflare account that contains Worker `ultor-esports-2-0`, add `ultor-esports.com` as a website / DNS zone.
2. Review the DNS records Cloudflare imports or suggests. Preserve all existing mail and verification records, especially MX, TXT, SPF, DKIM, DMARC and domain-verification records.
3. If Cloudflare instructs a nameserver change, update the registrar to the two nameservers shown on the Cloudflare zone only after the current DNS records have been checked and copied. Do not replace mail records with only the website records.
4. Wait for the Cloudflare zone status to show **Active**.
5. Only after the zone is Active, add Worker Custom Domains for:
   - `ultor-esports.com` (canonical)
   - `www.ultor-esports.com` (redirects to the apex host)
6. Set Worker variable `BETTER_AUTH_URL=https://ultor-esports.com` and ensure both hostnames are trusted by Better Auth.
7. Keep `workers_dev: true` until both custom domains, HTTPS and CMS login work. Then decide whether to keep workers.dev as a backup.
8. After deployment, test the homepage, `/imprint/`, `/privacy/`, favicon, CMS login/session/logout, news, teams, partners, shop catalogue, APIs and R2 media.

Do not add Wrangler `custom_domain` routes while the zone is not Active. That previously disabled the workers.dev URL and caused a deployment failure.

## Remaining legal/account-specific confirmations before declaring the public site fully legally reviewed

The public privacy notice now reflects the current code paths, but the following matters depend on facts and account settings that cannot be verified from the repository alone:

- Confirm the operator's legal status and whether any commercial-register, business-identification or VAT-ID details apply. If applicable, update the imprint.
- Confirm the operator's current postal/contact details and that the listed email is monitored.
- Confirm the person named under § 18 Abs. 2 MStV is in fact the editorially responsible person for the site's news content.
- Review the current Cloudflare customer agreement, accepted Data Processing Addendum, sub-processors and international-transfer safeguards in the actual Cloudflare account.
- Review the actual D1 and R2 location/jurisdiction settings. The Wrangler file itself does not establish an EU-only data location.
- Set and apply concrete retention/deletion periods for CMS accounts, activity logs and test orders. The notice currently describes purpose-based criteria; the internal operating process must follow them.
- Recheck cookies, browser storage, third-party network requests and any Cloudflare security challenges on the deployed site in a clean browser session.
- Determine whether any additional VSBG/consumer information is required for the actual legal and business model. The present shop is not accepting real orders.

## Important release boundary

PR #4 changed the legal pages and removed external Google Fonts links. It did not modify the CMS modules, login flow, user permissions, D1 schema, R2 binding, shop APIs, test checkout, Printful synchronization, payment logic or Worker routes.
