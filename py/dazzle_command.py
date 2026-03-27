"""
Dazzle Command — Workflow orchestration node.

Outputs a DAZZLE_SIGNAL dict that coordinates seed control (SmartResCalc)
and execution gates (Preview Bridge Extended) from a single toggle.

Signal protocol (schema_version 1):
{
    "state": "reviewing" | "proceeding",
    "seed_intent": "random" | "lock" | "lock_current" | None,
    "gate_intent": "open" | "block" | None,
    "gate_mode": "never" | "auto" | "always" | "if_empty_mask" | "if_empty_editor",
    "schema_version": 1,
}
"""

import logging

logger = logging.getLogger("DazzleCommand")


# Seed intent mappings
SEED_INTENTS = {
    "random": "random",
    "lock last seed": "lock",
    "lock current": "lock_current",
    "no override": None,
}

# Gate intent mappings for review mode
REVIEW_GATE_MODES = {
    "auto": "auto",
    "always block": "always",
    "block if empty mask": "if_empty_mask",
    "block if empty editor": "if_empty_editor",
}

# Gate intent mappings for proceed mode
PROCEED_GATE_MODES = {
    "unblock (never)": "never",
    "auto": "auto",
}


class DazzleCommandNode:
    """
    Workflow orchestration node — single toggle to coordinate
    seed control and execution gates across multiple nodes.

    Outputs a DAZZLE_SIGNAL dict that receiving nodes interpret
    based on their own capabilities.
    """

    CATEGORY = "DazzleNodes/Control"
    RETURN_TYPES = ("DAZZLE_SIGNAL",)
    RETURN_NAMES = ("signal",)
    FUNCTION = "execute"
    OUTPUT_NODE = False

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "state": (["reviewing", "proceeding"], {
                    "default": "reviewing",
                    "tooltip": (
                        "reviewing: Workflow is paused for inspection. "
                        "Gates block, seed follows review_seed setting.\n"
                        "proceeding: Workflow continues. "
                        "Gates open, seed follows proceed_seed setting."
                    ),
                }),
            },
            "optional": {
                "review_seed": (list(SEED_INTENTS.keys()), {
                    "default": "random",
                    "tooltip": (
                        "Seed behavior when reviewing:\n"
                        "random: Generate new seed each queue\n"
                        "lock last seed: Reuse the last resolved seed\n"
                        "lock current: Keep current widget value\n"
                        "no override: Don't change seed behavior"
                    ),
                }),
                "proceed_seed": (list(SEED_INTENTS.keys()), {
                    "default": "lock last seed",
                    "tooltip": (
                        "Seed behavior when proceeding:\n"
                        "lock last seed: Reuse the last resolved seed (most common)\n"
                        "random: Generate new seed each queue\n"
                        "lock current: Keep current widget value\n"
                        "no override: Don't change seed behavior"
                    ),
                }),
                "review_gate": (list(REVIEW_GATE_MODES.keys()), {
                    "default": "auto",
                    "tooltip": (
                        "Gate behavior when reviewing:\n"
                        "auto: Smart block selection based on mask state\n"
                        "always block: Block regardless of state\n"
                        "block if empty mask: Block only when output mask is empty\n"
                        "block if empty editor: Block only when user hasn't drawn"
                    ),
                }),
                "proceed_gate": (list(PROCEED_GATE_MODES.keys()), {
                    "default": "unblock (never)",
                    "tooltip": (
                        "Gate behavior when proceeding:\n"
                        "unblock (never): Never block — let execution continue\n"
                        "auto: Smart selection based on mask state"
                    ),
                }),
            },
        }

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        # Always re-execute — state changes are the whole point
        return float("NaN")

    def execute(self, state, review_seed="random", proceed_seed="lock last seed",
                review_gate="auto", proceed_gate="unblock (never)"):

        if state == "proceeding":
            seed_intent = SEED_INTENTS.get(proceed_seed)
            gate_intent = "open"
            gate_mode = PROCEED_GATE_MODES.get(proceed_gate, "never")
        else:
            seed_intent = SEED_INTENTS.get(review_seed)
            gate_intent = "block"
            gate_mode = REVIEW_GATE_MODES.get(review_gate, "auto")

        signal = {
            "state": state,
            "seed_intent": seed_intent,
            "gate_intent": gate_intent,
            "gate_mode": gate_mode,
            "schema_version": 1,
        }

        logger.debug(f"DazzleCommand: state={state}, seed_intent={seed_intent}, "
                      f"gate_intent={gate_intent}, gate_mode={gate_mode}")

        return (signal,)
