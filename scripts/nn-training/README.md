# DamaNet — Neural Network Evaluator for DamaDojo

Lightweight feed-forward network that replaces (well, augments) the
hand-tuned eval function for Russian draughts 8×8.

## Architecture

```
position (32 dark squares × 4 piece channels + side-to-move)
  ┃ 129 floats
  ▼
Linear(129 → 256) + ReLU
  ▼
Linear(256 → 256) + ReLU
  ▼
Linear(256 → 1) + Sigmoid
  ▼
win-probability for side-to-move (∈ [0, 1])
```

~100 k parameters, ~400 KB float32 weights. Forward pass: ~100 k ops, runs
in ~0.1–0.5 ms in a single Web Worker thread — feasible inside the alpha-beta
search.

## End-to-end pipeline

### Step 1 — build the training dataset (locally)

```sh
# Walks every *.pdn file under data/pdn/, replays games, emits
# (position, win-prob) pairs into a binary dataset.
node --import tsx scripts/build-nn-dataset.mjs

# Outputs:
#   data/datasets/nn/positions.bin   (float32, [N × 129])
#   data/datasets/nn/labels.bin      (float32, [N])
#   data/datasets/nn/meta.json
```

Tunables (all optional):

```sh
node --import tsx scripts/build-nn-dataset.mjs \
  --max-games 30000 --min-elo 1700 --max-ply 100 --skip-first 6
```

Runtime: ~5–15 minutes for the full ~35 k-game corpus.

### Step 2 — train (Modal, recommended)

Modal gives us per-second GPU billing. On an H100 the full training run
typically completes in 5–15 minutes wall-clock.

```sh
pip install modal
modal token new                          # one-time auth

# One-time: create the persistent volume.
modal volume create damadojo-data

# Upload dataset to the volume.
modal volume put damadojo-data \
  data/datasets/nn/positions.bin /datasets/nn/positions.bin
modal volume put damadojo-data \
  data/datasets/nn/labels.bin    /datasets/nn/labels.bin
modal volume put damadojo-data \
  data/datasets/nn/meta.json     /datasets/nn/meta.json

# Run training (default: H100, 60 epochs, batch 4096).
modal run scripts/nn-training/modal_app.py

# Download trained weights back to the repo.
modal volume get damadojo-data /checkpoints/ ./data/datasets/nn/checkpoints
```

### Step 2 (alternative) — train locally

```sh
pip install torch numpy
cd scripts/nn-training
python train.py --data-dir ../../data/datasets/nn
```

On a 5950X CPU this is ~20–30 minutes per 60 epochs. On a desktop RTX 3060
it's ~3 minutes. On AMD ROCm or NVIDIA CUDA the script just works.

### Step 3 — ship weights into the app

```sh
mkdir -p public/nn
cp data/datasets/nn/checkpoints/damanet.weights.bin   public/nn/
cp data/datasets/nn/checkpoints/damanet.manifest.json public/nn/
```

The engine worker (`src/lib/engine-ai/worker/engine.worker.ts`) loads these
assets at startup. If they're missing, it silently falls back to the
classical evaluator — there is no crash path.

## Files

| File | Role |
|---|---|
| `scripts/build-nn-dataset.mjs` | PDN → binary positions + labels |
| `scripts/nn-training/train.py` | PyTorch training loop |
| `scripts/nn-training/modal_app.py` | Modal serverless GPU wrapper |
| `src/lib/engine-ai/nn/encoding.ts` | FastState → 129-float vector |
| `src/lib/engine-ai/nn/forward.ts` | Pure-TS forward pass |
| `src/lib/engine-ai/nn/evaluator.ts` | Hybrid (classical + NN) score |
| `src/lib/engine-ai/nn/loader.ts` | Fetch + install weights at runtime |

## Architecture choices

- **Why 129 inputs, not bitboards.** Bitboards are great when the engine
  is written in a low-level language and we can BMI-shift them around;
  in JS plain float arrays beat any clever bit-packing because we already
  pay V8's tax on every operation.
- **Why MSE (not BCE).** Game-result labels in 0/0.5/1 form are heavy-tailed
  and BCE with 0.5 labels behaves badly. MSE handles the middle case
  cleanly and matches the literature on Stockfish NNUE eval-distillation
  (which also uses MSE on a [0,1] target).
- **Why blend with classical, not replace.** The classical eval gives
  fast tactical signals (back-rank, material, mobility) that a small MLP
  has trouble learning from a result-only target. Blending keeps tactics
  sharp while letting the NN supply positional understanding.

## Next steps after a baseline run

1. **Knowledge distillation.** Replace game-result labels with full
   engine evaluations (depth 14 search score) for the same positions.
   This typically lifts strength by another ~200 Elo over result-labels.
2. **NNUE update.** Switch from full forward pass to efficient incremental
   updates over the input vector. Drops per-eval cost ~10× and lets us
   raise NN_BLEND.
3. **Self-play loop (AlphaZero-style).** Generate fresh games with MCTS+NN,
   relabel with the latest network, retrain. Repeat. This is the publishable
   variant.
