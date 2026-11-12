export type LayoutReport = { texts: number; band: [number, number] | null; errors: string[]; warns: string[] };
export function probeLayout(opts?: Partial<{ width: number; height: number; brandBand: number; safeTop: number; safeBottom: number; uiBottom: number }>): LayoutReport;
