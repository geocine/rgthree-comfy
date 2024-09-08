import { BaseAnyInputConnectedNode } from "./base_any_input_connected_node.js";
import { changeModeOfNodes, PassThroughFollowing } from "./utils.js";
import { wait } from "../../rgthree/common/shared_utils.js";
function isGroupModeController(node) {
    return (node.constructor.name === "GroupModeController" &&
        "globalToggle" in node &&
        typeof node.onAction === "function");
}
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
        let changed = false;
        const isGroupController = isGroupModeController(linkedNode);
        const value = isGroupController
            ? linkedNode.globalToggle
            : forceValue == null
                ? linkedNode.mode === this.modeOn
                : forceValue;
        let name = `Enable ${linkedNode.title}`;
        if (widget.name !== name) {
            widget.name = `Enable ${linkedNode.title}`;
            widget.options = { on: "yes", off: "no" };
            widget.value = value;
            widget.doModeChange = (forceValue, skipOtherNodeCheck) => {
                var _a, _b;
                const isGroupController = isGroupModeController(linkedNode);
                let newValue = isGroupController
                    ? forceValue == null
                        ? !linkedNode.globalToggle
                        : forceValue
                    : forceValue == null
                        ? linkedNode.mode === this.modeOff
                        : forceValue;
                if (skipOtherNodeCheck !== true) {
                    const restriction = (_a = this.properties) === null || _a === void 0 ? void 0 : _a["toggleRestriction"];
                    if (newValue && (restriction === null || restriction === void 0 ? void 0 : restriction.includes(" one"))) {
                        for (const w of this.widgets) {
                            if (w !== widget) {
                                w.doModeChange(false, true);
                            }
                        }
                    }
                    else if (!newValue && restriction === "always one") {
                        if (this.widgets.every((w) => !w.value || w === widget)) {
                            newValue = true;
                        }
                    }
                }
                if (isGroupController) {
                    if (linkedNode.globalToggle !== newValue) {
                        linkedNode.onAction("Toggle Global");
                    }
                    widget.value = linkedNode.globalToggle;
                }
                else {
                    changeModeOfNodes(linkedNode, (newValue ? this.modeOn : this.modeOff));
                    widget.value = newValue;
                }
                this.applyToggleRestrictions(widget);
            };
            widget.callback = () => {
                widget.doModeChange();
            };
            changed = true;
        }
        if (isGroupController && widget.value !== value) {
            widget.value = value;
            changed = true;
        }
        if (forceValue != null) {
            widget.doModeChange(forceValue);
            changed = true;
        }
        return changed;
    }
    applyToggleRestrictions(changedWidget) {
        var _a;
        const restriction = (_a = this.properties) === null || _a === void 0 ? void 0 : _a["toggleRestriction"];
        if (restriction !== "max one" && restriction !== "always one") {
            return;
        }
        const activeWidgets = this.widgets.filter((w) => w.value);
        if (restriction === "max one" && activeWidgets.length > 1) {
            for (const w of activeWidgets) {
                if (w !== changedWidget) {
                    w.doModeChange(false, true);
                }
            }
        }
        else if (restriction === "always one" && activeWidgets.length === 0) {
            changedWidget.doModeChange(true, true);
        }
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
