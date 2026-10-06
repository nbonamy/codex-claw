/** Developer-controlled release gates. Change in source and rebuild; never persist or override at runtime. */
export const releaseFeatures = Object.freeze({
  // Awaiting native multi-agent MCP and CodeReviewService qualification.
  antigravity: false,
});

export type ReleaseFeature = keyof typeof releaseFeatures;
