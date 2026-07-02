/**
 * DazzleCommand -- Workflow Orchestration Extension
 *
 * Play/pause buttons at the top of the node.
 * State lives on each node object (runtime) and in node.properties
 * (persisted per workflow-tab draft). At queue time a prompt hook injects
 * the live state into the node's prompt inputs (dazzle_state, a declared
 * hidden input on the Python side). There is NO server-side state and NO
 * API side-channel: node IDs collide across workflow tabs, so any shared
 * store keyed by node ID gets contaminated the moment a second tab opens.
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

// Per-node state. node._dazzleCommandState is the runtime value (also read
// by SmartResCalc's seed intercept); node.properties.dazzle_state is the
// persisted copy that rides each workflow tab's draft, so it survives tab
// switches and page reloads. Deliberately no module-level map and no API
// call: those were shared across tabs and keyed by colliding node IDs.
function getState(node) {
    return node?._dazzleCommandState || "paused";
}

function setState(node, state) {
    node._dazzleCommandState = state;
    node.properties.dazzle_state = state;
}

// Initialize extension with dynamic imports
(async () => {
    const { app, api } = await importComfyCore();

    app.registerExtension({
    name: "DazzleNodes.DazzleCommand",

    async setup() {
        // Inject the live play/pause state into each DazzleCommand node's
        // prompt inputs at queue time. dazzle_state is a declared hidden
        // input on the Python side, so it reaches execute() AND enters the
        // ComfyUI cache key — a toggle is exactly the change that should
        // invalidate the node. This replaces both IS_CHANGED and the old
        // /dazzle-command/set-state API side-channel: the queued prompt is
        // self-contained, so state is per-queue and per-tab by construction.
        const originalQueuePrompt = app.api.queuePrompt.bind(app.api);
        app.api.queuePrompt = async function(index, prompt, ...args) {
            const nodes = app.graph._nodes || [];
            for (const n of nodes) {
                if (n.comfyClass !== "DazzleCommand") continue;
                const nodePrompt = prompt?.output?.[String(n.id)];
                if (nodePrompt?.inputs) {
                    nodePrompt.inputs.dazzle_state = getState(n);
                    logger.debug(`[Queue] Node ${n.id}: injected dazzle_state='${getState(n)}'`);
                }
            }
            return originalQueuePrompt(index, prompt, ...args);
        };
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
                const isPlaying = getState(node) === "playing";

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
                        setState(node, "playing");
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
                            node.properties.dazzle_user_seed = null;
                            node.setDirtyCanvas(true);
                        } else {
                            const parsed = parseInt(result.trim());
                            if (!isNaN(parsed) && parsed >= 0) {
                                // User entered a seed — DazzleCommand drives
                                userEnteredSeed = parsed;
                                node._dazzleUserSeed = parsed;
                                node.properties.dazzle_user_seed = parsed;
                                lastSeedValue = String(parsed);
                                node.properties.dazzle_seed_display = lastSeedValue;
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
                        setState(node, "paused");
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
                                setState(n, "paused");
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
                // Save play/pause state in workflow (legacy slot — properties
                // are the primary store; this keeps old-format restores alive)
                return getState(node);
            },
        });

        // Restore state on configure. LiteGraph copies the serialized
        // properties onto the node BEFORE onConfigure fires, so
        // node.properties is already this tab's persisted truth. Because
        // every store is per-node-object (no shared map, no server state),
        // mid-execution reconfigures, tab switches, and same-file-twice
        // tabs all restore their own values with nothing to contaminate.
        const origOnConfigure = node.onConfigure;
        node.onConfigure = function(config) {
            if (origOnConfigure) origOnConfigure.call(this, config);

            // Runtime-first guard: if THIS node object already carries live
            // state, this configure is a reconfigure replaying a snapshot
            // (extensions like components-manager do this mid-session, and
            // the snapshot may predate the user's last Play/Pause click —
            // the v0.2.5 state-reset incident). The user's clicks outrank
            // stored data: re-assert runtime state over whatever the
            // snapshot restored into properties. Fresh node objects (real
            // loads / tab switches) have no runtime state and fall through
            // to the normal restore below.
            const live = this._dazzleCommandState;
            if (live === "playing" || live === "paused") {
                this.properties.dazzle_state = live;
                logger.debug(`[Configure] Node ${node.id}: reconfigure — preserved runtime state='${live}'`);
                return;
            }

            // Play/pause: properties first, legacy widgets_values fallback
            let state = this.properties?.dazzle_state;
            if (state !== "playing" && state !== "paused") {
                state = null;
                const widgets = config?.widgets_values;
                if (widgets) {
                    for (const v of widgets) {
                        if (v === "playing" || v === "paused") {
                            state = v;
                            break;
                        }
                    }
                }
            }
            setState(node, state || "paused");

            // Seed-bar: restore display + user-entered seed for this tab
            const disp = this.properties?.dazzle_seed_display;
            if (disp != null) lastSeedValue = String(disp);
            const userSeed = this.properties?.dazzle_user_seed;
            userEnteredSeed = (typeof userSeed === "number") ? userSeed : null;
            node._dazzleUserSeed = userEnteredSeed;
            logger.debug(`[Configure] Node ${node.id}: restored state='${getState(node)}', seedDisplay='${lastSeedValue}', userSeed=${userEnteredSeed}`);
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
                // Noodle-required (#56 spirit): only display seeds from a
                // SmartResCalc whose dazzle_signal is wired to THIS node.
                // The old "no noodle — accept any" fallback made unconnected
                // DazzleCommands display seeds from nodes they don't control,
                // which disguises missing noodles as working orchestration.
                let isOurs = false;
                const signalInput = srcNode.inputs?.find(i => i.name === 'dazzle_signal');
                if (signalInput?.link) {
                    const link = app.graph.links[signalInput.link];
                    if (link && link.origin_id === node.id) isOurs = true;
                }

                if (isOurs) {
                    const seedWidget = srcNode.widgets?.find(w => w.name === 'fill_seed');
                    logger.debug(`status event: SmartResCalc node ${srcNode.id}, seedWidget=${!!seedWidget}, lastSeed=${seedWidget?.lastSeed}`);
                    if (seedWidget?.lastSeed != null) {
                        lastSeedValue = String(seedWidget.lastSeed);
                        node.properties.dazzle_seed_display = lastSeedValue;
                        // Sync userEnteredSeed with node property
                        // (cleared by SmartResCalc JS after transient use)
                        if (node._dazzleUserSeed === null && userEnteredSeed !== null) {
                            userEnteredSeed = null;
                            node.properties.dazzle_user_seed = null;
                            logger.debug('Transient seed cleared by SmartResCalc, returning to display mode');
                        }
                        node.setDirtyCanvas(true);
                    }
                    break;
                }
            }
        });

        node.setSize(node.computeSize());
    },
    });
})();
