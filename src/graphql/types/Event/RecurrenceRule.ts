import type { recurrenceRulesTable } from "~/src/drizzle/tables/recurrenceRules";
import { builder } from "~/src/graphql/builder";

export type RecurrenceRule = typeof recurrenceRulesTable.$inferSelect;

export const RecurrenceRule = builder.objectRef<RecurrenceRule>("RecurrenceRule");

RecurrenceRule.implement({
  description: "Rules for defining recurring event patterns",
  fields: (t) => ({
    id: t.exposeID("id", {
      description: "Global identifier of the recurrence rule.",
      nullable: false,
    }),
    frequency: t.exposeString("frequency", {
      description: "Frequency of the recurrence (DAILY, WEEKLY, MONTHLY, YEARLY).",
      nullable: false,
    }),
    interval: t.exposeInt("interval", {
      description: "Interval between recurrences (e.g., every 2 weeks).",
      nullable: false,
    }),
    count: t.exposeInt("count", {
      description: "Total number of occurrences.",
      nullable: true,
    }),
    recurrenceRuleString: t.exposeString("recurrenceRuleString", {
      description: "The complete RRule string representation.",
      nullable: false,
    }),
    recurrenceStartDate: t.expose("recurrenceStartDate", {
      description: "Date time at which the recurrence pattern starts.",
      type: "DateTime",
      nullable: false,
    }),
    recurrenceEndDate: t.expose("recurrenceEndDate", {
      description: "Date time at which the recurrence pattern ends.",
      type: "DateTime",
      nullable: true,
    }),
    byDay: t.exposeStringList("byDay", {
      description: "Days of week for recurrence (e.g., MO, WE, FR).",
      nullable: true,
    }),
    byMonth: t.exposeIntList("byMonth", {
      description: "Months for recurrence (e.g., 1, 6, 12).",
      nullable: true,
    }),
    byMonthDay: t.exposeIntList("byMonthDay", {
      description: "Days of month for recurrence.",
      nullable: true,
    }),
  }),
});