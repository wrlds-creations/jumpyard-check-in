import type { HandoutArea, HandoutRequest, HandoutResult, HandoutSelection, StaffSessionDetail, StaffSessionSummary } from "@/lib/adminApi";

export interface HandoutDraft {
  checkinSessionId: string;
  area: HandoutArea;
  selection: HandoutSelection[];
}

// The first tap claims immediately. While that request is in flight, retain only
// the latest complete selection and send it with the server's accepted revision.
export function createSelectionBuffer(request: HandoutRequest) {
  let selection = request.selection || [];
  let revision = request.revision;
  let version = 0;
  return {
    update(next: HandoutSelection[]) { selection = next; version += 1; },
    async drain(send: (request: HandoutRequest) => Promise<HandoutResult | null>) {
      while (true) {
        const sentVersion = version;
        const result = await send({ ...request, revision, selection });
        if (!result) return null;
        if (version === sentVersion) return result;
        const claim = result.handout.claims.find((claim) => claim.area === request.area);
        if (!claim || !Number.isSafeInteger(claim.revision)) throw new Error("Selection revision missing");
        revision = claim.revision;
      }
    },
  };
}

export function mergeHandoutSummary(row: StaffSessionSummary, selected: StaffSessionDetail, result: HandoutResult): StaffSessionSummary {
  if (row.rollerUniqueId !== selected.rollerUniqueId) return row;
  const cafe = result.handout.items.filter((item) => item.area === "cafe");
  const completed = result.session.status === "redeemed" || result.session.handoffStatus === "completed";
  return {
    ...row,
    ...(row.checkinSessionId === selected.checkinSessionId ? result.session : {}),
    claims: result.handout.claims,
    cafeQuantity: cafe.reduce((sum, item) => sum + item.quantity, 0),
    cafeRemaining: cafe.reduce((sum, item) => sum + Math.max(0, item.quantity - item.collected), 0),
    cafeSession: completed ? {
      checkinSessionId: selected.checkinSessionId,
      handoffCode: result.session.handoffCode ?? selected.handoffCode,
      handoffDay: selected.handoffDay,
      completedAt: result.session.completedAt ?? selected.completedAt,
      checkedInBy: result.session.checkedInBy ?? selected.checkedInBy,
      status: "redeemed", handoffStatus: "completed",
    } : row.cafeSession,
  };
}
