"""DamaDojo NN evaluator — training script.

Reads the binary dataset produced by `scripts/build-nn-dataset.mjs`, trains a
small MLP that maps a 129-float position vector to a win-probability score
for the side-to-move, and exports the trained weights as a packed Float32
binary alongside a JSON manifest.

Designed to run on:
- a local CPU/GPU for debugging,
- Modal (https://modal.com) with an H100 / A10 / T4 GPU for the full run,
- an AMD GPU machine via PyTorch ROCm,
- or any standard NVIDIA box (just `python train.py`).

Architecture: 129 → 256 → 256 → 1 with ReLU + sigmoid (~100k parameters).
This is intentionally small so we can ship the weights as a ~400 KB asset
inside the Next.js bundle and run inference in the browser worker.

Usage (local):
    pip install torch numpy
    python train.py --data-dir ../../data/datasets/nn

Usage (Modal):
    modal run modal_app.py
"""

import argparse
import json
import os
import sys
import time
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import torch
from torch import nn
from torch.utils.data import DataLoader, TensorDataset

INPUT_DIM = 129
HIDDEN_DIM = 256
DEFAULT_BATCH_SIZE = 4096
DEFAULT_EPOCHS = 60
DEFAULT_LR = 1e-3
DEFAULT_WEIGHT_DECAY = 1e-5
DEFAULT_VAL_FRACTION = 0.08


@dataclass
class TrainConfig:
    data_dir: Path
    out_dir: Path
    labels_file: str = "labels.bin"
    batch_size: int = DEFAULT_BATCH_SIZE
    epochs: int = DEFAULT_EPOCHS
    lr: float = DEFAULT_LR
    weight_decay: float = DEFAULT_WEIGHT_DECAY
    val_fraction: float = DEFAULT_VAL_FRACTION
    device: str = "auto"
    seed: int = 1337


def parse_args() -> TrainConfig:
    p = argparse.ArgumentParser()
    p.add_argument("--data-dir", type=Path, default=Path("../../data/datasets/nn"))
    p.add_argument("--out-dir", type=Path, default=Path("../../data/datasets/nn/checkpoints"))
    p.add_argument("--labels-file", type=str, default="labels.bin",
                   help="Filename within data-dir for the labels (e.g. labels.bin or distilled.bin)")
    p.add_argument("--batch-size", type=int, default=DEFAULT_BATCH_SIZE)
    p.add_argument("--epochs", type=int, default=DEFAULT_EPOCHS)
    p.add_argument("--lr", type=float, default=DEFAULT_LR)
    p.add_argument("--weight-decay", type=float, default=DEFAULT_WEIGHT_DECAY)
    p.add_argument("--val-fraction", type=float, default=DEFAULT_VAL_FRACTION)
    p.add_argument("--device", type=str, default="auto", help="auto | cpu | cuda | mps")
    p.add_argument("--seed", type=int, default=1337)
    args = p.parse_args()
    return TrainConfig(**vars(args))


def pick_device(arg: str) -> torch.device:
    if arg != "auto":
        return torch.device(arg)
    if torch.cuda.is_available():
        return torch.device("cuda")
    if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        return torch.device("mps")
    return torch.device("cpu")


def load_dataset(data_dir: Path, labels_file: str = "labels.bin") -> tuple[np.ndarray, np.ndarray, dict]:
    meta_path = data_dir / "meta.json"
    pos_path = data_dir / "positions.bin"
    lab_path = data_dir / labels_file
    for p in (meta_path, pos_path, lab_path):
        if not p.exists():
            sys.exit(f"Missing dataset artefact: {p}")
    meta = json.loads(meta_path.read_text())
    count = meta["count"]
    input_dim = meta["inputDim"]
    if input_dim != INPUT_DIM:
        sys.exit(f"Input-dim mismatch: dataset says {input_dim}, code expects {INPUT_DIM}")
    positions = np.fromfile(pos_path, dtype=np.float32).reshape(count, input_dim)
    labels = np.fromfile(lab_path, dtype=np.float32)
    assert labels.shape == (count,), f"label shape {labels.shape} != ({count},)"
    print(f"  Labels source: {lab_path.name}")
    return positions, labels, meta


class DamaNet(nn.Module):
    def __init__(self) -> None:
        super().__init__()
        self.fc1 = nn.Linear(INPUT_DIM, HIDDEN_DIM)
        self.fc2 = nn.Linear(HIDDEN_DIM, HIDDEN_DIM)
        self.fc3 = nn.Linear(HIDDEN_DIM, 1)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = torch.relu(self.fc1(x))
        x = torch.relu(self.fc2(x))
        return torch.sigmoid(self.fc3(x)).squeeze(-1)


def split_train_val(
    positions: np.ndarray, labels: np.ndarray, val_fraction: float, seed: int
) -> tuple[TensorDataset, TensorDataset]:
    n = positions.shape[0]
    rng = np.random.default_rng(seed)
    perm = rng.permutation(n)
    n_val = int(round(n * val_fraction))
    val_idx = perm[:n_val]
    train_idx = perm[n_val:]
    train = TensorDataset(
        torch.from_numpy(positions[train_idx]),
        torch.from_numpy(labels[train_idx]),
    )
    val = TensorDataset(
        torch.from_numpy(positions[val_idx]),
        torch.from_numpy(labels[val_idx]),
    )
    return train, val


def train_one_epoch(
    model: DamaNet,
    loader: DataLoader,
    optimizer: torch.optim.Optimizer,
    loss_fn: nn.Module,
    device: torch.device,
) -> float:
    model.train()
    total_loss = 0.0
    total_n = 0
    for x, y in loader:
        x = x.to(device, non_blocking=True)
        y = y.to(device, non_blocking=True)
        pred = model(x)
        loss = loss_fn(pred, y)
        optimizer.zero_grad(set_to_none=True)
        loss.backward()
        optimizer.step()
        total_loss += float(loss.detach()) * x.size(0)
        total_n += x.size(0)
    return total_loss / total_n


@torch.no_grad()
def evaluate_model(model: DamaNet, loader: DataLoader, loss_fn: nn.Module, device: torch.device) -> tuple[float, float]:
    model.eval()
    total_loss = 0.0
    total_n = 0
    total_abs_err = 0.0
    for x, y in loader:
        x = x.to(device, non_blocking=True)
        y = y.to(device, non_blocking=True)
        pred = model(x)
        loss = loss_fn(pred, y)
        total_loss += float(loss.detach()) * x.size(0)
        total_abs_err += float((pred - y).abs().sum().detach())
        total_n += x.size(0)
    return total_loss / total_n, total_abs_err / total_n


def export_weights(model: DamaNet, out_dir: Path, meta: dict) -> None:
    """Pack all parameters into a single contiguous float32 binary plus a manifest."""
    out_dir.mkdir(parents=True, exist_ok=True)
    layers = []
    chunks: list[np.ndarray] = []
    offset = 0
    for name, param in model.named_parameters():
        arr = param.detach().cpu().numpy().astype(np.float32)
        flat = arr.flatten()
        chunks.append(flat)
        layers.append({
            "name": name,
            "shape": list(arr.shape),
            "offset": offset,
            "size": flat.size,
        })
        offset += flat.size

    blob = np.concatenate(chunks).astype(np.float32)
    weights_path = out_dir / "damanet.weights.bin"
    manifest_path = out_dir / "damanet.manifest.json"

    blob.tofile(weights_path)
    manifest = {
        "architecture": {
            "inputDim": INPUT_DIM,
            "hiddenDim": HIDDEN_DIM,
            "layout": "fc1 (Linear+ReLU) → fc2 (Linear+ReLU) → fc3 (Linear+Sigmoid)",
        },
        "totalFloats": int(blob.size),
        "totalBytes": int(blob.nbytes),
        "layers": layers,
        "datasetMeta": meta,
        "trainedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    manifest_path.write_text(json.dumps(manifest, indent=2))
    print(f"  exported weights: {weights_path} ({blob.nbytes / 1024:.1f} KB)")
    print(f"  exported manifest: {manifest_path}")


def main() -> None:
    cfg = parse_args()
    torch.manual_seed(cfg.seed)
    np.random.seed(cfg.seed)

    device = pick_device(cfg.device)
    print(f"Device: {device}")

    print(f"Loading dataset from {cfg.data_dir}…")
    positions, labels, meta = load_dataset(cfg.data_dir, cfg.labels_file)
    print(f"  {positions.shape[0]} positions, dim {positions.shape[1]}")
    print(f"  label range: [{labels.min():.4f}, {labels.max():.4f}], mean {labels.mean():.4f}, std {labels.std():.4f}")

    train_ds, val_ds = split_train_val(positions, labels, cfg.val_fraction, cfg.seed)
    print(f"  train: {len(train_ds)}, val: {len(val_ds)}")

    pin_memory = device.type == "cuda"
    train_loader = DataLoader(
        train_ds, batch_size=cfg.batch_size, shuffle=True,
        num_workers=2, pin_memory=pin_memory, drop_last=True,
    )
    val_loader = DataLoader(
        val_ds, batch_size=cfg.batch_size, shuffle=False,
        num_workers=1, pin_memory=pin_memory,
    )

    model = DamaNet().to(device)
    print(f"Parameters: {sum(p.numel() for p in model.parameters()):,}")

    loss_fn = nn.MSELoss()
    optimizer = torch.optim.Adam(model.parameters(), lr=cfg.lr, weight_decay=cfg.weight_decay)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=cfg.epochs)

    cfg.out_dir.mkdir(parents=True, exist_ok=True)
    best_val_loss = float("inf")
    history: list[dict] = []

    for epoch in range(1, cfg.epochs + 1):
        t0 = time.time()
        train_loss = train_one_epoch(model, train_loader, optimizer, loss_fn, device)
        val_loss, val_mae = evaluate_model(model, val_loader, loss_fn, device)
        scheduler.step()
        elapsed = time.time() - t0
        history.append({
            "epoch": epoch,
            "trainLoss": train_loss,
            "valLoss": val_loss,
            "valMae": val_mae,
            "elapsedSec": elapsed,
        })
        print(
            f"epoch {epoch:3d}/{cfg.epochs} | "
            f"train {train_loss:.5f} | val {val_loss:.5f} | mae {val_mae:.4f} | "
            f"lr {scheduler.get_last_lr()[0]:.2e} | {elapsed:.1f}s"
        )
        if val_loss < best_val_loss:
            best_val_loss = val_loss
            export_weights(model, cfg.out_dir, meta)
            print(f"  best val_loss so far: {best_val_loss:.5f}")

    (cfg.out_dir / "history.json").write_text(json.dumps(history, indent=2))
    print(f"Done. Best val loss: {best_val_loss:.5f}")


if __name__ == "__main__":
    main()
