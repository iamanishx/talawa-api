import { relations, sql } from "drizzle-orm";
import {
	type AnyPgColumn,
	boolean,
	index,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { uuidv7 } from "uuidv7";
import { z } from "zod";
import { agendaFoldersTable } from "./agendaFolders";
import { eventAttachmentsTable } from "./eventAttachments";
import { eventAttendancesTable } from "./eventAttendances";
import { organizationsTable } from "./organizations";
import { recurrenceRulesTable } from "./recurrenceRules";
import { usersTable } from "./users";
import { venueBookingsTable } from "./venueBookings";

/**
 * Drizzle orm postgres table definition for events.
 */
export const eventsTable = pgTable(
	"events",
	{
		/**
		 * Date time at the time the event was created.
		 */
		createdAt: timestamp("created_at", {
			mode: "date",
			precision: 3,
			withTimezone: true,
		})
			.notNull()
			.defaultNow(),
		/**
		 * Foreign key reference to the id of the user who created the event.
		 */
		creatorId: uuid("creator_id").references(() => usersTable.id, {
			onDelete: "set null",
			onUpdate: "cascade",
		}),
		/**
		 * Custom information about the event.
		 */
		description: text("description"),
		/**
		 * Date time at the time the event ends at.
		 */
		endAt: timestamp("end_at", {
			mode: "date",
			precision: 3,
			withTimezone: true,
		}).notNull(),
		/**
		 * Primary unique identifier of the event.
		 */
		id: uuid("id").primaryKey().$default(uuidv7),
		/**
		 * Name of the event.
		 */
		name: text("name", {}).notNull(),
		/**
		 * Foreign key reference to the id of the organization the event is associated to.
		 */
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizationsTable.id, {
				onDelete: "cascade",
				onUpdate: "cascade",
			}),
		/**
		 * Date time at the time the event starts at.
		 */
		startAt: timestamp("start_at", {
			mode: "date",
			precision: 3,
			withTimezone: true,
		}).notNull(),
		/**
		 * Date time at the time the event was last updated.
		 */
		updatedAt: timestamp("updated_at", {
			mode: "date",
			precision: 3,
			withTimezone: true,
		})
			.$defaultFn(() => sql`${null}`)
			.$onUpdate(() => new Date()),
		/**
		 * Foreign key reference to the id of the user who last updated the event.
		 */
		updaterId: uuid("updater_id").references(() => usersTable.id, {
			onDelete: "set null",
			onUpdate: "cascade",
		}),

		/**
		 * Indicates if this event is part of a recurring series.
		 */
		isRecurring: boolean("is_recurring").notNull().default(false),

		/**
		 * Indicates if this is the base template event for a recurring series.
		 */
		isBaseRecurringEvent: boolean("is_base_recurring_event")
			.notNull()
			.default(false),

		/**
		 * Foreign key reference to the id of the base recurring event this instance belongs to.
		 */
		baseRecurringEventId: uuid("base_recurring_event_id").references(
			(): AnyPgColumn => eventsTable.id, // Use AnyPgColumn type annotation
			{
				onDelete: "cascade",
				onUpdate: "cascade",
			},
		),

		/**
		 * Foreign key reference to the id of the recurrence rule that defines this recurring event.
		 */
		recurrenceRuleId: uuid("recurrence_rule_id").references(
			(): AnyPgColumn => recurrenceRulesTable.id,
			{
				onDelete: "cascade",
				onUpdate: "cascade",
			},
		),
	},
	(self) => [
		index().on(self.createdAt),
		index().on(self.creatorId),
		index().on(self.endAt),
		index().on(self.name),
		index().on(self.organizationId),
		index().on(self.startAt),
		index().on(self.isRecurring),
		index().on(self.baseRecurringEventId),
		index().on(self.recurrenceRuleId),
	],
);

export const eventsTableRelations = relations(eventsTable, ({ many, one }) => ({
	/**
	 * One to many relationship from `events` table to `agenda_folders` table.
	 */
	agendaFoldersWhereEvent: many(agendaFoldersTable, {
		relationName: "agenda_folders.event_id:events.id",
	}),
	/**
	 * Many to one relationship from `events` table to `users` table.
	 */
	creator: one(usersTable, {
		fields: [eventsTable.creatorId],
		references: [usersTable.id],
		relationName: "events.creator_id:users.id",
	}),
	/**
	 * One to many relationship from `events` table to `event_attachments` table.
	 */
	attachmentsWhereEvent: many(eventAttachmentsTable, {
		relationName: "event_attachments.event_id:events.id",
	}),
	/**
	 * One to many relationship from `events` table to `event_attendances` table.
	 */
	eventAttendancesWhereEvent: many(eventAttendancesTable, {
		relationName: "event_attendances.event_id:events.id",
	}),
	/**
	 * Many to one relationship from `events` table to `organizations` table.
	 */
	organization: one(organizationsTable, {
		fields: [eventsTable.organizationId],
		references: [organizationsTable.id],
		relationName: "events.organization_id:organizations.id",
	}),
	/**
	 * Many to one relationship from `events` table to `users` table.
	 */
	updater: one(usersTable, {
		fields: [eventsTable.updaterId],
		references: [usersTable.id],
		relationName: "events.updater_id:users.id",
	}),
	/**
	 * One to many relationship from `events` table to `venue_bookings` table.
	 */
	venueBookingsWhereEvent: many(venueBookingsTable, {
		relationName: "events.id:venue_bookings.event_id",
	}),
	/**
	 * Many to one relationship from `events` table to `recurrence_rules` table.
	 */
	recurrenceRule: one(recurrenceRulesTable, {
		fields: [eventsTable.recurrenceRuleId],
		references: [recurrenceRulesTable.id],
		relationName: "events.recurrence_rule_id:recurrence_rules.id",
	}),

	/**
	 * Many to one relationship from `events` table to `events` table (self-reference for recurring instances).
	 */
	baseRecurringEvent: one(eventsTable, {
		fields: [eventsTable.baseRecurringEventId],
		references: [eventsTable.id],
		relationName: "events.base_recurring_event_id:events.id",
	}),

	/**
	 * One to many relationship from `events` table to `events` table (recurring instances).
	 */
	recurringInstances: many(eventsTable, {
		relationName: "events.base_recurring_event_id:events.id",
	}),
}));
export const eventsTableInsertSchema = createInsertSchema(eventsTable, {
	description: () => z.string().min(1).max(2048).optional(),
	name: () => z.string().min(1).max(256),
	isRecurring: () => z.boolean().default(false).optional(),
	isBaseRecurringEvent: () => z.boolean().default(false).optional(),
	baseRecurringEventId: () => z.string().uuid().optional(),
	recurrenceRuleId: () => z.string().uuid().optional(),
});
