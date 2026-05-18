"""Combine original + self-play datasets on Modal volume.

Reads from /data/datasets/nn/ (1.18M orig) and /data/selfplay/ (3.9M new),
concatenates positions + labels + distilled, shuffles in-sync, writes the
combined arrays back to /data/combined/.

Also produces a Stockfish-style mixed labels file ready for retraining.

Usage:
    modal run scripts/nn-training/modal_combine.py
    modal run scripts/nn-training/modal_combine.py --shuffle-seed 17 --lambda-mix 0.6
"""

import modal

stub = modal.App("damadojo-combine")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install("numpy==1.26.4")
)

volume = modal.Volume.from_name("damadojo-data", create_if_missing=False)

INPUT_DIM = 129


@stub.function(
    image=image,
    cpu=4,
    timeout=60 * 60,
    volumes={"/data": volume},
)
def combine_and_mix(shuffle_seed: int = 17, lambda_mix: float = 0.6) -> dict:
    import json
    import numpy as np
    from pathlib import Path

    orig_pos = np.fromfile("/data/datasets/nn/positions.bin", dtype=np.float32)
    orig_lab = np.fromfile("/data/datasets/nn/labels.bin", dtype=np.float32)
    orig_dist = np.fromfile("/data/datasets/nn/distilled.bin", dtype=np.float32)
    new_pos = np.fromfile("/data/selfplay/merged_positions.bin", dtype=np.float32)
    new_lab = np.fromfile("/data/selfplay/merged_labels.bin", dtype=np.float32)
    new_dist = np.fromfile("/data/selfplay/distilled.bin", dtype=np.float32)

    orig_n = orig_pos.size // INPUT_DIM
    new_n = new_pos.size // INPUT_DIM
    assert orig_lab.size == orig_n and orig_dist.size == orig_n, (
        f"orig sizes: pos={orig_n}, lab={orig_lab.size}, dist={orig_dist.size}"
    )
    assert new_lab.size == new_n and new_dist.size == new_n, (
        f"new sizes: pos={new_n}, lab={new_lab.size}, dist={new_dist.size}"
    )
    total_n = orig_n + new_n
    print(f"Orig: {orig_n}, New: {new_n}, Total: {total_n}")

    # Reshape positions to (N, 129) for row-wise shuffle
    orig_pos = orig_pos.reshape(orig_n, INPUT_DIM)
    new_pos = new_pos.reshape(new_n, INPUT_DIM)
    positions = np.concatenate([orig_pos, new_pos], axis=0)
    labels = np.concatenate([orig_lab, new_lab], axis=0)
    distilled = np.concatenate([orig_dist, new_dist], axis=0)

    # Shuffle in-sync
    rng = np.random.default_rng(shuffle_seed)
    perm = rng.permutation(total_n)
    positions = positions[perm]
    labels = labels[perm]
    distilled = distilled[perm]

    # Mix labels: target = λ * distilled + (1-λ) * game_result
    mixed = lambda_mix * distilled + (1.0 - lambda_mix) * labels
    mixed = mixed.astype(np.float32)

    out_dir = Path("/data/combined")
    out_dir.mkdir(parents=True, exist_ok=True)
    positions.tofile(out_dir / "positions.bin")
    labels.tofile(out_dir / "labels.bin")
    distilled.tofile(out_dir / "distilled.bin")
    mixed.tofile(out_dir / f"mixed_l{int(lambda_mix * 100)}.bin")
    meta = {
        "count": int(total_n),
        "inputDim": INPUT_DIM,
        "shuffleSeed": shuffle_seed,
        "lambdaMix": lambda_mix,
        "source": {
            "orig": {"count": int(orig_n)},
            "selfplay": {"count": int(new_n)},
        },
        "labelStats": {
            "gameResult": {
                "mean": float(labels.mean()),
                "std": float(labels.std()),
            },
            "distilled": {
                "mean": float(distilled.mean()),
                "std": float(distilled.std()),
            },
            "mixed": {
                "mean": float(mixed.mean()),
                "std": float(mixed.std()),
            },
        },
    }
    (out_dir / "meta.json").write_text(json.dumps(meta, indent=2))
    volume.commit()
    print("Combined dataset stats:")
    print(json.dumps(meta, indent=2))
    return meta


@stub.local_entrypoint()
def main(shuffle_seed: int = 17, lambda_mix: float = 0.6) -> None:
    meta = combine_and_mix.remote(shuffle_seed=shuffle_seed, lambda_mix=lambda_mix)
    print("=" * 60)
    print("Combine complete.")
    print(f"  Total: {meta['count']} positions ({meta['source']['orig']['count']} + {meta['source']['selfplay']['count']})")
    print(f"  Mixed labels: mean={meta['labelStats']['mixed']['mean']:.4f} std={meta['labelStats']['mixed']['std']:.4f}")
    print("=" * 60)
    print(f"Ready to retrain: modal run scripts/nn-training/modal_app.py --labels-file mixed_l{int(lambda_mix*100)}.bin --out-subdir checkpoints_v4")
    print("(NOTE: update modal_app data_dir to /data/combined for this retrain)")
