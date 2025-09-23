import { subWeeks, addWeeks } from "date-fns";

export type RelativePeriodName = "prev" | "current";

export function dateToSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

export function getPeriod(
  relativePeriodName: RelativePeriodName
): [Date, Date] | undefined {
  const recentWednesday = getRecentWednesdayStartOfDay();
  const prevWednesday = subWeeks(recentWednesday, 1);
  const nextWednesday = addWeeks(recentWednesday, 1);

  switch (relativePeriodName) {
    case "prev":
      return [prevWednesday, recentWednesday];
    case "current":
      return [recentWednesday, nextWednesday];
    default:
      throw new Error("Unsupported period: " + relativePeriodName);
  }
}

export function getRecentWednesdayStartOfDay(): Date {
  const now = new Date();
  const dayOfWeek = now.getUTCDay();
  const daysSinceWednesday = (dayOfWeek + 4) % 7;

  return new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - daysSinceWednesday,
      0,
      0,
      0
    )
  );
}
