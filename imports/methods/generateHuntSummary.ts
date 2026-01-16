import TypedMethod from "./TypedMethod";

export interface HuntSummaryResult {
  summary: string;
  generatedAt: Date;
}

export default new TypedMethod<
  {
    huntId: string;
    timeWindowMinutes: number; // 30, 60, 240, or -1 for "full hunt"
    forceRegenerate?: boolean; // Optional: set to true to bypass cache and force regeneration
  },
  HuntSummaryResult // Returns the summary text and generation timestamp
>("Hunts.methods.generateSummary");
