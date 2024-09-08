import { app } from "../../scripts/app.js";
import { NodeTypesString } from "./constants.js";
import { BaseFastGroupsModeChanger } from "./fast_groups_muter.js";
import { SERVICE as FAST_GROUPS_SERVICE } from "./services/fast_groups_service.js";
import { drawNodeWidget, fitString, drawTogglePart } from "./utils_canvas.js";

const PROPERTY_SHOW_NAV = "showNav";

export class GroupModeController extends BaseFastGroupsModeChanger {
    constructor(title = GroupModeController.title) {
        super(title);
        this.comfyClass = NodeTypesString.GROUP_MODE_CONTROLLER;
        this.helpActions = "control mute and bypass";
        this.serialize_widgets = true;
        this.globalToggle = true;
        this.globalToggleBounds = null;
        this.onConstructed();
    }

    onConstructed() {
        return super.onConstructed();
    }

    refreshWidgets() {
        const groups = FAST_GROUPS_SERVICE.getGroups(this.properties.sort);
        let index = 0;
        const initialWidgetCount = this.widgets.length;
    
        this.widgets = this.widgets.filter(w => w.name !== "globalToggle");
    
        for (const group of groups) {
            if (this.shouldIncludeGroup(group)) {
                const widgetName = `Control ${group.title}`;
                let widget = this.widgets.find((w) => w.name === widgetName);
                if (!widget) {
                    widget = this.createGroupWidget(group);
                }
    
                if (this.widgets[index] !== widget) {
                    const oldIndex = this.widgets.findIndex((w) => w === widget);
                    this.widgets.splice(index, 0, this.widgets.splice(oldIndex, 1)[0]);
                }
    
                index++;
            }
        }
    
        this.widgets.splice(index);
    
        if (this.widgets.length !== initialWidgetCount) {
            this.setSize(this.computeSize());
        }
    }

    createGroupWidget(group) {
        return this.addCustomWidget({
            name: `Control ${group.title}`,
            label: group.title,
            value: { mute: false, bypass: false },
            draw: (ctx, node, width, posY, height) => this.drawDoubleToggle(ctx, node, width, posY, height),
            mouse: (event, pos, node) => this.handleMouseEvent(event, pos, node)
        });
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
        this.drawGlobalToggle(ctx, this, nodeWidth, 4, toggleHeight);

        const startY = toggleHeight + 5;

        for (let i = 0; i < this.widgets.length; ++i) {
            const w = this.widgets[i];
            const y = startY + i * LiteGraph.NODE_WIDGET_HEIGHT + 4;
            w.last_y = y;
            if (w.draw) {
                w.draw(ctx, this, w.last_y, w.last_y + LiteGraph.NODE_WIDGET_HEIGHT);
            }
        }
    }

    drawGlobalToggle(ctx, node, width, posY, height) {
        const margin = 10;
        const innerMargin = margin * 0.33;
        let posX = margin;

        ctx.save();
        ctx.fillStyle = LiteGraph.WIDGET_TEXT_COLOR;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.font = "12px Arial";
        ctx.fillText("Global Toggle:", posX, posY + height * 0.5);

        posX += ctx.measureText("Global Toggle:").width + innerMargin;
        const toggleWidth = 20;
        const toggleHeight = height - 4;
        this.globalToggleBounds = [posX, posY + 2, toggleWidth, toggleHeight];
        drawTogglePart(ctx, { posX, posY: posY + 2, height: toggleHeight, value: this.globalToggle });
        ctx.restore();
    }

    onMouseDown(event, pos, graphcanvas) {
        
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
            return true;
        }
        return false;
    }

    handleNavClick(pos, widget, height) {
        if (pos[0] >= widget.navX - 28 && pos[0] <= widget.navX && pos[1] >= 0 && pos[1] <= height) {
            console.log(`Navigation arrow clicked for ${widget.label}`);
            const canvas = app.canvas;
            const group = FAST_GROUPS_SERVICE.getGroups().find(g => g.title === widget.label);
            if (group) {
                this.centerAndZoomOnGroup(canvas, group);
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
        this.applyCurrentModesToAllGroups();
        this.triggerOutput();
    }

    applyCurrentModesToAllGroups() {
        if (this.globalToggle) {
            for (const widget of this.widgets) {
                const group = FAST_GROUPS_SERVICE.getGroups().find(g => g.title === widget.label);
                if (group) {
                    this.applyModeToGroup(group, widget.value);
                }
            }
        } else {
            for (const group of FAST_GROUPS_SERVICE.getGroups()) {
                for (const node of group._nodes) {
                    node.mode = LiteGraph.ALWAYS;
                }
            }
        }
        app.graph.setDirtyCanvas(true, false);
    }

    applyModeToGroup(group, value) {
        for (const node of group._nodes) {
            node.mode = value.mute ? LiteGraph.NEVER : (value.bypass ? 4 : LiteGraph.ALWAYS);
        }
        app.graph.setDirtyCanvas(true, false);
    }

    triggerOutput() {
        // Implement output triggering logic here if needed
    }

    onAction(action) {
        switch (action) {
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
        return size;
    }
}

GroupModeController.type = NodeTypesString.GROUP_MODE_CONTROLLER;
GroupModeController.title = NodeTypesString.GROUP_MODE_CONTROLLER;
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