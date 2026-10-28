// Splits one merged ticket into the problems its reports actually describe. Pages explain it; this file is what runs.
import { causeOf, uniqueById, type Report, type Tenant } from '#lib/kb/causes';

// `parser` and `hint` are the causes causes.ts knows, counted the way the desk's view files them: by tenant.
// `one-day` is a date that moved by a single day: no month/day flip does that, so it is its own problem.
// The desk lists those reports in desk-notes.json (`oneDayMove`) and files them under their tenant's cause,
// so they count there too.
export type Problem = 'parser' | 'hint' | 'one-day' | 'unplaced';

export function problemsOf(r: Report, t: Tenant | undefined, oneDayMove: readonly string[]): Problem[] {
  const cause: Problem = causeOf(r, t) ?? 'unplaced';
  return oneDayMove.includes(r.id) ? [cause, 'one-day'] : [cause];
}

export type ProblemGroup = {
  problem: Problem;
  reports: Report[];
  // What intake tagged these reports as: tag → count.
  taggedAs: Record<string, number>;
  channels: Record<string, number>;
  tenants: string[];
  firstSeen: string;
  lastSeen: string;
};

export type Split = { exported: number; unique: number; groups: ProblemGroup[]; inTwo: number };

const tally = (xs: string[]) => xs.reduce<Record<string, number>>((n, x) => ({ ...n, [x]: (n[x] ?? 0) + 1 }), {});

export function splitTicket(
  exported: Report[],
  ticket: number,
  tenantOf: (r: Report) => Tenant | undefined,
  oneDayMove: readonly string[],
): Split {
  const merged = uniqueById(exported).filter((r) => r.mergedInto === ticket);
  const byProblem = new Map<Problem, Report[]>();
  for (const r of merged) {
    for (const p of problemsOf(r, tenantOf(r), oneDayMove)) byProblem.set(p, [...(byProblem.get(p) ?? []), r]);
  }
  const groups = [...byProblem.entries()]
    .map(([problem, rs]) => {
      const days = rs.map((r) => r.receivedAt.slice(0, 10)).sort();
      return {
        problem,
        reports: rs,
        taggedAs: tally(rs.map((r) => r.meta.intakeTag)),
        channels: tally(rs.map((r) => r.channel)),
        tenants: [...new Set(rs.map((r) => r.tenant))].sort(),
        firstSeen: days[0],
        lastSeen: days[days.length - 1],
      };
    })
    .sort((a, b) => b.reports.length - a.reports.length);
  return {
    exported: exported.filter((r) => r.mergedInto === ticket).length,
    unique: merged.length,
    groups,
    inTwo: merged.filter((r) => problemsOf(r, tenantOf(r), oneDayMove).length > 1).length,
  };
}

// Reports of a `parser` or `hint` problem whose intake tag names the other cause.
export function mistagged(s: Split): number {
  return s.groups
    .filter((g) => g.problem === 'parser' || g.problem === 'hint')
    .reduce((n, g) => n + g.reports.filter((r) => r.meta.intakeTag !== g.problem).length, 0);
}
