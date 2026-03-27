# ComfyUI Dazzle Command
### *One Toggle to Rule Them All*

[![Python 3.10+](https://img.shields.io/badge/python-3.10+-blue.svg)](https://www.python.org/downloads/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Workflow orchestration node for ComfyUI. Coordinate seed control and execution gates from a single toggle.

Part of the [DazzleNodes](https://github.com/DazzleNodes/DazzleNodes) collection.

## What It Does

Dazzle Command outputs a `DAZZLE_SIGNAL` that receiving nodes use to adjust their behavior:

| State | Seed nodes (SmartResCalc) | Gate nodes (Preview Bridge Extended) |
|-------|--------------------------|--------------------------------------|
| **Reviewing** | Generate new random seeds (configurable) | Block execution (configurable mode) |
| **Proceeding** | Lock to last seed (configurable) | Unblock execution |

Instead of navigating to multiple nodes and clicking multiple widgets, toggle one state on Dazzle Command.

## Signal Protocol

Dazzle Command outputs a `DAZZLE_SIGNAL` dict:

```python
{
    "state": "reviewing" | "proceeding",
    "seed_intent": "random" | "lock" | "lock_current" | None,
    "gate_intent": "open" | "block" | None,
    "gate_mode": "never" | "auto" | "always" | "if_empty_mask" | "if_empty_editor",
    "schema_version": 1,
}
```

Receiving nodes interpret the signal based on their own capabilities. Nodes without a signal connection behave exactly as before (backward compatible).

## Installation

### Via ComfyUI Manager
Search for "Dazzle Command" in ComfyUI Manager.

### Manual
Clone into your ComfyUI custom_nodes directory:
```bash
cd ComfyUI/custom_nodes
git clone https://github.com/DazzleNodes/ComfyUI-DazzleCommand.git
```

### Via DazzleNodes Collection
Included automatically when using the [DazzleNodes](https://github.com/DazzleNodes/DazzleNodes) aggregate package.

## Compatible Nodes

| Node | Signal Support | What It Controls |
|------|---------------|-----------------|
| [Smart Resolution Calculator](https://github.com/djdarcy/ComfyUI-Smart-Resolution-Calc) | `seed_intent` | Seed randomize/lock behavior |
| [Preview Bridge Extended](https://github.com/DazzleNodes/ComfyUI-PreviewBridgeExtended) | `gate_intent` | Execution blocking mode |

Any node can accept `DAZZLE_SIGNAL` as an optional input and respond to the intents it understands.

## License

MIT License - see [LICENSE](LICENSE) for details.
