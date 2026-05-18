"""Modal entrypoint for knowledge-distillation labelling.

Runs the production TypeScript engine at depth N on every position in the
dataset, in parallel across 100 CPU workers. Writes per-chunk score files
to the Modal volume, then merges them into a single distilled.bin.

Usage:
    modal run scripts/nn-training/modal_distill.py
    modal run scripts/nn-training/modal_distill.py --total-chunks 100 --depth 12 --time-ms 500
"""

import modal

stub = modal.App("damadojo-distill")

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
            "public/nn",
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
    timeout=60 * 80,
    volumes={"/data": volume},
    max_containers=100,
    retries=2,
)
def label_chunk(
    chunk_id: int,
    total_chunks: int,
    total_positions: int,
    depth: int,
    time_ms: int,
    positions_path: str = "/data/datasets/nn/positions.bin",
    output_subdir: str = "distilled",
) -> dict:
    import subprocess
    import time
    from pathlib import Path

    chunk_size = (total_positions + total_chunks - 1) // total_chunks
    start = chunk_id * chunk_size
    end = min(start + chunk_size, total_positions)
    if start >= end:
        return {"chunk_id": chunk_id, "start": start, "end": end, "count": 0, "wall_s": 0.0}

    out_dir = Path(f"/data/{output_subdir}")
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"chunk_{chunk_id:04d}.bin"

    # Resume: if chunk already labelled with correct byte count, skip.
    expected_bytes = (end - start) * 4
    if out_path.exists() and out_path.stat().st_size == expected_bytes:
        print(f"chunk {chunk_id:04d} already exists, skipping")
        return {
            "chunk_id": chunk_id,
            "start": start,
            "end": end,
            "count": end - start,
            "wall_s": 0.0,
            "skipped": True,
        }

    cmd = [
        "node",
        "--import", "tsx",
        "/root/checkers/scripts/nn-training/label_distill.mjs",
        "--positions", positions_path,
        "--output", str(out_path),
        "--start", str(start),
        "--end", str(end),
        "--depth", str(depth),
        "--time-ms", str(time_ms),
        "--log-every", "5000",
    ]
    t0 = time.time()
    proc = subprocess.run(cmd, cwd="/root/checkers", capture_output=True, text=True)
    wall_s = time.time() - t0
    if proc.returncode != 0:
        print(f"chunk {chunk_id} FAILED: {proc.stderr[-2000:]}")
        raise RuntimeError(f"chunk {chunk_id} exit {proc.returncode}")
    volume.commit()
    last = "\n".join(proc.stdout.strip().splitlines()[-3:])
    print(f"chunk {chunk_id:04d} [{start},{end}) done in {wall_s:.1f}s\n{last}")
    return {
        "chunk_id": chunk_id,
        "start": start,
        "end": end,
        "count": end - start,
        "wall_s": wall_s,
    }


@stub.function(
    image=image,
    cpu=2,
    timeout=60 * 30,
    volumes={"/data": volume},
)
def merge_chunks(
    total_chunks: int,
    total_positions: int,
    output_subdir: str = "distilled",
    merged_path: str = "/data/datasets/nn/distilled.bin",
) -> dict:
    import numpy as np
    from pathlib import Path

    out_dir = Path(f"/data/{output_subdir}")
    chunks = sorted(out_dir.glob("chunk_*.bin"))
    assert len(chunks) == total_chunks, f"expected {total_chunks}, found {len(chunks)}"

    full = np.empty(total_positions, dtype=np.float32)
    cursor = 0
    for c in chunks:
        arr = np.fromfile(c, dtype=np.float32)
        full[cursor : cursor + len(arr)] = arr
        cursor += len(arr)
    assert cursor == total_positions, f"merge cursor {cursor} != {total_positions}"

    merged_path_obj = Path(merged_path)
    merged_path_obj.parent.mkdir(parents=True, exist_ok=True)
    full.tofile(merged_path_obj)
    volume.commit()
    return {
        "total": int(cursor),
        "mean": float(full.mean()),
        "std": float(full.std()),
        "min": float(full.min()),
        "max": float(full.max()),
        "merged_path": str(merged_path_obj),
        "size_bytes": int(full.nbytes),
    }


@stub.local_entrypoint()
def distill_selfplay(total_chunks: int = 800, depth: int = 12, time_ms: int = 500) -> None:
    """Distill the self-play positions (under /data/selfplay/merged_positions.bin)."""
    import json
    total_positions = 3908808  # from self-play merge result
    print(f"Distilling self-play positions: {total_positions} across {total_chunks} chunks")

    args = [
        (
            i,
            total_chunks,
            total_positions,
            depth,
            time_ms,
            "/data/selfplay/merged_positions.bin",
            "distilled_selfplay",
        )
        for i in range(total_chunks)
    ]
    results = list(label_chunk.starmap(args))
    done = sum(r["count"] for r in results)
    max_wall = max(r["wall_s"] for r in results)
    print(f"All chunks done: {done} positions, max wall {max_wall:.1f}s")

    print("Merging chunks…")
    summary = merge_chunks.remote(
        total_chunks=total_chunks,
        total_positions=total_positions,
        output_subdir="distilled_selfplay",
        merged_path="/data/selfplay/distilled.bin",
    )
    print("=" * 60)
    print("Self-play distillation complete.")
    print(json.dumps(summary, indent=2))
    print("=" * 60)


@stub.local_entrypoint()
def merge_only(total_chunks: int = 400) -> None:
    import json
    from pathlib import Path

    meta_path = Path("data/datasets/nn/meta.json")
    meta = json.loads(meta_path.read_text())
    total_positions = int(meta["count"])

    print(f"Merging {total_chunks} chunks ({total_positions} positions total)…")
    summary = merge_chunks.remote(total_chunks=total_chunks, total_positions=total_positions)
    print(json.dumps(summary, indent=2))


@stub.local_entrypoint()
def main(total_chunks: int = 400, depth: int = 12, time_ms: int = 500) -> None:
    import json
    from pathlib import Path

    meta_path = Path("data/datasets/nn/meta.json")
    meta = json.loads(meta_path.read_text())
    total_positions = int(meta["count"])

    print(f"Total positions: {total_positions}")
    print(f"Chunks: {total_chunks}, depth={depth}, time-budget={time_ms}ms")
    print(f"Chunk size: ~{total_positions // total_chunks} positions each")

    args = [
        (i, total_chunks, total_positions, depth, time_ms)
        for i in range(total_chunks)
    ]
    print(f"Launching {len(args)} parallel workers…")

    results = list(label_chunk.starmap(args))
    done = sum(r["count"] for r in results)
    avg_wall = sum(r["wall_s"] for r in results) / max(1, len(results))
    max_wall = max(r["wall_s"] for r in results)
    print(f"All chunks done: {done} positions, avg wall {avg_wall:.1f}s, max {max_wall:.1f}s")

    print("Merging chunks…")
    summary = merge_chunks.remote(total_chunks=total_chunks, total_positions=total_positions)
    print("=" * 60)
    print("Distillation labelling complete.")
    print(json.dumps(summary, indent=2))
    print("=" * 60)
    print(
        "Download: modal volume get damadojo-data /datasets/nn/distilled.bin "
        "./data/datasets/nn/distilled.bin"
    )
