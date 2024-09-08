import { BaseAnyInputConnectedNode } from "./base_any_input_connected_node.js";
import { PassThroughFollowing } from "./utils.js";
import { wait } from "../../rgthree/common/shared_utils.js";
export class BaseNodeModeChanger extends BaseAnyInputConnectedNode {
    constructor(title) {
        super(title);
        this.inputsPassThroughFollowing = PassThroughFollowing.ALL;
        this.isVirtualNode = true;
        this.modeOn = -1;
        this.modeOff = -1;
        this.properties["toggleRestriction"] = "default";
    }
    onConstructed() {
        wait(10).then(() => {
            if (this.modeOn < 0 || this.modeOff < 0) {
                throw new Error("modeOn and modeOff must be overridden.");
            }
        });
        this.addOutput("OPT_CONNECTION", "*");
        return super.onConstructed();
    }
    configure(info) {
        var _a;
        if ((_a = info.outputs) === null || _a === void 0 ? void 0 : _a.length) {
            info.outputs.length = 1;
        }
        super.configure(info);
    }
    handleLinkedNodesStabilization(linkedNodes) {
        let changed = false;
        for (const [index, node] of linkedNodes.entries()) {
            let widget = this.widgets && this.widgets[index];
            if (!widget) {
                this._tempWidth = this.size[0];
                widget = this.addWidget("toggle", "", false, "", { on: "yes", off: "no" });
                changed = true;
            }
            if (node) {
                changed = this.setWidget(widget, node) || changed;
            }
        }
        if (this.widgets && this.widgets.length > linkedNodes.length) {
            this.widgets.length = linkedNodes.length;
            changed = true;
        }
        return changed;
    }
    setWidget(widget, linkedNode, forceValue) {
        let value;
        const isGroupModeController = linkedNode.constructor.name === "GroupModeController";
        if (isGroupModeController) {
            value = linkedNode.globalToggle;
        } else {
            value = forceValue == null ? linkedNode.mode === this.modeOn : forceValue;
        }

        widget.name = `Enable ${linkedNode.title}`;
        widget.options = { on: "yes", off: "no" };
        widget.value = value;

        widget.doModeChange = (forceValue, skipOtherNodeCheck) => {
            let newValue;
            if (isGroupModeController) {
                newValue = forceValue == null ? !linkedNode.globalToggle : forceValue;
            } else {
                newValue = forceValue == null ? linkedNode.mode === this.modeOff : forceValue;
            }

            if (skipOtherNodeCheck !== true) {
                const restriction = this.properties?.["toggleRestriction"];
                if (newValue && restriction?.includes(" one")) {
                    for (const w of this.widgets) {
                        if (w !== widget) {
                            w.doModeChange(false, true);
                        }
                    }
                }
                else if (!newValue && restriction === "always one") {
                    if (this.widgets.every((w) => !w.value || w === widget)) {
                        newValue = true; // Prevent turning off if it's the last one on
                    }
                }
            }

            if (isGroupModeController) {
                if (linkedNode.globalToggle !== newValue) {
                    linkedNode.onAction("Toggle Global");
                }
                widget.value = linkedNode.globalToggle;
            } else {
                linkedNode.mode = (newValue ? this.modeOn : this.modeOff);
                widget.value = newValue;
            }

            // Apply restrictions after change
            this.applyToggleRestrictions(widget);
        };

        widget.callback = () => {
            widget.doModeChange();
        };

        if (forceValue != null) {
            widget.doModeChange(forceValue);
        }
    }
    applyToggleRestrictions(changedWidget) {
        const restriction = this.properties?.["toggleRestriction"];
        if (restriction === "max one" || restriction === "always one") {
            let activeCount = 0;
            let lastActiveWidget = null;
            for (const w of this.widgets) {
                if (w.value) {
                    activeCount++;
                    lastActiveWidget = w;
                }
            }
            if (restriction === "max one" && activeCount > 1) {
                for (const w of this.widgets) {
                    if (w !== changedWidget && w.value) {
                        w.doModeChange(false, true);
                    }
                }
            } else if (restriction === "always one" && activeCount === 0 && lastActiveWidget) {
                lastActiveWidget.doModeChange(true, true);
            }
        }
        if (forceValue != null) {
            const newMode = (forceValue ? this.modeOn : this.modeOff);
            if (linkedNode.mode !== newMode) {
                linkedNode.mode = newMode;
                changed = true;
            }
        }
        return changed;
    }
    forceWidgetOff(widget, skipOtherNodeCheck) {
        widget.doModeChange(false, skipOtherNodeCheck);
    }
    forceWidgetOn(widget, skipOtherNodeCheck) {
        widget.doModeChange(true, skipOtherNodeCheck);
    }
    forceWidgetToggle(widget, skipOtherNodeCheck) {
        widget.doModeChange(!widget.value, skipOtherNodeCheck);
    }
}
BaseNodeModeChanger.collapsible = false;
BaseNodeModeChanger["@toggleRestriction"] = {
    type: "combo",
    values: ["default", "max one", "always one"],
};
