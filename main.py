"""Cerebrium entrypoint for parallel distillation labelling.

Each HTTP request processes one chunk of positions, running depth-12 search
through the TypeScript engine (via Node.js + tsx subprocess). Output is
written to /persistent-storage/distilled_selfplay/chunk_NNNN.bin so that
clients can fan out hundreds of requests in parallel.

Resume logic: if the output file already exists with the expected byte
count, the request returns immediately (no work).
"""

import os
import subprocess
from pathlib import Path

TOTAL_POSITIONS = 3_908_808
DEFAULT_TOTAL_CHUNKS = 800
PERSISTENT = Path("/persistent-storage")


def _chunk_range(chunk_id: int, total_chunks: int) -> tuple[int, int]:
    chunk_size = (TOTAL_POSITIONS + total_chunks - 1) // total_chunks
    start = chunk_id * chunk_size
    end = min(start + chunk_size, TOTAL_POSITIONS)
    return start, end


def run(
    chunk_id: int,
    total_chunks: int = DEFAULT_TOTAL_CHUNKS,
    depth: int = 12,
    time_ms: int = 500,
    positions_subpath: str = "selfplay/merged_positions.bin",
    out_subdir: str = "distilled_selfplay",
):
    start, end = _chunk_range(chunk_id, total_chunks)
    if start >= end:
        return {"chunk_id": chunk_id, "status": "empty", "start": start, "end": end}

    out_dir = PERSISTENT / out_subdir
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"chunk_{chunk_id:04d}.bin"

    expected_bytes = (end - start) * 4
    if out_path.exists() and out_path.stat().st_size == expected_bytes:
        return {
            "chunk_id": chunk_id,
            "status": "skipped",
            "start": start,
            "end": end,
            "size_bytes": expected_bytes,
        }

    positions_path = str(PERSISTENT / positions_subpath)
    cmd = [
        "node",
        "--import", "tsx",
        "/cortex/scripts/nn-training/label_distill.mjs",
        "--positions", positions_path,
        "--output", str(out_path),
        "--start", str(start),
        "--end", str(end),
        "--depth", str(depth),
        "--time-ms", str(time_ms),
        "--log-every", "5000",
    ]
    result = subprocess.run(
        cmd,
        cwd="/cortex",
        capture_output=True,
        text=True,
        timeout=4500,
    )
    if result.returncode != 0:
        tail = result.stderr.strip().splitlines()[-20:]
        raise RuntimeError(
            f"node exit {result.returncode}: " + "\n".join(tail)
        )

    return {
        "chunk_id": chunk_id,
        "status": "done",
        "start": start,
        "end": end,
        "out_path": str(out_path),
        "size_bytes": out_path.stat().st_size,
        "tail": "\n".join(result.stdout.strip().splitlines()[-3:]),
    }
