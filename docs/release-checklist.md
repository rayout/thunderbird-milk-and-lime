# Release gate — beta source repository

- Author: rayout (Alexandr Shapovalov). GitHub account rayout verified; public repository thunderbird-milk-and-lime approved.
- Scope: standalone theme and extension with built-in CSS; no bundled Conversations.
- Source license: MPL-2.0. Corporate artwork removed; navigation glyphs in bundled CSS are inline paths from the prototype, provenance should be confirmed before distribution.
- Build/test results: see VALIDATION.md after the local run.
- Review English/Russian listing drafts and synthetic-data screenshots with the author before publication.
- Repository name, public visibility and description approved. A packaged release and store submission remain separate steps.
- Do not publish backup folders, profiles, real-mail screenshots or the parent workspace.
- Standalone theme/extension captures and disable/re-enable passed on clean Thunderbird 157 profiles. Upgrade from older installed builds still needs a dedicated test.
- Windows/macOS, real screen-reader testing and large/encrypted mailboxes remain unverified; do not advertise them as tested.
- Do not broaden compatibility without testing the relevant Thunderbird release.
- Review full-access Experiment code before distributing the extension.
- Confirm current ATN submission policy before upload: custom Experiment APIs currently block new submissions except accepted published API drafts.
  Source: https://github.com/thunderbird/webext-linter/blob/main/assets/registry.yaml (checked 2026-10-16).
- Ordinary theme submission is separate; approval by ATN is not guaranteed.
- Do not market the optional advanced-CSS screenshot as the standalone theme.
