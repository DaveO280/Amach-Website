import { TimeFrame } from "../types/healthData";

/**
 * Checks if a date is within the specified time frame from the current date
 *
 * @param dateStr - Date string to check
 * @param timeFrame - Time frame to check against (3mo, 6mo, 1yr, 2yr)
 * @returns boolean indicating if the date is within the time frame
 */
export const isWithinTimeFrame = (
  dateStr: string,
  timeFrame: TimeFrame,
): boolean => {
  const date = new Date(dateStr);
  const now = new Date();
  const cutoff = getTimeFrameCutoffDate(timeFrame);
  return date >= cutoff;
};

/**
 * Gets the cutoff date for a specified time frame
 *
 * @param timeFrame - Time frame to get cutoff date for
 * @returns Date object representing the cutoff date
 */
export const getTimeFrameCutoffDate = (timeFrame: TimeFrame): Date => {
  const now = new Date();

  // Map time frames to days - using only the ones defined in your TimeFrame type
  const timeFrameMap: Record<TimeFrame, number> = {
    "3mo": 90, // 3 months
    "6mo": 180, // 6 months
    "1yr": 365, // 1 year
    "2yr": 730, // 2 years
  };

  // Get the number of days for the time frame
  const days = timeFrameMap[timeFrame] || 365; // Default to 1 year if not found

  // Calculate cutoff date
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - days);
  return cutoff;
};

/**
 * Formats a date to a user-friendly string
 *
 * @param date - Date to format
 * @param format - Optional format (defaults to short date)
 * @returns Formatted date string
 */
export const formatDate = (
  date: Date,
  format: "short" | "long" = "short",
): string => {
  if (format === "long") {
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return date.toLocaleDateString();
};

/**
 * Groups data points by day
 */
export const groupByDay = <T extends { startDate: string }>(
  data: T[],
): Record<string, T[]> => {
  return data.reduce(
    (acc, item) => {
      const day = item.startDate.split("T")[0];
      if (!acc[day]) {
        acc[day] = [];
      }
      acc[day].push(item);
      return acc;
    },
    {} as Record<string, T[]>,
  );
};
