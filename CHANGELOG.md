# Changelog

All notable changes to ComfyUI Dazzle Command will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0-alpha] - 2026-03-28

### Added
- **5-option seed control** -- one run then random (default, transient lock), new seed each
  run (force random), reuse last seed (lock previous), keep widget value (persistent),
  SmartResCalc decides (no interference). Applied in both pause and play states.
- **Transient seed entry** -- click seed bar to enter a value. DazzleCommand-entered seeds
  take priority over SmartResCalc widget. Cleared after transient use (one run then random).
  Clear the field to return control to SmartResCalc.
- **Debug logger** -- `web/debug_logger.js` with localStorage-based enable/disable.
  Enable: `localStorage.setItem('DEBUG_DAZZLE_COMMAND', 'true')`
- **Seed display updates** -- seed bar now updates after every prompt completion via
  status event listener (works even when DazzleCommand is cached)
- **Visual seed source indicator** -- green text with `*` when DazzleCommand drives seed,
  grey when displaying SmartResCalc's last seed

### Companion versions
- Requires [SmartResCalc v0.11.0](https://github.com/djdarcy/ComfyUI-Smart-Resolution-Calc)
  for JS seed control, prompt stripping, _apply_signal receiver
- Requires [PBE v0.4.0-alpha](https://github.com/DazzleNodes/ComfyUI-PreviewBridgeExtended)
  for DAZZLE_SIGNAL gate control

### Changed
- **Seed option labels** -- renamed from internal terms to behavior-descriptive labels

## [0.1.1-alpha] - 2026-03-27

### Changed
- **Cache-transparent state management** -- play/pause state removed from INPUT_TYPES to prevent
  ComfyUI cache cascade. State communicated via `/dazzle-command/set-state` API endpoint and
  `sys._dazzle_command_state` side-channel. Signal dict is static (contains both play and pause
  configurations); receivers read active state from sys.
- **Play/pause JS buttons** -- custom canvas widget replaces dropdown. Writes state to Python
  via API call, stores on `node._dazzleCommandState` for cross-extension access.
- **Seed display bar** -- read-only display below buttons shows last seed from connected
  SmartResCalc (via onExecuted callback).

### Fixed
- **Dropdown label** -- "unblock (never)" renamed to "never block" for readability

## [0.1.0-alpha] - 2026-03-27

### Added
- Initial release of Dazzle Command orchestration node
- `DAZZLE_SIGNAL` output type for coordinating downstream nodes
- Two-state toggle: reviewing (gates block, seed configurable) and proceeding (gates open, seed configurable)
- Configurable seed intent per state: random, lock last seed, lock current, no override
- Configurable gate intent per state: auto, always, if_empty_mask, if_empty_editor, unblock
- Signal protocol v1 with schema versioning for forward compatibility
- Dual-loading detection (standalone + DazzleNodes aggregate)
