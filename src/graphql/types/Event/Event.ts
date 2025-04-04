import type { eventsTable } from "~/src/drizzle/tables/events";
import { builder } from "~/src/graphql/builder";
import {
  EventAttachment,
  type EventAttachment as EventAttachmentType,
} from "~/src/graphql/types/EventAttachment/EventAttachment";
import { RecurrenceRule } from "./RecurrenceRule";

export type Event = typeof eventsTable.$inferSelect & {
  attachments: EventAttachmentType[] | null;
};

export const Event = builder.objectRef<Event>("Event");

Event.implement({
  description:
    "Events are occurrences that take place for specific purposes at specific times.",
  fields: (t) => ({
    attachments: t.expose("attachments", {
      description: "Array of attachments.",
      type: t.listRef(EventAttachment),
    }),
    description: t.exposeString("description", {
      description: "Custom information about the event.",
    }),
    endAt: t.expose("endAt", {
      description: "Date time at the time the event ends at.",
      type: "DateTime",
    }),
    id: t.exposeID("id", {
      description: "Global identifier of the event.",
      nullable: false,
    }),
    name: t.exposeString("name", {
      description: "Name of the event.",
    }),
    startAt: t.expose("startAt", {
      description: "Date time at the time the event starts at.",
      type: "DateTime",
    }),
    // Add recurring event fields
    isRecurring: t.exposeBoolean("isRecurring", {
      description: "Whether this event is recurring.",
      nullable: false,
    }),
    isBaseRecurringEvent: t.exposeBoolean("isBaseRecurringEvent", {
      description: "Whether this event is a base recurring event template.",
      nullable: false,
    }),
    baseRecurringEventId: t.exposeID("baseRecurringEventId", {
      description: "ID of the base recurring event this instance belongs to.",
      nullable: true,
    }),
    recurrenceRuleId: t.exposeID("recurrenceRuleId", {
      description: "ID of the recurrence rule that defines this recurring event.",
      nullable: true,
    }),
    // Add a field resolver for the recurrence rule
    recurrenceRule: t.field({
      description: "Recurrence rule that defines this recurring event pattern.",
      type: RecurrenceRule,
      nullable: true,
      resolve: async (parent, _args, ctx) => {
        if (!parent.recurrenceRuleId) return null;
        
        return await ctx.drizzleClient.query.recurrenceRulesTable.findFirst({
          where: (fields, operators) => 
            operators.eq(fields.id, parent.recurrenceRuleId as string),
        });
      },
    }),
  }),
});