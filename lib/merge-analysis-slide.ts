import type { SlideData } from "./types";

/** An analysis response may predate edits made while its request was running. */
export function mergeAnalysisSlide(current: SlideData | undefined, result: SlideData): SlideData {
  return {
    ...result,
    notes: current?.notes ?? result.notes ?? "",
    ...(current?.read !== undefined ? { read: current.read } : {}),
    ...(current?.chat !== undefined ? { chat: current.chat } : {}),
  };
}
