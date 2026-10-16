# Milk & Lime advanced styles 0.1.7 — optional

Lime Mail Cards now includes these styles and loads/unloads them automatically.
This manual archive is only for installations WITHOUT Lime Mail Cards. Do not install both copies.
The canonical sources are in lime-mail-cards/styles; the build exports the same files here.
They customize internal Thunderbird/Conversations markup and can break after updates.
Target: Thunderbird 157.x; prior local validation used Conversations 4.3.16 on Ubuntu.
The extension does not remove any previously installed manual CSS.

## Install

1. Find the active profile through Help → Troubleshooting Information → Profile Folder.
2. Save drafts and quit Thunderbird. Back up existing `chrome/userChrome.css` and `chrome/userContent.css`.
3. If custom CSS already exists, merge deliberately; do not overwrite it. Otherwise copy the two supplied CSS files into the profile's `chrome` directory.
4. In Thunderbird's Config Editor, enable `toolkit.legacyUserProfileCustomizations.stylesheets` and enable Milk & Lime (or Light).
5. Restart Thunderbird. For the reference layout, select vertical layout and native three-line cards yourself.

## Revert

Quit Thunderbird and restore only the two backed-up CSS files (or remove the two added files if none existed).
Do not restore the whole profile or preferences just to undo styling. Restart.
Removing the theme or extension alone does NOT remove these styles.

## Boundaries

The styles affect panel typography, spacing, navigation icons and the Conversations reader.
Ordinary links use a dark green with underlines; some author-defined colors remain.
Known GitLab template links have a more specific override. Arbitrary email designs are not guaranteed.
Native tag/status colors and message data are not rewritten. High-contrast modes have dedicated guards,
but a real screen-reader/platform audit is still needed. Conversations is not bundled or patched.
