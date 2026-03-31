# ComfyUI Dazzle Command
### *One Toggle to Rule Them All*

[![Python 3.10+](https://img.shields.io/badge/python-3.10+-blue.svg)](https://www.python.org/downloads/)
[![GitHub release](https://img.shields.io/github/v/release/DazzleNodes/ComfyUI-DazzleCommand?include_prereleases&label=version)](https://github.com/DazzleNodes/ComfyUI-DazzleCommand/releases)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)

Workflow orchestration node for ComfyUI. Coordinate seed control and execution gates from a single play/pause toggle without re-executing expensive generation steps.

Part of the [DazzleNodes](https://github.com/DazzleNodes/DazzleNodes) collection.

<p align="center">
  <a href="https://github.com/DazzleNodes/ComfyUI-PreviewBridgeExtended/blob/main/docs/workflow-dazzle-command-orchestration.jpg">
    <img src="https://raw.githubusercontent.com/DazzleNodes/ComfyUI-PreviewBridgeExtended/main/docs/workflow-dazzle-command-orchestration.jpg" alt="Dazzle Command orchestration workflow" width="700">
  </a>
</p>

## What It Does

| State | Seed (SmartResCalc) | Gate (Preview Bridge Extended) |
|-------|---------------------|-------------------------------|
| **Pause** | Configurable (default: one run then random) | Block execution (configurable mode) |
| **Play** | Configurable (default: reuse last seed) | Unblock execution |

Click Play when you find an image you like. The seed locks and downstream execution resumes. Click Pause to explore with new random seeds while blocking the pipeline.

**Cache-transparent**: toggling play/pause does NOT re-execute expensive nodes (KSampler, VAE). 83% time savings in typical workflows.

## Seed Control Modes

Each mode is configurable independently for pause and play states:

| Mode | Behavior |
|------|----------|
| **one run then random** | Use entered seed once, then revert to random (default for pause) |
| **new seed each run** | Force fresh random every time |
| **reuse last seed** | Lock to the seed from previous execution (default for play) |
| **keep widget value** | Use SmartResCalc's current widget value persistently |
| **SmartResCalc decides** | Don't interfere — normal widget behavior |

### Understanding "one run then random"

This is the default pause mode and the most common workflow pattern. It handles the case where you want to **try a specific seed once, then go back to exploring**:

1. You see seed `847291038` in another workflow and want to test it
2. Type it into DazzleCommand's seed bar (or SmartResCalc's widget)
3. Run → generates with `847291038`
4. Run again → automatically generates with a new random seed

Without this mode, you'd have to manually switch between "keep widget value" and "new seed each run" every time you test a seed. The "one run" part uses your entered value; the "then random" part cleans up after itself.

If the widget is already set to random (-1), this mode behaves the same as "new seed each run" — each run generates a fresh random.

See [Seed Control Guide](docs/seed-control.md) for the full interaction matrix and transient lock details.

## Seed Entry

Click the seed bar on Dazzle Command to enter a seed value directly. DazzleCommand-entered seeds take priority over SmartResCalc's widget. Clear the field to return control to SmartResCalc.

Priority order:
1. Seed entered in DazzleCommand's seed bar
2. Active seed mode (one run then random, etc.)
3. SmartResCalc widget value (fallback)

## Installation

### Via DazzleNodes Collection (Recommended)

Included in the [DazzleNodes](https://github.com/DazzleNodes/DazzleNodes) aggregate package.

### Manual

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/DazzleNodes/ComfyUI-DazzleCommand.git
```

## Companion Nodes

| Node | Min Version | What It Controls |
|------|------------|-----------------|
| [Smart Resolution Calculator](https://github.com/DazzleNodes/ComfyUI-Smart-Resolution-Calc) | v0.11.3 | Seed behavior (random/lock/transient) |
| [Preview Bridge Extended](https://github.com/DazzleNodes/ComfyUI-PreviewBridgeExtended) | v0.4.2-alpha | Execution blocking (play = unblock, pause = block) |

## How It Works

Dazzle Command uses a cache-transparent architecture:

- **Per-node state** — each DazzleCommand maintains independent state in a per-node registry. Multiple DazzleCommands in one workflow operate independently (DC-1 Play + DC-2 Pause)
- **Signal carries active_state** — PBE reads play/pause state from its connected DC's signal via noodle, not from a global
- **Seed resolution** happens in JS before prompt generation — identical prompt data = ComfyUI cache hit
- **Noodle stripping** — `dazzle_signal` is removed from SmartResCalc's prompt data (cache-transparent) while PBE keeps the noodle for execution ordering

## Documentation

[Seed Control Guide](docs/seed-control.md) - detailed explanation of all 5 seed modes, transient lock behavior, priority order, interaction matrix, and cache architecture

## Debug Logging

```javascript
// Browser console
localStorage.setItem('DEBUG_DAZZLE_COMMAND', 'true')
```

```bash
# Python (environment variable)
DC_DEBUG=1 python main.py
```

## Contributing

Contributions welcome! Fork, create a feature branch, test in ComfyUI, and submit a PR.

Like the project?

[!["Buy Me A Coffee"](https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png)](https://www.buymeacoffee.com/djdarcy)

## License

This project is licensed under the GNU General Public License v3.0 - see the [LICENSE](LICENSE) for details.
