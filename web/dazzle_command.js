/**
 * DazzleCommand - Workflow Orchestration Extension
 *
 * Minimal v1 — uses native ComfyUI dropdown widgets.
 * Phase 2 will add a custom toggle button widget.
 */

import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "DazzleNodes.DazzleCommand",

    async nodeCreated(node) {
        if (node.comfyClass !== "DazzleCommand") return;

        // Set a reasonable default size
        node.size[0] = Math.max(node.size[0], 280);
    },
});
