import { subWeeks, addWeeks, fromUnixTime } from "date-fns";

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

export function validateInitialFromTimestamp(
  initialFromTimestamp: number
): void {
  if (
    !Number.isSafeInteger(initialFromTimestamp) ||
    initialFromTimestamp <= 0
  ) {
    throw new Error(
      `initialFromTimestamp must be an integer number of seconds since epoch, got "${initialFromTimestamp}".`
    );
  }
  if (initialFromTimestamp >= 1e11) {
    throw new Error(
      `initialFromTimestamp must be in seconds since epoch, not milliseconds.`
    );
  }

  const start = dateToSeconds(getRecentWednesdayStartOfDay());
  const TWELVE_HOURS_IN_SECONDS = 12 * 60 * 60;
  const end = start + TWELVE_HOURS_IN_SECONDS;

  if (initialFromTimestamp < start || initialFromTimestamp > end) {
    const where = initialFromTimestamp < start ? "before" : "after";
    const diffSeconds =
      initialFromTimestamp < start
        ? start - initialFromTimestamp
        : initialFromTimestamp - end;

    throw new Error(
      `Timestamp ${initialFromTimestamp} (${fromUnixTime(
        initialFromTimestamp
      ).toISOString()}) ` +
        `must be between ${fromUnixTime(
          start
        ).toISOString()} and ${fromUnixTime(end).toISOString()}. ` +
        `It is ${diffSeconds} seconds ${where} the allowed window.`
    );
  }
}
