"""Fan out distillation requests to a deployed Cerebrium app.

Sends N parallel POST requests, one per chunk_id, with bounded concurrency.
Reports progress, failures, and final stats.

Usage:
    python scripts/nn-training/cerebrium_fanout.py \
        --url https://api.aws.us-east-1.cerebrium.ai/v4/p-XXXXXX/damadojo-distill/run \
        --auth-token <bearer-or-empty-if-disabled> \
        --total-chunks 800 \
        --concurrency 500
"""

import argparse
import json
import time
import threading
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed


def post_chunk(url: str, auth_token: str, chunk_id: int, total_chunks: int, depth: int, time_ms: int, http_timeout: int) -> dict:
    body = json.dumps({
        "chunk_id": chunk_id,
        "total_chunks": total_chunks,
        "depth": depth,
        "time_ms": time_ms,
    }).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    if auth_token:
        headers["Authorization"] = f"Bearer {auth_token}"
    req = urllib.request.Request(url, data=body, headers=headers, method="POST")
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=http_timeout) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
            return {"chunk_id": chunk_id, "ok": True, "wall_s": time.time() - t0, "payload": payload}
    except urllib.error.HTTPError as e:
        return {"chunk_id": chunk_id, "ok": False, "wall_s": time.time() - t0, "error": f"HTTP {e.code}: {e.read()[:500].decode('utf-8', errors='replace')}"}
    except Exception as e:
        return {"chunk_id": chunk_id, "ok": False, "wall_s": time.time() - t0, "error": str(e)[:500]}


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--url", required=True, help="Cerebrium endpoint URL ending in /run")
    p.add_argument("--auth-token", default="", help="Bearer token (empty if disable_auth=true)")
    p.add_argument("--total-chunks", type=int, default=800)
    p.add_argument("--concurrency", type=int, default=500)
    p.add_argument("--depth", type=int, default=12)
    p.add_argument("--time-ms", type=int, default=500)
    p.add_argument("--http-timeout", type=int, default=4800, help="seconds per request")
    p.add_argument("--first-chunk", type=int, default=0)
    p.add_argument("--last-chunk", type=int, default=-1, help="-1 for total_chunks-1")
    p.add_argument("--out-log", default="data/datasets/nn/cerebrium_fanout.log")
    args = p.parse_args()

    last = args.last_chunk if args.last_chunk >= 0 else args.total_chunks - 1
    chunks = list(range(args.first_chunk, last + 1))
    print(f"Firing {len(chunks)} requests, concurrency={args.concurrency}, total_chunks={args.total_chunks}")
    print(f"  URL: {args.url}")

    lock = threading.Lock()
    log_lines = []
    counts = {"done": 0, "skipped": 0, "error": 0}
    t0 = time.time()

    def cb(future, chunk_id):
        res = future.result()
        with lock:
            if not res["ok"]:
                counts["error"] += 1
                tag = "ERR"
            else:
                inner = res["payload"].get("result", res["payload"])
                status = inner.get("status", "?")
                counts[status] = counts.get(status, 0) + 1
                tag = status.upper()
            elapsed = time.time() - t0
            total_done = sum(counts.values())
            rate = total_done / elapsed if elapsed > 0 else 0
            eta = (len(chunks) - total_done) / rate if rate > 0 else float("inf")
            line = f"[{int(elapsed):5d}s] chunk_{chunk_id:04d} {tag:8s} | done={counts.get('done',0)} skip={counts.get('skipped',0)} err={counts['error']} | {rate:.2f}/s ETA={eta/60:.1f}m"
            print(line, flush=True)
            log_lines.append(json.dumps({"chunk_id": chunk_id, **res}))

    with ThreadPoolExecutor(max_workers=args.concurrency) as exe:
        futures = {}
        for cid in chunks:
            fut = exe.submit(
                post_chunk,
                args.url, args.auth_token, cid,
                args.total_chunks, args.depth, args.time_ms,
                args.http_timeout,
            )
            futures[fut] = cid
        for fut in as_completed(futures):
            cb(fut, futures[fut])

    wall = time.time() - t0
    print("=" * 60)
    print(f"All done in {wall/60:.1f} min")
    for k, v in counts.items():
        print(f"  {k}: {v}")

    with open(args.out_log, "w", encoding="utf-8") as f:
        f.write("\n".join(log_lines))
    print(f"Log: {args.out_log}")


if __name__ == "__main__":
    main()
