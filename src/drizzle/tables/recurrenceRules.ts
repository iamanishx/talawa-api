import { relations, sql } from "drizzle-orm";
import {
	index,
	integer,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { uuidv7 } from "uuidv7";
import { z } from "zod";
import { eventsTable } from "./events";
import { organizationsTable } from "./organizations";
import { usersTable } from "./users";

/**
 * Enum for recurrence frequency options
 */
export const recurrenceFrequencyEnum = {
	options: ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"] as const,
};

/**
 * Drizzle orm postgres table definition for recurrence rules.
 */
export const recurrenceRulesTable = pgTable(
	"recurrence_rules",
	{
		/**
		 * Date time at the time the recurrence rule was created.
		 */
		createdAt: timestamp("created_at", {
			mode: "date",
			precision: 3,
			withTimezone: true,
		})
			.notNull()
			.defaultNow(),

		/**
		 * Foreign key reference to the id of the user who created the recurrence rule.
		 */
		creatorId: uuid("creator_id").references(() => usersTable.id, {
			onDelete: "set null",
			onUpdate: "cascade",
		}),

		/**
		 * The complete RRule string representation of the recurrence pattern.
		 */
		recurrenceRuleString: text("recurrence_rule_string").notNull(),

		/**
		 * Date time at which the recurrence pattern starts.
		 */
		recurrenceStartDate: timestamp("recurrence_start_date", {
			mode: "date",
			precision: 3,
			withTimezone: true,
		}).notNull(),

		/**
		 * Date time at which the recurrence pattern ends (optional).
		 */
		recurrenceEndDate: timestamp("recurrence_end_date", {
			mode: "date",
			precision: 3,
			withTimezone: true,
		}),

		/**
		 * Frequency of the recurrence (DAILY, WEEKLY, MONTHLY, YEARLY).
		 */
		frequency: text("frequency", {
			enum: recurrenceFrequencyEnum.options,
		}).notNull(),

		/**
		 * Interval between recurrences (e.g., every 2 weeks).
		 */
		interval: integer("interval").notNull().default(1),

		/**
		 * Total number of occurrences (optional).
		 */
		count: integer("count"),

		/**
		 * Days of week for recurrence (e.g., ["MO", "WE", "FR"]).
		 */
		byDay: text("by_day").array(),

		/**
		 * Months for recurrence (e.g., [1, 6, 12] for Jan, Jun, Dec).
		 */
		byMonth: integer("by_month").array(),

		/**
		 * Days of month for recurrence (e.g., [1, 15] for 1st and 15th).
		 */
		byMonthDay: integer("by_month_day").array(),

		/**
		 * Primary unique identifier of the recurrence rule.
		 */
		id: uuid("id").primaryKey().$default(uuidv7),

		/**
		 * Foreign key reference to the id of the organization associated with this recurrence rule.
		 */
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizationsTable.id, {
				onDelete: "cascade",
				onUpdate: "cascade",
			}),

		/**
		 * Foreign key reference to the id of the base recurring event.
		 */
		baseRecurringEventId: uuid("base_recurring_event_id")
			.notNull()
			.references(() => eventsTable.id, {
				onDelete: "cascade",
				onUpdate: "cascade",
			}),

		/**
		 * Date time of the latest generated instance in this recurrence series.
		 */
		latestInstanceDate: timestamp("latest_instance_date", {
			mode: "date",
			precision: 3,
			withTimezone: true,
		}).notNull(),

		/**
		 * Date time at the time the recurrence rule was last updated.
		 */
		updatedAt: timestamp("updated_at", {
			mode: "date",
			precision: 3,
			withTimezone: true,
		})
			.$defaultFn(() => sql`${null}`)
			.$onUpdate(() => new Date()),

		/**
		 * Foreign key reference to the id of the user who last updated the recurrence rule.
		 */
		updaterId: uuid("updater_id").references(() => usersTable.id, {
			onDelete: "set null",
			onUpdate: "cascade",
		}),
	},
	(self) => [
		index().on(self.createdAt),
		index().on(self.creatorId),
		index().on(self.frequency),
		index().on(self.organizationId),
		index().on(self.baseRecurringEventId),
		index().on(self.latestInstanceDate),
	],
);

/**
 * Relations for the recurrenceRules table.
 */
export const recurrenceRulesTableRelations = relations(
	recurrenceRulesTable,
	({ one }) => ({
		/**
		 * Many to one relationship from `recurrence_rules` table to `users` table.
		 */
		creator: one(usersTable, {
			fields: [recurrenceRulesTable.creatorId],
			references: [usersTable.id],
			relationName: "recurrence_rules.creator_id:users.id",
		}),

		/**
		 * Many to one relationship from `recurrence_rules` table to `users` table.
		 */
		updater: one(usersTable, {
			fields: [recurrenceRulesTable.updaterId],
			references: [usersTable.id],
			relationName: "recurrence_rules.updater_id:users.id",
		}),

		/**
		 * Many to one relationship from `recurrence_rules` table to `organizations` table.
		 */
		organization: one(organizationsTable, {
			fields: [recurrenceRulesTable.organizationId],
			references: [organizationsTable.id],
			relationName: "recurrence_rules.organization_id:organizations.id",
		}),

		/**
		 * Many to one relationship from `recurrence_rules` table to `events` table.
		 */
		baseRecurringEvent: one(eventsTable, {
			fields: [recurrenceRulesTable.baseRecurringEventId],
			references: [eventsTable.id],
			relationName: "recurrence_rules.base_recurring_event_id:events.id",
		}),
	}),
);

/**
 * Zod schema for recurrenceRules table inserts with validation rules.
 */
export const recurrenceRulesTableInsertSchema = createInsertSchema(
	recurrenceRulesTable,
	{
		frequency: (schema) => schema.pipe(z.enum(recurrenceFrequencyEnum.options)),
		interval: (schema) => schema.positive().int(),
		count: (schema) => schema.positive().int().optional(),
	},
);
