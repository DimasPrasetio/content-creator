export type LayoutReport = { texts: number; band: [number, number] | null; errors: string[]; warns: string[] };
export function probeLayout(opts?: Partial<{ width: number; height: number; safeLeft: number; safeRight: number; safeTop: number; safeBottom: number }>): LayoutReport;
