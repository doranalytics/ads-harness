# Meta Business setup

What you're building: one **business portfolio** that owns your Instagram
account, your Facebook Page and an ad account. Inside it go one campaign with
one **promote ad set**, and one **System User** whose token lets the app read
the ad account and create ads in it.

Meta moves menus around often. If a name below doesn't match what you see,
search for it in Business settings; the pieces are the same.

## 1. Make Instagram a professional account, linked to a Page

1. In the Instagram app: **Settings → Account type and tools → Switch to
   professional account**, and pick **Business** (Creator works too).
2. You need a Facebook Page for the business; create one if you don't have
   one. Connect it in Instagram: **Edit profile → Page → Connect**, or from the
   Page's settings under **Linked accounts → Instagram**.

Meta runs Instagram ads through the Page, which is why the Page is needed.

## 2. Business portfolio with the three assets

1. Go to [business.facebook.com](https://business.facebook.com) and create a
   business portfolio, if you don't already have one.
2. Open **Settings** (Business settings) and add each asset you own under
   **Accounts**:
   - **Pages → Add** → your Facebook Page
   - **Instagram accounts → Add** → your Instagram account
   - **Ad accounts → Add** → your existing ad account, or **Create a new ad
     account** (set the currency and timezone carefully; they can't be
     changed later)
3. On the ad account: **Payment methods** → add a card. Nothing runs without
   one.

## 3. (Recommended) Meta pixel on your site

For **cost per result** to mean **cost per sale**, Meta has to see sales.
In **Events Manager → Connect data sources → Web**, create a pixel/dataset
and put it on your site. Shopify, Squarespace, Wix and WordPress all have a
Meta/Facebook integration that does this for you. Check that **Purchase**
events arrive before you run sales ads.

Skip this and you can still run Traffic ads. "Results" will then be link
clicks.

## 4. The campaign and the promote ad set

In [Ads Manager](https://adsmanager.facebook.com), under your ad account:

1. **Create → campaign objective.** Pick the one that matches what you want:
   - **Sales** — optimise for purchases (needs the pixel from step 3)
   - **Leads** — sign-ups and enquiries
   - **Traffic** — visits to your site
2. **Ad set** (this is the "promote ad set" the app drops posts into):
   - **Conversion location: Website**, and for Sales pick your pixel and the
     **Purchase** event
   - **Budget: daily**, an amount you're comfortable with. Every promoted post
     shares it, and you can change it later from the app's Paid tab.
   - **Audience**: your call
   - **Placements**: Advantage+ placements, or Manual with **Instagram** feed,
     Stories and Reels included
3. **Ad**: Ads Manager won't publish an empty ad set, so give it one ad.
   The easiest is **Use existing post** → pick an Instagram post. Publish.
   You can pause or delete that ad later; the ad set stays.

Write down two IDs:

- **Ad account id**: in the Ads Manager URL, `act=1234567890`. Enter it as
  `act_1234567890` (or just the number).
- **Ad set id**: Ads Manager → **Ad sets** tab → the ad set's row. Turn on
  the **Ad set ID** column (Columns → Customize columns), or open the ad
  set and copy the number after `selected_adset_ids=` in the URL.

## 5. Page id

On the Facebook Page: **About → Page transparency** shows the Page ID. You
can also find it in Business settings → Accounts → Pages, with the Page
selected.

## 6. The System User and its token

The app acts as a **System User**: a non-human user in your business whose
token doesn't expire when someone changes their password.

1. **An app for the token.** Meta's token screen asks you to pick an app, so
   create one first. In Business settings → **Accounts → Apps → Add → Create
   a new app ID**. This opens developers.facebook.com, which asks you to
   register as a developer once (free, a few clicks). Choose the **Business**
   app type, give it any name, and connect it to your business portfolio. You
   don't need to add products or submit it for review: it only signs the
   token.
2. **Business settings → Users → System users → Add.** Name it (e.g.
   `harness`) and set the role to **Admin**.
3. With the system user selected, **Assign assets**:
   - your **ad account** → full control (Manage ad account)
   - your **Page** → full control
   - your **Instagram account** → full control
   - the **app** you just made
4. **Generate new token**:
   - App: the one from step 1
   - Expiration: **Never**
   - Permissions: `ads_management`, `ads_read`, `business_management`,
     `pages_show_list`, `pages_read_engagement`, `instagram_basic`
5. Copy the token now; Meta only shows it once.

## 7. Paste it into the app

**Settings → Connector keys → Meta Ads**:

| Field | Value |
|---|---|
| Access token | the token from step 6 |
| Ad account id | `act_…` from step 4 |
| Promote ad set id | the ad set id from step 4 |
| Facebook Page id | from step 5 |
| Ad link | the page the ads send people to (product, shop, booking) |
| Button | `SHOP_NOW`, `LEARN_MORE`, `SIGN_UP`, `BOOK_NOW`, `ORDER_NOW`, `CONTACT_US`… |

**Save**, then **Connectors → Meta Ads → Sync now**. Your campaign should
appear in the Paid tab. Then go to Organic and press **Promote to paid** on a
post.

## When something says no

The app shows Meta's own error text. The usual ones:

| Message | Fix |
|---|---|
| *is not an Instagram identity this token can use* | The Instagram account isn't connected to the Page, or isn't assigned to the system user. Steps 1, 2 and 6.3. |
| *Not in @you's owned media* | The post is a collab created by the other account, or it's archived. Only posts your account authored can run. |
| *not eligible for advertising* | Usually licensed music or branded content. Meta won't run that post. |
| *(#200) permission* or *(#10) …* | The token is missing a permission or an asset. Generate a new one with everything in step 6.4. |
| *Payment* / account disabled | Fix billing in the ad account's Payment settings. |
| Ads stay **in review** | Normal for a few minutes, sometimes longer. Rejections show in Ads Manager with Meta's reason. |
