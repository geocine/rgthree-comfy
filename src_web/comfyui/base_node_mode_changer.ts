import type {LGraphNode, IWidget} from "@comfyorg/frontend";

import {BaseAnyInputConnectedNode} from "./base_any_input_connected_node.js";
import {changeModeOfNodes, PassThroughFollowing} from "./utils.js";
import {wait} from "rgthree/common/shared_utils.js";

type GroupModeControllerLike = LGraphNode & {
  globalToggle: boolean;
  onAction(action: "Toggle Global"): void;
};

function isGroupModeController(node: LGraphNode): node is GroupModeControllerLike {
  return (
    node.constructor.name === "GroupModeController" &&
    "globalToggle" in node &&
    typeof (node as {onAction?: unknown}).onAction === "function"
  );
}

export class BaseNodeModeChanger extends BaseAnyInputConnectedNode {
  override readonly inputsPassThroughFollowing: PassThroughFollowing = PassThroughFollowing.ALL;

  static collapsible = false;
  override isVirtualNode = true;

  // These Must be overriden
  readonly modeOn: number = -1;
  readonly modeOff: number = -1;

  static "@toggleRestriction" = {
    type: "combo",
    values: ["default", "max one", "always one"],
  };

  constructor(title?: string) {
    super(title);
    this.properties["toggleRestriction"] = "default";
  }

  override onConstructed(): boolean {
    wait(10).then(() => {
      if (this.modeOn < 0 || this.modeOff < 0) {
        throw new Error("modeOn and modeOff must be overridden.");
      }
    });
    this.addOutput("OPT_CONNECTION", "*");
    return super.onConstructed();
  }

  override handleLinkedNodesStabilization(linkedNodes: LGraphNode[]) {
    let changed = false;
    for (const [index, node] of linkedNodes.entries()) {
      let widget: IWidget | undefined = this.widgets && this.widgets[index];
      if (!widget) {
        // When we add a widget, litegraph is going to mess up the size, so we
        // store it so we can retrieve it in computeSize. Hacky..
        (this as any)._tempWidth = this.size[0];
        widget = this.addWidget("toggle", "", false, "", {on: "yes", off: "no"}) as IWidget;
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

  private setWidget(widget: IWidget, linkedNode: LGraphNode, forceValue?: boolean) {
    let changed = false;
    const isGroupController = isGroupModeController(linkedNode);
    const value = isGroupController
      ? linkedNode.globalToggle
      : forceValue == null
        ? linkedNode.mode === this.modeOn
        : forceValue;
    let name = `Enable ${linkedNode.title}`;
    // Need to set initally
    if (widget.name !== name) {
      widget.name = `Enable ${linkedNode.title}`;
      widget.options = {on: "yes", off: "no"};
      widget.value = value;
      (widget as any).doModeChange = (forceValue?: boolean, skipOtherNodeCheck?: boolean) => {
        const isGroupController = isGroupModeController(linkedNode);
        let newValue = isGroupController
          ? forceValue == null
            ? !linkedNode.globalToggle
            : forceValue
          : forceValue == null
            ? linkedNode.mode === this.modeOff
            : forceValue;
        if (skipOtherNodeCheck !== true) {
          const restriction = this.properties?.["toggleRestriction"] as string | undefined;
          if (newValue && restriction?.includes(" one")) {
            for (const w of this.widgets) {
              if (w !== widget) {
                (w as any).doModeChange(false, true);
              }
            }
          } else if (!newValue && restriction === "always one") {
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
        } else {
          changeModeOfNodes(linkedNode, (newValue ? this.modeOn : this.modeOff));
          widget.value = newValue;
        }
        this.applyToggleRestrictions(widget);
      };
      widget.callback = () => {
        (widget as any).doModeChange();
      };
      changed = true;
    }
    if (isGroupController && widget.value !== value) {
      widget.value = value;
      changed = true;
    }
    if (forceValue != null) {
      (widget as any).doModeChange(forceValue);
      changed = true;
    }
    return changed;
  }

  private applyToggleRestrictions(changedWidget: IWidget) {
    const restriction = this.properties?.["toggleRestriction"] as string | undefined;
    if (restriction !== "max one" && restriction !== "always one") {
      return;
    }
    const activeWidgets = this.widgets.filter((w) => w.value);
    if (restriction === "max one" && activeWidgets.length > 1) {
      for (const w of activeWidgets) {
        if (w !== changedWidget) {
          (w as any).doModeChange(false, true);
        }
      }
    } else if (restriction === "always one" && activeWidgets.length === 0) {
      (changedWidget as any).doModeChange(true, true);
    }
  }

  forceWidgetOff(widget: IWidget, skipOtherNodeCheck?: boolean) {
    (widget as any).doModeChange(false, skipOtherNodeCheck);
  }
  forceWidgetOn(widget: IWidget, skipOtherNodeCheck?: boolean) {
    (widget as any).doModeChange(true, skipOtherNodeCheck);
  }
  forceWidgetToggle(widget: IWidget, skipOtherNodeCheck?: boolean) {
    (widget as any).doModeChange(!widget.value, skipOtherNodeCheck);
  }
}
