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
        this.globalToggle = false;
        this.globalToggleBounds = null;
        this.controlledByMuter = false;
        this.inputNodes = [];
        this.schedulePromise = null;
        this.repeaterNode = null;
        this.isUpdating = false;
        this.groupWidgets = [];
        this.nodeWidgets = [];
        this.groupSettings = {}; // Stores settings for groups
        this.nodeSettings = {};  // Stores settings for nodes
        this.onConstructed();
    }

    onConstructed() {
        console.log("GroupModeController: onConstructed");
        this.addInput("", "*");
        this.addOutput("OPT_CONNECTION", "*");
        return super.onConstructed();
    }

    onAdded(graph) {
        console.log("GroupModeController: onAdded");
        FAST_GROUPS_SERVICE.addFastGroupNode(this);
    }

    onRemoved() {
        console.log("GroupModeController: onRemoved");
        FAST_GROUPS_SERVICE.removeFastGroupNode(this);
    }

    refreshWidgets() {
        const groups = FAST_GROUPS_SERVICE.getGroups(this.properties.sort);
        const linkedNodes = getConnectedInputNodesAndFilterPassThroughs(this);
        const initialWidgetCount = this.widgets.length;

        // Refresh group widgets
        this.refreshGroupWidgets(groups);

        // Refresh node widgets
        this.refreshNodeWidgets(linkedNodes);

        // Combine group and node widgets
        this.widgets = [...this.groupWidgets, ...this.nodeWidgets];

        // Update positions for all widgets
        this.widgets.forEach((widget, i) => this.updateWidgetPosition(widget, i));

        // Only recompute size if the widget count has changed
        if (this.widgets.length !== initialWidgetCount) {
            this.setSize(this.computeSize());
        }

        this.setDirtyCanvas(true, true);
    }

    refreshGroupWidgets(groups) {
        // Clear existing group widgets
        this.groupWidgets = [];

        // Temporary storage to keep track of current settings keys
        const currentSettingsKeys = new Set();

        // Iterate through each group to create/update widgets
        groups.forEach((group, index) => {
            if (this.shouldIncludeGroup(group)) {
                // Generate a unique settingsKey based on group title and index
                const settingsKey = `group_${group.title}_${index}`;
                currentSettingsKeys.add(settingsKey);

                // Retrieve existing settings or initialize with default settings
                const savedSettings = this.groupSettings[settingsKey] || { mute: false, bypass: false };

                // Create the widget
                const widget = this.createEntityWidget(group, "group", settingsKey, savedSettings, index);
                this.groupWidgets.push(widget);

                // Update the groupSettings with the current settings
                this.groupSettings[settingsKey] = widget.value;
            }
        });

        // Clean up groupSettings by removing entries that no longer correspond to any group
        Object.keys(this.groupSettings).forEach(key => {
            if (!currentSettingsKeys.has(key)) {
                delete this.groupSettings[key];
            }
        });
    }

    refreshNodeWidgets(linkedNodes) {
        // Remove widgets for nodes that no longer exist
        this.nodeWidgets = this.nodeWidgets.filter(widget => 
            linkedNodes.some(node => node.id === widget.entity.id)
        );

        // Temporary storage to keep track of current node settings keys
        const currentNodeSettingsKeys = new Set();

        // Update existing widgets and add new ones
        linkedNodes.forEach((node, index) => {
            const settingsKey = `node_${node.id}`;
            currentNodeSettingsKeys.add(settingsKey);

            const existingWidget = this.nodeWidgets.find(w => w.settingsKey === settingsKey && w.type === "node");
            if (existingWidget) {
                // Update the widget's label and entity reference
                existingWidget.label = node.title || node.name;
                existingWidget.entity = node;
                this.nodeSettings[settingsKey] = existingWidget.value;
                this.updateWidgetPosition(existingWidget, index);
            } else {
                // Create a new widget for the node
                const savedSettings = this.nodeSettings[settingsKey] || { mute: false, bypass: false };
                const widget = this.createEntityWidget(node, "node", settingsKey, savedSettings, index);
                this.nodeWidgets.push(widget);
                this.nodeSettings[settingsKey] = widget.value;
            }
        });

        // Clean up nodeSettings by removing entries that no longer correspond to any node
        Object.keys(this.nodeSettings).forEach(key => {
            if (!currentNodeSettingsKeys.has(key)) {
                delete this.nodeSettings[key];
            }
        });
    }

    createEntityWidget(entity, type, settingsKey, savedSettings, index) {
        const entityTitle = entity.title || entity.name;
        
        const widget = {
            name: `Control ${entityTitle}`,
            label: entityTitle,
            value: { ...savedSettings },
            draw: (ctx, node, width, posY, height) => this.drawDoubleToggle(ctx, node, width, posY, height),
            mouse: (event, pos, node) => this.handleMouseEvent(event, pos, node),
            entity: entity,
            settingsKey: settingsKey,
            type: type,
            last_y: null // Initialize as needed
        };
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
        if (!this.flags.collapsed) { // Check if the node is not collapsed
            const nodeWidth = this.size[0];
            const toggleHeight = 20;
            const inputOutputHeight = Math.max(this.inputs.length, this.outputs.length) * LiteGraph.NODE_SLOT_HEIGHT;
            
            // Draw global toggle below inputs and outputs
            this.drawGlobalToggle(ctx, this, nodeWidth, inputOutputHeight + 5, toggleHeight);
        }
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
        console.log("GroupModeController: onMouseDown", event, pos, graphcanvas);
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
        console.log("GroupModeController: handleMouseEvent", event, pos, node);
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
        console.log("GroupModeController: handleToggleClick", pos, widget, toggleX, toggleWidth, toggleType);
        if (pos[0] >= toggleX - toggleWidth && pos[0] <= toggleX + toggleWidth) {
            // Update the settings
            const currentSettings = widget.value;
            currentSettings[toggleType] = !currentSettings[toggleType];
            currentSettings[toggleType === 'mute' ? 'bypass' : 'mute'] = false;
            
            // Save the updated settings
            if (widget.type === "group") {
                this.groupSettings[widget.settingsKey] = { ...currentSettings };
            } else {
                this.nodeSettings[widget.settingsKey] = { ...currentSettings };
            }

            this.applySettingsToEntity(widget, currentSettings);

            // Only apply changes if global toggle is on
            if (this.globalToggle) {
                this.applyCurrentModesToAllGroups();
            }
            this.setDirtyCanvas(true, true);
            return true;
        }
        return false;
    }

    applySettingsToEntity(widget, settings) {
        console.log("GroupModeController: applySettingsToEntity", widget, settings);
        const entity = widget.entity;
        if (entity instanceof LGraphGroup) {
            this.applyModeToGroup(widget, settings);
        } else {
            this.applyModeToNode(widget, settings);
        }
    }

    handleNavClick(pos, widget, height) {
        console.log("GroupModeController: handleNavClick", pos, widget, height);
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
                const entity = widget.entity;
                const settingsKey = widget.settingsKey;
                const savedSettings = widget.type === "group" 
                    ? this.groupSettings[settingsKey] 
                    : this.nodeSettings[settingsKey];

                if (entity instanceof LGraphGroup) {
                    this.applyModeToGroup(widget, savedSettings);
                } else {
                    this.applyModeToNode(widget, savedSettings);
                }
            }
        } else {
            // When global toggle is off, set all nodes to ALWAYS
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

        this.setDirtyCanvas(true, true);
        app.graph.setDirtyCanvas(true, false);

        // Update repeater node if necessary
        if (this.repeaterNode && !this.repeaterNode.isUpdating) {
            const repeaterWidget = this.widgets.find(w => w.entity === this.repeaterNode);
            if (repeaterWidget) {
                const savedSettings = this.nodeSettings[repeaterWidget.settingsKey] || { mute: false, bypass: false };
                const newMode = this.globalToggle ? 
                    (savedSettings.mute ? LiteGraph.NEVER : (savedSettings.bypass ? 4 : LiteGraph.ALWAYS)) :
                    LiteGraph.ALWAYS;
                this.repeaterNode.mode = newMode;
                this.repeaterNode.onModeChange(this.repeaterNode.mode, newMode);
            }
        }

        this.isUpdating = false;
    }

    applyModeToGroup(widget, value) {
        const group = widget.entity;
        for (const node of group._nodes) {
            // Check if this node is individually controlled by this GroupModeController
            const nodeWidget = this.widgets.find(w => w.entity === node);
            if (nodeWidget) {
                // If the node is individually controlled, use its own settings
                const nodeSettings = this.nodeSettings[nodeWidget.settingsKey] || { mute: false, bypass: false };
                node.mode = nodeSettings.mute ? LiteGraph.NEVER : (nodeSettings.bypass ? 4 : LiteGraph.ALWAYS);
            } else {
                // If the node is not individually controlled, apply the group settings
                node.mode = value.mute ? LiteGraph.NEVER : (value.bypass ? 4 : LiteGraph.ALWAYS);
            }
        }
        app.graph.setDirtyCanvas(true, false);
    }

    applyModeToNode(widget, value) {
        const node = widget.entity;
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

    serialize() {
        const obj = super.serialize();
        obj.groupSettings = this.groupSettings;
        obj.nodeSettings = this.nodeSettings;
        return obj;
    }

    configure(info) {
        super.configure(info);
        if (info.groupSettings) {
            this.groupSettings = info.groupSettings;
        }
        if (info.nodeSettings) {
            this.nodeSettings = info.nodeSettings;
        }
    }

    computeSize(out) {
        const size = super.computeSize(out);
        const widgetSpacing = 5; // Same spacing as in updateWidgetPosition

        // Add extra height for the global toggle and widget spacing only if not collapsed
        if (!this.flags.collapsed) {
            size[1] += 20 + (this.widgets.length - 1) * widgetSpacing;
        }
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

    onExternalModeChange(entity, mode) {
        const widget = this.widgets.find(w => w.entity === entity);
        if (widget) {
            const currentSettings = this.entitySettings[widget.settingsKey] || { mute: false, bypass: false };
            currentSettings.mute = mode === 'mute';
            currentSettings.bypass = false;
            this.entitySettings[widget.settingsKey] = { ...currentSettings };
            this.setDirtyCanvas(true, true);
        }
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