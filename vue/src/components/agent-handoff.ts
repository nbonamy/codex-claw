export interface AgentHandoffRect {
  height: number;
  left: number;
  top: number;
  width: number;
}

export interface AgentHandoffOrigin {
  contentHeight: number;
  contentOffsetLeft: number;
  contentOffsetTop: number;
  frame: AgentHandoffRect;
}

export function snapshotAgentHandoffRect(rect: DOMRect): AgentHandoffRect {
  return {
    height: rect.height,
    left: rect.left,
    top: rect.top,
    width: rect.width,
  };
}
