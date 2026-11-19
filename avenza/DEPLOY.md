# Going live: checklist

Everything AVENZA needs before real customers pay £6.99 a month. Work top to bottom; each step
says how to check it worked. **None of the work in this folder is live yet.** The site at
pixel-perfect-replay-43351.lovable.app still runs the version from before the export.

## 1. Put this code back into Lovable

This folder was exported from the Lovable project into a different GitHub repository
(`claude-code-my-workflow`, branch `claude/nifty-feynman-p93ms0`). Lovable doesn't watch that repository.

- [ ] In Lovable, open the project → **GitHub → Connect**. Lovable creates its own repository for the project.
- [ ] Copy everything in this `avenza/` folder into the root of that repository, then commit and push. Leave out `node_modules/` and `.env`.
- [ ] Wait for Lovable to sync, then check that the preview shows the single £6.99 plan on the home page.

## 2. Database

Apply the two new migrations, in order. Use Lovable Cloud's SQL editor, or ask the Lovable agent to apply them.

- [ ] `drizzle/migrations/0017_subscriptions.sql`: the subscriptions table.
- [ ] **Decide about existing users before applying 0018.** After 0018, anyone without a trial or paid subscription loses access to their books. Nothing is deleted; it all comes back when they subscribe. To give current users the same 14-day trial, run this once, straight after 0017:
  ```sql
  insert into public.subscriptions (user_id, status, trial_end)
  select id, 'trialing', now() + interval '14 days' from auth.users
  on conflict (user_id) do nothing;
  ```
  These users have no Stripe subscription yet, so at day 14 they will **not** be charged. They stay
  in the app until something changes their row, so either choose a cut-off and set their status to
  `canceled`, or ask them to subscribe.
- [ ] `drizzle/migrations/0018_subscription_enforcement.sql`: the database enforces the paywall.
- [ ] Every person who works in a business (an accountant or staff member) needs their own subscription. Tell anyone this affects.
- [ ] To check: sign in as a user with no subscription. You should land on **Subscribe to continue**, and the dashboard should be empty even if you open `/dashboard` directly.

The database rules can be tested before going live, on any machine with PostgreSQL 16 or newer:
`db-tests/run.sh` (it applies every migration to a throwaway database and runs the subscription,
Bank and My Files checks).

## 3. Stripe (taking payments)

Use Stripe **test mode** first. Switch to live keys only after step 6 passes.

- [ ] Stripe Dashboard → Developers → API keys: copy the **secret key** (`sk_test_…`). In Lovable Cloud → Secrets, add it as `STRIPE_SECRET_KEY`.
- [ ] Developers → Webhooks → **Add endpoint**:
  - URL: `https://<your site>/api/public/stripe/webhook`
  - Events: `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.paused` and `customer.subscription.resumed`
- [ ] Copy that endpoint's **signing secret** (`whsec_…`) into Lovable Cloud → Secrets as `STRIPE_WEBHOOK_SECRET`.
- [ ] Settings → Billing → **Customer portal**: save it once (allow cancelling and updating the card). **Manage billing** uses it.
- [ ] You don't need to create a product or price in Stripe. The app sends £6.99/month (GBP) itself, with the 14-day trial on someone's first subscription only.
- [ ] Settings → Business: set the public business name and statement descriptor that customers will see.

## 4. HMRC (VAT returns and Income Tax updates)

- [ ] HMRC Developer Hub: create an application and subscribe it to the VAT (MTD), Business Details, Self Employment Business and Individual Calculations APIs.
- [ ] Redirect URI: `https://<your site>/api/public/hmrc/callback`
- [ ] Lovable Cloud → Secrets: add `HMRC_CLIENT_ID` and `HMRC_CLIENT_SECRET`. While `HMRC_ENV` is unset, the app uses HMRC's sandbox.
- [ ] Before real customers file: get HMRC production approval for the application, including the fraud prevention header checks. Then set `HMRC_ENV=production` and use the production credentials.
- [ ] Making Tax Digital for Income Tax: HMRC lists software that can file it. Ask HMRC to recognise AVENZA before advertising quarterly updates to sole traders.

## 5. Already provided by Lovable Cloud (just check they exist)

- [ ] `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`: the database. The service role key lets the Stripe webhook save subscriptions.
- [ ] `LOVABLE_API_KEY`: AI category suggestions on the Bank tab, AI receipt reading and the assistant. Without it, Bank suggestions only come from the user's own history.

## 6. Test the whole thing (Stripe test mode)

- [ ] Create a new account. You should be sent to **Subscribe**.
- [ ] Start the free trial with test card `4242 4242 4242 4242`. You should return to the dashboard. In Stripe → Webhooks, the delivery should show as succeeded (200).
- [ ] Create a business, record some money, import a bank CSV and reconcile a line.
- [ ] In **Billing → Manage billing**, cancel immediately (in Stripe, cancel the subscription now, not at period end). Refresh the app: it should be locked. Subscribe again (no second trial): everything should be back.
- [ ] To test a failed renewal, use test card `4000 0000 0000 0341` and advance the subscription with a Stripe test clock. The status goes to past_due and the app locks.
- [ ] Phone: open the site in Safari (iPhone) and in Chrome (Android), add it to the Home Screen, and check that it opens full-screen.
- [ ] Then switch Stripe to live mode. Repeat step 3 with the live secret key, a live webhook endpoint and its signing secret, and the live customer portal.

## 7. App Store and Google Play (optional; the web app already installs on phones)

**Blockers. Both stores will reject the app without these.**
- [ ] **Privacy policy** page on the site, and its link in each store listing. You need one under UK GDPR anyway, since the app holds financial data.
- [ ] **Delete account inside the app.** Apple requires this for any app where people sign up. My Files already has "delete all", but nothing deletes the account and its business records.

Then:
- [ ] If the site moves to its own domain, set `AVENZA_URL=https://<your domain>` before `npx cap sync`. The store apps load the live site from this address.
- [ ] iPhone: you need a Mac with Xcode and an Apple Developer account (yearly fee). Run `npx cap sync ios`, open `ios/App/App.xcworkspace`, set your Team under Signing, then **Product → Archive → Distribute**. The bundle ID is `uk.avenza.app`.
- [ ] Android: you need Android Studio and a Google Play Console account (one-off fee). Run `npx cap sync android`, open `android/`, then **Build → Generate Signed App Bundle**. Keep the signing key safe: it can't be replaced.
- [ ] The store apps show no prices and no payment links. Store rules don't allow pointing people to outside payment unless the app uses Apple's or Google's own billing. People subscribe on the website and then sign in to the app. In the review notes, say so, and give the reviewers a **subscribed** test account.
- [ ] Store listings need screenshots (iPhone 6.9", iPad if supported, Android phone), a description, a support URL and the privacy policy URL.

## 8. After launch

- [ ] Stripe → Webhooks: check now and then that deliveries are succeeding. If they fail, people who paid stay locked out.
- [ ] Remind sole traders of the quarterly deadlines (7 Aug, 7 Nov, 7 Feb, 7 May). The Reports page shows them, but nothing emails anyone yet.
