# Privacy / Конфиденциальность

## English

Milk & Lime theme does not run scripts, read mail or contact external services.
Lime Mail Cards processes displayed message metadata, existing local previews, tags and local contact photos
inside Thunderbird. Tag changes use Thunderbird's native mechanism and may synchronize to the mail server.
Optional nickname matching reads local contact nicknames for configured notification senders. Nicknames are not sent to the logo service. An avatar is not proof of sender identity.

No telemetry, advertising or developer-operated server is used. New installations do not perform automatic
logo lookup. If you enable it, DuckDuckGo receives the correspondent's domain, your IP and normal HTTP
connection information. No full email addresses, names, subjects or bodies are sent by that lookup.
DuckDuckGo is an independent service; its availability and handling of received requests are outside this project's control.

Settings, manually assigned images and bounded logo caches are stored in the extension's local storage.
Previews are held in bounded memory caches, not copied to a new on-disk mail archive.
You can disable online lookup, clear the logo cache and remove image assignments in settings.
Turning lookup off does not itself erase existing cached domains; use the cache reset button if needed.

The Experiment permission grants unrestricted access to Thunderbird and the computer. The behavior above
describes this implementation, not a technical sandbox guarantee. Review the source and trust the distributor.

## Русский

Тема Milk & Lime не запускает скрипты, не читает почту и не обращается к внешним сервисам.
Lime Mail Cards обрабатывает сведения отображаемых писем, локальные превью, метки и фото контактов внутри Thunderbird.
Изменения меток выполняются штатным механизмом и могут синхронизироваться с почтовым сервером.
Сопоставление по псевдониму включается для выбранных адресов уведомлений и использует локальные контакты. Псевдонимы не отправляются сервису логотипов. Аватар не подтверждает личность отправителя.

Телеметрии, рекламы и сервера разработчика нет. В новой установке автоматический поиск логотипов выключен.
При его включении DuckDuckGo получает домен корреспондента, IP и обычные сведения HTTP-соединения.
Полные адреса, имена, темы и текст писем для поиска логотипов не отправляются.
Доступность DuckDuckGo и обработка полученных им запросов не контролируются этим проектом.

Настройки, свои картинки и ограниченный кэш логотипов хранятся локально в расширении.
Превью кэшируются в памяти; новая дисковая копия почты не создаётся.
В настройках можно выключить поиск, сбросить кэш и удалить назначенные картинки.
Выключение поиска само по себе не удаляет кэш доменов — при необходимости используйте сброс кэша.

Разрешение Experiment даёт полный доступ к Thunderbird и компьютеру. Описанное поведение — свойства реализации,
а не ограничения песочницы. Устанавливайте расширение только из доверенного источника.
