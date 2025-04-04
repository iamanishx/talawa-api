import { addYears } from "date-fns";
// Fix RRule import - use CommonJS require for compatibility
import rrule from "rrule";
import type { Options as RRuleOptions } from 'rrule';

// Define frequency mapping to avoid direct RRule access issues
const FREQ_MAP = {
  YEARLY: 0,  // These values match RRule.YEARLY, etc.
  MONTHLY: 1,
  WEEKLY: 2,
  DAILY: 3,
  HOURLY: 4,
  MINUTELY: 5,
  SECONDLY: 6
};

const options: RRuleOptions = {
  freq: FREQ_MAP.WEEKLY,
  interval: 1,
  dtstart: new Date(),
  wkst: null,
  count: null,
  until: null,
  tzid: null,
  bysetpos: null,
  bymonth: null,
  bymonthday: null,
  bynmonthday: null,
  byyearday: null,
  byweekno: null,
  byweekday: null,
  bynweekday: null,
  byhour: null,
  byminute: null,
  bysecond: null,
  byeaster: null
};

// Define weekday mapping
const WEEKDAY_MAP = {
  MO: 0,
  TU: 1,
  WE: 2,
  TH: 3,
  FR: 4,
  SA: 5,
  SU: 6
};

/**
 * Interface for recurrence input data
 */
export interface RecurrenceInput {
  frequency: keyof typeof FREQ_MAP;
  interval?: number;
  recurrenceStartDate?: Date;
  recurrenceEndDate?: Date | null;
  count?: number;
  byDay?: string[];
  byMonth?: number[];
  byMonthDay?: number[];
}

/**
 * Generates an RRule string from recurrence input
 */
export function generateRecurrenceRuleString(recurrence: RecurrenceInput): string {
  const options: RRuleOptions = {
	  freq: FREQ_MAP[recurrence.frequency],
	  interval: recurrence.interval || 1,
	  dtstart: recurrence.recurrenceStartDate || new Date(),
	  wkst: null,
	  count: null,
	  until: null,
	  tzid: null,
	  bysetpos: null,
	  bymonth: null,
	  bymonthday: null,
	  bynmonthday: null,
	  byyearday: null,
	  byweekno: null,
	  byweekday: null,
	  bynweekday: null,
	  byhour: null,
	  byminute: null,
	  bysecond: null,
	  byeaster: null
  };

  if (recurrence.count) {
    options.count = recurrence.count;
  }

  if (recurrence.recurrenceEndDate) {
    options.until = recurrence.recurrenceEndDate;
  }

  if (recurrence.byDay && recurrence.byDay.length > 0) {
    options.byweekday = recurrence.byDay.map(day => WEEKDAY_MAP[day as keyof typeof WEEKDAY_MAP]);
  }

  if (recurrence.byMonth && recurrence.byMonth.length > 0) {
    options.bymonth = recurrence.byMonth;
  }

  if (recurrence.byMonthDay && recurrence.byMonthDay.length > 0) {
    options.bymonthday = recurrence.byMonthDay;
  }

  return new rrule.RRule(options).toString();
}

/**
 * Gets dates for recurring instances based on rule
 */
export function getRecurringInstanceDates(
  rRuleString: string,
  startDate: Date,
  endDate: Date | null,
  queryEndDate?: Date
): Date[] {
  const rule = rrule.rrulestr(rRuleString);
  
  // Default to 1 year if no end date is provided
  const effectiveEndDate = endDate || queryEndDate || addYears(new Date(), 1);
  
  // Generate all dates between start and end
  const dates = rule.between(startDate, effectiveEndDate, true);
  
  return dates;
}