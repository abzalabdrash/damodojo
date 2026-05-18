# Avatar generation prompts

Generate each at **1024×1024 (square)**. Style is consistent across all 5:
**stylized 2.5D portrait, painterly, soft warm cinematic lighting, head and shoulders only, plain dark gradient background (#1a1408 → #2a1c0f), 3/4 angle facing camera, premium chess.com-aesthetic, NO text, NO logos**.

After generation, save under `public/bots/<id>.png` (e.g. `public/bots/ata.png`).

---

## 1. `ata.png` — Тренер Ата (2200 ELO)

> A stylized 2.5D painterly portrait of an elderly Kazakh man, 67 years old, weathered tan skin, thick silver-white hair combed back, neatly trimmed white beard, deep wise hazel eyes with crow's feet from smiling, wearing a simple charcoal wool sweater over a white collared shirt. Calm authoritative expression with the faintest knowing smile. Soft warm rim light from upper-left, deep amber shadows. Head and shoulders only, 3/4 angle facing camera. Background: smooth dark gradient from deep brown (#1a1408) to charcoal (#2a1c0f). Premium chess.com style portrait, painterly but realistic. No text, no logos.

---

## 2. `aigerim.png` — Айгерим (КМС, 2150 ELO)

> A stylized 2.5D painterly portrait of a young Kazakh woman in her late 20s, sharp focused expression, almond-shaped dark brown eyes, jet-black straight hair tied back in a low ponytail, high cheekbones, wearing a dark navy blazer over a crisp white shirt. Cool composed face, like a chess master mid-calculation — analytical, unflinching. Cool light from upper-left (subtle blue tint), deep neutral shadows. Head and shoulders only, slight 3/4 angle. Background: smooth dark gradient from deep brown (#1a1408) to charcoal (#2a1c0f). Premium chess.com style portrait, painterly but realistic. No text, no logos.

---

## 3. `zhanar.png` — Жанар (атакующая, 1800 ELO)

> A stylized 2.5D painterly portrait of a young Kazakh woman, 21, university student, lively energetic expression with a half-smirk, bright dark eyes with a confident challenging glint, shoulder-length wavy black hair, wearing an oversized soft mustard-yellow university hoodie. Slightly raised eyebrow, mischievous youthful confidence. Warm lighting from upper-right with amber highlights. Head and shoulders only, slight 3/4 angle. Background: smooth dark gradient from deep brown (#1a1408) to charcoal (#2a1c0f). Premium chess.com style portrait, painterly but realistic. No text, no logos.

---

## 4. `temir.png` — Темир (защитник, 1500 ELO)

> A stylized 2.5D painterly portrait of a middle-aged Kazakh man, 54, a tractor driver from a small steppe town, sun-weathered tan skin with deep lines around the eyes, short salt-and-pepper hair, thick dark stubble, calm patient eyes that have seen a lot, wearing a faded olive-green canvas work jacket over a grey shirt. Quiet stoic expression, the face of a man who waits. Warm low sun lighting from the side, long earthy shadows. Head and shoulders only, slight 3/4 angle. Background: smooth dark gradient from deep brown (#1a1408) to charcoal (#2a1c0f). Premium chess.com style portrait, painterly but realistic. No text, no logos.

---

## 5. `kanat.png` — Канат (новичок, 1100 ELO)

> A stylized 2.5D painterly portrait of an 18-year-old Kazakh university freshman, wide-eyed friendly expression with an open mouth half-laugh, slightly messy short black hair, smooth youthful skin, slight blush on cheeks, wearing a navy varsity-style college hoodie. Goofy energetic vibe, the kind of kid who laughs at his own mistakes. Warm light from upper-right with playful soft highlights. Head and shoulders only, slight 3/4 angle. Background: smooth dark gradient from deep brown (#1a1408) to charcoal (#2a1c0f). Premium chess.com style portrait, painterly but realistic. No text, no logos.

---

## Tips for generating

- **ChatGPT (DALL-E 3 / Sora image)**: paste each prompt directly. May need to ask "tighter crop, head and shoulders only" if it generates full body.
- **Midjourney**: append ` --ar 1:1 --style raw --stylize 350 --v 6.1` to each prompt.
- **Imagen 3** (Gemini): paste prompt, request "1:1 aspect ratio".
- **Flux 1.1 Pro** (via Replicate): excellent for painterly portraits, append `, painterly portrait, soft cinematic lighting`.

If any face comes out weird (extra fingers, distorted features), regenerate — these models occasionally fail on faces. Pick the best of 3-4 generations per character.

After saving to `public/bots/`, no code changes needed — `CoachBubble` component loads them automatically.
