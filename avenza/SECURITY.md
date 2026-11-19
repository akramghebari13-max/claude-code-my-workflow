# Security report

Checked and fixed on 19 November 2026, before going live. Each item below says what I found, what
changed, and how it was tested. **Section 2 lists settings only you can change.** Several
protections live in Supabase's dashboard, not in the code.

This was a careful review of the code and database, not a professional penetration test. Tests
ran against a local copy of PostgreSQL set up like Supabase, not your live project, and against
the app running on this machine.

## 1. Item by item

| You asked for | Result |
|---|---|
| A real login, every password hashed | **Already in place.** Sign-in is Supabase Auth, which stores only a bcrypt hash of each password. The app never sees or stores passwords. **Added:** "Forgot your password?", which was missing (see reset links below). Sign-up now asks for at least 10 characters and rejects obvious passwords. Supabase's own minimum still needs raising (section 2). |
| API keys on the server, never in the browser | **Confirmed.** I scanned the built browser files for every secret the app uses (Stripe, Supabase service key, HMRC, AI). None are there, and no server-only code is bundled. The browser gets only the Supabase address and its *publishable* key. That key is designed to be public: it can do only what the database rules allow, which is the next item. |
| Lock the database so people only see their own data | **Confirmed, tightened and tested.** Every table has row-level security switched on. **Fixed:** the three membership checks could be called by visitors who aren't signed in. They gave nothing away, but now they can't be called at all (migration 0020). **New test** `db-tests/security.test.sql` checks every table and function, so a table added later without protection fails it. A second paying user can't see or change anything in someone else's business: 14 tables, the receipts, and 9 business functions. Anonymous visitors get nothing, not even files. |
| Force HTTPS everywhere | **Added.** Any plain-HTTP request is redirected to HTTPS. Every response now carries HSTS, which tells browsers to use only HTTPS for a year. Tested in unit tests and on the running app. |
| Check every form on the server, not just the page | **Confirmed and tightened.** Every server function that takes input checks it on the server (IDs, dates, lengths, allowed values). Forms that save directly go through database rules. **Fixed:** business, customer, account and profile text fields had no size limit, so a crafted request could store megabytes. The database now refuses oversized text (migration 0021, tested). |
| Block XSS | **Confirmed safe, plus headers.** React escapes everything it displays. There is no raw HTML built from user data; the only raw HTML is an unused chart component. Links and redirects only go to addresses from Supabase, Stripe or HMRC. **Added:** a Content-Security-Policy that blocks plugins, base-tag tricks and other sites framing the app (clickjacking), plus `nosniff`, a referrer policy and a permissions policy. **Update:** the live site now **blocks injected scripts**. Every page load gets a fresh random code (a "nonce"), and only the app's own script files and scripts carrying that code run. Inline handlers such as `onclick="…"` never run. Tested on a production build in a browser: no violations in normal use across 7 pages, and an injected script and an injected `onerror` handler were both blocked. The development server and Lovable's preview add their own scripts, so scripts stay unrestricted there. |
| Safe queries, no SQL injection | **Confirmed safe.** All database access goes through the Supabase client, which sends values separately from the query, or through database functions that do the same. The one hand-built filter only inserts a date the server works out itself. The one piece of dynamic SQL quotes its table names safely and loops over a fixed list. Every privileged database function pins its `search_path`, so it can't be tricked by a look-alike table (tested). |
| Rate-limit the login | **Done by Supabase, which you need to check.** Sign-in, sign-up and reset emails go straight from the browser to Supabase Auth, so the limits have to be set there; app code can't enforce them. Supabase applies per-IP limits by default. Check them and turn on CAPTCHA (section 2). **Added:** a clear "Too many attempts. Wait a few minutes" message instead of a generic error. |
| CSRF protection | **Already in place, confirmed.** Every server function is behind TanStack's CSRF middleware (`src/start.ts`). The app also proves who you are with a token in a header, not a cookie, which is what CSRF attacks exploit. The two public endpoints are protected differently: the Stripe webhook checks Stripe's signature, and the HMRC return page needs a one-time code. **Fixed:** an unused HMRC code stayed valid for 24 hours; it now expires after 15 minutes. |
| Secure session cookies | **There are no session cookies.** Supabase keeps the session as a token in the browser and sends it in a header. Cookie flags (`Secure`, `HttpOnly`, `SameSite`) don't apply. The trade-off: script injected into the page could read that token, which is why the script-blocking policy above matters; it now stops injected scripts from running at all. Moving to a script-proof cookie was assessed and not done; see section 3. Tokens last an hour and are renewed automatically; check those settings in section 2. |
| Password reset links that expire | **Added the reset flow.** The page sends a reset link and gives the same answer whether or not the email has an account, so nobody can use it to find out who's a customer. The link works once. Expired or used links show a clear message. After a reset, every other signed-in device is signed out. Expiry is a Supabase setting, 1 hour by default (section 2). Tested in a browser. |
| Turn off debug mode | **Confirmed.** The production build has no developer tools, no debug logging, no `debugger` statements and no source maps. Server errors reach the browser as a message only, never a stack trace, and the error page shows no technical details. Database error text is mapped to plain messages. |
| Update risky packages, delete unused ones | **Done.** The audit found 29 known vulnerabilities (1 critical, 14 high). **Now 2 moderate**, both in build-time tools (esbuild, minimatch) that never reach the live site. Upgraded packages include the page-data serialiser (`seroval`, a script-injection fix), Vite, Zod (version 3 to 4) and Vitest. **Removed** `@hookform/resolvers` and `date-fns`, which nothing used. Flagged but kept: Capacitor (the store apps), Tailwind (used from CSS), and drizzle-orm/postgres (Lovable's database tooling). All tests pass on the new versions. |
| Scan git history for leaked keys, and replace any found | **Clean: nothing to replace.** Every commit on every branch (330, full history, not a partial copy) was scanned for 14 kinds of secret: Stripe, Supabase, JWTs, AWS, Google, GitHub, OpenAI, Anthropic, Slack, private keys, passwords and database URLs. **None found**, and no `.env` file has ever been committed. The scanner was checked first: it caught all 14 fake keys planted for the test, with no false alarms. This repository only; the Lovable project's own repository wasn't scanned. |

## 2. Settings only you can change (Lovable Cloud → Authentication, or the Supabase dashboard)

- [ ] **URL configuration:** set the Site URL to your live address. Add `https://<your site>/reset-password`, `/auth` and `/dashboard` to the allowed redirect URLs. **Without this, reset links won't work.**
- [ ] **Passwords:** minimum length **10**. Turn on **leaked password protection**, which rejects passwords known from data breaches (a Supabase Pro feature).
- [ ] **Email link expiry:** keep it at 1 hour (3600 seconds) or less. The app tells people the link expires in an hour.
- [ ] **Rate limits:** check the sign-in, sign-up and email limits. Keep the email limit low; it stops your address being used to spam people.
- [ ] **CAPTCHA** (Cloudflare Turnstile or hCaptcha) on sign-up, sign-in and password reset: the strongest protection against password guessing. The sign-in page needs a small change to show it; I can add that once you have the keys.
- [ ] **Sessions:** keep the token lifetime at 1 hour or less, with refresh-token rotation on (both Supabase defaults).
- [ ] **Confirm email** on, and **secure email change** on.
- [ ] Optional: two-factor sign-in (MFA) for accounts that file with HMRC.
- [ ] Apply migrations **0020** and **0021** after the others (see DEPLOY.md).

## 3. Done since, what's left, and what I'd do next

**Done since the first report**
- **Script-blocking policy (nonce):** see the XSS row above.
- **AI usage limits**, enforced in the database (migration 0022). Each person gets, per rolling 24 hours:
  - 300 bank category suggestions,
  - 60 document reads,
  - 100 My Files questions,
  - 60 report questions,
  - and at most 20 AI requests a minute in total.

  Only signed-in subscribers get AI at all, nobody can read or reset their own count, and if the check fails, no AI call is made. Over the limit, bank suggestions are simply not offered, and the other features say the limit resets within 24 hours. *This reverses an earlier decision (migration 0016) that My Files questions are unlimited*; the limits are deliberately generous. Change them in `ai_daily_limit` in that migration.
- **Sign in with Apple**, which Apple requires because the app offers Google sign-in. See DEPLOY.md for switching it on.

**Assessed, not done: script-proof (HttpOnly) cookie sessions.** I measured this before changing anything:
- **The usual library (`@supabase/ssr`) doesn't help.** It keeps the session in a cookie that page scripts can still read, so it's no safer than now.
- **A real script-proof cookie means rebuilding sign-in.** The browser calls Supabase directly 109 times across 27 files, plus file uploads and the Apple/Google/Lovable sign-in. With an HttpOnly cookie, every one of those has to go through a new relay on the server that adds the real session. That touches Lovable's generated sign-in code and needs its own CSRF protection.
- **It can't be tested here,** since there's no real Supabase sign-in in this environment. A mistake would sign every customer out.
- **The main risk is already handled:** stopping injected scripts from stealing the session is what the script-blocking policy now does.

My recommendation is to leave it, or do it as its own project tested against a staging copy of your Supabase project.

**Next steps**
1. **An independent penetration test** before you handle many customers' tax data.
2. **Check Google sign-in inside the store apps.** Google refuses sign-in inside embedded app browsers. Apple and email sign-in are the reliable options there.

## 4. How it was tested

- `db-tests/run.sh`: **179 database checks pass**, including the whole-database security test, the oversized-text test and the AI limits.
- `bun run test`: **173 app tests pass**, including HTTPS redirects and headers, the per-request nonce, password rules, expired reset links and the AI allowance.
- Typecheck, lint and production build are clean.
- In a real browser on the running app:
  - the home page, privacy page and sign-in page load with no errors under the new headers;
  - asking for a reset link works;
  - an expired link shows the right message.
- The security headers were confirmed on live responses.
- `bun audit` shows 2 moderate alerts, both in build-only tools.
- The git history scan covered 330 commits after fetching full history, with the scanner first checked against planted fake keys.
