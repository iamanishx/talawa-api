import { z } from "zod";
import { builder } from "~/src/graphql/builder";

export const recurrenceInputSchema = z.object({
	frequency: z.enum(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"]),
	interval: z.number().int().positive().default(1),
	count: z.number().int().positive().optional(),
	recurrenceEndDate: z.date().optional(),
	byDay: z.array(z.string()).optional(),
	byMonth: z.array(z.number().int().min(1).max(12)).optional(),
	byMonthDay: z.array(z.number().int().min(1).max(31)).optional(),
});

export const RecurrenceInput = builder.inputType("RecurrenceInput", {
	description: "Input for defining a recurrence pattern",
	fields: (t) => ({
		frequency: t.field({
			type: builder.enumType("RecurrenceFrequency", {
				values: ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"],
			}),
			description: "Frequency of the recurrence",
			required: true,
		}),
		interval: t.int({
			description: "Interval between recurrences (e.g., every 2 weeks)",
			defaultValue: 1,
			required: true, // Add this line to make it required
		}),
		// Other fields remain unchanged
		count: t.int({
			description: "Total number of occurrences",
		}),
		recurrenceEndDate: t.field({
			type: "DateTime",
			description: "Date when recurrence ends",
		}),
		byDay: t.stringList({
			description: "Days of week (MO,TU,WE,TH,FR,SA,SU)",
		}),
		byMonth: t.intList({
			description: "Months (1-12)",
		}),
		byMonthDay: t.intList({
			description: "Days of month (1-31)",
		}),
	}),
});
