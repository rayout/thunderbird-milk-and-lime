# Lime Mail Cards 0.3.0 — public beta candidate

Read the next step, not just the subject. Local previews, visible native tags,
thread summaries and sender avatars, inside Thunderbird's own message list.
Author: rayout (Alexandr Shapovalov). MPL-2.0.

## Install and remove

Thunderbird 157.x → Add-ons and Themes → gear → Install Add-on From File → `lime-mail-cards-0.3.0.xpi`.
Use native three-line cards. Table and two-line modes are left alone.
The extension includes Milk & Lime interface/content styling; the color theme and Conversations are optional.
It requests full access through its custom Experiment API; install only from a trusted source.
Disable/remove it in Add-ons to restore native rows. Previously assigned native tags remain.
Bundled CSS is registered on activation and removed on deactivation, including from already open windows.
No profile files or legacy CSS preference are changed. Existing user CSS is left alone.

## Features and limits

- Milk & Lime typography, navigation rail, panel styling and green message links.
  Conversations styling applies only when that separate add-on is present.

- Local cached previews; no forced mail download, indexing or decryption.
- Native tag chips, quick assignment and remove buttons. Up to two chips plus a remainder count.
- Tags replace the preview by default; a separate fourth line is optional in settings.
- Collapsed threads show the latest message's summary and the union of thread tags.
  Removing a tag there removes that tag from the thread's messages; expanded rows affect one message.
  The add menu targets one message; native bulk commands remain available.
- Local contact photos, manual address/domain images and optional domain-logo lookup.
  Otherwise initials are shown. Shared notification addresses represent that sender, not an inferred person.
- Only rendered rows are customized. Previews use header caches or the existing local Gloda index;
  if no preview exists, the subject gets more room. A known GitLab wrapper is trimmed from previews.
- No account, folder, language, density, sorting or IMAP-tag-key migration is performed.
  Server-side tag compatibility is separate; see `../docs/zimbra.md`.

## Privacy

New installations default to offline avatars. An explicitly saved prior choice is preserved on upgrade.
Enabling automatic logos sends the displayed correspondent's domain and the client's IP address
to `icons.duckduckgo.com`; email bodies, subjects, names and full addresses are not sent.
Requests omit cookies/referrer and reject redirects. Known personal email providers, local domains
and IP addresses are skipped; the list is not a guarantee that every private organization is recognized.

Locally stored data: display settings, up to 100 user image assignments and up to 128 cached domains.
Positive results expire after seven days, negative results after one day. At most two concurrent requests,
five-second timeout, 256 KiB response limit. Failure falls back to initials. The external endpoint has no SLA.
Local contact images are read without querying remote address books; remote photo URLs are not fetched.
There is no telemetry or separate persistent mail-body cache. Thunderbird itself still performs normal mail sync.
See [privacy policy](PRIVACY.md).

## From the personal build

0.3.0 removes the bundled company logo and company-specific GitLab identity mapping.
Use manual images or local contact photos for portable behavior. It preserves the extension ID,
native tags and stored options. This candidate has not been installed into the working mail profile.

## Verification

Fast suite from repository root: `node --test lime-mail-cards/tests/*.test.cjs tests/*.test.cjs`.
Build: `python3 scripts/build.py`. Packaging uses an explicit runtime allowlist and compares XPI bytes to sources.

Optional browser checks require Chromium, PostCSS and a Thunderbird `omni.ja`:
`THUNDERBIRD_OMNI=/path/to/omni.ja CHROME_BIN=/path/to/chrome node lime-mail-cards/tests/layout.cjs`.
These test geometry, not Gecko rendering. The browser runner uses a disposable profile and `--no-sandbox`;
run only against these trusted local fixtures.

Native test scripts require a dedicated `lime-cards-test-*` profile, `tests/profile-user.js`,
the extension sources copied into `addon-source`, and Thunderbird started with
`--headless --new-instance --marionette --remote-allow-system-access`.
Set `THUNDERBIRD_TEST_PROFILE` to the exact absolute test-profile path. The connector refuses any different profile.
`native-probe.cjs` seeds synthetic messages; `native.cjs` exercises the native adapter.
Other native scenarios have prerequisite fixtures described in their headers; they are not a one-command suite.
Never use a real account/profile for these tests. Native screenshot generation is a separate fixture script.

Windows/macOS, large production mailboxes, screen readers and encrypted mail still need release validation.
Internal APIs/markup can change: only Thunderbird 157.x is declared compatible.
