"""Modal entrypoint for DamaDojo NN training.

This wraps `train.py` so we can run the same code on a serverless H100/A10/T4
on Modal. The dataset is uploaded once to a Modal Volume; subsequent runs
reuse the cached upload.

Usage:
    pip install modal
    modal token new                     # one-time
    modal volume create damadojo-data   # one-time
    # Upload dataset:
    modal volume put damadojo-data \\
        data/datasets/nn/positions.bin /datasets/nn/positions.bin
    modal volume put damadojo-data \\
        data/datasets/nn/labels.bin    /datasets/nn/labels.bin
    modal volume put damadojo-data \\
        data/datasets/nn/meta.json     /datasets/nn/meta.json
    # Run training:
    modal run scripts/nn-training/modal_app.py
    # Download artefacts:
    modal volume get damadojo-data /checkpoints/ ./data/datasets/nn/checkpoints
"""

import modal

stub = modal.App("damadojo-nn-trainer")

# Pick the GPU at run time. H100 is fastest but A10G/T4 are cheaper.
# Override via env var if needed:  GPU=A10G modal run modal_app.py
GPU_CHOICE = "H100"

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install("torch==2.4.0", "numpy==1.26.4")
    .add_local_dir("./", remote_path="/root/checkers", ignore=["node_modules", ".next", "data", ".git", ".claude"])
)

volume = modal.Volume.from_name("damadojo-data", create_if_missing=True)


@stub.function(
    image=image,
    gpu=GPU_CHOICE,
    timeout=60 * 60 * 2,
    volumes={"/data": volume},
)
def train_remote(
    epochs: int = 60,
    batch_size: int = 4096,
    lr: float = 1e-3,
    labels_file: str = "labels.bin",
    out_subdir: str = "checkpoints",
    data_subdir: str = "datasets/nn",
) -> dict:
    import json
    import subprocess
    import sys
    from pathlib import Path

    data_dir = Path(f"/data/{data_subdir}")
    out_dir = Path(f"/data/{out_subdir}")
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"Files under {data_dir}: {list(data_dir.iterdir())}")
    print(f"GPU: {GPU_CHOICE} | labels file: {labels_file} | out: {out_dir}")
    print("Running training…")

    cmd = [
        sys.executable,
        "/root/checkers/scripts/nn-training/train.py",
        "--data-dir", str(data_dir),
        "--out-dir", str(out_dir),
        "--labels-file", labels_file,
        "--epochs", str(epochs),
        "--batch-size", str(batch_size),
        "--lr", str(lr),
        "--device", "cuda",
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    print(result.stdout)
    print(result.stderr)
    if result.returncode != 0:
        raise RuntimeError(f"train.py exit {result.returncode}")

    volume.commit()  # persist checkpoints back to the volume
    manifest_path = out_dir / "damanet.manifest.json"
    return json.loads(manifest_path.read_text())


@stub.local_entrypoint()
def main(
    epochs: int = 60,
    batch_size: int = 4096,
    lr: float = 1e-3,
    labels_file: str = "labels.bin",
    out_subdir: str = "checkpoints",
    data_subdir: str = "datasets/nn",
) -> None:
    manifest = train_remote.remote(
        epochs=epochs,
        batch_size=batch_size,
        lr=lr,
        labels_file=labels_file,
        out_subdir=out_subdir,
        data_subdir=data_subdir,
    )
    print("=" * 60)
    print("Training complete. Manifest:")
    print(manifest)
    print("=" * 60)
    print("Download artefacts with:")
    print(
        "  modal volume get damadojo-data /checkpoints/ "
        "./data/datasets/nn/checkpoints"
    )
