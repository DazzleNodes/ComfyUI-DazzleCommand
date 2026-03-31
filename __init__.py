"""
ComfyUI Dazzle Command - DazzleNodes Custom Node
Workflow orchestration node — coordinate seed control and execution gates.

Part of the DazzleNodes collection - standalone ComfyUI custom nodes.
"""

import logging
import os
import sys

# Configure module logger
_logger = logging.getLogger("DazzleCommand")

# Enable debug logging via environment variable: DC_DEBUG=1
if os.environ.get('DC_DEBUG', '').lower() in ('1', 'true', 'yes'):
    _logger.setLevel(logging.DEBUG)
    if not _logger.handlers:
        _handler = logging.StreamHandler()
        _handler.setFormatter(logging.Formatter('[%(name)s] %(levelname)s: %(message)s'))
        _logger.addHandler(_handler)

# =====================================================
# DUAL-LOADING DETECTION
# Prevents issues when DazzleCommand is installed both
# as a standalone node AND inside DazzleNodes.
# Uses a sys-level sentinel (shared across all module
# namespaces) to detect the second load.
# =====================================================
_DC_SENTINEL = '_dazzle_command_loaded'
_is_duplicate_load = hasattr(sys, _DC_SENTINEL)

if _is_duplicate_load:
    _first_path = getattr(sys, _DC_SENTINEL)
    _this_path = os.path.dirname(os.path.abspath(__file__))
    print(f"[DazzleCommand] WARNING: Duplicate installation detected!")
    print(f"[DazzleCommand]   Already loaded from: {_first_path}")
    print(f"[DazzleCommand]   Skipping this copy:  {_this_path}")
    print(f"[DazzleCommand]   Fix: Remove one installation (standalone symlink or DazzleNodes submodule).")
else:
    setattr(sys, _DC_SENTINEL, os.path.dirname(os.path.abspath(__file__)))

from .py.dazzle_command import DazzleCommandNode
from .version import __version__

NODE_CLASS_MAPPINGS = {
    "DazzleCommand": DazzleCommandNode,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "DazzleCommand": "Dazzle Command (DazzleNodes)",
}

# Register API endpoint for JS to set play/pause state per node (#5)
# Uses per-node state registry instead of global singleton
from .py.dazzle_command import get_dc_state
try:
    from aiohttp import web
    import server

    @server.PromptServer.instance.routes.post("/dazzle-command/set-state")
    async def set_dazzle_command_state(request):
        data = await request.json()
        node_id = str(data.get('nodeId', data.get('node_id', 'default')))
        state_value = data.get('state', 'paused')
        # Write to per-node registry (#5)
        dc_state = get_dc_state(node_id)
        dc_state.state = state_value
        _logger.debug(f"API: Node {node_id} state set to: {state_value}")
        return web.json_response({"ok": True})

    print(f"[DazzleCommand] Registered API endpoint: /dazzle-command/set-state (per-node #5)")
except Exception as e:
    print(f"[DazzleCommand] WARNING: Could not register API endpoint: {e}")

# Tell ComfyUI where to find our JavaScript files
# Disabled on duplicate loads to prevent double JS extension registration
WEB_DIRECTORY = None if _is_duplicate_load else "./web"

__all__ = ['NODE_CLASS_MAPPINGS', 'NODE_DISPLAY_NAME_MAPPINGS', 'WEB_DIRECTORY']

# Display version info on load
if _is_duplicate_load:
    print(f"[DazzleCommand] Duplicate skipped v{__version__} (JS disabled)")
else:
    print(f"[DazzleCommand] Loaded v{__version__}")
