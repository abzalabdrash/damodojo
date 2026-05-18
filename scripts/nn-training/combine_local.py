"""Combine orig + self-play datasets locally.

Orig labels: data/datasets/nn/mixed_l60.bin (1.18M, λ=0.6 mixed)
Selfplay labels: data/datasets/nn/selfplay_merged_labels.bin (3.9M, game-result)

Output:
    data/datasets/nn/combined_positions.bin    (5.09M × 129 × float32, ~2.6 GB)
    data/datasets/nn/combined_labels.bin       (5.09M × float32, ~20 MB)
    data/datasets/nn/combined_meta.json
"""
import json
import time
from pathlib import Path

import numpy as np

INPUT_DIM = 129
ROOT = Path("data/datasets/nn")
SHUFFLE_SEED = 13

def load_f32(p): return np.fromfile(p, dtype=np.float32)

t0 = time.time()
print("Loading orig positions...")
orig_pos = load_f32(ROOT / "positions.bin").reshape(-1, INPUT_DIM)
print(f"  {orig_pos.shape}")

print("Loading orig mixed labels...")
orig_lab = load_f32(ROOT / "mixed_l60.bin")
print(f"  {orig_lab.shape}")
assert orig_lab.shape[0] == orig_pos.shape[0]

print("Loading self-play positions (2GB)...")
sp_pos = load_f32(ROOT / "selfplay_merged_positions.bin").reshape(-1, INPUT_DIM)
print(f"  {sp_pos.shape}")

print("Loading self-play labels (game-result)...")
sp_lab = load_f32(ROOT / "selfplay_merged_labels.bin")
print(f"  {sp_lab.shape}")
assert sp_lab.shape[0] == sp_pos.shape[0]

orig_n = int(orig_pos.shape[0])
sp_n = int(sp_pos.shape[0])
total = orig_n + sp_n
print(f"\nCombining: {orig_n} orig + {sp_n} new = {total}")

print("Concatenating positions (this allocates ~2.6 GB)...")
positions = np.concatenate([orig_pos, sp_pos], axis=0)
del orig_pos, sp_pos
labels = np.concatenate([orig_lab, sp_lab])
del orig_lab, sp_lab

print("Shuffling...")
rng = np.random.default_rng(SHUFFLE_SEED)
perm = rng.permutation(total)
positions = positions[perm]
labels = labels[perm]

print(f"Writing combined_positions.bin ({positions.nbytes / 1024**2:.0f} MB)...")
positions.tofile(ROOT / "combined_positions.bin")
print(f"Writing combined_labels.bin ({labels.nbytes / 1024:.0f} KB)...")
labels.tofile(ROOT / "combined_labels.bin")

meta = {
    "count": int(total),
    "inputDim": INPUT_DIM,
    "shuffleSeed": SHUFFLE_SEED,
    "source": {
        "orig": {"count": orig_n, "labels": "mixed_l60"},
        "selfplay": {"count": sp_n, "labels": "game_result"},
    },
    "labelStats": {
        "mean": float(labels.mean()),
        "std": float(labels.std()),
    },
    "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
}
(ROOT / "combined_meta.json").write_text(json.dumps(meta, indent=2))

print(f"\nDone in {(time.time() - t0)/60:.1f} min. Total: {total} positions.")
print(f"Label mean={labels.mean():.4f} std={labels.std():.4f}")
