# Changelog

All notable changes to ComfyUI Dazzle Command will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.6-alpha] - 2026-03-31

### Added
- **Reset All button** -- small square button next to Pause with circular arrow icon.
  Clicking it sets ALL DazzleCommand nodes in the workflow back to paused state.
  Useful for resetting a multi-DC workflow to a clean starting state for a fresh run.

### Changed
- **Restored OUTPUT_NODE = True** -- DazzleCommand is an execution entry point again.
  Research confirmed OUTPUT_NODE does not bypass caching (only marks entry points).
  The real cache fix was PBE's deterministic preview filenames.

## [0.2.5-alpha] - 2026-03-31

### Fixed
- **State reset race condition** -- play/pause state no longer reverts during mid-execution
  workflow reconfigures. Uses `app.graph.extra.id` (workflow UUID) to distinguish new
  workflow loads (restore saved state) from same-workflow reconfigures (preserve runtime
  state). Fixes issue where clicking Play on DC-2 would silently reset DC-1 to Pause.

## [0.2.4-alpha] - 2026-03-30

### Changed
- **Updated README** -- companion version table, per-node state architecture description,
  corrected SmartResCalc repo URL (DazzleNodes org)
- **Updated seed-control.md** -- cache architecture docs reflect per-node state registry
  and signal-carried active_state (replaces global side-channel description)

## [0.2.3-alpha] - 2026-03-30

### Added
- **Per-node state registry** (#5) -- `DazzleCommandState` class replaces global
  `sys._dazzle_command_state` singleton. Each DazzleCommand maintains independent state
  in `sys._dazzle_command_states` keyed by node ID. Enables correct multi-DazzleCommand
  workflows where DC-1=Play and DC-2=Pause operate independently.
- **`unique_id` hidden input** -- DazzleCommand now receives its ComfyUI node ID for
  per-node state lookup in IS_CHANGED and execute().
- **IS_CHANGED builds signal** -- signal dict (with active_state and gate config) is
  built during IS_CHANGED (before any execute runs), ensuring PBE can read gate config
  regardless of execution order.

### Changed
- **API endpoint uses node ID** -- `/dazzle-command/set-state` keys state by `nodeId`
  from JS instead of writing to a global. JS defers `setState` calls during page load
  to ensure node IDs are assigned (fixes -1 ID problem).
- **Removed OUTPUT_NODE** -- DazzleCommand no longer marked as OUTPUT_NODE. PBE requests
  DC's output via noodle, so DC executes when needed. Removing OUTPUT_NODE prevents
  unnecessary re-execution on every prompt.
- **Removed legacy global writes** -- no backward compatibility with old global
  `sys._dazzle_command_state`. Clean break for v0.2.3+.

## [0.2.2-alpha] - 2026-03-30

### Fixed
- **Signal carries active state for multi-DC workflows** (#5) -- signal dict now includes
  `active_state` field so noodle-connected PBE nodes read per-node state instead of the
  global `sys._dazzle_command_state`. Fixes multi-DazzleCommand workflows where DC-1=Play
  and DC-2=Pause caused PBE-2 to ignore its Pause state.
- **Signal schema version bumped to 2** -- PBE nodes with schema v2 support read
  `active_state` from signal; older PBE versions fall back to global (backward compat).

## [0.2.1-alpha] - 2026-03-28

### Fixed
- **Dynamic JS imports** -- replaced static `../../scripts/app.js` imports with auto-depth
  detection via `importComfyCore()`. Fixes extension not loading when installed through
  DazzleNodes aggregate (depth 3) vs standalone (depth 2). Same pattern used by SmartResCalc
  and PBE.

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
