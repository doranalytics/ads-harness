# Meta Business setup for your own ads harness

Start with reporting. Leave `META_WRITES_ENABLED=0` until you deliberately choose ad actions. This checklist is for assets you control, not onboarding third-party advertisers.

The app calls Meta Graph/Marketing API directly with a System User token. It does not use Meta MCP or Facebook Login OAuth onboarding. A Meta app is required by the System User token issuance path, but the harness needs no app ID or app secret environment variables.

Meta changes menus, eligibility and permission access. Match the assets and permissions below rather than expecting identical menu labels. Setup can be blocked by access levels, verification or review.

## 1. Prepare owned assets

- A Meta Business portfolio with your ad account.
- For owned Instagram media lookup and ads, a professional Instagram account linked to your Facebook Page, both assigned to the portfolio/system user and ad account as applicable.
- Access to manage/assign these assets. Billing is needed before actual delivery.
- For promotion, an existing campaign and ad set with a reviewed audience, objective, placements, budget and destination. This harness does not create them.
- For sales measurement, a working dataset/pixel/conversions setup that reports the outcome you actually care about. The harness does not install it.

Set up the campaign/ad set in Ads Manager and keep the relevant entities paused while preparing them. Do not activate an example ad just to complete this checklist. Meta UI may require an ad to publish an ad set; keep that ad and its parent entities paused and verify their states in Ads Manager.

## 2. Create/select an app and System User

1. In Meta for Developers, create/select an app with the appropriate Marketing API use case and associate it with your business portfolio. Register as a developer if prompted.
2. In Business settings → Users → System users, create/select a system user with suitable asset access.
3. Assign the app and the ad account. For Instagram promotion, assign the Page and Instagram assets needed by the identity/media lookups.
4. Choose **Generate token**, select the app, and request the relevant permissions. Use the expiration options Meta offers. Even a token without a scheduled expiry can be revoked or invalidated.
5. Copy it directly into the app's Settings form privately. Never paste it into chat, screenshots or a source file.

[Meta's token guide](https://developers.facebook.com/documentation/facebook-login/guides/access-tokens) and [System User overview](https://developers.facebook.com/docs/business-management-apis/system-users/overview/) describe app-associated issuance.

## 3. Understand permission scope

| Feature | Needed access |
| --- | --- |
| Campaign/ad set/ad reporting and insights | `ads_read`, with the ad account assigned to the token's system user |
| Paused ad creation and status/budget controls | `ads_management`, with management access to that ad account |
| Business/Page/Instagram identity and owned-media lookup | Applicable `business_management`, `pages_show_list`, `pages_read_engagement`, `instagram_basic` permissions for this Facebook Login based integration, plus assigned Page/Instagram assets |

Start with reporting scope and grant management only if you choose actions. If a permission is absent from token generation, inspect the app's use case, access level and asset assignments. Do not replace that diagnosis with an app secret or a different person's token.

Do not assume every configuration skips review. Other businesses' assets or advanced permissions can require business verification, advanced access and App Review. [Meta's Marketing API app use cases](https://developers.facebook.com/documentation/development/create-an-app/marketing-api-use-cases) are the reference. There is no guarantee of same-day eligibility or approval.

## 4. Connect reporting first

In harness → Settings → Connector keys → Meta Ads, privately save:

| Field | Value |
| --- | --- |
| Access token | Your System User token |
| Ad account ID | Numeric ID or `act_…`, found in Ads Manager's account selector/URL |

Then Connectors → Meta Ads → Sync now. Confirm names, spend, date range and recognized result labels against Ads Manager. Manual Sync is read-only against Meta, regardless of the automation settings.

The server defaults to Marketing/Graph `v26.0`, overridden by `META_GRAPH_VERSION`. Check Meta's currently supported versions if requests return version errors. No live account call is part of the public starter's verification.

## 5. Optional paused ad draft

Add the following to the same Settings form:

| Field | Value |
| --- | --- |
| Promote ad set ID | Existing ad set ID, available as an Ads Manager column |
| Facebook Page ID | The Page connected to the Instagram identity |
| Ad link | The real destination you reviewed |
| Button | A supported CTA such as `LEARN_MORE`, `SHOP_NOW` or `SIGN_UP` |

Check audience, currency, budget, parent status, identity, destination and billing in Ads Manager. The UI uses dollar formatting and the budget conversion assumes two decimal minor units. Only then set server-only `META_WRITES_ENABLED=1` and redeploy your own app.

In Organic, Promote → **Create paused ad**. The post must be an eligible owned post. Inspect the draft in Paid → Paused and Ads Manager. Resume requests a separate spending confirmation. Parent entities must also permit delivery. The harness does not activate parents automatically.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Permission error (#10 / #200) | App use case/access level, token permission and assigned asset access |
| No Instagram identity available | Professional IG → linked Page → business/ad-account/system-user assignments |
| Owned media not found | Post may belong to a collaboration partner, be archived or be unavailable to that token |
| Not eligible for advertising | Meta eligibility, licensed music, collaboration/branded-content restrictions |
| Version error | Supported `META_GRAPH_VERSION`; redeploy after server setting change |
| Schema error / auto_off_started_at missing | Apply missing numbered migrations, especially 0002 and 0003 |
| Live actions are off | Reporting is working; only intentionally set `META_WRITES_ENABLED=1` after review |
| Paused draft not visible | Paid → Paused filter, Ads Manager, then reporting Sync |
| Active ad does not deliver | Parent campaign/ad set, review, policy, billing, audience and scheduling |

System User tokens are credentials. Revoke/replace a leaked token in Meta and update your app privately. Keep the live account out of the public class demo.
