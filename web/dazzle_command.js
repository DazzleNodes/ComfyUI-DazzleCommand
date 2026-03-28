/**
 * DazzleCommand -- Workflow Orchestration Extension
 *
 * Play/pause buttons at the top of the node.
 * State is communicated to Python via API endpoint (not widget input)
 * to avoid ComfyUI cache invalidation.
 */

import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { logger } from "./debug_logger.js";

const PLAY_COLOR = "#2a5a2a";
const PAUSE_COLOR = "#5a4a1a";
const BUTTON_BG = "#3a3a3a";
const INFO_BG = "#1a1a1a";
const BUTTON_RADIUS = 4;
const MIN_NODE_WIDTH = 260;

// Track state per node (JS-side, persisted via workflow save)
const nodeStates = new Map();

function getState(nodeId) {
    return nodeStates.get(nodeId) || "paused";
}

async function setState(nodeId, state, node) {
    nodeStates.set(nodeId, state);
    // Store on node object so other extensions can read it
    if (node) node._dazzleCommandState = state;
    // Notify Python via API (writes to sys._dazzle_command_state)
    try {
        await api.fetchApi("/dazzle-command/set-state", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ state, nodeId }),
        });
    } catch (e) {
        logger.error("API call failed:", e);
    }
}

app.registerExtension({
    name: "DazzleNodes.DazzleCommand",

    async nodeCreated(node) {
        if (node.comfyClass !== "DazzleCommand") return;

        // Seed display -- updated via onExecuted
        // Seed tracking:
        // lastSeedValue: display string (updated by status listener from SmartResCalc)
        // userEnteredSeed: explicitly typed by user via seed bar click (drives SmartResCalc)
        //   null = DazzleCommand not driving, SmartResCalc controls seed
        //   number = DazzleCommand drives, this value takes priority
        let lastSeedValue = null;
        let userEnteredSeed = null;

        // Expose on node for JS prompt hook to read
        node._dazzleUserSeed = null;

        // Create custom widget for play/pause buttons + seed display
        const commandWidget = node.addCustomWidget({
            name: "_command_buttons",
            type: "DAZZLE_COMMAND_BUTTONS",

            draw(ctx, nodeRef, widgetWidth, y, widgetHeight) {
                const margin = 15;
                const usable = widgetWidth - margin * 2;
                const btnWidth = (usable - 10) / 2;
                const btnHeight = 28;
                const btnY = y + 4;
                const isPlaying = getState(node.id) === "playing";

                ctx.save();

                // Play button
                const playX = margin;
                ctx.fillStyle = isPlaying ? PLAY_COLOR : BUTTON_BG;
                ctx.beginPath();
                ctx.roundRect(playX, btnY, btnWidth, btnHeight, BUTTON_RADIUS);
                ctx.fill();
                if (isPlaying) {
                    ctx.strokeStyle = "#4a8a4a";
                    ctx.lineWidth = 1.5;
                    ctx.stroke();
                }
                ctx.fillStyle = isPlaying ? "#90ee90" : "#999999";
                ctx.font = "bold 13px sans-serif";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText("\u25B6 PLAY", playX + btnWidth / 2, btnY + btnHeight / 2);

                // Pause button
                const pauseX = margin + btnWidth + 10;
                ctx.fillStyle = !isPlaying ? PAUSE_COLOR : BUTTON_BG;
                ctx.beginPath();
                ctx.roundRect(pauseX, btnY, btnWidth, btnHeight, BUTTON_RADIUS);
                ctx.fill();
                if (!isPlaying) {
                    ctx.strokeStyle = "#8a7a3a";
                    ctx.lineWidth = 1.5;
                    ctx.stroke();
                }
                ctx.fillStyle = !isPlaying ? "#eeee90" : "#999999";
                ctx.font = "bold 13px sans-serif";
                ctx.fillText("\u23F8 PAUSE", pauseX + btnWidth / 2, btnY + btnHeight / 2);

                // Seed display
                const infoY = btnY + btnHeight + 6;
                const infoH = 18;
                ctx.fillStyle = INFO_BG;
                ctx.beginPath();
                ctx.roundRect(margin, infoY, usable, infoH, 3);
                ctx.fill();
                // Show seed with source indicator
                const isDriving = userEnteredSeed !== null;
                const displaySeed = isDriving ? String(userEnteredSeed) : (lastSeedValue || "--");
                const seedText = isDriving ? `seed: ${displaySeed} *` : `seed: ${displaySeed}`;
                ctx.fillStyle = isDriving ? "#90cc90" : (lastSeedValue !== null ? "#aaaaaa" : "#555555");
                ctx.font = "11px monospace";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(seedText, margin + usable / 2, infoY + infoH / 2);

                ctx.restore();

                this._playArea = { x: playX, y: btnY, w: btnWidth, h: btnHeight };
                this._pauseArea = { x: pauseX, y: btnY, w: btnWidth, h: btnHeight };
                this._seedArea = { x: margin, y: infoY, w: usable, h: infoH };
            },

            mouse(event, pos, node) {
                if (event.type !== "pointerdown") return false;
                const localX = pos[0];
                const localY = pos[1];

                if (this._playArea) {
                    const a = this._playArea;
                    if (localX >= a.x && localX <= a.x + a.w &&
                        localY >= a.y && localY <= a.y + a.h) {
                        setState(node.id, "playing", node);
                        node.setDirtyCanvas(true);
                        return true;
                    }
                }
                // Click seed bar — view/enter/clear seed value
                if (this._seedArea) {
                    const a = this._seedArea;
                    if (localX >= a.x && localX <= a.x + a.w &&
                        localY >= a.y && localY <= a.y + a.h) {
                        const current = lastSeedValue || "";
                        const result = prompt(
                            "Enter seed (DazzleCommand drives)\n" +
                            "Clear/empty to let SmartResCalc drive:",
                            current
                        );
                        if (result === null) {
                            // Cancelled — no change
                        } else if (result.trim() === "") {
                            // Cleared — return control to SmartResCalc
                            userEnteredSeed = null;
                            node._dazzleUserSeed = null;
                            node.setDirtyCanvas(true);
                        } else {
                            const parsed = parseInt(result.trim());
                            if (!isNaN(parsed) && parsed >= 0) {
                                // User entered a seed — DazzleCommand drives
                                userEnteredSeed = parsed;
                                node._dazzleUserSeed = parsed;
                                lastSeedValue = String(parsed);
                                node.setDirtyCanvas(true);
                            }
                        }
                        return true;
                    }
                }

                if (this._pauseArea) {
                    const a = this._pauseArea;
                    if (localX >= a.x && localX <= a.x + a.w &&
                        localY >= a.y && localY <= a.y + a.h) {
                        setState(node.id, "paused", node);
                        node.setDirtyCanvas(true);
                        return true;
                    }
                }
                return false;
            },

            computeSize() {
                return [MIN_NODE_WIDTH, 60];
            },

            serializeValue() {
                // Save play/pause state in workflow
                return getState(node.id);
            },
        });

        // Restore state from workflow load
        const origOnConfigure = node.onConfigure;
        node.onConfigure = function(config) {
            if (origOnConfigure) origOnConfigure.call(this, config);
            const widgets = config?.widgets_values;
            if (widgets) {
                for (const v of widgets) {
                    if (v === "playing" || v === "paused") {
                        nodeStates.set(node.id, v);
                        setState(node.id, v, node);
                        break;
                    }
                }
            }
        };

        // Move buttons to first widget position
        const idx = node.widgets.indexOf(commandWidget);
        if (idx > 0) {
            node.widgets.splice(idx, 1);
            node.widgets.unshift(commandWidget);
        }

        // Min width
        node.size[0] = Math.max(node.size[0], MIN_NODE_WIDTH);
        const origOnResize = node.onResize;
        node.onResize = function(size) {
            size[0] = Math.max(size[0], MIN_NODE_WIDTH);
            if (origOnResize) origOnResize.call(this, size);
        };

        // Update seed display after each prompt completes.
        // SmartResCalc isn't OUTPUT_NODE so "executed" events don't fire for it.
        // Instead, read seedWidget.lastSeed from the connected SmartResCalc
        // after the full prompt finishes. The "status" event with
        // status.exec_info.queue_remaining === 0 indicates queue is done.
        api.addEventListener("status", ({ detail }) => {
            if (detail?.exec_info?.queue_remaining !== 0) return;

            // Find connected SmartResCalc (via noodle) or any in graph
            const allNodes = app.graph._nodes || [];
            for (const srcNode of allNodes) {
                if (srcNode.comfyClass !== 'SmartResolutionCalc') continue;

                // Check if connected to this DazzleCommand
                let isOurs = false;
                const signalInput = srcNode.inputs?.find(i => i.name === 'dazzle_signal');
                if (signalInput?.link) {
                    const link = app.graph.links[signalInput.link];
                    if (link && link.origin_id === node.id) isOurs = true;
                } else {
                    isOurs = true; // No noodle — accept any
                }

                if (isOurs) {
                    const seedWidget = srcNode.widgets?.find(w => w.name === 'fill_seed');
                    logger.debug(`status event: SmartResCalc node ${srcNode.id}, seedWidget=${!!seedWidget}, lastSeed=${seedWidget?.lastSeed}`);
                    if (seedWidget?.lastSeed != null) {
                        lastSeedValue = String(seedWidget.lastSeed);
                        // Sync userEnteredSeed with node property
                        // (cleared by SmartResCalc JS after transient use)
                        if (node._dazzleUserSeed === null && userEnteredSeed !== null) {
                            userEnteredSeed = null;
                            logger.debug('Transient seed cleared by SmartResCalc, returning to display mode');
                        }
                        node.setDirtyCanvas(true);
                    }
                    break;
                }
            }
        });

        // Initialize Python-side state
        setState(node.id, "paused", node);

        node.setSize(node.computeSize());
    },
});
