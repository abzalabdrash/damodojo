"""Modal entrypoint for parallel self-play game generation.

Generates N games of self-play across many CPU workers using the current
NN weights. Each worker writes a chunk; merge step concatenates into a
single positions.bin + labels.bin pair under /data/selfplay/.

This is the "data generation" half of the AlphaZero loop. Pair with:
  - modal_distill.py  (to relabel the resulting positions with depth-12)
  - modal_app.py      (to retrain on the combined dataset)

Usage:
    modal run scripts/nn-training/modal_self_play.py
    modal run scripts/nn-training/modal_self_play.py --total-games 10000 --workers 50
"""

import modal

stub = modal.App("damadojo-selfplay")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("curl", "gnupg", "ca-certificates")
    .pip_install("numpy==1.26.4")
    .run_commands(
        "curl -fsSL https://deb.nodesource.com/setup_20.x | bash -",
        "apt-get install -y nodejs",
    )
    .add_local_dir(
        "./",
        remote_path="/root/checkers",
        copy=True,
        ignore=[
            "node_modules",
            ".next",
            "data",
            ".git",
            ".claude",
            "scripts/nn-training/__pycache__",
        ],
    )
    .run_commands(
        "cd /root/checkers && npm install --no-audit --no-fund --loglevel=error",
    )
)

volume = modal.Volume.from_name("damadojo-data", create_if_missing=False)


@stub.function(
    image=image,
    cpu=1,
    timeout=60 * 90,
    volumes={"/data": volume},
    max_containers=120,
)
def generate_chunk(
    chunk_id: int,
    games_per_chunk: int,
    weights_subpath: str,
    manifest_subpath: str,
    time_ms: int,
    depth: int,
    seed_base: int,
) -> dict:
    import subprocess
    import time
    from pathlib import Path

    out_dir = Path("/data/selfplay")
    out_dir.mkdir(parents=True, exist_ok=True)
    out_pos = out_dir / f"chunk_{chunk_id:04d}_positions.bin"
    out_lab = out_dir / f"chunk_{chunk_id:04d}_labels.bin"

    weights_full = f"/data/{weights_subpath}"
    manifest_full = f"/data/{manifest_subpath}"

    cmd = [
        "node",
        "--import", "tsx",
        "/root/checkers/scripts/nn-training/self_play_generate.mjs",
        "--weights", weights_full,
        "--manifest", manifest_full,
        "--games", str(games_per_chunk),
        "--time-ms", str(time_ms),
        "--depth", str(depth),
        "--seed", str(seed_base + chunk_id),
        "--out-positions", str(out_pos),
        "--out-labels", str(out_lab),
        "--log-every", "100",
    ]
    t0 = time.time()
    proc = subprocess.run(cmd, cwd="/root/checkers", capture_output=True, text=True)
    wall_s = time.time() - t0
    if proc.returncode != 0:
        print(f"chunk {chunk_id} FAILED: {proc.stderr[-2000:]}")
        raise RuntimeError(f"chunk {chunk_id} exit {proc.returncode}")
    volume.commit()
    last = "\n".join(proc.stdout.strip().splitlines()[-3:])
    print(f"chunk {chunk_id:04d}: {games_per_chunk} games, {wall_s:.0f}s\n{last}")
    return {
        "chunk_id": chunk_id,
        "games": games_per_chunk,
        "wall_s": wall_s,
        "positions_bytes": out_pos.stat().st_size,
        "labels_bytes": out_lab.stat().st_size,
    }


@stub.function(
    image=image,
    cpu=2,
    timeout=60 * 30,
    volumes={"/data": volume},
)
def merge_selfplay() -> dict:
    import json
    import numpy as np
    from pathlib import Path

    in_dir = Path("/data/selfplay")
    pos_chunks = sorted(in_dir.glob("chunk_*_positions.bin"))
    lab_chunks = sorted(in_dir.glob("chunk_*_labels.bin"))
    assert len(pos_chunks) == len(lab_chunks)

    pos_arrays = [np.fromfile(c, dtype=np.float32) for c in pos_chunks]
    lab_arrays = [np.fromfile(c, dtype=np.float32) for c in lab_chunks]
    all_pos = np.concatenate(pos_arrays)
    all_lab = np.concatenate(lab_arrays)
    n_pos = all_pos.size // 129
    assert all_lab.size == n_pos

    merged_pos = in_dir / "merged_positions.bin"
    merged_lab = in_dir / "merged_labels.bin"
    all_pos.tofile(merged_pos)
    all_lab.tofile(merged_lab)

    meta = {
        "count": int(n_pos),
        "inputDim": 129,
        "source": "self-play",
        "chunks": len(pos_chunks),
    }
    (in_dir / "merged_meta.json").write_text(json.dumps(meta, indent=2))
    volume.commit()
    return {
        "n_positions": int(n_pos),
        "pos_bytes": int(all_pos.nbytes),
        "lab_bytes": int(all_lab.nbytes),
    }


@stub.local_entrypoint()
def main(
    total_games: int = 10000,
    workers: int = 50,
    time_ms: int = 100,
    depth: int = 6,
    weights_subpath: str = "checkpoints/damanet.weights.bin",
    manifest_subpath: str = "checkpoints/damanet.manifest.json",
    seed_base: int = 100000,
) -> None:
    games_per_chunk = (total_games + workers - 1) // workers
    print(f"Self-play: total={total_games} across {workers} workers ({games_per_chunk}/worker)")
    print(f"Per-move budget: {time_ms}ms / depth {depth}")

    args = [
        (i, games_per_chunk, weights_subpath, manifest_subpath, time_ms, depth, seed_base)
        for i in range(workers)
    ]
    results = list(generate_chunk.starmap(args))
    total_secs = max(r["wall_s"] for r in results)
    print(f"All workers done. Slowest worker: {total_secs:.0f}s")

    print("Merging chunks…")
    summary = merge_selfplay.remote()
    print("=" * 60)
    print("Self-play generation complete.")
    print(summary)
    print("=" * 60)
