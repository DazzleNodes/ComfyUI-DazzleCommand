# Seed Control — Detailed Guide

## The Problem Dazzle Command Solves

In a typical ComfyUI workflow with inpainting or iterative generation:

1. Generate an image (KSampler runs ~30s)
2. Check the result in Preview Bridge Extended
3. **If you like it**: lock the seed, unblock the gate, continue to inpainting
4. **If you don't**: keep the gate blocked, generate with a new random seed

Without Dazzle Command, steps 3-4 require navigating to multiple nodes and clicking multiple widgets. Dazzle Command reduces this to a single play/pause click.

## Seed Modes Explained

### one run then random (default for pause)

The "smart default" — handles the most common workflow automatically:

- If you typed a seed in DazzleCommand's seed bar → uses it for one run, then clears
- If you typed a seed in SmartResCalc's widget → uses it for one run, then resets widget to random (-1)
- If neither has a manually entered seed → normal random behavior

**Why this is the default**: Users often want to "test" a specific seed they've used earlier or copied from another workflow, then go back to exploring. Without this mode, they'd have to manually switch between "lock current" and "random" every time.

**Example flow**:

1. You see a cool seed in test workflow: `847291038`
2. Type it in DazzleCommand's seed bar (or SmartResCalc's widget)
3. Run → generates with `847291038`
4. Run again → generates with a new random seed (the typed value was transient)

### new seed each run

Forces a fresh random seed every queue, regardless of what SmartResCalc's widget shows. Even if someone typed `5225` into SmartResCalc, this mode overrides it with a random number.

**When to use**: You want pure exploration and don't want any accidental seed locking from manual widget entries.

### reuse last seed (default for play)

Locks to whatever seed was used on the previous execution. This is the "I like this one, keep it" button.

**When to use**: You found a generation you like and want to continue the workflow (inpainting, upscaling, etc.) with the same seed.

**Cache benefit**: Since the seed is identical to the previous run, ComfyUI caches the entire generation pipeline. The KSampler doesn't re-run — only downstream nodes (like Preview Bridge Extended unblocking) execute. This is where the 83% time savings comes from.

### keep widget value

Uses whatever SmartResCalc's widget currently shows, persistently. Doesn't reset, doesn't override.

- Widget shows `5225` → always uses `5225` (even across multiple runs)
- Widget shows `-1` (random) → normal random behavior each run

**When to use**: You're tweaking other parameters (CFG, steps, prompt) while keeping the same seed. You don't want the seed to change between runs.

### SmartResCalc decides

Dazzle Command completely hands off seed control. SmartResCalc's widget behaves as if Dazzle Command doesn't exist.

**When to use**: You only want Dazzle Command for gate control (play/pause blocking) and want to manage seeds manually on SmartResCalc.

## Seed Entry Priority

When seeds could come from multiple places, this priority order determines which one wins:

1. **DazzleCommand seed bar** — if the user clicked the seed bar and typed a value
2. **Active seed mode** — the mode applies its logic (random, lock, transient, etc.)
3. **SmartResCalc widget** — fallback when DazzleCommand isn't driving

### How to tell who's driving

- **Green text with `*`** on the seed bar → DazzleCommand is driving (user entered a seed)
- **Grey text** on the seed bar → displaying SmartResCalc's last-used seed (SmartResCalc is driving)

### Returning control to SmartResCalc

Click the seed bar on DazzleCommand and clear/empty the field. The `*` disappears and SmartResCalc's widget controls the seed again.

## Transient Lock — The "One Run" Concept

The "one run then random" mode introduces a concept we call **transient lock**: a seed value that exists for exactly one execution, then automatically reverts.

### From SmartResCalc

1. User types `5225` into SmartResCalc's seed widget
2. First queue: uses `5225`, then resets widget back to random mode (-1)
3. Second queue: generates a fresh random seed

The widget visually switches from the fixed value back to the green dice/random mode after the first run.

### From DazzleCommand

1. User clicks seed bar, types `5225`
2. First queue: uses `5225`, then clears `_dazzleUserSeed`
3. Second queue: falls through to normal behavior (random if widget is -1)

The seed bar text changes from green (`seed: 5225 *`) to grey (showing the random seed that was generated).

## Cache-Transparent Operation

The key engineering challenge: toggling play/pause must NOT cause expensive re-execution of KSampler and other upstream nodes.

### Why this is hard

ComfyUI caches based on input values. If ANY input to a node changes, it re-executes. A naive signal implementation would change the signal value on every toggle → change SmartResCalc's input → force KSampler to re-run (~30s wasted).

### How we solve it

1. **Per-node state** — each DazzleCommand maintains independent state in a per-node registry (`sys._dazzle_command_states`). Play/pause is communicated via API with node ID, invisible to ComfyUI's cache.
2. **Signal carries active_state** — PBE reads play/pause state from the signal dict via noodle. SmartResCalc reads seed intent from per-node registry via `_dazzle_dc_id` marker.
3. **Seed resolution happens in JS** — the prompt interception hook resolves seeds BEFORE ComfyUI sees the prompt. When "reuse last seed" sends the same seed number, the prompt data is identical → cache hit.
4. **Noodle stripping** — `dazzle_signal` is removed from SmartResCalc's prompt data (cache-transparent). PBE keeps the noodle for execution ordering.

### What re-executes and what doesn't

| Node | On Play Toggle | Why |
|------|---------------|-----|
| Dazzle Command | Executes | IS_CHANGED detects state change, produces updated signal |
| SmartResCalc | **Cached** | Same seed = same input = cache hit (signal stripped) |
| KSampler | **Cached** | SmartResCalc cached = KSampler input unchanged |
| VAE Decode | **Cached** | KSampler cached = VAE input unchanged |
| Preview Bridge Extended | Executes | Signal changed (active_state), re-evaluates blocking |
| Downstream inpaint KSampler | Executes | PBE unblocked = new output flows downstream |

## Interaction Matrix

Full enumeration of SmartResCalc widget state vs DazzleCommand seed mode:

### Pause State

| SmartResCalc Widget | one run then random | new seed each run | reuse last seed | keep widget value | SmartResCalc decides |
|-------------------|-------------------|-------------------|-----------------|-------------------|---------------------|
| -1 (random) | New random | New random | Last seed | New random | New random |
| 5225 (fixed) | Use 5225, reset to -1 | Force random | Last seed | Use 5225 | Use 5225 |

### Play State

| SmartResCalc Widget | one run then random | new seed each run | reuse last seed | keep widget value | SmartResCalc decides |
|-------------------|-------------------|-------------------|-----------------|-------------------|---------------------|
| -1 (random) | New random | New random | Last seed | New random | New random |
| 5225 (fixed) | Use 5225, reset to -1 | Force random | Last seed | Use 5225 | Use 5225 |

Note: "Last seed" means the seed from the previous execution, regardless of what the widget shows.
