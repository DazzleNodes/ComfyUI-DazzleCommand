"""
Dazzle Command -- Workflow orchestration node.

Outputs a DAZZLE_SIGNAL dict that coordinates seed control (SmartResCalc)
and execution gates (Preview Bridge Extended) from a single toggle.

Architecture:
- The play/pause STATE is NOT a ComfyUI input (would cause cache cascade)
- State lives in JS widget, communicated via per-node state registry (#5)
- IS_CHANGED reads per-node state to trigger re-execution on toggle
- The signal dict carries active_state for noodle-connected receivers
- Each DazzleCommand maintains independent state (no global cross-talk)
"""

import logging
import sys

logger = logging.getLogger("DazzleCommand")


class DazzleCommandState:
    """Per-node state for a single DazzleCommand instance.

    Stored in sys._dazzle_command_states keyed by node ID.
    Replaces the global sys._dazzle_command_state singleton (#5).
    """
    __slots__ = ('node_id', 'state', 'seed_intent',
                 'gate_intent', 'gate_mode', 'signal')

    def __init__(self, node_id):
        self.node_id = node_id
        self.state = 'paused'
        self.seed_intent = None
        self.gate_intent = None
        self.gate_mode = None
        self.signal = None  # Full signal dict for PBE gate config

    def __repr__(self):
        return f"DazzleCommandState(id={self.node_id}, state={self.state}, seed={self.seed_intent})"


def get_dc_state(node_id):
    """Get or create per-node DazzleCommand state."""
    node_id = str(node_id)
    if not hasattr(sys, '_dazzle_command_states'):
        sys._dazzle_command_states = {}
    if node_id not in sys._dazzle_command_states:
        sys._dazzle_command_states[node_id] = DazzleCommandState(node_id)
    return sys._dazzle_command_states[node_id]


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
        # NOTE: "state" is intentionally NOT a ComfyUI input. It's a
        # JS-only widget communicated via per-node state registry (#5).
        # IS_CHANGED reads state to trigger re-execution on toggle;
        # the signal carries active_state for downstream PBE nodes.
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
                "unique_id": "UNIQUE_ID",
            },
        }

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        # IS_CHANGED runs for ALL nodes BEFORE any execute(). We build
        # the signal dict here so PBE can read gate config even if PBE
        # executes before DazzleCommand (no noodle dependency after
        # JS strips dazzle_signal from PBE's prompt inputs).
        import sys
        unique_id = kwargs.get('unique_id', '')
        dc_state = get_dc_state(unique_id)
        state = dc_state.state
        pause_seed = kwargs.get('pause_seed', 'one run then random')
        pause_gate = kwargs.get('pause_gate', 'auto')
        play_seed = kwargs.get('play_seed', 'reuse last seed')
        play_gate = kwargs.get('play_gate', 'never block')

        # Resolve intents based on state
        if state == "playing":
            seed_intent = SEED_OPTIONS.get(play_seed)
            gate_intent = "open"
            gate_mode = PLAY_GATE_OPTIONS.get(play_gate, "never")
        else:
            seed_intent = SEED_OPTIONS.get(pause_seed)
            gate_intent = "block"
            gate_mode = PAUSE_GATE_OPTIONS.get(pause_gate, "auto")

        # Store in per-node state so PBE can read during its execute
        dc_state.seed_intent = seed_intent
        dc_state.gate_intent = gate_intent
        dc_state.gate_mode = gate_mode
        dc_state.signal = {
            "active_state": state,
            "pause_seed_intent": SEED_OPTIONS.get(pause_seed),
            "pause_gate_intent": "block",
            "pause_gate_mode": PAUSE_GATE_OPTIONS.get(pause_gate, "auto"),
            "play_seed_intent": SEED_OPTIONS.get(play_seed),
            "play_gate_intent": "open",
            "play_gate_mode": PLAY_GATE_OPTIONS.get(play_gate, "never"),
            "schema_version": 2,
        }

        return f"{state}|{pause_seed}|{pause_gate}|{play_seed}|{play_gate}"

    def execute(self, pause_seed="one run then random", pause_gate="auto",
                play_seed="reuse last seed", play_gate="never block",
                unique_id=""):

        # Read active state from per-node registry (#5)
        dc_state = get_dc_state(unique_id)
        state = dc_state.state

        # Resolve active intents based on state
        if state == "playing":
            seed_intent = SEED_OPTIONS.get(play_seed)
            gate_intent = "open"
            gate_mode = PLAY_GATE_OPTIONS.get(play_gate, "never")
        else:
            seed_intent = SEED_OPTIONS.get(pause_seed)
            gate_intent = "block"
            gate_mode = PAUSE_GATE_OPTIONS.get(pause_gate, "auto")

        # Write resolved state to per-node registry (#5)
        dc_state.seed_intent = seed_intent
        dc_state.gate_intent = gate_intent
        dc_state.gate_mode = gate_mode

        # Signal dict with all configs. JS strips this from SmartResCalc and
        # PBE prompt inputs to prevent cache cascade. Consumers read per-node
        # state from sys._dazzle_command_states via _dazzle_dc_id marker.
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
        dc_state.signal = signal

        logger.debug(f"DazzleCommand: state={state}, seed_intent={seed_intent}, "
                      f"gate_intent={gate_intent}, gate_mode={gate_mode}")
        logger.debug(f"{state.upper()}: seed={seed_intent}, gate={gate_intent} ({gate_mode})")

        last_seed = get_last_seed()
        seed_display = str(last_seed) if last_seed is not None else "--"

        return {"ui": {"text": [seed_display]},
                "result": (signal,)}
