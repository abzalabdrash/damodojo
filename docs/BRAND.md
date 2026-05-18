# DamaDojo — Brand & Visual System (v0)

Цель: премиум-продукт уровня Linear / Arc / chess.com по тактильности, а не AI-сгенерированный лендинг. Никаких эмодзи в UI, никаких фиолетовых градиентов, никаких bouncy round-shapes.

---

## 1. Tone of voice

**Ата** — это объективный коуч, не дед-сказочник.

- Реплики короткие, фактологичные, одно предложение.
- Никаких ласкательных оборотов, никакого юмора в репликах об игре.
- Имя локализуется: `Ата` (RU) / `АТА` (KZ caps) / `Ata` (EN).

| Bad | Good |
|---|---|
| "Эх, юный падаван, не туда полез!" | "Ход 12: ты отдал инициативу." |
| "Молодец, давай ещё!" | "Партия сохранена. Ключевой момент — ход 8." |
| "Ой, нельзя так..." | "Этот ход теряет дамку." |

Маркетинговый тон landing'а — спокойный, уверенный, без вау-восклицаний. "Шашки, которые учат думать." а не "Самые крутые шашки в Казахстане!!!".

---

## 2. Color palette

Тёплая тёмная база (warm dark), без серых "AI-pixel" оттенков. Все цвета слегка сдвинуты в коричневый/охру.

```
/* Base */
--bg-page:      #0E0C0A    /* почти чёрный с тёплым подтоном */
--bg-surface:   #181512    /* карточки, панели */
--bg-elevated:  #221E1A    /* модалки, hover */
--border:       #2D2823    /* тонкие разделители */
--border-strong:#3E372F

/* Text */
--text-primary:   #F5F1EA   /* основной — тёплый off-white */
--text-secondary: #A39988
--text-muted:     #6E665B

/* Board */
--board-light: #D6BF95    /* светлые клетки — тёплый песок */
--board-dark:  #5C4530    /* тёмные — орех */
--board-frame: #2A2018    /* рамка доски */

/* Pieces */
--piece-light:        #EDE3D0   /* кремовый с лёгким золотом */
--piece-light-edge:   #B89B6A
--piece-dark:         #1F1A14   /* почти чёрный с тёплым подтоном */
--piece-dark-edge:    #4A3E2D
--piece-king-accent:  #C9A227   /* муст-голд для короны */

/* Functional */
--accent:       #C9A227   /* подсветка возможных ходов, активная клетка */
--accent-muted: rgba(201, 162, 39, 0.18)
--success:      #6B8F4E   /* выигрыш, валидный ход */
--warning:      #C97A2A   /* предупреждение */
--danger:       #B85C50   /* blunder, мат — приглушённый красный, НЕ #FF0000 */
--info:         #6F8AAD   /* нейтральная информация */
```

**Светлая тема** (toggle):
- Base: `#F5F1EA` → `#E8E1D2` → белый
- Text: `#1A1612`
- Доска: те же `--board-light` / `--board-dark` (доска одинакова в обеих темах — это важно для распознавания)

---

## 3. Typography

Никаких Roboto, никакого Comic Sans, никаких "modern AI fonts" типа Plus Jakarta.

**Headlines:** `Fraunces` (Google Fonts) — современный засечный, с характером. Альтернатива: `PT Serif`.
**UI / body:** `Inter` (variable) или `Geist`. Без выпендрёжа.
**Numbers / timer / move notation:** `JetBrains Mono` или `Geist Mono` — моноширинный, чтобы цифры таймера не плясали.

Размеры:
- Hero h1: 56–72px Fraunces, weight 500, letter-spacing -0.02em
- h2: 36px
- h3: 24px
- Body: 16px / line-height 1.6
- UI labels: 13–14px medium, slight tracking +0.02em
- Timer: 28px mono semibold

---

## 4. Spacing & layout

Generous, не плотно. 8px base grid: spacing values только из 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96.

Container max-width: 1280px на лендинге, 1120px в app.

Доска — square, max-side 640px на десктопе, fluid 100vw — 32px padding на мобильном.

---

## 5. Iconography

- **Lucide React** (`lucide-react`) — единственная разрешённая icon library. Stroke 1.5–1.75. Размер 16/20/24.
- **Никаких эмодзи** в UI и в репликах Ата.
- Шашка-фигура в hero — кастомный SVG, не emoji ♟.

---

## 6. Piece design (доска и фигуры)

Это половина впечатления от продукта. Не клипарт.

- **Фигуры — SVG**, два слоя:
  - Нижний эллипс (тень/основание)
  - Верхний эллипс с радиальным градиентом для объёма (НЕ purple-вращающийся, а матовый off-white или матовый walnut)
  - Edge (тонкий 1px stroke цвета `--piece-*-edge`)
  - Король: маленькая золотая корона-засечка по верху (НЕ ♚ символ, а кастомный SVG-полумесяц / венок)
- При наведении: piece поднимается на 2px (CSS `translateY(-2px)` + увеличенная тень).
- При drag: opacity 0.85, follow cursor smoothly.
- При взятии: захватываемая фигура fades out с лёгким "крошится" эффектом (Framer Motion: scale down + opacity + slight rotate).

**Подсветка ходов:**
- Доступная клетка (если фигура выбрана): полупрозрачный кружок 30% от размера клетки, цвет `--accent`.
- Клетка с возможным взятием: кольцо, не круг — другой visual cue.
- Последний ход: обе клетки (откуда → куда) тонко подсвечены `--accent-muted`.
- Premove: подсветка другого оттенка (например `#7B6DAA` — НО без блеска).

---

## 7. Sounds (chess.com vibe, но open-source)

Источник: **[Lichess sound packs](https://github.com/lichess-org/lila/tree/master/public/sound)** (GPL-совместимы) или [freesound.org](https://freesound.org) с CC0/CC-BY лицензиями.

Набор обязательный:
- `move-self.mp3` — твой ход, мягкий деревянный клик
- `move-opponent.mp3` — ход соперника (чуть глуше)
- `capture.mp3` — взятие (сильнее, низкий thud)
- `promote.mp3` — превращение в дамку (короткий перезвон)
- `check-warn.mp3` — Ата предупреждает о blunder
- `game-start.mp3` — короткий мягкий
- `game-end-win.mp3` — короткая мажорная нота (не фанфары)
- `game-end-lose.mp3` — нисходящий короткий
- `low-time.mp3` — тик-так при <10s
- `notify.mp3` — соперник сделал ход в async-партии

Громкость по умолчанию: 40%. Toggle в настройках.

---

## 8. Motion / animation

**Framer Motion** для всего, что движется. Easing — кастомный, не `easeInOut`:

```js
const ease = [0.16, 1, 0.3, 1]   // out-expo-ish, премиум-чувство
const fast = 0.18
const med  = 0.32
const slow = 0.6
```

- Move animation: piece летит из клетки A в клетку B за 280ms, ease.
- Hover на UI элементах: 120ms.
- Modal in: 240ms slide-up + fade.
- НЕ юзаем: bouncy spring, элементы вращаются, конфетти.

---

## 9. Logo / wordmark

Wordmark: `DamaDojo` в Fraunces, weight 500, letter-spacing -0.02em. 
Между "Dama" и "Dojo" нет пробела — это намеренно плотно.

Опционально mark: монограмма "DD" с двумя стилизованными шашками-кружками внутри буквы D (одна полная = шашка, одна полая = клетка). Делаем после v0, если будет время.

---

## 10. Inspirations (что смотреть)

Открой эти сайты и сверь chrome / typography / spacing:
- **linear.app** — precision, dark warm
- **arc.net** — warm details, motion
- **chess.com** — board craft, sounds, piece animations
- **lichess.org** — pure functionality, open-source ethos
- **stripe.com** — типографика и плотность

Что **НЕ** смотреть и НЕ копировать:
- Любые AI-сгенерированные лендинги (Lovable / v0 дефолты)
- Сайты с фиолетовыми/радужными градиентами
- Замощённые emoji в hero ("🚀✨🎯")
- Иллюстрации в стиле Notion mascots

---

## 11. Domain (через GitHub Student Pack)

Кандидаты (проверить доступность):
- `damadojo.me` (Namecheap, 1 год free через Student Pack) — основной кандидат
- `damadojo.app` (Name.com через Student Pack)
- `damadojo.live` — fallback

Email отправителя для прод-уведомлений: `ata@damadojo.me` (мы зовём Ata, не "noreply").
