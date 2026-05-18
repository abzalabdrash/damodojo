"""Cerebrium training endpoint for DamaNet NN_v4.

Reads /persistent-storage/combined/positions.bin + labels.bin, trains
a 129->256->256->1 MLP, exports weights to /persistent-storage/checkpoints_v4/.
"""
import json
import time
from pathlib import Path

import numpy as np
import torch
from torch import nn
from torch.utils.data import DataLoader, TensorDataset

INPUT_DIM = 129
HIDDEN_DIM = 256

PERSISTENT = Path("/persistent-storage")


class DamaNet(nn.Module):
    def __init__(self):
        super().__init__()
        self.fc1 = nn.Linear(INPUT_DIM, HIDDEN_DIM)
        self.fc2 = nn.Linear(HIDDEN_DIM, HIDDEN_DIM)
        self.fc3 = nn.Linear(HIDDEN_DIM, 1)

    def forward(self, x):
        x = torch.relu(self.fc1(x))
        x = torch.relu(self.fc2(x))
        return torch.sigmoid(self.fc3(x)).squeeze(-1)


def export_weights(model, out_dir: Path, meta: dict):
    out_dir.mkdir(parents=True, exist_ok=True)
    layers, chunks, offset = [], [], 0
    for name, p in model.named_parameters():
        arr = p.detach().cpu().numpy().astype(np.float32)
        flat = arr.flatten()
        chunks.append(flat)
        layers.append({"name": name, "shape": list(arr.shape), "offset": offset, "size": int(flat.size)})
        offset += int(flat.size)
    blob = np.concatenate(chunks).astype(np.float32)
    blob.tofile(out_dir / "damanet.weights.bin")
    manifest = {
        "architecture": {"inputDim": INPUT_DIM, "hiddenDim": HIDDEN_DIM, "layout": "fc1 (Linear+ReLU) -> fc2 (Linear+ReLU) -> fc3 (Linear+Sigmoid)"},
        "totalFloats": int(blob.size),
        "totalBytes": int(blob.nbytes),
        "layers": layers,
        "datasetMeta": meta,
        "trainedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    (out_dir / "damanet.manifest.json").write_text(json.dumps(manifest, indent=2))


def run(
    epochs: int = 60,
    batch_size: int = 4096,
    lr: float = 1e-3,
    val_fraction: float = 0.05,
    seed: int = 1337,
    data_subdir: str = "combined",
    out_subdir: str = "checkpoints_v4",
):
    torch.manual_seed(seed)
    np.random.seed(seed)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Device: {device}")

    data_dir = PERSISTENT / data_subdir
    out_dir = PERSISTENT / out_subdir

    print(f"Loading positions...")
    positions = np.fromfile(data_dir / "positions.bin", dtype=np.float32)
    count = positions.size // INPUT_DIM
    positions = positions.reshape(count, INPUT_DIM)
    print(f"  {positions.shape}")

    print(f"Loading labels...")
    labels = np.fromfile(data_dir / "labels.bin", dtype=np.float32)
    assert labels.size == count
    print(f"  mean={labels.mean():.4f} std={labels.std():.4f}")

    meta = {"count": int(count), "inputDim": INPUT_DIM, "source": "combined orig+selfplay"}

    rng = np.random.default_rng(seed)
    perm = rng.permutation(count)
    n_val = int(round(count * val_fraction))
    val_idx, train_idx = perm[:n_val], perm[n_val:]

    pin = device.type == "cuda"
    train_ds = TensorDataset(torch.from_numpy(positions[train_idx]), torch.from_numpy(labels[train_idx]))
    val_ds = TensorDataset(torch.from_numpy(positions[val_idx]), torch.from_numpy(labels[val_idx]))
    train_loader = DataLoader(train_ds, batch_size=batch_size, shuffle=True, num_workers=2, pin_memory=pin, drop_last=True)
    val_loader = DataLoader(val_ds, batch_size=batch_size, shuffle=False, num_workers=1, pin_memory=pin)
    print(f"  train={len(train_ds)} val={len(val_ds)}")

    model = DamaNet().to(device)
    print(f"Params: {sum(p.numel() for p in model.parameters()):,}")
    loss_fn = nn.MSELoss()
    opt = torch.optim.Adam(model.parameters(), lr=lr, weight_decay=1e-5)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=epochs)

    best_val = float("inf")
    history = []
    for epoch in range(1, epochs + 1):
        t0 = time.time()
        model.train()
        train_loss, n = 0.0, 0
        for x, y in train_loader:
            x, y = x.to(device, non_blocking=True), y.to(device, non_blocking=True)
            pred = model(x)
            loss = loss_fn(pred, y)
            opt.zero_grad(set_to_none=True)
            loss.backward()
            opt.step()
            train_loss += float(loss.detach()) * x.size(0)
            n += x.size(0)
        train_loss /= n

        model.eval()
        val_loss, vn, mae = 0.0, 0, 0.0
        with torch.no_grad():
            for x, y in val_loader:
                x, y = x.to(device, non_blocking=True), y.to(device, non_blocking=True)
                pred = model(x)
                val_loss += float(loss_fn(pred, y).detach()) * x.size(0)
                mae += float((pred - y).abs().sum().detach())
                vn += x.size(0)
        val_loss /= vn
        mae /= vn

        sched.step()
        elapsed = time.time() - t0
        history.append({"epoch": epoch, "trainLoss": train_loss, "valLoss": val_loss, "valMae": mae, "elapsedSec": elapsed})
        print(f"epoch {epoch:3d}/{epochs} | train {train_loss:.5f} | val {val_loss:.5f} | mae {mae:.4f} | {elapsed:.1f}s")
        if val_loss < best_val:
            best_val = val_loss
            export_weights(model, out_dir, meta)

    (out_dir / "history.json").write_text(json.dumps(history, indent=2))
    return {"best_val_loss": best_val, "epochs": epochs, "count": count, "weights_path": str(out_dir / "damanet.weights.bin")}
