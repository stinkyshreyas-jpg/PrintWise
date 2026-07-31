export interface MaterialEstimate {
  minGrams: number;
  maxGrams: number;
  targetGrams: number;
  formattedRange: string;
  estimatedCostUSD: string;
}

export function calculateMaterialRange(
  vShellMm3: number,
  vCoreMaxMm3: number,
  infillPercent: number = 15,
  density: number = 1.24, // PLA Standard
  spoolPriceUSD: number = 25,
  spoolWeightGrams: number = 1000
): MaterialEstimate {
  if (!vShellMm3) {
    return {
      minGrams: 0,
      maxGrams: 0,
      targetGrams: 0,
      formattedRange: "~0g",
      estimatedCostUSD: "$0.00",
    };
  }

  // Raw boundary mass
  const w0 = (vShellMm3 / 1000) * density;
  const w100 = w0 + (vCoreMaxMm3 / 1000) * density;
  const wCoreMax = Math.max(0, w100 - w0);

  // Power curve expected baseline
  const normalizedInfill = Math.max(0, Math.min(100, infillPercent)) / 100;
  const target = w0 + wCoreMax * Math.pow(normalizedInfill, 0.88);

  // Apply slicer variation tolerance buffers (+/- 8% to 12%)
  const minGrams = Math.floor(target * 0.92);
  const maxGrams = Math.ceil(target * 1.10);

  const costPerGram = spoolPriceUSD / spoolWeightGrams;
  const targetCost = target * costPerGram;

  return {
    minGrams,
    maxGrams,
    targetGrams: Math.round(target),
    formattedRange: `~${minGrams}g – ${maxGrams}g`,
    estimatedCostUSD: `$${targetCost.toFixed(2)}`,
  };
}