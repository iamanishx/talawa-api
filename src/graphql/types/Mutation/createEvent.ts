import type { FileUpload } from "graphql-upload-minimal";
import { ulid } from "ulidx";
import { z } from "zod";
import { eventAttachmentMimeTypeEnum } from "~/src/drizzle/enums/eventAttachmentMimeType";
import { eventAttachmentsTable } from "~/src/drizzle/tables/eventAttachments";
import { recurrenceRulesTable } from "~/src/drizzle/tables/recurrenceRules";
import {
	generateRecurrenceRuleString,
	getRecurringInstanceDates,
} from "~/src/graphql/types/Event/recurringEventHelpers";

import { addYears } from "date-fns";
import { sql } from "drizzle-orm";
import { eventsTable } from "~/src/drizzle/tables/events";
import { builder } from "~/src/graphql/builder";
import {
	MutationCreateEventInput,
	mutationCreateEventInputSchema,
} from "~/src/graphql/inputs/MutationCreateEventInput";
import { Event } from "~/src/graphql/types/Event/Event";
import { TalawaGraphQLError } from "~/src/utilities/TalawaGraphQLError";
import envConfig from "~/src/utilities/graphqLimits";
const mutationCreateEventArgumentsSchema = z.object({
	input: mutationCreateEventInputSchema.transform(async (arg, ctx) => {
		let attachments:
			| (FileUpload & {
					mimetype: z.infer<typeof eventAttachmentMimeTypeEnum>;
			  })[]
			| undefined;

		if (arg.attachments !== undefined) {
			const rawAttachments = await Promise.all(arg.attachments);
			const { data, error, success } = eventAttachmentMimeTypeEnum
				.array()
				.safeParse(rawAttachments.map((attachment) => attachment.mimetype));

			if (!success) {
				for (const issue of error.issues) {
					// `issue.path[0]` would correspond to the numeric index of the attachment within `arg.attachments` array which contains the invalid mime type.
					if (typeof issue.path[0] === "number") {
						ctx.addIssue({
							code: "custom",
							path: ["attachments", issue.path[0]],
							message: `Mime type "${rawAttachments[issue.path[0]]?.mimetype}" is not allowed.`,
						});
					}
				}
			} else {
				attachments = rawAttachments.map((attachment, index) =>
					Object.assign(attachment, {
						mimetype: data[index],
					}),
				);
			}
		}

		return {
			...arg,
			attachments,
		};
	}),
});

builder.mutationField("createEvent", (t) =>
	t.field({
		args: {
			input: t.arg({
				description: "",
				required: true,
				type: MutationCreateEventInput,
			}),
		},
		complexity: envConfig.API_GRAPHQL_OBJECT_FIELD_COST,
		description: "Mutation field to create an event.",
		resolve: async (_parent, args, ctx) => {
			if (!ctx.currentClient.isAuthenticated) {
				throw new TalawaGraphQLError({
					extensions: {
						code: "unauthenticated",
					},
				});
			}

			const {
				data: parsedArgs,
				error,
				success,
			} = await mutationCreateEventArgumentsSchema.safeParseAsync(args);

			if (!success) {
				throw new TalawaGraphQLError({
					extensions: {
						code: "invalid_arguments",
						issues: error.issues.map((issue) => ({
							argumentPath: issue.path,
							message: issue.message,
						})),
					},
				});
			}

			const currentUserId = ctx.currentClient.user.id;

			const [currentUser, existingOrganization] = await Promise.all([
				ctx.drizzleClient.query.usersTable.findFirst({
					columns: {
						role: true,
					},
					where: (fields, operators) => operators.eq(fields.id, currentUserId),
				}),
				ctx.drizzleClient.query.organizationsTable.findFirst({
					columns: {
						countryCode: true,
					},
					with: {
						membershipsWhereOrganization: {
							columns: {
								role: true,
							},
							where: (fields, operators) =>
								operators.eq(fields.memberId, currentUserId),
						},
					},
					where: (fields, operators) =>
						operators.eq(fields.id, parsedArgs.input.organizationId),
				}),
			]);

			if (currentUser === undefined) {
				throw new TalawaGraphQLError({
					extensions: {
						code: "unauthenticated",
					},
				});
			}

			if (existingOrganization === undefined) {
				throw new TalawaGraphQLError({
					extensions: {
						code: "arguments_associated_resources_not_found",
						issues: [
							{
								argumentPath: ["input", "organizationId"],
							},
						],
					},
				});
			}

			const currentUserOrganizationMembership =
				existingOrganization.membershipsWhereOrganization[0];

			if (
				currentUser.role !== "administrator" &&
				(currentUserOrganizationMembership === undefined ||
					currentUserOrganizationMembership.role !== "administrator")
			) {
				throw new TalawaGraphQLError({
					extensions: {
						code: "unauthorized_action_on_arguments_associated_resources",
						issues: [
							{
								argumentPath: ["input", "organizationId"],
							},
						],
					},
				});
			}

			return await ctx.drizzleClient.transaction(async (tx) => {
				const isRecurring = parsedArgs.input.recurrence !== undefined;

				let baseRecurringEvent: typeof eventsTable.$inferSelect | undefined;
				let recurrenceRuleId: string | undefined;

				if (isRecurring) {
					// Create base recurring event
					const [createdBaseEvent] = await tx
						.insert(eventsTable)
						.values({
							creatorId: currentUserId,
							description: parsedArgs.input.description,
							name: parsedArgs.input.name,
							organizationId: parsedArgs.input.organizationId,
							startAt: parsedArgs.input.startAt,
							endAt: parsedArgs.input.endAt,
							isRecurring: true,
							isBaseRecurringEvent: true,
						})
						.returning();

					baseRecurringEvent = createdBaseEvent;
					if (baseRecurringEvent === undefined) {
						throw new TalawaGraphQLError({
							extensions: {
								code: "unexpected",
							},
						});
					}

					// Create recurrence rule
					const recurrence = parsedArgs.input.recurrence as NonNullable<
						typeof parsedArgs.input.recurrence
					>;
					const recurrenceRuleString = generateRecurrenceRuleString({
						...recurrence,
						frequency: recurrence.frequency || "DAILY", // Default to DAILY if frequency is undefined
						recurrenceStartDate: parsedArgs.input.startAt,
					});

					// Calculate date difference for event duration
					const eventDuration =
						parsedArgs.input.endAt.getTime() -
						parsedArgs.input.startAt.getTime();

					// Generate instance dates
					const recurrenceEndDate =
						recurrence.recurrenceEndDate || addYears(new Date(), 1);
					const instanceDates = getRecurringInstanceDates(
						recurrenceRuleString,
						parsedArgs.input.startAt,
						recurrenceEndDate,
					);

					// Create recurrence rule record
					const [createdRule] = await tx
						.insert(recurrenceRulesTable)
						.values({
							creatorId: currentUserId,
							recurrenceRuleString,
							recurrenceStartDate: parsedArgs.input.startAt,
							recurrenceEndDate: recurrence.recurrenceEndDate,
							frequency: recurrence.frequency,
							interval: recurrence.interval || 1,
							count: recurrence.count,
							byDay: recurrence.byDay,
							byMonth: recurrence.byMonth,
							byMonthDay: recurrence.byMonthDay,
							organizationId: parsedArgs.input.organizationId,
							baseRecurringEventId: baseRecurringEvent.id,
							latestInstanceDate:
								instanceDates[instanceDates.length - 1] ||
								parsedArgs.input.startAt,
						})
						.returning();

					if (createdRule === undefined) {
						throw new Error("Expected createdRule to be defined");
					}
					recurrenceRuleId = createdRule.id;

					await tx
						.update(eventsTable)
						.set({
							recurrenceRuleId: createdRule.id,
						})
						.where(sql`${eventsTable.id} = ${baseRecurringEvent.id}`);

					// Create first X instances (e.g., first 10 or up to 6 months)
					// Here we're creating the first instance, rest will be generated on-demand
					const firstInstance = instanceDates[0];
					if (firstInstance) {
						const [createdEvent] = await tx
							.insert(eventsTable)
							.values({
								creatorId: currentUserId,
								description: parsedArgs.input.description,
								name: parsedArgs.input.name,
								organizationId: parsedArgs.input.organizationId,
								startAt: firstInstance,
								endAt: new Date(firstInstance.getTime() + eventDuration),
								isRecurring: true,
								isBaseRecurringEvent: false,
								baseRecurringEventId: baseRecurringEvent.id,
								recurrenceRuleId: createdRule.id,
							})
							.returning();

						// Handle attachments for recurring events
						if (parsedArgs.input.attachments !== undefined) {
							const attachments = parsedArgs.input.attachments;
							if (!createdEvent) {
								throw new Error("Failed to create event");
							}
							const createdEventAttachments = await tx
								.insert(eventAttachmentsTable)
								.values(
									attachments.map((attachment) => ({
										creatorId: currentUserId,
										eventId: createdEvent.id,
										mimeType: attachment.mimetype,
										name: ulid(),
									})),
								)
								.returning();

							await Promise.all(
								createdEventAttachments.map((attachment, index) => {
									if (attachments[index] !== undefined) {
										return ctx.minio.client.putObject(
											ctx.minio.bucketName,
											attachment.name,
											attachments[index].createReadStream(),
											undefined,
											{
												"content-type": attachment.mimeType,
											},
										);
									}
								}),
							);

							if (!createdEvent) {
								throw new Error("Failed to create event");
							}
							return Object.assign(createdEvent, {
								attachments: createdEventAttachments,
								isRecurring: true,
								recurrenceRuleId: createdRule.id,
								baseRecurringEventId: baseRecurringEvent.id,
							});
						}
						if (!createdEvent) {
							throw new Error("Failed to create event");
						}
						return Object.assign(createdEvent, {
							attachments: [],
							isRecurring: true,
							recurrenceRuleId: createdRule.id,
							baseRecurringEventId: baseRecurringEvent.id,
						});
					}
				}

				const [createdEvent] = await tx
					.insert(eventsTable)
					.values({
						creatorId: currentUserId,
						description: parsedArgs.input.description,
						endAt: parsedArgs.input.endAt,
						name: parsedArgs.input.name,
						organizationId: parsedArgs.input.organizationId,
						startAt: parsedArgs.input.startAt,
					})
					.returning();

				// Inserted event not being returned is an external defect unrelated to this code. It is very unlikely for this error to occur.
				if (createdEvent === undefined) {
					ctx.log.error(
						"Postgres insert operation unexpectedly returned an empty array instead of throwing an error.",
					);

					throw new TalawaGraphQLError({
						extensions: {
							code: "unexpected",
						},
					});
				}

				if (parsedArgs.input.attachments !== undefined) {
					const attachments = parsedArgs.input.attachments;

					const createdEventAttachments = await tx
						.insert(eventAttachmentsTable)
						.values(
							attachments.map((attachment) => ({
								creatorId: currentUserId,
								eventId: createdEvent.id,
								mimeType: attachment.mimetype,
								name: ulid(),
							})),
						)
						.returning();

					await Promise.all(
						createdEventAttachments.map((attachment, index) => {
							if (attachments[index] !== undefined) {
								return ctx.minio.client.putObject(
									ctx.minio.bucketName,
									attachment.name,
									attachments[index].createReadStream(),
									undefined,
									{
										"content-type": attachment.mimeType,
									},
								);
							}
						}),
					);

					return Object.assign(createdEvent, {
						attachments: createdEventAttachments,
					});
				}

				return Object.assign(createdEvent, {
					attachments: [],
				});
			});
		},
		type: Event,
	}),
);
