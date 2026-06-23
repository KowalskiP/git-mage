# Техническое задание — GitMage

> Open-source, быстрый и лёгкий Git-клиент на Tauri + Rust + React.
> Уровня GitKraken по фичам, но без облака и без встроенного AI — с оркестрацией внешних кодинг-агентов в worktree.
>
> Версия документа: 0.1 · Дата: 2026-06-22 · Статус: черновик к согласованию

---

## 1. Видение и позиционирование

**Что это.** Десктопный Git-клиент, который даёт визуальный граф истории, полный набор git-операций, интерактивный rebase, работу с worktree, встроенный терминал и оркестрацию AI-кодинг-агентов — в лёгком (~10–25 МБ) приложении с нативной отзывчивостью.

**Чем отличаемся от GitKraken:**

| | GitKraken | GitMage |
|---|---|---|
| Платформа | Electron (~150 МБ) | Tauri + Rust (~10–25 МБ) |
| Git-движок | libgit2 (nodegit) + git CLI | gitoxide + git2-rs + git CLI |
| Облако (Workspaces/Launchpad/Cloud Patch) | да | **нет** (осознанно) |
| Встроенный AI (commit msg, explain, auto-resolve) | да (API из приложения) | **нет** (осознанно) |
| Agent Sessions (внешние агенты в worktree) | да | **да — ключевая фича** |
| Лицензия | проприетарная, пейволл | **open-source, без пейволла** |
| Телеметрия | да | **нет по умолчанию** |

**Четыре ставки (приоритеты, заданные заказчиком):**
1. **Скорость и лёгкость** — обогнать GitKraken по footprint, времени старта и отзывчивости на больших репозиториях.
2. **AI-агенты + worktrees** — параллельные изолированные сессии кодинг-агентов (Claude Code, Codex CLI, OpenCode, Copilot CLI, Gemini CLI).
3. **UX графа и интерактивного rebase** — лучшая визуализация истории и drag-and-drop rebase.
4. **Открытость** — open-source, без пейволла и телеметрии.

## 2. Не-цели (v1)

- Собственный облачный бэкенд, Workspaces, Launchpad/Focus View, Cloud Patches, Code Suggest, Teams/Org.
- Встроенный AI (генерация commit-сообщений, объяснение коммитов, авторазрешение конфликтов через API). AI присутствует **только** как внешние агенты (см. §10).
- Мобильные платформы, веб-версия.
- Платные тарифы, лицензирование, machine-id.

## 3. Целевая аудитория и сценарии

- **Разработчик-одиночка / OSS-контрибьютор** — визуальная история, быстрый commit/branch/rebase, мало ресурсов.
- **Опытный гит-пользователь** — keyboard-first, интерактивный rebase, worktrees, терминал под рукой.
- **Пользователь AI-агентов** — гоняет несколько параллельных сессий Claude Code/Codex по разным задачам в изолированных worktree, мониторит их статус из одной панели.

Ключевые сценарии: открыть репо → увидеть граф → застейджить и закоммитить → переключить/смержить/перебейзить ветку → создать worktree и запустить агента → следить за статусом → влить результат.

---

## 4. Технологический стек

| Слой | Выбор | Обоснование |
|---|---|---|
| Оболочка | **Tauri 2** | Лёгкий, нативный webview, Rust-бэкенд, авто-апдейтер, мультиокно |
| Бэкенд | **Rust** (tokio async) | Скорость, безопасность, доступ к gitoxide/git2 |
| Git (чтение) | **gitoxide (`gix`)** | Очень быстрый обход истории/статуса/диффов — основа ставки на скорость |
| Git (запись, fallback) | **git2-rs (libgit2)** | Зрелые commit/branch/merge/reset/cherry-pick там, где gix ещё неполон |
| Git (сложные операции) | **системный git** (shell-out) | fetch/push/pull, интерактивный rebase, hooks, LFS, submodules, gitflow, gc, sparse/shallow |
| Frontend | **React 18 + TypeScript** | Экосистема, готовые компоненты |
| State | **Zustand + Immer + TanStack Query** | Лёгкая альтернатива Redux; тяжёлые эффекты — на стороне Rust |
| Стили | **Tailwind CSS + Radix UI primitives** | Лёгкие доступные примитивы, кастомные темы |
| Diff/редактор | **CodeMirror 6** | Легче Monaco при тех же возможностях (альтернатива — Monaco, см. §15 риски) |
| Терминал | **xterm.js** + Rust `portable-pty` | Стандарт для встроенного терминала |
| Граф | **canvas 2D** (layout считается в Rust) | 60 fps + виртуализация; WebGL как опция при необходимости |
| File watch | Rust crate **`notify`** | Слежение за `.git` и рабочим деревом |
| Иконки | **lucide** | Лёгкие SVG |

## 5. Архитектура

### 5.1 Процессная модель
```
┌─────────────────────────────────────────────┐
│  Tauri Core (Rust)                            │
│   • git engine (gix / git2 / git CLI)         │
│   • repo manager, file watcher (notify)       │
│   • pty host (portable-pty)                   │
│   • agent supervisor (процессы агентов)       │
│   • async task pool (tokio)                   │
└───────────────┬───────────────────────────────┘
                │ Tauri IPC (commands + events)
┌───────────────┴───────────────────────────────┐
│  WebView (React)                               │
│   • граф (canvas), WIP/commit, diff (CodeMirror)│
│   • терминал (xterm), агент-дашборд            │
│   • Zustand store, TanStack Query              │
└───────────────────────────────────────────────┘
```

### 5.2 Git-движок (гибридная стратегия)
- **gix** — горячие read-пути: статус рабочего дерева, обход графа, листинг refs, diff, blame. Цель — субсекундный отклик на репозиториях с сотнями тысяч коммитов.
- **git2-rs** — write-операции, где gix ещё неполон: commit, ветки, merge, reset, cherry-pick, tag.
- **системный git** — операции с сетью и побочными эффектами: fetch/push/pull (вся аутентификация), интерактивный rebase (через `GIT_SEQUENCE_EDITOR`), hooks (через `core.hooksPath`), LFS, submodule update, gc, gitflow, sparse/shallow. Бандлим известную версию git как fallback, но по умолчанию предпочитаем системный (лёгкость).

> Принцип: **читаем нативно (gix) ради скорости, пишем безопасно (git2), а сложное доверяем настоящему git** ради корректности. Тот же гибрид, что у GitKraken (libgit2 + git), но на Rust.

### 5.3 IPC-контракт (примеры)
- **Commands** (request/response): `repo_open(path)`, `repo_status(id)`, `graph_load(id, range)`, `stage(id, paths)`, `commit(id, msg, opts)`, `branch_create`, `checkout`, `merge`, `rebase_start`, `worktree_create`, `agent_session_start`, …
- **Events** (стрим): `graph:chunk`, `status:changed`, `op:progress`, `terminal:data`, `agent:status`, `watcher:fs-change`. Долгие операции выполняются как tokio-задачи и стримят прогресс событиями.

### 5.4 Перехват git (как у GitKraken)
- `GIT_ASKPASS` → свой бинарь/хэндлер → креды у приложения (или из системного credential helper / SSH-агента).
- `GIT_SEQUENCE_EDITOR` → drag-and-drop интерактивный rebase превращается в `git rebase -i`.
- `core.hooksPath` → обёртка над хуками: запускает пользовательский хук и парсит его вывод/код возврата для показа в UI.

### 5.5 Хранилище
- Реестр репозиториев, вкладки, профили, кэш графа/метаданных, состояние agent-сессий — в **SQLite** (`rusqlite`, режим WAL): ACID-атомарность (нет «битого» файла при краше), частичные обновления и индексы вместо перечитывания всего файла на каждое изменение.
- Пользовательский конфиг, который удобно править руками и держать в git (keybindings, тема), — в **TOML/JSON**.
- Кэш графа/метаданных — в памяти + дисковый слой в той же SQLite на репозиторий.

---

## 6. Функциональные требования

Приоритеты по MoSCoW: **M** must / **S** should / **C** could (v1).

### 6.1 Репозитории и оболочка
- **M** Open / Init / Clone (https, ssh; ввод кред через askpass/credential helper).
- **M** Вкладки (открыть, закрыть, переоткрыть закрытую, переключение `Ctrl/⌘+1..9`, `Ctrl+Tab`).
- **M** Reпозиторий-менеджер (список, группы, favorites `⌘⌥1..9`, alias, close all).
- **S** Профили (author name/email, набор настроек, копирование между профилями).
- **M** Открыть в: внешнем редакторе, терминале, файловом менеджере.
- **M** Deep links `gitmage://repo/...`.

### 6.2 Граф коммитов (killer-фича, детали в §9)
- **M** Рендер графа на canvas с виртуализацией; 60 fps на 100k+ коммитов.
- **M** Колонки: message, author, sha, date, ahead/behind, refs (ветки/теги/remote).
- **M** Настройка видимости элементов строки (message/description/author/sha/date/tree/changes).
- **M** Smart branch visibility, hide/solo ветки и ремоуты.
- **M** Навигация клавиатурой (`j/k`, стрелки, топологическая `⇧j/⇧k`), jump-to-commit, поиск/фильтр коммитов (`⌘F`), фильтр по автору/ветке/дате/тексту.

### 6.3 Рабочая копия и коммит
- **M** WIP-вид: список изменённых файлов, статусы, untracked/ignored.
- **M** Stage/unstage файла, **hunk** и **отдельных строк**; stageAll/unstageAll, discard.
- **M** Commit / amend, сообщение + description, шаблоны; commit (`⌘⏎`) / commit all (`⌘⇧⏎`).
- **M** Diff рабочей копии (inline / split / hunk-режимы) на CodeMirror; распознавание бинарных файлов и кодировок; корректные line-endings и `diff.noprefix`.

### 6.4 Ветки, refs, операции
- **M** Create (`⌘B`) / checkout / rename / delete (local/remote/all), set upstream, fast-forward.
- **M** Merge, **Rebase** (обычный), **Cherry-pick** (1 и N), **Revert**, **Reset** (soft/mixed/hard), **Squash**.
- **M** Tags: lightweight и annotated, create here, push/delete на remote.
- **M** Remotes: add/edit/remove, push (to/all), pull, fetch (`⌘L`), prune.
- **S** Shallow clone и Sparse checkout (формы настройки).

### 6.5 Интерактивный rebase (killer-фича)
- **M** Отдельная панель + drag-and-drop в графе.
- **M** Действия: pick `p`, reword `r`, drop `d`, squash, fixup, move up/down, edit.
- **M** Реализация через `GIT_SEQUENCE_EDITOR`; корректная обработка прерванного rebase, continue/abort.

### 6.6 Конфликты и merge (без AI)
- **M** Встроенный 3-way merge tool (`diff3`-стиль), разрешение по hunk/строке, save & resolve (`⌘S`).
- **M** Поддержка внешних merge/diff-инструментов (настраиваемые команды).
- **S** Проактивная детекция конфликтов с целевой веткой (локально, без облака).

### 6.7 Worktrees (база для агентов)
- **M** Create / open (в т.ч. в новой вкладке) / lock / unlock / prune / remove.
- **M** «Remove worktree and delete branch», переключение на главный worktree перед удалением активного.
- **S** Наследование настроек вида (hidden/solo refs, collapsed folders) от исходного репо.

### 6.8 Stash, Submodules, LFS, GitFlow
- **S** Stash: create (all/staged), apply, pop, delete, сообщение.
- **S** Submodules: add/update/remove, авто-обновление после git-действий, статусы.
- **C** Git LFS: init, tracking patterns, push/pull/checkout/prune, правка `.gitattributes`.
- **C** GitFlow: init, start/finish feature/release/hotfix, настройка префиксов.

### 6.9 История, diff, blame
- **M** File history по коммитам; **blame/annotate**.
- **M** Diff коммита, сравнение коммита с рабочей копией, restore file from commit.

### 6.10 Hooks и подпись
- **S** Обёртка над hooks (показ вывода/кода в UI), выбор hooks-директории.
- **S** Подпись коммитов: GPG (OpenPGP) и SSH-подпись; выбор/генерация ключа, copy public key.

### 6.11 Встроенный терминал
- **M** xterm.js + pty (Rust `portable-pty`); WebGL-рендер.
- **M** Мульти-сессии: отдельная сессия на worktree, авто-переключение при смене worktree.
- **S** Drag-and-drop файлов/текста, minimize, kill сессии, dimming при потере фокуса.

### 6.12 Командная палитра
- **M** Fuzzy Finder (`⌘P`): команды, checkout ветки, open/edit/create/delete файла, blame, действия.
- **M** Overlay горячих клавиш (`⌘/`); полностью настраиваемые keybindings (JSON).

### 6.13 Интеграции (опционально, не «облако GitKraken»)
- **C** GitHub / GitLab: просмотр и создание Pull/Merge Request, статусы, merged-pills, привязка PR к ветке/worktree.
- **C** Issue-трекеры (GitHub/GitLab Issues, Jira) — просмотр, создание ветки из issue.
- Реализуются через сторонние API, независимо от какого-либо собственного бэкенда.
- **Аутентификация (M6): Personal Access Token.** Пользователь сам создаёт токен в настройках GitHub/GitLab и вставляет его в GitMage; токен хранится в системном keychain (Keychain / Credential Manager / libsecret). Ни OAuth App, ни серверной инфраструктуры регистрировать не нужно — ни сейчас, ни в M6. Минимальные scopes: GitHub — `repo` (или fine-grained PR/issues read-write); GitLab — `api`. Отсрочка интеграций = **сейчас в GitHub/GitLab ничего заводить не надо.**

### 6.14 Настройки и темы
- **M** Панели: General, UI Customization, External Tools, Commit, Editor, Hooks, Signing, Terminal, Agents, Keybindings.
- **M** Темы (тёмная/светлая + кастомные), зум 50–200%.
- **M** Авто-fetch interval, auto-prune, default branch name, autocrlf, longpaths.

---

## 7. Нефункциональные требования

| Метрика | Бюджет |
|---|---|
| Размер установщика | ≤ 30 МБ |
| Холодный старт | ≤ 1 с; тёплый ≤ 500 мс |
| Память (типичный репо) | ≤ 200 МБ |
| Открытие репо + статус (средний репо) | ≤ 100 мс |
| Загрузка графа 100k коммитов | первый экран ≤ 300 мс, скролл 60 fps |
| Refresh после fs-изменения | ≤ 100 мс до отрисовки |

- **Кросс-платформенность:** macOS, Windows, Linux (единый код, платформенные keybindings/menus).
- **Безопасность:** креды только через системный credential helper / SSH-агент / askpass; никакого хранения паролей в открытом виде; проверка host key; поддержка прокси (http/https/socks).
- **Приватность:** телеметрия выключена по умолчанию (опциональный opt-in crash-репортинг).
- **Доступность:** навигация с клавиатуры, ARIA-роли (Radix), контраст тем.
- **i18n:** строки вынесены в каталог локализации с самого начала (как у GitKraken).
- **Офлайн-first:** все локальные операции работают без сети.

---

## 8. Модель данных (основные сущности)

`Repo { id, path, name, alias, lastOpened, favorite }` ·
`Tab { id, repoId, kind }` ·
`Profile { id, name, authorName, authorEmail, settings }` ·
`Remote { name, url, fetchRefspec }` ·
`Ref { name, kind: branch|remote|tag, target, upstream, ahead, behind }` ·
`Commit { sha, parents[], author, committer, summary, body, refs[] }` ·
`GraphRow { sha, lane, color, edges[], refs[] }` ·
`WorktreeSession { id, repoId, path, branch, base, locked, agent? }` ·
`AgentSession { worktreeId, agent, pid, status, startedAt, setupLog }` ·
`Stash`, `Submodule`, `Setting`, `Keybinding`.

---

## 9. Граф коммитов — детальная спецификация (killer-фича)

**Pipeline:**
1. **Сбор данных (Rust/gix):** обход коммитов в нужном диапазоне (incremental, по чанкам), без блокировки UI.
2. **Layout (Rust):** назначение lane (колонки) каждому коммиту, цвета веток, рёбра (прямые + изгибы Безье для перескоков колонок). Алгоритм: классический column-assignment (как в `git log --graph`), оптимизированный под стрим и стабильность колонок при подгрузке.
3. **Стрим в UI:** события `graph:chunk` с готовыми `GraphRow`.
4. **Рендер (canvas 2D):** виртуализация по строкам (рисуем только видимое окно + буфер); строка графа синхронизирована со строкой списка коммитов. Узлы — кружки, рёбра — линии/кривые, refs — пилюли.
5. **Интеракции:** hover/selection, multi-select, drag-and-drop коммита → контекстные действия (merge/rebase/cherry-pick onto), jump-to-commit, поиск с подсветкой.

**Требования к производительности:** инкрементальная подгрузка, стабильность колонок, 60 fps скролл, отсутствие «прыжков» при дозагрузке истории.

---

## 10. Agent Sessions — детальная спецификация (killer-фича)

> AI в продукте присутствует **только** как внешние кодинг-агенты, запускаемые в изолированных worktree. Никаких прямых API-вызовов из приложения.

### 10.1 Модель
**Agent Session = worktree + запущенный процесс агента + pty/терминал.** Сессии параллельны и изолированы.

### 10.2 Поддерживаемые агенты (авто-детект по установке)
Claude Code, Codex CLI, OpenCode, Copilot CLI, Gemini CLI. Для каждого — настраиваемые CLI-аргументы.

### 10.3 Жизненный цикл «New Agent Session»
1. Выбор **base branch** (searchable) и агента.
2. Создание worktree с новой веткой.
3. Выполнение **setup-команд** (из Preferences > Agents: `npm install`, build, копирование `.env` и т.п.).
4. Запуск процесса агента в pty этого worktree.

### 10.4 Мониторинг статуса (live)
Статусы: `Running` · `Thinking` · `Using tool` · `Needs response` · `Awaiting approval` · `Waiting for input` · `Error` · `Idle/Done`.

Механизм (по убыванию надёжности):
- **Хуки/плагины агента** — например, Claude Code поддерживает hooks: ставим небольшой хук-скрипт, который пишет статус в файл/сокет, за которым следит Rust-супервайзер (так это делает GitKraken «Claude Code Plugin» / «OpenCode Plugin»). Установка/удаление хуков — из Preferences > External Tools.
- **Парсинг вывода pty** — эвристики по выводу для агентов без хуков.
- **Состояние процесса** — минимальный фолбэк (alive/exited).

### 10.5 Дашборд (Agents view в левой панели)
- Карточка на worktree: ветка, uncommitted changes, ahead/behind, связанный PR, **статус агента**.
- Сортировка/фильтр сессий (по статусу/ветке/изменениям/PR), three-dot actions.
- Запуск сессии из контекстного меню существующего worktree.
- Очистка: remove worktree (+ опционально ветку); индикатор удаления; переключение на главный worktree перед удалением активного.

### 10.6 Архитектура (Rust «agent supervisor»)
Отдельный модуль управляет дочерними процессами агентов: спавн, переменные окружения, рабочая директория = worktree, сбор статуса, корректное завершение/kill, переживание перезапуска UI (процессы трекаются по pid + метаданные в SQLite).

---

## 11. Дорожная карта (милстоуны)

| M | Название | Содержание |
|---|---|---|
| **M0** | Каркас | Tauri+React skeleton, repo open/init, реестр репо, статус через gix, file watcher, настройки, темы |
| **M1** | Граф + commit | Граф (Rust layout + canvas + виртуализация), WIP-вид, stage hunk/line, commit/amend, diff (CodeMirror) |
| **M2** | Ветки и операции | branches/checkout/rename/delete, merge/rebase/cherry-pick/revert/reset, tags, fetch/pull/push, remotes, askpass |
| **M3** | Rebase + конфликты | drag-drop интерактивный rebase, 3-way merge tool, внешние tools |
| **M4** | Worktrees + Agent Sessions | worktree-менеджмент, agent supervisor, мониторинг статуса, дашборд *(ключевой релиз)* |
| **M5** | Терминал + палитра + остальное | embedded terminal (pty+xterm, мульти-сессии), fuzzy finder, stash, submodules, LFS, gitflow, signing |
| **M6** | Интеграции (опц.) | GitHub/GitLab PR & issues |
| **M7** | Полировка | perf-тюнинг, packaging, авто-апдейт, accessibility, i18n, релиз |

Минимально полезный публичный релиз: **после M4** (граф + полный git + rebase + worktrees + агенты — это и есть уникальное ядро).

---

## 12. Лицензирование и распространение

- **Лицензия: GPL-3.0-or-later.** GitMage позиционируется как открытая альтернатива проприетарному GitKraken; главный риск — что код заберут, закроют и продадут. Копилефт GPL-3.0 это запрещает: любой форк/дистрибутив обязан оставаться открытым. Прецедент — редактор Zed (GPL-3.0 по той же причине). Совместимо с зависимостями: Tauri/gix/git2/CodeMirror/xterm — пермиссивные (MIT/Apache), их можно включать в GPL-проект; системный `git` вызывается как отдельный процесс (заражения нет); libgit2 — GPLv2 с linking exception.
  - *Альтернатива:* **Apache-2.0** — если приоритет максимальное распространение и вклад компаний важнее защиты от проприетарных форков (ценой того, что закрытый форк станет легальным).
  - *Опция:* переиспользуемые крейты (например, движок layout графа) вынести под Apache-2.0/MIT, а само приложение оставить под GPL-3.0.
  - **AGPL не нужен** — это десктоп без серверной части, сетевая клауза AGPL смысла не имеет.
- **Распространение:** GitHub Releases + Tauri updater; macOS (notarization), Windows (signing), Linux (AppImage/deb/rpm).
- **Без телеметрии** по умолчанию; опциональный opt-in crash-репортинг.

---

## 13. Структура репозитория (предлагаемая)

```
git-ui/
├─ src-tauri/        # Rust: команды, git-движок, pty, agent supervisor, watcher
│  ├─ src/git/       # gix / git2 / cli-обёртки
│  ├─ src/graph/     # layout-алгоритм
│  ├─ src/agents/    # supervisor + детект агентов + хуки статуса
│  ├─ src/pty/       # терминал
│  └─ src/ipc/       # tauri commands/events
├─ src/              # React: граф (canvas), панели, diff, терминал, дашборд
│  ├─ features/      # graph, commit, branches, rebase, worktrees, agents, terminal
│  ├─ store/         # zustand
│  └─ ipc/           # типизированные обёртки над invoke/events
├─ docs/             # этот SPEC.md и далее
└─ ...
```

---

## 14. Маппинг на GitKraken (что берём / что выкидываем)

**Берём:** гибридный git-движок, граф на canvas + виртуализация, перехват через `GIT_ASKPASS`/`GIT_SEQUENCE_EDITOR`/`core.hooksPath`, тяжёлый git в отдельном процессе с IPC, file watcher, worktrees как первоклассная сущность, мульти-сессионный терминал, fuzzy finder, профили, темы, i18n с первого дня.

**Выкидываем (v1):** облако/Workspaces/Launchpad/Cloud Patches/Code Suggest/Teams, встроенный GitKraken-AI, лицензирование/пейволл/телеметрию.

**Переосмысляем:** Electron→Tauri, nodegit→gix+git2, Monaco→CodeMirror, redux-saga→Rust-side эффекты + Zustand.

---

## 15. Риски и открытые вопросы

| Риск | Митигация |
|---|---|
| Незрелость write/rebase/merge в **gitoxide** | Фолбэк на git2-rs и системный git; gix только на read-путях v1 |
| **CodeMirror vs Monaco** — хватит ли возможностей diff | Прототип diff на M1; Monaco как запасной вариант (ценой веса) |
| **Статус агентов** без официальных хуков | Слой деградации: хуки → парсинг pty → process-alive |
| Кросс-платформенный **pty/подпись (GPG/SSH)** | Ранние интеграционные тесты на всех ОС |
| **Бандлить git** или полагаться на системный | По умолчанию системный (лёгкость), бандл как fallback |
| Стабильность колонок графа при стриме | Алгоритм layout с детерминированным назначением lane |

**Решено:** нейминг — **GitMage**; лицензия — **GPL-3.0-or-later**; хранилище — **SQLite** (+ TOML для пользовательского конфига); интеграции GitHub/GitLab — отложены в **M6**.

**Остаётся:** bundled vs системный git (по умолчанию системный); CodeMirror vs Monaco — решаем по прототипу M1.
