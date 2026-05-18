# DamaDojo — Product Blueprint (v1, обновлено 2026-05-15)

Оперативная карта на 3 дня. Не PR-документ — внутренний референс.

---

## 1. Один абзац о продукте

**DamaDojo** — веб-платформа премиум-класса для русских шашек 8×8 с AI-движком и встроенным AI-ревьюером **Ата**. Игрок может сыграть с Ата на разной силе, позвать друга по ссылке (синхронная игра с таймером, премувами и чатом), а после партии получить объективный разбор ключевых моментов и сохранить их как ежедневные задачи. Это не "ещё одни шашки" — это retention-first продукт уровня chess.com по UX и тактильности, заточенный под локальный рынок.

**Wedge:** премиум-UX + объективный AI-ревьюер + retention loop через daily puzzle из твоих партий.

**Pitch jurors hear:** "Я не делал курсовую по шашкам. Я делал retention-first продукт уровня chess.com — с тремя бот-персонами и полноценным Game Review с классификацией ходов. Причём в Review мы исправили UX-промахи, на которые жалуется само chess.com комьюнити: у нас eval graph не исчезает при просмотре хода, move list — вертикальный 2-колоночный, всё на одном экране. И сверху — retention loop: ключевой момент твоей вчерашней партии возвращается как daily puzzle."

---

## 2. Решённые ключевые вопросы

| Вопрос | Решение |
|---|---|
| Позиционирование | Тренажёр стратегического мышления для школьников и студентов |
| Правила | **Русские шашки 8×8** (взятие назад, летающая дамка, обязательное взятие) — это что играют в Казахстане |
| Главный режим | (а) vs **бот-персона** (3 бота — Ата/Жанар/Темир), (б) live vs друг по ссылке с таймером+чатом+премувами, (в) async vs бот с возобновлением |
| AI движок (расчёт ходов) | Свой minimax + alpha-beta на TypeScript, depth 6–10, opening book ~50 позиций. Никаких LLM в расчётах. |
| In-game реплики ботов | ~10 канонических фраз на каждого бота (характер, не подсказки) + Featherless LLM для вариаций. Реплики НЕ информативны о позиции — они про роль. |
| Post-game Review | **Полноценный анализатор уровня chess.com Game Review**: eval bar, eval graph, стрелки лучшего хода, классификация каждого хода (Brilliant/Best/Good/Inaccuracy/Mistake/Blunder), replay controls, "Next mistake" jump. Не текстовый отчёт. |
| Persona naming | **Ата** (RU) / **АТА** (KZ caps) / **Ata** (EN) — один из трёх ботов, не закадровый голос |
| Языки v1 | RU + EN + KZ (3 языка, toggle в шапке) |
| Темы | Тёплая dark (default) + тёплая light, toggle в настройках |
| Подсказки | Включаются в настройках партии перед стартом (3 типа: подсветка возможных, предупреждение о blunder, лучший ход) |
| Монетизация | Pro mockup, без живого Stripe (Казахстан не поддерживается). Paddle / Lemon Squeezy в roadmap. |
| Stack | Next.js 15 (App Router) + TS + Tailwind + shadcn/ui + Framer Motion + Zustand + Supabase (auth/DB/realtime) + Vercel |
| Тесты | Vitest для rule engine (это must) |

---

## 3. Архитектура движка и AI

### 3.1 Checkers engine (TS)
- Файлы: `src/lib/engine/rules.ts`, `moves.ts`, `state.ts`, `notation.ts`
- Bitboard или int8[64] представление — выберем в Day 1
- Generate legal moves → apply move → evaluate
- Обязательные взятия (forced captures) + multi-capture chains
- Promote → king на последней горизонтали
- Detect: win / loss / draw (50-ходовое правило + троекратное повторение)

### 3.2 AI (минимакс)
- `src/lib/engine/ai.ts`
- Alpha-beta pruning + iterative deepening
- Evaluation: материал (шашка=1, дамка=3), позиционные бонусы (центр, продвижение), king mobility, tempo
- Opening book: ~50 typed позиций для разнообразия первых ходов
- 3 силы — `easy` (depth 3 + случайность), `med` (depth 6), `hard` (depth 9 + opening book + iterative deepening time budget 2s)

### 3.3 Bot personas (in-game) — model: chess.com Bots ("семейство Дома")

- `src/lib/bots/`
- Семейство **"Дома"** = аналог семейства Mittens у chess.com. Три бота одного дома, разные поколения:

| Бот | Displayed ELO | Real depth | Темперамент | Стиль | Аватар (SVG) |
|---|---|---|---|---|---|
| **Ата** | 1100 | depth 4 | Спокойный, терпеливый аксакал | Классическая позиционка, не рискует | Силуэт пожилого мужчины в такыйе |
| **Жанар** | 1400 | depth 6 | Молодая, энергичная, ободряет | Активные взятия, быстрый темп | Силуэт с высоким хвостом |
| **Темир** | 1700 *(displayed)*, реально depth 11 | depth 11 + opening book | Строгий, немногословный, точный | Расчёт без слабостей, как Mittens trick | Силуэт со строгими линиями |

- **Backstory** — каждому короткая (2-3 предложения). Не для геймплея, для эмоции при выборе бота
- Каждый бот = `{ id, name_loc, displayed_elo, real_depth, eval_overrides, opening_preferences, avatar_svg_path, backstory_loc, voice_lines: { event: [...] } }`
- События для реплик: `on_start`, `on_your_strong_move`, `on_your_blunder`, `on_my_capture`, `on_promote`, `on_check_to_win`, `on_win`, `on_lose`. Каждый бот ~3 фразы на event = ~24 строки × 3 бота × 3 языка = ~216 строк копи (это ~2 часа работы, выделить отдельно)
- **Voice line writing — это работа, не "пусть LLM сгенерит"**. Пишем руками, Featherless только для вариаций при повторении
- **Реплики НЕ содержат позиционных подсказок** — это критично, бот в роли соперника, не коуча

### 3.4 Game Review (post-game analyzer) — model: chess.com Game Review, но фиксим их UX-промахи

**Классификация ходов — те же 10 категорий, что у chess.com** (для узнаваемости игроками):
```
Brilliant!   — piece sacrifice that's still good (extra conditions apply)
Great        — only good move in position
Best         — engine's top choice
Excellent    — almost as good as best
Good         — acceptable
Book         — opening theory
Inaccuracy   — −5..10% win chance
Mistake      — −10..20% win chance
Blunder      — −20%+ win chance
Miss         — failed to punish opponent's mistake
```

**Expected Points Model** (как у chess.com): нормируем engine eval (centipawns) в winning chance [0..1] через сигмоиду, потом смотрим delta в percentage points.

- `src/lib/review/`
- Один прогон по всем ходам партии (по DB запись). Для каждой позиции: depth 10 eval + top 3 lines
- Classification function берёт `{eval_before, eval_after, best_move, played_move, is_sacrifice, opponent_blundered}`
- Featherless вызывается **только** для Blunder / Mistake / Brilliant / Miss — генерирует одно предложение в голосе Ата. Кешируется в `game_reviews` table
- Стрелки: green = best move, red = played (если хуже best), thin gray = top 3 line

**UI компоненты — учимся на ошибках chess.com Game Review v2 (community ненавидит):**
- ✅ Eval bar — **всегда видна** слева от доски, persistent
- ✅ Eval graph (sparkline) — **всегда виден** в нижней четверти, не исчезает при просмотре хода
- ✅ Move list — **вертикальный, две колонки** (White / Black), как старый chess.com, НЕ горизонтальный скролл
- ✅ Все три (move list, eval graph, board+arrows) — **на одном экране** одновременно
- ✅ Кнопка ⏭ **Next key move** — прыгает на следующий Blunder/Mistake/Brilliant
- ✅ Кнопка "💾 Save as Daily Puzzle" — на каждом key move → замыкает retention loop
- ✅ Toggle для evaluation lines / arrows / hints — в шапке Review

### 3.4.1 Visual references (screenshots collected by user)
Path: `C:\Users\abdra\OneDrive\Desktop\chess.com\`

| File | What it shows | What we copy |
|---|---|---|
| `SILNUY HOD.jpg` | Move classification badge на клетке (`!` + tooltip "Сильный ход!") + side panel с inline icons | **THE wow-moment** — реплицируем дословно, но в шашечной нотации (1-5, 5×7) |
| `XOD.jpg` | Last-move highlight на обеих клетках (from + to) yellow-green | Точная копия |
| `premuv.jpg` / `PREMUVE.jpg` | Premove highlight (orange overlay) + capture target (red overlay) | Точная копия |
| `STRELKA NO NE PREMUV.jpg` | Suggestion arrow — толстая золото-полупрозрачная стрелка | SVG overlay, reuse в hint mode + review |
| `end.jpg` | End-game modal: trophy + result + reason + coach avatar + 3 stat-counters + primary CTA | Сделаем 1:1, но с нашим Ata avatar и метриками |
| `ata-like.jpg`, `ata-like3.jpg`, `OTCHET.jpg` | Game Review side panel: coach bubble, accuracy bar, stat counters (Лучший/Ошибка/Упущенный шанс/Зевок), rating, phase ratings | Базовая структура нашего Game Review |
| `VIZYV.jpg` | Challenge/searching modal | Используем для friend invite state |
| `archiv.jpg` | Game archive table | Базовая структура `/history` |

### 3.4.2 Move classification badge (HIGHEST priority WOW)
Реплицирует chess.com SILNUY HOD.jpg один-в-один, но улучшая (см. UX-lessons выше).
- `<MoveBadge type="brilliant|great|best|excellent|good|book|inaccuracy|mistake|blunder|miss" />`
- Круг 28-32px, абсолютно позиционирован на угол destination square
- Цвета: brilliant=light-blue (#6F8AAD-bright), great=green (#6B8F4E), best=green-checkmark, excellent=green-exclaim, good=neutral, book=gray-book-icon, inaccuracy=yellow (#C9A227), mistake=orange (#C97A2A), blunder=red (#B85C50), miss=red-cross
- Glyph внутри: `‼` / `★` / `✓` / `!` / `•` / `📖` / `?!` / `?` / `??` / `✕`
- Pop-in анимация: `scale: [0, 1.15, 1]`, opacity in, 240ms ease=premium
- Tooltip pill сверху: "Сильный ход!" / "Ошибка" / "Зевок" — fades after 2.5s
- Тот же компонент (size-small variant) рендерится inline в move list

### 3.4.3 Sound system
- `useSound()` hook на HTMLAudioElement (или Howler.js если нужно multitrack)
- Пакет в `/public/sounds/`: move-self, move-opponent, capture, promote, notify, low-time, game-start, game-end-win, game-end-lose, game-end-draw, move-brilliant (special), move-blunder (sad)
- Источник: Lichess `public/sound/standard/` (GPL-compatible)
- В review при click move → звук + badge pop одновременно

### 3.4.4 End-game modal (replicates end.jpg)
- Trophy/sad icon + result heading + reason text
- Avatar (Ata/Жанар/Темир в зависимости от соперника) + speech bubble с 1 строкой
- 3 inline stat-counters (Best/Mistake/Brilliant count)
- Primary CTA: **"Разобрать партию"** → `/review/[gameId]`
- Secondary: "Реванш" (new game)
- Close "×"

### 3.4.5 Player strip (replicates chess.com header/footer)
- Avatar circle (40px) + username + (rating) + flag
- Captured pieces tray ("♟ ♟ ♟ +7")
- Timer card на правой стороне (моноширинный, JetBrains Mono, 28px)

### 3.5 Realtime (live vs друг)
- Supabase Realtime Broadcast channel per room (`room:<id>`)
- Presence для online/typing статуса
- Сообщения: `move`, `chat`, `premove_set`, `resign`, `draw_offer`, `clock_sync`
- Server time через `Date.now()` + Supabase server timestamp на ход
- Premoves: queued client-side, validated против нового состояния, auto-submit если легально

---

## 4. Ключевые экраны

1. **Landing** (`/`) — hero с анимированной демо-доской + один CTA "Играть сейчас"
2. **Quick play modal** — выбор: vs бот (картинки трёх ботов с ELO) или с другом (создать ссылку)
3. **Bot select** (`/play/bots`) — карточки трёх ботов: аватар, имя, ELO, краткий байо, signature opening, кнопка "Играть"
4. **Game vs Bot** (`/play/bot/[id]`) — доска + панель статуса + таймер + chat-area с репликами бота
5. **Live room** (`/r/[id]`) — доска + два таймера + чат справа + индикатор соперника + share-link
6. **Home / Dashboard** (`/home`, после auth) — streak, daily puzzle, continue games, leaderboard preview
7. **Daily Puzzle** (`/puzzle/today`) — позиция из вчерашней партии + одна задача
8. **Game Review** (`/review/[gameId]`) — полноценный анализатор (eval bar, eval graph, move list с классификацией, доска со стрелками, replay controls)
9. **History** (`/history`) — список партий с реплеем
10. **Profile** (`/u/[handle]`) — рейтинг, streak, последние партии, доступен публично
11. **Pricing / Pro** (`/pro`) — mockup
12. **Settings** (`/settings`) — язык, тема, звук, подсказки, профиль

---

## 5. MUST HAVE (то, что должно работать без багов)

- Rule engine — 100% корректность русских шашек, покрыто тестами
- Доска: drag + click-to-move, анимации, premove highlights, possible-moves highlight
- Звуки (move, capture, promote, low-time, end) — open-source из Lichess pack
- AI vs Ата (3 силы) — играет осмысленно, не подвисает
- Ата перехват blunder'а в реальном времени (это wow-фича)
- Live multiplayer: создал ссылку → друг зашёл → играем синхронно с таймером, премувами, чатом
- Post-game review с 3 ключевыми моментами
- Daily puzzle из вчерашней партии
- 3 языка (RU/KZ/EN) — полная локализация UI
- Dark/light тема
- Auth (Google + magic link через Supabase)
- История партий + публичный профиль
- Mobile responsive (доска адаптивна, чат внизу на мобильном)
- Deploy на Vercel + домен `damadojo.me` через GitHub Student Pack

## 6. NICE TO HAVE (если останется время)

- City leaderboard (топ Алматы / Астана / Шымкент)
- Share replay card (PNG для соцсетей)
- Email-уведомление "соперник сделал ход" в async
- Spectator mode для friend rooms
- Custom board skins в Pro mockup

## 7. EXPLICITLY OUT-OF-SCOPE (v1.1 roadmap)

- ELO / matchmaking pool / турниры
- Push web-notifications (только email)
- Mobile native app
- Кастомные правила (английские/международные шашки) — заложена архитектура, но в v1 только русские
- Stripe / реальные платежи
- Голосовой Ата

---

## 8. UX flow (короткая версия)

### Первый визит (target: 90s до момента wow)
```
Landing  
  └─ CTA [Играть сейчас] ─── без signup, без модалок
     └─ Quick play modal:
        ├─ [vs Ата · легко / средне / сильно]
        └─ [с другом по ссылке]
     └─ /play/ai
        └─ доска расставляется, Ата: «Ходи первым.»
        └─ blunder-перехват: «Подожди — посмотри на e5.»
        └─ конец → review overlay: 3 ключевых момента
        └─ CTA [Сохранить партию] → signup (Google/magic link)
        └─ /home
```

### Возврат (retention loop)
```
Open → /home
  ├─ streak: «5 дней подряд»
  ├─ daily puzzle (из вчерашней партии)
  ├─ continue game (если async с Ата на паузе)
  └─ [Новая партия] → quick play modal
```

### Live multiplayer (viral)
```
[С другом] → выбор контроля времени (3+0 / 5+3 / 10+0)
  → ссылка damadojo.me/r/x7k2pq
  → share to WA / TG / copy
Друг открывает:
  → если не залогинен — просит только ник (никаких форм)
  → доска появляется обоим, таймер старт по первому ходу
  → играют синхронно: таймер, премувы, чат
  → конец → review для обоих, опционально Ата-разбор
  → [Реванш] (новая ссылка) / [Поделиться партией]
```

---

## 9. План на 3 дня (детализированный)

### Day 1 — Foundation
- **Morning (4h):** Next.js bootstrap, Tailwind config с BRAND palette, shadcn/ui setup, лендинг hero, базовая навигация, i18n setup (next-intl, 3 языка), темы (next-themes)
- **Afternoon (4h):** Rule engine с тестами — generate moves, captures, chains, promotion, win detection
- **Evening (4h):** Board UI — клетки, фигуры SVG, click-to-move, drag-and-drop, анимации Framer Motion, sounds wired, локальная 1v1 hot-seat работает

### Day 2 — AI + Multiplayer (core день)
- **Morning (4h):** Minimax + alpha-beta, evaluation function, opening book, 3 силы AI
- **Afternoon (4h):** Supabase setup (auth + tables: users, games, moves, rooms), live room creation, Realtime broadcast, sync moves between two clients
- **Evening (4h):** Таймер (часы сторон), премувы (client queue + auto-submit), чат в комнате, mobile responsive partial pass

### Day 3 — Coach + Polish + Ship
- **Morning (4h):** Ata blunder перехват (eval delta), post-game review (топ-3 ходов), Featherless integration через Edge Function
- **Afternoon (4h):** Daily puzzle generator (по cron'у на Supabase или on-demand), history, profile page, лидерборд, Pro mockup page
- **Evening (4h):** Polish — все mobile breakpoints, бэйджи, sound polish, deploy на Vercel, домен, README, скринкаст 90s

---

## 10. README narrative (черновик финала)

> **DamaDojo** — AI-coached Russian checkers built for thinkers.
>
> Most checkers apps stop at "play the game." DamaDojo treats every match like a chess lesson: a strong engine plays against you at three strength levels, **Ata** (your objective in-game reviewer) intercepts blunders before they finalize, and tomorrow the critical moment of yesterday's match returns as your daily puzzle.
>
> Play solo against the engine, or invite a friend by link — synchronous online play with chess.com-grade controls (timer, premoves, chat) and a post-game review you both can study together. Three languages (RU / KZ / EN), warm dark and light themes, mobile-first.
>
> Built in 3 days as my submission for nFactorial Incubator 2026, but designed as the foundation of a retention-first product for students learning to think strategically.

---

## 11. Open questions to revisit

- Domain pick: `damadojo.me` vs `damadojo.app` — зависит от наличия в GitHub Student Pack акках
- Time controls на v1 — 3+0, 5+3, 10+0 хватит? или добавить 1+0 bullet?
- Гость-пользователи в friend rooms: только ник, или сразу пуш на signup после партии?
