export interface VisibilityNode {
  visible?: boolean;
  parent?: unknown;
}

/** True when the layer and every parent group are visible. */
export function isDrawn(layer: VisibilityNode): boolean {
  let current: VisibilityNode | undefined = layer;
  while (current) {
    if (current.visible === false) return false;
    const parent: unknown = current.parent;
    if (!isVisibilityNode(parent) || typeof parent.visible !== "boolean") return true;
    current = parent;
  }
  return true;
}

function isVisibilityNode(value: unknown): value is VisibilityNode {
  return typeof value === "object" && value !== null;
}
