import { app } from "../../scripts/app.js";
import { NodeTypesString } from "./constants.js";
import { RgthreeBaseVirtualNode } from "./base_node.js";
import { SERVICE as FAST_GROUPS_SERVICE } from "./services/fast_groups_service.js";
import { drawNodeWidget, fitString, drawTogglePart } from "./utils_canvas.js";
import { getConnectedInputNodesAndFilterPassThroughs } from "./utils.js";

const PROPERTY_SHOW_NAV = "showNav";

export class GroupModeController extends RgthreeBaseVirtualNode {
    constructor(title = GroupModeController.title) {
        super(title);
        this.comfyClass = NodeTypesString.GROUP_MODE_CONTROLLER;
        this.helpActions = "control mute and bypass";
        this.serialize_widgets = true;
        this.globalToggle = true;
        this.globalToggleBounds = null;
        this.controlledByMuter = false;
        this.inputNodes = [];
        this.schedulePromise = null;
        this.repeaterNode = null;
        this.isUpdating = false;
        this.onConstructed();
    }

    onConstructed() {
        this.addInput("", "*");
        this.addOutput("OPT_CONNECTION", "*");
        return super.onConstructed();
    }

    onAdded(graph) {
        FAST_GROUPS_SERVICE.addFastGroupNode(this);
    }

    onRemoved() {
        FAST_GROUPS_SERVICE.removeFastGroupNode(this);
    }

    refreshWidgets() {
        const groups = FAST_GROUPS_SERVICE.getGroups(this.properties.sort);
        const linkedNodes = getConnectedInputNodesAndFilterPassThroughs(this);
        let index = 0;
        const initialWidgetCount = this.widgets.length;

        // Process groups
        for (const group of groups) {
            if (this.shouldIncludeGroup(group)) {
                this.processEntity(group, index++);
            }
        }

        // Process linked nodes
        for (const node of linkedNodes) {
            this.processEntity(node, index++);
        }

        this.widgets.splice(index);

        // Update positions for all widgets
        this.widgets.forEach((widget, i) => this.updateWidgetPosition(widget, i));

        if (this.widgets.length !== initialWidgetCount) {
            this.setSize(this.computeSize());
        }
        this.setDirtyCanvas(true, true);
    }

    processEntity(entity, index) {
        const widgetName = `Control ${entity.title || entity.name}`;
        let widget = this.widgets.find((w) => w.name === widgetName);
        if (!widget) {
            widget = this.createEntityWidget(entity, index);
        } else {
            this.updateWidgetPosition(widget, index);
        }

        if (this.widgets[index] !== widget) {
            const oldIndex = this.widgets.findIndex((w) => w === widget);
            if (oldIndex !== -1) {
                this.widgets.splice(oldIndex, 1);
            }
            this.widgets.splice(index, 0, widget);
        }
    }

    createEntityWidget(entity, index) {
        const widget = this.addCustomWidget({
            name: `Control ${entity.title || entity.name}`,
            label: entity.title || entity.name,
            value: { mute: false, bypass: false },
            draw: (ctx, node, width, posY, height) => this.drawDoubleToggle(ctx, node, width, posY, height),
            mouse: (event, pos, node) => this.handleMouseEvent(event, pos, node),
            entity: entity
        });
        this.updateWidgetPosition(widget, index);
        return widget;
    }

    updateWidgetPosition(widget, index) {
        const inputOutputHeight = Math.max(this.inputs.length, this.outputs.length) * LiteGraph.NODE_SLOT_HEIGHT;
        const globalToggleHeight = 25; // Adjust this value based on your global toggle height
        const widgetSpacing = 5; // Add spacing between widgets
        const startY = inputOutputHeight + globalToggleHeight + 10;
        widget.y = startY + index * (LiteGraph.NODE_WIDGET_HEIGHT + widgetSpacing);
    }

    shouldIncludeGroup(group) {
        if (this.properties?.PROPERTY_MATCH_TITLE?.trim()) {
            try {
                return new RegExp(this.properties.PROPERTY_MATCH_TITLE, "i").test(group.title);
            } catch (e) {
                return false;
            }
        }
        return true;
    }

    drawDoubleToggle(ctx, node, width, posY, height) {
        const widget = this.widgets.find(w => w.last_y === posY);
        if (!widget) return;

        const widgetData = drawNodeWidget(ctx, { width, height, posY });
        const showNav = node.properties?.[PROPERTY_SHOW_NAV] !== false;

        let currentX = widgetData.width - widgetData.margin;

        widget.navX = currentX;
        widget.bypassX = 0;
        widget.muteX = 0;

        if (!widgetData.lowQuality && showNav) {
            currentX = this.drawNavArrow(ctx, currentX, widgetData);
        } else if (widgetData.lowQuality && showNav) {
            currentX -= 28;
        }

        currentX = this.drawBypassToggle(ctx, currentX, posY, height, widget, widgetData);
        currentX = this.drawMuteToggle(ctx, currentX, posY, height, widget, widgetData);

        if (!widgetData.lowQuality) {
            this.drawLabels(ctx, currentX, posY, height, widget, widgetData);
        }
    }

    drawNavArrow(ctx, currentX, widgetData) {
        currentX -= 7;
        const midY = widgetData.posY + widgetData.height * 0.5;
        ctx.fillStyle = ctx.strokeStyle = "#89A";
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        const arrow = new Path2D(`M${currentX} ${midY} l -7 6 v -3 h -7 v -6 h 7 v -3 z`);
        ctx.fill(arrow);
        ctx.stroke(arrow);
        currentX -= 14;

        currentX -= 7;
        ctx.strokeStyle = widgetData.colorOutline;
        ctx.stroke(new Path2D(`M ${currentX} ${widgetData.posY} v ${widgetData.height}`));
        return currentX;
    }

    drawBypassToggle(ctx, currentX, posY, height, widget, widgetData) {
        currentX -= 7;
        const toggleRadius = height * 0.36;
        widget.bypassX = currentX - toggleRadius;
        ctx.fillStyle = widget.value.bypass ? "#89A" : "#333";
        ctx.beginPath();
        ctx.arc(widget.bypassX, posY + height * 0.5, toggleRadius, 0, Math.PI * 2);
        ctx.fill();
        return currentX - toggleRadius * 2;
    }

    drawMuteToggle(ctx, currentX, posY, height, widget, widgetData) {
        currentX -= 7;
        const toggleRadius = height * 0.36;
        widget.muteX = currentX - toggleRadius;
        ctx.fillStyle = widget.value.mute ? "#89A" : "#333";
        ctx.beginPath();
        ctx.arc(widget.muteX, posY + height * 0.5, toggleRadius, 0, Math.PI * 2);
        ctx.fill();
        return currentX - toggleRadius * 2;
    }

    drawLabels(ctx, currentX, posY, height, widget, widgetData) {
        currentX -= 4;
        ctx.textAlign = "right";
        ctx.fillStyle = widget.value.bypass ? widgetData.colorText : widgetData.colorTextSecondary;
        ctx.fillText("B", currentX, posY + height * 0.7);
        currentX -= ctx.measureText("B").width;

        currentX -= 4;
        ctx.fillStyle = widget.value.mute ? widgetData.colorText : widgetData.colorTextSecondary;
        ctx.fillText("M", currentX, posY + height * 0.7);
        currentX -= ctx.measureText("M").width;

        currentX -= 7;
        ctx.textAlign = "left";
        let maxLabelWidth = widgetData.width - widgetData.margin - 10 - (widgetData.width - currentX);
        if (widget.label != null) {
            ctx.fillText(
                fitString(ctx, widget.label, maxLabelWidth),
                widgetData.margin + 10,
                posY + height * 0.7
            );
        }
    }

    onDrawForeground(ctx) {
        const nodeWidth = this.size[0];
        const toggleHeight = 20;
        const inputOutputHeight = Math.max(this.inputs.length, this.outputs.length) * LiteGraph.NODE_SLOT_HEIGHT;
        
        // Draw global toggle below inputs and outputs
        this.drawGlobalToggle(ctx, this, nodeWidth, inputOutputHeight + 5, toggleHeight);
    }

    drawGlobalToggle(ctx, node, width, posY, height) {
        const margin = 15;
        const innerMargin = margin * 0.33;
        let posX = margin;

        ctx.save();
        ctx.fillStyle = this.controlledByMuter ? LiteGraph.WIDGET_SECONDARY_TEXT_COLOR : LiteGraph.WIDGET_TEXT_COLOR;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.font = "12px Arial";
        ctx.fillText("Global Toggle:", posX, posY + height * 0.5);

        posX += ctx.measureText("Global Toggle:").width + innerMargin;
        const toggleWidth = 20;
        const toggleHeight = height - 4;
        this.globalToggleBounds = [posX, posY + 2, toggleWidth, toggleHeight];
        drawTogglePart(ctx, { 
            posX, 
            posY: posY + 2, 
            height: toggleHeight, 
            value: this.globalToggle,
            disabled: this.controlledByMuter
        });
        ctx.restore();
    }

    onMouseDown(event, pos, graphcanvas) {
        if (this.controlledByMuter) {
            return false; // Disable interaction if controlled by a Muter
        }
        
        if (this.globalToggleBounds) {
            const [x, y, width, height] = this.globalToggleBounds;
            if (pos[0] >= x && pos[0] <= x + width && pos[1] >= y && pos[1] <= y + height) {
                this.globalToggle = !this.globalToggle;
                this.setDirtyCanvas(true, true);
                this.applyCurrentModesToAllGroups();
                return true;
            }
        }
        return super.onMouseDown?.(event, pos, graphcanvas);
    }

    handleMouseEvent(event, pos, node) {
        if (event.type === "pointerdown") {
            const height = node.size[1];
            const toggleWidth = 13;

            const widget = this.widgets.find(w => 
                pos[1] >= w.last_y && pos[1] <= w.last_y + LiteGraph.NODE_WIDGET_HEIGHT
            );

            if (widget) {
                if (this.handleToggleClick(pos, widget, widget.muteX, toggleWidth, 'mute') ||
                    this.handleToggleClick(pos, widget, widget.bypassX, toggleWidth, 'bypass')) {
                    node.setDirtyCanvas(true, true);
                    this.applyCurrentModesToAllGroups();
                    return true;
                }

                if (this.handleNavClick(pos, widget, height)) {
                    this.applyCurrentModesToAllGroups();
                    return true;
                }
            }
        }
        return false;
    }

    handleToggleClick(pos, widget, toggleX, toggleWidth, toggleType) {
        if (pos[0] >= toggleX - toggleWidth && pos[0] <= toggleX + toggleWidth) {
            widget.value[toggleType] = !widget.value[toggleType];
            widget.value[toggleType === 'mute' ? 'bypass' : 'mute'] = false;
            console.log(`${toggleType} toggle clicked. New state: M${widget.value.mute ? 1 : 0} B${widget.value.bypass ? 1 : 0}`);
            
            // Update repeater if it exists and this widget corresponds to it
            if (this.repeaterNode && !this.repeaterNode.isUpdating && widget.entity === this.repeaterNode) {
                const newMode = widget.value.mute ? LiteGraph.NEVER : 
                               (widget.value.bypass ? 4 : LiteGraph.ALWAYS);
                this.repeaterNode.mode = newMode;
                this.repeaterNode.onModeChange(this.repeaterNode.mode, newMode);
            }
            
            return true;
        }
        return false;
    }

    handleNavClick(pos, widget, height) {
        if (pos[0] >= widget.navX - 28 && pos[0] <= widget.navX && pos[1] >= 0 && pos[1] <= height) {
            console.log(`Navigation arrow clicked for ${widget.label}`);
            const canvas = app.canvas;
            if (widget.entity instanceof LGraphGroup) {
                this.centerAndZoomOnGroup(canvas, widget.entity);
            } else {
                canvas.centerOnNode(widget.entity);
            }
            return true;
        }
        return false;
    }

    centerAndZoomOnGroup(canvas, group) {
        canvas.centerOnNode(group);
        const zoomCurrent = canvas.ds.scale || 1;
        const zoomX = canvas.canvas.width / group._size[0] - 0.02;
        const zoomY = canvas.canvas.height / group._size[1] - 0.02;
        canvas.setZoom(Math.min(zoomCurrent, zoomX, zoomY), [
            canvas.canvas.width / 2,
            canvas.canvas.height / 2,
        ]);
        canvas.setDirty(true, true);
    }

    onExecute() {
        this.stabilizeInputsOutputs();
        this.refreshWidgets();
        this.applyCurrentModesToAllGroups();
        this.triggerOutput();
    }

    applyCurrentModesToAllGroups() {
        if (this.isUpdating) return;
        this.isUpdating = true;

        if (this.globalToggle) {
            for (const widget of this.widgets) {
                if (widget.entity instanceof LGraphGroup) {
                    this.applyModeToGroup(widget.entity, widget.value);
                } else {
                    this.applyModeToNode(widget.entity, widget.value);
                }
            }
        } else {
            for (const group of FAST_GROUPS_SERVICE.getGroups()) {
                for (const node of group._nodes) {
                    node.mode = LiteGraph.ALWAYS;
                }
            }
            const linkedNodes = getConnectedInputNodesAndFilterPassThroughs(this);
            for (const node of linkedNodes) {
                node.mode = LiteGraph.ALWAYS;
            }
        }
        app.graph.setDirtyCanvas(true, false);

        // Update connected NodeModeRepeater
        if (this.repeaterNode && !this.repeaterNode.isUpdating) {
            if (this.globalToggle) {
                const repeaterWidget = this.widgets.find(w => w.entity === this.repeaterNode);
                if (repeaterWidget) {
                    const newMode = repeaterWidget.value.mute ? LiteGraph.NEVER : 
                                    (repeaterWidget.value.bypass ? 4 : LiteGraph.ALWAYS);
                    this.repeaterNode.mode = newMode;
                    this.repeaterNode.onModeChange(this.repeaterNode.mode, newMode);
                }
            } else {
                // Set repeater to ALWAYS when global toggle is off
                this.repeaterNode.mode = LiteGraph.ALWAYS;
                this.repeaterNode.onModeChange(this.repeaterNode.mode, LiteGraph.ALWAYS);
            }
        }

        this.isUpdating = false;
    }

    applyModeToGroup(group, value) {
        for (const node of group._nodes) {
            node.mode = value.mute ? LiteGraph.NEVER : (value.bypass ? 4 : LiteGraph.ALWAYS);
        }
        app.graph.setDirtyCanvas(true, false);
    }

    applyModeToNode(node, value) {
        node.mode = value.mute ? LiteGraph.NEVER : (value.bypass ? 4 : LiteGraph.ALWAYS);
    }

    triggerOutput() {
        // Implement output triggering logic here if needed
    }

    onAction(action) {
        switch (action) {
            case "Toggle Global":
                this.globalToggle = !this.globalToggle;
                this.setDirtyCanvas(true, true);
                this.applyCurrentModesToAllGroups();
                break;
            case "Mute all":
                this.applyToAll({ mute: true, bypass: false });
                break;
            case "Bypass all":
                this.applyToAll({ mute: false, bypass: true });
                break;
            case "Clear all":
                this.applyToAll({ mute: false, bypass: false });
                break;
        }
        this.triggerOutput();
    }

    applyToAll(value) {
        for (const widget of this.widgets) {
            widget.value = { ...value };
        }
        this.setDirtyCanvas(true, true);
    }

    configure(info) {
        if (info.outputs?.length) {
            info.outputs.length = 1;
        }
        super.configure(info);
    }

    computeSize(out) {
        const size = super.computeSize(out);
        const widgetSpacing = 5; // Same spacing as in updateWidgetPosition
        // Add extra height for the global toggle and widget spacing
        size[1] += 2 + (this.widgets.length - 1) * widgetSpacing;
        return size;
    }

    onConnectionsChange(type, slotIndex, isConnected, link_info, input) {
        console.log(`GroupModeController: onConnectionsChange called with type: ${type}, slotIndex: ${slotIndex}, isConnected: ${isConnected}, link_info: ${JSON.stringify(link_info)}, input: ${JSON.stringify(input)}`);
        
        if (type === LiteGraph.OUTPUT && slotIndex === 0) {
            this.controlledByMuter = isConnected;
        }

        if (type === LiteGraph.INPUT) {
            if (isConnected && link_info) {
                console.log(`New connection made to input slot ${slotIndex}`);
                if (link_info.origin_id) {
                    const connectedNode = this.graph.getNodeById(link_info.origin_id);
                    if (this.isNodeModeRepeater(connectedNode)) {
                        this.repeaterNode = connectedNode;
                        // Instead of syncing, just update the repeater's mode
                        this.repeaterNode.mode = this.globalToggle ? LiteGraph.ALWAYS : LiteGraph.NEVER;
                    }
                }
            } else {
                console.log(`Connection removed from input slot ${slotIndex}`);
                if (this.repeaterNode && link_info && link_info.origin_id === this.repeaterNode.id) {
                    this.repeaterNode = null;
                }
            }
            this.scheduleStabilizeWidgets();
        }

        if (super.onConnectionsChange) {
            super.onConnectionsChange(type, slotIndex, isConnected, link_info, input);
        }
    }

    scheduleStabilizeWidgets(ms = 100) {
        if (!this.schedulePromise) {
            this.schedulePromise = new Promise((resolve) => {
                setTimeout(() => {
                    this.schedulePromise = null;
                    this.doStabilization();
                    resolve();
                }, ms);
            });
        }
        return this.schedulePromise;
    }

    doStabilization() {
        if (!this.graph) {
            return;
        }
        this.stabilizeInputsOutputs();
        this.refreshWidgets();
        app.graph.setDirtyCanvas(true, true);
    }

    // Implement methods from BaseAnyInputConnectedNode
    stabilizeInputsOutputs() {
        const hasEmptyInput = !this.inputs[this.inputs.length - 1]?.link;
        if (!hasEmptyInput) {
            this.addInput("", "*");
        }
        for (let index = this.inputs.length - 2; index >= 0; index--) {
            const input = this.inputs[index];
            if (!input.link) {
                this.removeInput(index);
            } else {
                const node = getConnectedInputNodesAndFilterPassThroughs(this, this, index)[0];
                input.name = node?.title || "";
            }
        }
    }

    isNodeModeRepeater(node) {
        return node && typeof node === 'object' && node.type === NodeTypesString.NODE_MODE_REPEATER;
    }
}

GroupModeController.type = NodeTypesString.GROUP_MODE_CONTROLLER;
GroupModeController.title = NodeTypesString.GROUP_MODE_CONTROLLER;
GroupModeController.category = "rgthree";
GroupModeController._category = "rgthree";
GroupModeController.exposedActions = ["Mute all", "Bypass all", "Clear all"];

app.registerExtension({
    name: "rgthree.GroupModeController",
    registerCustomNodes() {
        GroupModeController.setUp();
    },
    loadedGraphNode(node) {
        if (node.type == GroupModeController.title) {
            node.tempSize = [...node.size];
        }
    },
});