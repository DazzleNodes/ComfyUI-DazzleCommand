/**
 * DazzleCommand -- Workflow Orchestration Extension
 *
 * Play/pause buttons at the top of the node.
 * State is communicated to Python via API endpoint (not widget input)
 * to avoid ComfyUI cache invalidation.
 *
 * COMPATIBILITY NOTE:
 * Uses dynamic imports with auto-depth detection to work in both:
 * - Standalone mode: /extensions/dazzle-command/
 * - DazzleNodes mode: /extensions/comfyui-dazzlenodes/dazzle-command/
 */

import { logger } from "./debug_logger.js";

// Dynamic import helper for standalone vs nested extension compatibility
async function importComfyCore() {
    const currentPath = import.meta.url;
    const urlParts = new URL(currentPath).pathname.split('/').filter(p => p);
    const depth = urlParts.length;
    const prefix = '../'.repeat(depth);

    const [appModule, apiModule] = await Promise.all([
        import(`${prefix}scripts/app.js`),
        import(`${prefix}scripts/api.js`)
    ]);

    return { app: appModule.app, api: apiModule.api };
}

const PLAY_COLOR = "#2a5a2a";
const PAUSE_COLOR = "#5a4a1a";
const BUTTON_BG = "#3a3a3a";
const INFO_BG = "#1a1a1a";
const BUTTON_RADIUS = 4;
const MIN_NODE_WIDTH = 260;

// Track state per node (JS-side, persisted via workflow save)
const nodeStates = new Map();

// Workflow identity tracking — detect new workflow vs mid-execution reconfigure.
// When loadGraphData fires, we reset this so the next configure knows it's a fresh load.
let _lastWorkflowId = null;
let _workflowJustLoaded = false;

// Resolved after dynamic import
let _app = null;

function _getWorkflowId() {
    const id = _app?.graph?.extra?.id;
    if (id) return id;
    // Fallback for older workflows without UUID
    const g = _app?.graph;
    if (g) return `legacy-${g.last_node_id ?? 0}`;
    return null;
}

function getState(nodeId) {
    return nodeStates.get(nodeId) || "paused";
}

// api reference set by IIFE after dynamic import
let _api = null;

async function setState(nodeId, state, node) {
    nodeStates.set(nodeId, state);
    // Store on node object so other extensions can read it
    if (node) node._dazzleCommandState = state;
    // Notify Python via API (writes to sys._dazzle_command_state)
    try {
        await _api.fetchApi("/dazzle-command/set-state", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ state, nodeId }),
        });
    } catch (e) {
        logger.error("API call failed:", e);
    }
}

// Initialize extension with dynamic imports
(async () => {
    const { app, api } = await importComfyCore();
    _api = api;
    _app = app;

    app.registerExtension({
    name: "DazzleNodes.DazzleCommand",

    async setup() {
        // Patch loadGraphData to detect new workflow loads vs reconfigures.
        // When a new workflow loads, we clear nodeStates so onConfigure
        // restores state from saved data. Mid-execution reconfigures
        // preserve runtime state (user's play/pause clicks).
        const origLoadGraphData = app.loadGraphData?.bind(app);
        if (origLoadGraphData) {
            app.loadGraphData = async function(graphData, ...args) {
                _workflowJustLoaded = true;
                _lastWorkflowId = null;
                logger.debug("[Workflow] loadGraphData fired — will restore saved state on next configure");
                return origLoadGraphData(graphData, ...args);
            };
        }
    },

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
                const btnHeight = 28;
                const resetSize = btnHeight;  // Perfect square matching button height
                const gap = 2;
                const btnWidth = (usable - gap - resetSize - gap) / 2;
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
                const pauseX = margin + btnWidth + gap;
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

                // Reset All button (perfect square, right of pause)
                const resetX = pauseX + btnWidth + gap;
                const resetY = btnY;
                ctx.fillStyle = "#3a3a4a";
                ctx.beginPath();
                ctx.roundRect(resetX, resetY, resetSize, resetSize, 3);
                ctx.fill();
                ctx.strokeStyle = "#555566";
                ctx.lineWidth = 1;
                ctx.stroke();
                // Draw recycle/reset arrow icon
                const cx = resetX + resetSize / 2;
                const cy = resetY + resetSize / 2;
                const r = resetSize * 0.28;
                ctx.strokeStyle = "#aaaacc";
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.arc(cx, cy, r, -0.5, Math.PI * 1.3);
                ctx.stroke();
                // Arrowhead
                const tipAngle = Math.PI * 1.3;
                const tipX = cx + r * Math.cos(tipAngle);
                const tipY = cy + r * Math.sin(tipAngle);
                ctx.fillStyle = "#aaaacc";
                ctx.beginPath();
                ctx.moveTo(tipX - 3, tipY - 2);
                ctx.lineTo(tipX + 2, tipY + 1);
                ctx.lineTo(tipX, tipY + 4);
                ctx.closePath();
                ctx.fill();

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
                this._resetArea = { x: resetX, y: resetY, w: resetSize, h: resetSize };
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
                // Reset All — set every DazzleCommand to paused
                if (this._resetArea) {
                    const a = this._resetArea;
                    if (localX >= a.x && localX <= a.x + a.w &&
                        localY >= a.y && localY <= a.y + a.h) {
                        const allNodes = app.graph._nodes || [];
                        for (const n of allNodes) {
                            if (n.comfyClass === "DazzleCommand") {
                                setState(n.id, "paused", n);
                                n.setDirtyCanvas(true);
                            }
                        }
                        logger.debug("[Reset All] All DazzleCommand nodes set to paused");
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

        // Restore state from workflow load — but only on NEW workflow loads.
        // Mid-execution reconfigures preserve runtime state (user's clicks).
        const origOnConfigure = node.onConfigure;
        node.onConfigure = function(config) {
            if (origOnConfigure) origOnConfigure.call(this, config);

            const currentWfId = _getWorkflowId();
            const isNewWorkflow = _workflowJustLoaded || currentWfId !== _lastWorkflowId;

            if (isNewWorkflow) {
                // New workflow — restore saved state
                _lastWorkflowId = currentWfId;
                _workflowJustLoaded = false;

                const widgets = config?.widgets_values;
                if (widgets) {
                    for (const v of widgets) {
                        if (v === "playing" || v === "paused") {
                            nodeStates.set(node.id, v);
                            const _node = node;
                            const _state = v;
                            setTimeout(() => {
                                setState(_node.id, _state, _node);
                            }, 100);
                            logger.debug(`[Configure] Node ${node.id}: NEW workflow, restored state='${v}'`);
                            break;
                        }
                    }
                }
            } else {
                // Same workflow reconfigure — preserve runtime state
                const existing = nodeStates.get(node.id);
                if (existing) {
                    node._dazzleCommandState = existing;
                    logger.debug(`[Configure] Node ${node.id}: SAME workflow, preserved state='${existing}'`);
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

        // Initialize Python-side state — defer until node ID is assigned (#5)
        const _initNode = node;
        setTimeout(() => {
            const savedState = nodeStates.get(_initNode.id) || "paused";
            setState(_initNode.id, savedState, _initNode);
        }, 150);

        node.setSize(node.computeSize());
    },
    });
})();
