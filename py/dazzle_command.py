"""
Dazzle Command -- Workflow orchestration node.

Outputs a DAZZLE_SIGNAL dict that coordinates seed control (SmartResCalc)
and execution gates (Preview Bridge Extended) from a single toggle.

Architecture (v0.3.x, stateless):
- Play/pause state lives in JS: on the node object at runtime and in
  node.properties per workflow-tab draft. Python holds NO state.
- At queue time the JS prompt hook injects the live state into this node's
  prompt inputs as `dazzle_state` (declared hidden input below). Because it
  is a prompt input, it is part of ComfyUI's cache key: toggling play/pause
  is exactly the change that should re-execute this node. No IS_CHANGED,
  no API side-channel, no sys registry -- each queued prompt is
  self-contained, so multiple open workflow tabs cannot contaminate each
  other (node IDs collide across tabs; any server-side store keyed by node
  ID was wrong the moment a second tab opened).
- SmartResCalc never sees this node in its prompt (JS strips the
  dazzle_signal link and bakes the resolved seed into fill_seed directly).
- PBE keeps the noodle: it receives the signal dict as a real input, reads
  active_state from it, and re-executes when this node re-executes.
- Headless/API prompts (no JS) omit dazzle_state and run as paused.
"""

import logging

logger = logging.getLogger("DazzleCommand")


# Seed intent mappings (display label -> signal value)
SEED_OPTIONS = {
    "one run then random": "transient",
    "new seed each run": "random",
    "reuse last seed": "lock",
    "keep widget value": "lock_current",
    "SmartResCalc decides": None,
}

# Gate mode mappings for pause state
PAUSE_GATE_OPTIONS = {
    "auto": "auto",
    "always block": "always",
    "block if empty mask": "if_empty_mask",
    "block if empty editor": "if_empty_editor",
}

# Gate mode mappings for play state
PLAY_GATE_OPTIONS = {
    "never block": "never",
    "auto": "auto",
}


class DazzleCommandNode:
    """
    Workflow orchestration node -- play/pause toggle coordinates
    seed control and execution gates across multiple nodes.
    """

    CATEGORY = "DazzleNodes/Control"
    RETURN_TYPES = ("DAZZLE_SIGNAL",)
    RETURN_NAMES = ("signal",)
    FUNCTION = "execute"
    OUTPUT_NODE = True

    @classmethod
    def INPUT_TYPES(cls):
        # NOTE: dazzle_state is a hidden input that the server never fills
        # (only PROMPT/DYNPROMPT/EXTRA_PNGINFO/UNIQUE_ID/etc. get server
        # values). Declaring it here is what lets the JS-injected prompt
        # value pass ComfyUI's input filter (execution.py get_input_data
        # drops constants whose key has no INPUT_TYPES category) and reach
        # execute(). It also puts the state into the cache key, replacing
        # IS_CHANGED.
        return {
            "required": {
                "pause_seed": (list(SEED_OPTIONS.keys()), {
                    "default": "one run then random",
                    "tooltip": (
                        "Seed behavior when paused:\n"
                        "one run then random: If a seed was entered (here or SmartResCalc), "
                        "use it once then revert to random (default)\n"
                        "new seed each run: Always generate fresh random, override widget\n"
                        "reuse last seed: Use the seed from the previous execution\n"
                        "keep widget value: Use SmartResCalc's current value persistently\n"
                        "SmartResCalc decides: Don't interfere with seed behavior"
                    ),
                }),
                "pause_gate": (list(PAUSE_GATE_OPTIONS.keys()), {
                    "default": "auto",
                    "tooltip": (
                        "Gate behavior when paused:\n"
                        "auto: Smart block selection based on mask state\n"
                        "always block: Block regardless of state\n"
                        "block if empty mask: Block only when output mask is empty\n"
                        "block if empty editor: Block only when user hasn't drawn"
                    ),
                }),
                "play_seed": (list(SEED_OPTIONS.keys()), {
                    "default": "reuse last seed",
                    "tooltip": (
                        "Seed behavior when playing:\n"
                        "reuse last seed: Use the seed from the previous execution (default)\n"
                        "one run then random: If a seed was entered, use it once then random\n"
                        "new seed each run: Always generate fresh random\n"
                        "keep widget value: Use SmartResCalc's current value persistently\n"
                        "SmartResCalc decides: Don't interfere with seed behavior"
                    ),
                }),
                "play_gate": (list(PLAY_GATE_OPTIONS.keys()), {
                    "default": "never block",
                    "tooltip": (
                        "Gate behavior when playing:\n"
                        "never block: Never block -- let execution continue (default)\n"
                        "auto: Smart selection based on mask state"
                    ),
                }),
            },
            "optional": {},
            "hidden": {
                "dazzle_state": "DAZZLE_STATE",
            },
        }

    def execute(self, pause_seed="one run then random", pause_gate="auto",
                play_seed="reuse last seed", play_gate="never block",
                dazzle_state="paused"):

        # State arrives in the prompt itself (injected by JS at queue time).
        # Missing/invalid (headless API prompts, API-format exports) -> paused.
        state = dazzle_state if dazzle_state in ("playing", "paused") else "paused"

        # Resolve active intents based on state
        if state == "playing":
            seed_intent = SEED_OPTIONS.get(play_seed)
            gate_intent = "open"
            gate_mode = PLAY_GATE_OPTIONS.get(play_gate, "never")
        else:
            seed_intent = SEED_OPTIONS.get(pause_seed)
            gate_intent = "block"
            gate_mode = PAUSE_GATE_OPTIONS.get(pause_gate, "auto")

        # Signal dict with both configs plus the active state. PBE receives
        # this via the noodle and picks the matching gate config.
        signal = {
            "active_state": state,
            "pause_seed_intent": SEED_OPTIONS.get(pause_seed),
            "pause_gate_intent": "block",
            "pause_gate_mode": PAUSE_GATE_OPTIONS.get(pause_gate, "auto"),
            "play_seed_intent": SEED_OPTIONS.get(play_seed),
            "play_gate_intent": "open",
            "play_gate_mode": PLAY_GATE_OPTIONS.get(play_gate, "never"),
            "schema_version": 2,
        }

        logger.debug(f"DazzleCommand: state={state}, seed_intent={seed_intent}, "
                     f"gate_intent={gate_intent}, gate_mode={gate_mode}")
        logger.debug(f"{state.upper()}: seed={seed_intent}, gate={gate_intent} ({gate_mode})")

        return (signal,)
