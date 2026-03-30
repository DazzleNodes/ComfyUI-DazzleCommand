"""
Dazzle Command -- Workflow orchestration node.

Outputs a DAZZLE_SIGNAL dict that coordinates seed control (SmartResCalc)
and execution gates (Preview Bridge Extended) from a single toggle.

Architecture:
- The play/pause STATE is NOT a ComfyUI input (would cause cache cascade)
- State lives in JS widget, communicated via sys._dazzle_command_state
- IS_CHANGED writes state to sys (runs before any execute)
- The signal dict is STATIC (contains both play and pause configs)
- Receivers read active state from sys, pick the right config from signal
"""

import logging
import sys

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


def get_last_seed():
    """Read the last seed reported by any signal consumer."""
    registry = getattr(sys, '_dazzle_seed_registry', None)
    if registry:
        return registry.get('last')
    return None


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
        # NOTE: "state" is intentionally NOT here. It's a JS-only widget
        # communicated via sys._dazzle_command_state. Including it as an
        # input would change the cache signature on every toggle, causing
        # expensive downstream re-execution.
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
        }

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        # IS_CHANGED always runs before execute(). We use it to read the
        # JS-side state from a hidden widget value that the JS injects
        # into sys before prompt generation.
        #
        # Return a hash of ONLY the dropdown configs (not the state).
        # These change rarely (user edits settings), so the node stays cached.
        pause_seed = kwargs.get('pause_seed', 'one run then random')
        pause_gate = kwargs.get('pause_gate', 'auto')
        play_seed = kwargs.get('play_seed', 'reuse last seed')
        play_gate = kwargs.get('play_gate', 'never block')
        return f"{pause_seed}|{pause_gate}|{play_seed}|{play_gate}"

    def execute(self, pause_seed="one run then random", pause_gate="auto",
                play_seed="reuse last seed", play_gate="never block"):

        # Read active state from sys (written by JS via API or IS_CHANGED)
        cmd_state = getattr(sys, '_dazzle_command_state', {})
        state = cmd_state.get('state', 'paused')

        # Resolve active intents based on state
        if state == "playing":
            seed_intent = SEED_OPTIONS.get(play_seed)
            gate_intent = "open"
            gate_mode = PLAY_GATE_OPTIONS.get(play_gate, "never")
        else:
            seed_intent = SEED_OPTIONS.get(pause_seed)
            gate_intent = "block"
            gate_mode = PAUSE_GATE_OPTIONS.get(pause_gate, "auto")

        # Write resolved intent to sys for SmartResCalc
        if not hasattr(sys, '_dazzle_command_state'):
            sys._dazzle_command_state = {}
        sys._dazzle_command_state['seed_intent'] = seed_intent

        # Signal carries active state so noodle-connected receivers can read
        # per-node state instead of the global sys._dazzle_command_state (#5).
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

        last_seed = get_last_seed()
        seed_display = str(last_seed) if last_seed is not None else "--"

        return {"ui": {"text": [seed_display]},
                "result": (signal,)}
