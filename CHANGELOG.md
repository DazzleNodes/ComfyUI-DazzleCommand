# Changelog

All notable changes to ComfyUI Dazzle Command will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0-alpha] - 2026-03-27

### Added
- Initial release of Dazzle Command orchestration node
- `DAZZLE_SIGNAL` output type for coordinating downstream nodes
- Two-state toggle: reviewing (gates block, seed configurable) and proceeding (gates open, seed configurable)
- Configurable seed intent per state: random, lock last seed, lock current, no override
- Configurable gate intent per state: auto, always, if_empty_mask, if_empty_editor, unblock
- Signal protocol v1 with schema versioning for forward compatibility
- Dual-loading detection (standalone + DazzleNodes aggregate)
