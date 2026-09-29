# ArcEngine — roadmap публичного AI-native набора

> **Правила работы с задачами (заявка → готово, аренда 24 ч):**
> 1. **Сначала заявка (claim), потом работа.** До начала работы над задачей отметь её как `[~]` с датой и временем взятия (UTC) и исполнителем отдельным коммитом и запушь в репозиторий, только после этого приступай к её выполнению.
> 2. **Готово = протестировано + отмечено в коммите.** Когда задача выполнена и протестирована (все проверки зелёные), отметь в роадмапе `[x]` с результатом и укажи в сообщении коммита, что задача сделана.
> 3. **Аренда 24 часа.** Задачи, которые взяты в работу (`[~]`), но за сутки не сделаны, нужно брать заново в работу (обновить дату/время и исполнителя), так как задача явно не будет закончена прежним исполнителем и не должна блокировать работу.

Цель: публичный MIT-проект — набор для 3D-игр в браузере, в котором ИИ-агенты (Claude Code, Codex, Cursor и любые, читающие стандартные точки входа) являются первоклассными пользователями: находят скиллы без инструкций, правят сцену через семантический API и проверяют себя headless-рендером.

`ArcEngine (MIT)
├── AI-native semantic API + edit transactions (фаза B)
├── deterministic headless + visual verification (фаза B)
├── agent skills: свои + движковые  (фаза A)
├── CLAUDE.md / AGENTS.md / agent-manifest.json (фаза A)
├── свой editor                   (есть)
├── свой scene format             (есть)
├── свой zero-npm build           (есть)
└── PlayCanvas Engine 2 (MIT)
    └── движковые скиллы @playcanvas/skills (MIT, вендор)
`

## Текущее состояние (после PR #1–#5, main)
  * Движок перенесён с Babylon.js 9.26 на PlayCanvas 2.22 (`libs/playcanvas.min.js`, UMD, WebGL2): toon-чанки `StandardMaterial` (цветные тени, полосы, rim), чернильные рёбра, inverted-hull контур, слои WORLD/OVERLAY/ACTOR, тени directional light.
  * Координатное соглашение: мир движка — зеркало карты по X (левосторонний PlayCanvas против правосторонней карты); игровая математика осталась в координатах карты (скилл `world3d`).
  * Фаза A (база, PR #3): sync-skills и точки входа агентов (`.claude/skills/`, `.agents/skills/`, `.cursor/rules/`, `AGENTS.md`), вендор `@playcanvas/skills` **v0.3.0**, NOTICE/README.
  * Фаза B (база, PR #4): `Scene.spawn/move/remove/query/inspect/follow/manifest` + `js/core/SceneSchema.js` (GENERATED), контрактные тесты, headless-сессия агента.
  * Фаза C (база, PR #5): `create-arcengine` (стартеры kit/empty/survival, npm bin, zero deps).
  * Ниже — ДЕЛЬТА к базе: фаза A+ (`agent-manifest.json`), фаза B+ (транзакции `Edit.*`, `Kit.*`/`UI.*`/`Asset.*`, `Scene.seed`, профили check `--render/--visual/--all`, visual gate).

## Лицензии и атрибуция
Компонент  | Лицензия  | Использование
--- | --- | ---
ArcEngine (этот репозиторий)  | MIT (`LICENSE`)  | основа
PlayCanvas Engine 2  | MIT  | `libs/playcanvas.min.js`, бинарно в репозитории
create-playcanvas  | MIT  | образец упаковки скиллов и скаффолда (фаза A/C), код не копируется
@playcanvas/skills  | MIT  | вендор engine-скиллов (фаза A), версия пинится
Вендоренные части сохраняют свои LICENSE-файлы рядом (`libs/PLAYCANVAS_LICENSE`, `claude/skills/vendor/playcanvas/LICENSE`); упоминания — в NOTICE (фаза A). Ничего GPL/proprietary в цепочке нет; публичная публикация набора совместима со всеми тремя лицензиями при сохранении copyright-строк и текста лицензий.

## Фаза A — мульти-агентная упаковка скиллов
Перед упаковкой скиллов фиксируется машинный контракт агента: `agent-manifest.json` содержит версию API, карту скиллов, точки входа и команды проверки. `CLAUDE.md` остаётся человекочитаемой картой, а `agent-manifest.json` — источником машиночитаемых возможностей.
Канон скиллов остаётся в `claude/skills/` (имена без точки: веб-загрузка GitHub не пропускает dot-папки). Появляется генерация копий для агентов:
  * `tools/sync-skills.mjs`: из канона + вендора собирает `.claude/skills/` (Claude Code, нативный Skill-tool), `.agents/skills/` (Codex, Cursor, прочие по emerging-конвенции create-playcanvas), `.cursor/rules/arcengine.mdc`, корневой `AGENTS.md` (кросс-агентная точка входа: инварианты, проверки, карта скиллов).
  * Вендор `@playcanvas/skills` v0.3.0 (MIT, уже в main) — engine-слой дополняет скиллы набора (графика, эффекты, соглашения движка); свои скиллы приоритетнее при коллизиях имён.
  * `tools/check.mjs`: шаг «копии синхронны канону» (по образцу CI create-playcanvas); правка канона без regen — провал проверки.
  * Инвариант 9 уточняется: «Skill-инструмент теперь видит скиллы; CLAUDE.md остаётся картой для человека и агентов без нативной поддержки скиллов».
  * NOTICE + раздел «AI-native» в README/CLAUDE.md.
Критерий готовности: `node tools/check.mjs --all` зелёный; Claude Code обнаруживает скилл через Skill-tool; Codex-совместимый агент находит `AGENTS.md` и `.agents/skills`; headless-рендер игры и редактора без ошибок; `agent-manifest.json` соответствует канону скиллов и API.

## Фаза B — семантический AI-API, манифест сцены и проверяемый агентский цикл
Агент не должен знать `pc.*`: поверх кита появляется тонкий декларативный слой (`js/AgentAPI.js` или подобное):
  * `Scene.spawn(model, opts)` (контракт из main: model — литерал `assets/…`, opts — kind/x/y/h/heading/rot/scale/clip), `Scene.move/remove/query`, `Scene.inspect()` — диагностика (обёртки Debug3D.lint/bench + состояние объектов). `Scene.inspect()` поддерживает фильтры по id/kind/области и возвращает состояние, предупреждения и ошибки.
  * Операции сцены и игры идемпотентны и сериализуемы в журнал правок. Для составных AI-правок появляется `Edit.begin/add/update/remove/commit/rollback`, чтобы частично применённая правка никогда не оставляла сцену в неопределённом состоянии.
  * Помимо `Scene.*` появляется минимальный generic API игрового цикла, UI и ассетов без обращения к `pc.*`: `Kit.*` (state, frame-хуки, time/dt/fps — имя `Game.*` сознательно не используется: каждая скаффолднутая игра определяет собственный `class Game` в `js/Game.js`, глобальный `Game` столкнулся бы с ней), `UI.query/patch/add/remove/get` (расширение канонического `UI`), `Asset.preload/list/loaded`.
  * Машинно-читаемый манифест сцены: JSON-схема поверх `Objects.js`/`UILayout.js`/`Constants.js` (имена, типы, диапазоны из `_utils/editor/schema.js`), чтобы агент валидировал правки до рендера; редактор и игра читают тот же канон.
  * Детерминированность: `Scene.seed(n)` задаёт PRNG агентских операций (`Scene.random()`); стартеры пользуют только его, не `Math.random`. Рельеф сеется константой `TERRAIN_NOISE_SEED` (правится редактором) и от `Scene.seed` не зависит — visual-тесты фиксируют viewport 1280x720 и seed сценария.
  * Проверка строится в несколько уровней: unit/contract tests без 3D + headless-сценарий «агент правит сцену → запуск → console/errors → Debug3D.lint» + screenshot/visual smoke checks для камеры, видимости и критичных UI.
  * `tools/check.mjs` получает профили `--types`, `--tests`, `--skills`, `--render`, `--visual`, `--all`; базовый `check` остаётся быстрым, а `--all` является обязательным релизным gate. `--render`/`--visual` вызывают `tools/headless-gate.mjs`, которому нужен puppeteer: это dev-only зависимость окружения проверки (node_modules/NODE_PATH), а не рантайма набора; без неё gate возвращает код 2 с инструкцией, и `--all` в релизном окружении обязан упасть.
Критерий готовности: пример сессии агента (spawn 10 врагов, поставить клип, изменить UI, прогнать lint и visual smoke) проходит headless без ручных правок `js/`; в случае ошибки составная правка откатывается.

## Фаза C — публичный скаффолд `create-arcengine`
  * CLI по образцу create-playcanvas, но без Vite/npm в рантайме набора: копия набора + скиллы + стартеры (пустая сцена, top-down survival-заготовка из примера Game.js); флаги `--no-skills`, `--starter`.
  * Рантайм-инвариант не меняется: ноль runtime npm-зависимостей, классические `<script>`, `libs/playcanvas.min.js` локально; npm допустим только в инструментарии скаффолда. Инструментарий может использовать npm cache/`npx`, если это явно задокументировано.
  * Релиз-канал: zip-архив сборки (есть) + npm-пакет скаффолда (опционально).

## Не-цели (осознанные отказы)
  * Не переезжаем на Vite/TypeScript-шаблоны create-playcanvas: ниша набора — vanilla JS без сборки; TS остаётся проверкой по JSDoc.
  * Не поддерживаем WebGL1: PlayCanvas 2 — WebGL2-only.
  * Не форкаем движок: только вендоринг релизных файлов (`libs/`), апгрейд = новая пара файлов
    * прогон check/рендера.
  * Не дублируем редактор PlayCanvas Editor: свой редактор — часть ДНК набора (пишет код-файлы, а не бинарные сцены).

## Риски и их страховки
Риск  | Страховка
--- | ---
апстрим PlayCanvas ломает якорь чанков toon-шейдера  | `ArcToon.register` молча деградирует до обычных теней + тест-маркер в check; версия движка пинится файлами в `libs/`
расходимость канона и копий скиллов  | шаг sync-проверки в `tools/check.mjs` + `agent-manifest.json`
агент ломает сцену через прямой `pc.*`  | API gate: игровой код не требует `pc.*`; lint/grep/check и контрактные тесты ловят обход semantic API
частично применённая AI-правка  | транзакции `Edit.commit/rollback` + журнал операций
недетерминированный headless/visual test  | фиксированный seed, viewport и набор ассетов; шум/процедурность привязаны к seed
ошибка, незаметная по lint  | screenshot/visual smoke + console/error gate
лицензионная чистота вендора  | LICENSE-файлы рядом с вендором + NOTICE; версии пинятся коммитом

## Порядок работы
Каждая фаза — отдельная ветка и PR в `main`; до мерджа: для обычной разработки `node tools/check.mjs`, для release/PR gate `node tools/check.mjs --all`; headless-рендер игры и редактора без ошибок консоли, visual smoke зелёный, скиллы/CLAUDE.md/`agent-manifest.json` обновлены в том же PR. В PR должен быть приложен краткий evidence: команды, seed/viewport и результаты проверок.

## Сверка внешнего ревью (2026-09-19) и фазы D/E

Ревью писалось без свежего checkout, поэтому часть «отсутствующего» уже была в main или в
PR #6–#8. Статусы пунктов ревью:

| Пункт ревью | Статус |
|---|---|
| 2, 3, 4, 6 (semantic API, transactions, inspect, seed) | в main/PR #4, #7: `Scene.*`, `Edit.*`, `Scene.journal()`, `Scene.seed/random` |
| 4 расширенный (фильтры inspect: kind/name/area, entities/camera/warnings) | PR #9 |
| 5 (schema contract) | в main: `js/core/SceneSchema.js` + валидация до кадра (PR #4, #7) |
| 7 (headless gate + машинный отчёт) | PR #7 (gate), PR #9 (`--json=FILE` + скриншоты в отчёте) |
| 8 (visual assertions: assertVisible/assertInFrame/assertPosition/capture) | PR #9 (`Debug3D.assert*`, `capture()`) |
| 17 (agent-manifest.json) | PR #6 |
| 18 (cross-platform CLI) | PR #8 (`tools/arc.mjs`, `.bat`/`.sh`) |
| 10 (map/render coordinates) | **сделано**: `World3D.mapToRender/renderToMap` (алиасы над `Coords.toEngine(toMap)`) + scope-гейт `tests/coords-mirror.test.mjs` — зеркало выводится только в `Coords.js`/`World3D.js`, ручное `-x` в игре валят тесты (apigate тоже запрещает) |
| 19 (security editor server) | PR #9: аудит + hardening (dot-paths 403, 400 bad JSON, 413 везде, drain без обрыва соединения) + `tests/editor-security.test.mjs` |
| 20 (операционный журнал) | в main/PR #7: `Scene.journal()` |
| 1, 9, 11, 12, 13, 14, 22, 23, 24 (split World3D, editor-as-client, FBX→GLB, ECS, physics, input, perf budget, license scanner) | фазы D/E ниже; perf budget (23) — **сделано**, см. «Фаза D» |

Порядок ревью («semantic до упаковки») принят ретроспективно как принцип: упаковка (A/C)
ушла первой только потому, что semantic-база (B) была следом; все будущие фазы идут в
порядке API → verification → AI → scaffold.

### Фаза D — semantic extensions и machine-ops
  * `Input.*`: `isDown(action)`, `mousePosition()`, `pointerWorld()` — единый контракт ввода
    для игр и агентов вместо `addEventListener` в каждой игре.
  * ✅ `js/core/Physics.js`: пространственные запросы без pc.* — `raycast()`, `lineOfSight()`,
    `overlap(area)`, `near()`, `distance(a, b)` / `distance3()`, `blocked(x, z)`
    (сделано 2026-09-29 @arena-playtest; `tests/physics.test.mjs`, 9 случаев).
    Слой читает только `WorldMap` — тот же источник, на котором настаивает
    `WorldMap.heightAt` («3D — это вид, логика не спрашивает высоту у рендерера»), поэтому
    запросы ведут себя одинаково во всех трёх профилях. Точечные запросы карта уже давала
    (`blocked`, `heightAt`, `zonesAt`, `triggersAt`), а `findPath` отвечал «как дойти»;
    не хватало ровно луча и области — того, что нужно выстрелу, видимости и подбору.
    Шаг марша по умолчанию — ПОЛТАЙЛА, и это не мелочь: два соседних отсчёта не могут
    перешагнуть стену в один тайл, поэтому тонкая стена на пологой диагонали не
    пропускается, а точка попадания приходится на её ближний край, а не на середину
    (тест краснеет, если шаг сделать полным тайлом). Отсутствующая карта бросает
    исключение вместо «не заблокировано» — иначе ИИ молча проходил бы сквозь стену;
    элемент без читаемой позиции попадает в `skipped`, а не считается «снаружи».
    Файл внесён в `CODE_FILES`, `PIPELINE` и `AGENT_FACING`, поэтому его покрывают и гейт
    совпадения списков, и запрет `pc.*` в агентском коде.
  * `World3D.mapToRender/renderToMap` как публичный API + тест, что engine-слой — единственное
    место с зеркалированием. — **сделано**: `mapToRender(m)`→`[px,py,pz]`, `renderToMap(px,py,pz)`→`{x,y,h}` (алиасы
    над `Coords`, тот же ответ по построению); `tests/coords-mirror.test.mjs` (консистентность + scope-гейт).
  * `Debug3D.stats()` машинно: fps, frame time, draw calls, triangles, materials, entities,
    textures; `node tools/check.mjs --performance` с budget-файлом
(`{ maxDrawCalls, maxTextureMB, maxTriangles }`) — агент видит цену своих 300 деревьев. — **сделано**:
    `Debug3D.stats(view?, {frame?})` (бюджетные строки drawCalls/textureMB + triangles из цензи; fps/frameMs
    только репортятся — software GL), `Debug3D.budgetBreaches(stats, budget)` (чистый вердикт «drawCalls N > M»),
    `tools/perf-budget.json` (калиброван по замеру сэмпла: 235 draws/кадр, 163390 triangles, 5.4 MB → лимиты
    700/400000/64, ~1.5x), гейт `check.mjs --performance` (в `--all`, JSON-отчёт `performance`); юниты
    `tests/debug3d.test.mjs`, каноны `claude/skills/{world3d,verify}`.
  * ✅ `tools/notices.mjs`: сканер цепочки лицензий → генерация `THIRD_PARTY_NOTICES.md`;
    проверка в `check.mjs` (сделано 2026-09-28 @arena-playtest). Канон — `NOTICE`; сканер
    обходит вендоримые корни `libs/` и `claude/vendor/`, требует, чтобы каждый файл был покрыт
    объявленным путём (точным или каталогом — `claude/vendor/playcanvas/` накрывает поддерево),
    проверяет существование лицензионных файлов и свежесть сводки. Шаг `цепочка лицензий (drift)`
    живёт во флаге `--skills`, то есть в дефолтном прогоне `check.mjs`. Первая же находка
    сканера: `libs/simplex-noise.d.ts` лежал в репозитории, но в `NOTICE` объявлен не был.

### Фаза E — архитектурная глубина
  * Разделение `World3D` на Renderer / Scene / Camera / Lighting / Picking + RenderStyle
    (Toon / Outline / Shadows): агент меняет lighting, не трогая lifecycle рендера.
  * Editor как API-клиент Arc API: человеческие, AI- и редакторские правки идут через один
    semantic layer (сейчас редактор правит записи напрямую — это его канон, но контракт
    должен стать общим).
  * FBX → GLB: конвертация ассетов набора, затем деградация собственного FBX-парсера до
    тонкого adapter'а glTF (Model3D: load/instantiate/animation/dispose).
  * Минимальная semantic ECS-модель поверх компонентов: `Entity.add('Health'|'EnemyAI', …)`
    без копирования ECS движка; аудио и навигация — по потребности игр.

## Фаза F — Unified Visual Pipeline: Profile + Variant (реализовано)

Цель фазы: разработчик создаёт игру ОДНОЙ семантической моделью, не привязанной к способу
визуализации, и переключает её между пятью визуальными профилями без переписывания.

```
ONE GAME MODEL (js/GameSpec.js)
   ├── PROFILE   тип представления (manifest/render-profiles.json -> RenderProfiles.js)
   │             2d | 2.5d | isometric3d | lowpoly3d | full3d
   └── VARIANT   конкретное представление проекта (presentation/variants/<id>.json)
```

Сделано (PR «Unified visual pipeline» + «Verification»):
  * Физическое разделение слоёв: `js/engine/` (единственное место с `pc.*`), `js/core/`
    (семантика: Coords x/y/z, Entity со стабильными id, World/WorldMap с клетками/зонами/
    триггерами/навигацией, GameModel с правилами/системами/`gameplayHash`, Input с каноническими
    осями, GameAudio-кью, Save без профиля внутри), `js/presentation/` (AssetRegistry ролей с
    фолбэк-цепочками и генерируемыми заглушками, Variant, RenderProfile, Migration, Camera,
    Lighting, GameAnimation, VisualEntity, PlayArcRuntime), `js/profiles/<id>/profile.js`.
  * Машинные контракты: `manifest/render-profiles.json` (+ game/asset/migration/variant-schema),
    генераторы `tools/render-profiles.mjs` и `tools/variants.mjs` (project.json, Variants.js,
    presentation/profiles/*.json) с drift-проверками в `check.mjs`.
  * Миграции: транзакция из 16 шагов со снапшотом, `Migration.verify` (id/координаты/правила/
    мир/схема сохранений), rollback, `VisualMigrationJournal`; конверсия НЕдеструктивна.
  * Движок: ортографическая проекция в CameraController, Sprite2D (экранно-ориентированные
    квады, свой слой с SORTMODE_CUSTOM, атлас-фреймы, canvas-заглушки), Camera3D, Lighting3D
    (оверрайды World3D.cfg), Visual3D (бэкенд: биндинги -> спрайты/модели/примитивы, мир),
    капсула в Procedural3D, presentation-only suppress у Location3D.
  * Один рантайм — много инстансов: `arc run --all`, `/?project=…&variant=…`, пять вкладок над
    одним деревом исходников; `PlayArcRuntime.context()` несёт project/variant/profile/хеши.
  * Редактор: вкладка Profile (проект/профиль/вариант раздельно, живой предпросмотр варианта,
    Preview/Apply миграции, Create all variants; сервер: /api/save-variant(s), /api/save-journal,
    /api/regenerate-variants).
  * Проверки: `tools/profile-matrix.mjs` (матрица профилей и конверсий без браузера),
    `headless-gate.mjs --variants` (пять инстансов в настоящем браузере, скриншот на профиль),
    тесты `core-model`, `variants`, `pipeline-layers` (гейт на `pc.*` вне `js/engine/`).
  * AI-слой: скиллы `render-profile` (оркестрация), `visual-migration`, `visual-variants`,
    `2d`, `2.5d`, `isometric3d`, `lowpoly3d`, `full3d`, `asset-representation`, `camera`,
    `lighting`, `materials`, `animation`; фундаментальный принцип в генерируемом `AGENTS.md`
    и `.cursor/rules`; `renderProfiles` + новый API в `agent-manifest.json`.

Критерий готовности фазы выполнен: сценарии A–F (создать 2D → 2.5D → isometric → lowpoly →
full3d → снова 2D без бэкапа) и «критический архитектурный тест» (создать игру, три варианта,
запустить одновременно, изменить gameplay — все варианты получили изменение, изменить один
вариант — остальные не изменились, конвертировать вариант — исходный жив) прогоняются командами
`node tools/check.mjs --profiles` и `node tools/arc.mjs run --all`.

## Дельта-задачи (агентские сессии; правила заявок — в шапке)

- [x] E-1 Каноническая диагностика в ките: `PlayArcDiagnostics` (census/frameDraws/webgl/glTrust/snapshot) + честная culled-метрика (postcull + visibleThisFrame). — взято: 2026-09-29 12:55 UTC @zavodilo-agent2 (arena.ai).
  Обоснование: единственная крупная игра на ките (Wanderburg) была вынуждена завести СОБСТВЕННЫЙ `js/presentation/Diagnostics.js` (BS-2) — диагностика по сути инженер-уровня (читает `PlayArcRuntime.context`, `scene.layers`, pass-счётчики рендерера), но в ките её нет, и каждая игра изобретает её заново. Там же замер T-14 упёрся в тупик culled-метрики: `_numDrawCallsCulled` в вендорном PlayCanvas мёртв (всегда 0, инкремента нет ни при каком флаге), а наивный пересчёт `pc.Frustum` + `_viewProjMat` + `containsAabb` даёт мусор («откуллено 2102 из 2115» при ~1300–1600 реальных draws/кадр — фрустум прохода берётся не оттуда). В вендорном `playcanvas.d.ts` есть документированный выход: `scene.on('postcull')` (EVENT_POSTCULL — «mesh instance visibility (such as MeshInstance#visibleThisFrame) is up to date when this fires») + `MeshInstance.visibleThisFrame` — СОБСТВЕННОЕ решение рендерера по каждой камере; метрика читает результат кульлинга, а не пересчитывает причину заново.
  План: (1) НОВЫЙ `js/presentation/Diagnostics.js` — порт канона из Wanderburg (API-совместимый: census/frameDraws/webgl/glTrust/snapshot — копия в игре заменяется диффом) + НОВЫЙ метод `culled(app?, frames?, timeoutMs?)`: на 'postcull' (camera!==null) пересчёт уникальных включённых инстансов по `visibleThisFrame` → {drawn, culled, total} на кадр; недоступный счётчик = null, никогда 0 (правило «тишина — баг»); в доках честно: «припаркованные» пулом вне фрустума инстансы попадают в culled (игры, желающие отделить пул, вычитают свой реестр — движок за пулы игр не решает). (2) `index.html` — один `<script>` после Runtime.js (инвариант порядка скриптов). (3) `agent-manifest.json` — секция api.diagnostics. (4) `Scene.inspect()` — поле `glTrust` рядом с `fps` (под swiftshader fps — скорость эмуляции, не темп игры; ловушка класса T-11 для агентов, читающих inspect(); поле синхронное, frame-free — контракт inspect не замедляется). (5) НОВЫЙ `tests/diagnostics.test.mjs` — чистые фейки scene/layers/событий без браузера: census-обход (уникальность между слоями, ink-сплит), frameDraws-дельты между postrender, culled-подсчёт по postcull, glTrust-классификация (denylist софта, «неизвестно ≠ софт»), null-вместо-0.
  ЗОНА ПРАВОК: новые `js/presentation/Diagnostics.js` и `tests/diagnostics.test.mjs`; `index.html` (одна строка скрипта); `agent-manifest.json` (api-карта); `js/core/SceneAPI.js` (одно поле inspect + комментарий). НЕ трогаю: `libs/` (не форкаем движок — не-цель), скиллы (regen не нужен; если check потребует — sync-skills), World3D/Debug3D/профили.
  Приёмка: `node tools/check.mjs --all` зелёный (types обоих tsconfig, tests, skills, drift-чеки, headless-гейты); живой замер на sample-игре: drawn+culled == census.instances, drawn согласуется с frameDraws.forward с учётом ink/shadow-проходов (числа СОВМЕСТНЫ — не «2102/2115»); итог с цифрами — в этой записи; ссылка для Wanderburg T-14 (кит разблокировал метрику).
  **СДЕЛАНО 2026-09-29 15:58 UTC @zavodilo-agent2** (честная поправка времени: заявка написала
  «12:55» — часы сессии отставали; фактический пуш заявки 4f0c291 ~15:45 UTC, аренда 24 ч
  считается от него). Реализовано по плану, все 5 пунктов:
  (1) `js/presentation/Diagnostics.js` (канон кита): порт Wanderburg-копии — API-совместимый
  (census/frameDraws/webgl/glTrust/snapshot + приватные _engineApp/_counters), обобщённые
  комментарии (три несущих правила: тишина=null никогда 0; счётчик=дельта; читать решение
  рендерера, не пересчитывать) + НОВЫЙ `culled(app?, frames?, timeoutMs?)` — сэмплирует
  `MeshInstance.visibleThisFrame` на документированном `scene.on('postcull')` (camera!==null;
  null = внутренний кульлинг теней, пропускается); отказные ветви честные: 'no visibleThisFrame'
  (сборка без флага), 'timeout', 'no layers' — чисел не изобретает; приватный `_walk` — общий
  обход уникальных инстансов для census и culled (один источник правды). snapshot() расширен
  секцией culled (медиана drawn/culled/total) — суперсет прежней формы.
  (2) `index.html`: `<script>` сразу после Runtime.js. (3) `tools/asset-scan.mjs`: SCRIPT_ORDER
  синхронно расширен (иначе файл выпал бы из zip-сборки); create-arcengine копирует дерево
  целиком — новый файл попадает в скаффолд автоматически. (4) `agent-manifest.json`: api.diagnostics
  (6 сигнатур), форматирование файла не тронуто (минимальная вставка). (5) `js/core/SceneAPI.js`
  inspect(): поле `glTrust` рядом с fps (под software-адаптером fps — скорость эмуляции;
  поле синхронное, frame-free; null когда Diagnostics не на странице).
  ТЕСТЫ: `tests/diagnostics.test.mjs` 12/12 на чистых фейках (эмиттеры событий, слои,
  инстансы; vm-таймеры инжектируются, ink-реестр строится Map'ом vm-реалма — кросс-реалм
  instanceof честен): уникальность census между слоями + skip UI/disabled, ink-сплит из
  window.app, frameDraws-дельты (670/680/650 из cumulative 1000→3000), 'no counters'=null-и,
  timeout-ветки, culled-сэмплы (2/3+3/2 из 5, null-камера не тратит сэмпл, drawn+culled+unknown
  ==total), отказ 'no visibleThisFrame', null-дисциплина _counters, glTrust-классификация
  (SwiftShader/WARP=software, NVIDIA=false+note null, «неизвестно ≠ софт»), snapshot-интеграция
  (peak draws + медианы culled + census + null-и контекста).
  ЗАМЕР ЖИВЬЁМ (sample, arcengine-sample-lowpoly3d, swiftshader 1280×720, headless;
  probe в сессии, pageerror 0): census **479** (base 326 + ink 153); culled **drawn 71 +
  culled 408 + unknown 0 = 479 == census** (разложение ТОЧНОЕ, 5/5 сэмплов идентичны);
  frameDraws forward **71/71/71/71/71** — **drawn == forward цифра-в-цифру** (в этом кадре
  ink-инстансы откуллены, shadow-проход отдельный: shadow 164, device 235 = 71+164 ✓;
  depth=null — счётчик не экспонируется, честно null); glTrust: software=true, note про
  SwiftShader — ровно та аннотация, из-за которой поле добавлено в inspect().
  ГЕЙТЫ: `node tools/check.mjs --all` — **EXIT 0, «Всё прошло.», 0 FAIL** (types игры и
  редактора, tests, skills-sync, манифест сцены, drift профилей/вариантов, матрица профилей,
  headless render/visual/variants).
  Следствие для Wanderburg: T-14 разблокирован НА УРОВНЕ КИТА — метрика читает решение
  рендерера (postcull+visibleThisFrame), а не пересчитывает фрустум; подпункт P-1 «culled в
  гейт» снова реализуем после синхронизации движковых файлов в игру (копия Wanderburg
  js/presentation/Diagnostics.js заменяется этим каноном диффом — API совместим; саму
  синхронизацию НЕ делаю — это репозиторий игры и зона его агентов, заявка там не моя).
