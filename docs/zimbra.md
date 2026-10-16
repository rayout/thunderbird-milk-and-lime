# Zimbra tags / Метки Zimbra

Tag presentation and IMAP synchronization are separate layers. If a tag disappears, test the same
message with Thunderbird's native tag menu and check the web client. The extension does not repair
or rename server-side tags automatically.

In one deployment, shared ASCII tag names/keys (such as `important`, `deadline`) with localized
Thunderbird display labels resolved rejected legacy keys. This is deployment evidence, not a universal
Zimbra fix. Existing assignments and saved-search criteria need a coordinated migration and backups.
Do not copy another user's tag IDs or edit a running Thunderbird profile.

Отображение меток и синхронизация IMAP — разные задачи. Сначала проверьте ту же метку на том же письме
через штатное меню и веб-клиент. В одном проверенном окружении помогли общие ASCII-ключи и русские
подписи в Thunderbird, но это не универсальное исправление. Расширение не мигрирует ключи и фильтры.
