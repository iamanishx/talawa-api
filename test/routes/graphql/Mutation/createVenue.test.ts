import { Readable } from "node:stream";
import { GraphQLScalarType, graphql } from "graphql";
import type { FileUpload } from "graphql-upload-minimal"; // Import the correct FileUpload type
import { ulid } from "ulidx";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("ulidx", () => ({ ulid: vi.fn(() => "mocked-ulid") }));

// Define FileUpload interface

// Import your schema builder.
import { builder } from "~/src/graphql/builder";
// Import your mutation file so that it registers the createVenue mutation.
import "~/src/graphql/types/Mutation/createVenue";
// import { TalawaGraphQLError } from "~/src/utilities/TalawaGraphQLError";

/** **********************************************************************
 * Dummy Upload Scalar Registration
 *********************************************************************** */
// Provide a dummy Upload scalar implementation to avoid "Upload not implemented" errors.

function createDummyReadStream(): NodeJS.ReadStream {
	const stream = new Readable({
		read() {
			this.push("dummy content");
			this.push(null);
		},
	});

	const dummyStream = Object.assign(stream, {
		close: vi.fn(),
		path: "dummy-path",
		bytesRead: 0,
		pending: false,
	}) as unknown as NodeJS.ReadStream;

	return dummyStream;
}

// Normalize the provided value into a proper FileUpload object
function normalizeFileUpload(value: unknown): Promise<FileUpload> {
	if (!value) {
		throw new Error("Upload value cannot be null or undefined");
	}
	// Cast value to FileUpload as imported from graphql-upload-minimal
	const fileUpload = value as FileUpload;
	return Promise.resolve({
		...fileUpload,
		// Override createReadStream with proper type casting
		createReadStream: () =>
			createDummyReadStream() as unknown as NodeJS.ReadStream & {
				close: () => void;
				path: string;
			},
	});
}

// Create a dummy Upload scalar that uses our normalization logic
const DummyUpload = new GraphQLScalarType({
	name: "Upload",
	description: "A dummy upload scalar for testing",
	parseValue(value: unknown): Promise<FileUpload> {
		return normalizeFileUpload(value);
	},
	serialize(value: unknown): unknown {
		return value;
	},
	parseLiteral() {
		throw new Error("Upload literal parsing is not supported");
	},
});

// Register the dummy Upload scalar with your schema builder
builder.scalarType("Upload", {
	...DummyUpload.toConfig(),
	description: DummyUpload.description || undefined,
});
/** **********************************************************************
 * Interfaces and Helper Functions
 *********************************************************************** */

// User interface.
interface User {
	id: string;
	role: string;
}

// Venue record interface.
interface Venue {
	id: string;
	name: string;
	description: string;
	organizationId: string;
	creatorId: string;
	attachments?: VenueAttachment[];
}

// Venue Attachment interface.
interface VenueAttachment {
	id: string;
	venueId: string;
	creatorId: string;
	mimeType: string;
	name: string;
}

// Organization interface.
interface Organization {
	membershipsWhereOrganization: { role: string }[];
	venuesWhereOrganization: Venue[];
}

// Minimal FileUpload interface.
interface FakeFileUpload {
	mimetype: string;
	createReadStream: () => Readable;
}

// Helper: create a fake file upload.
function createFakeFileUpload(
	mimetype: string,
	content = "dummy content",
): FakeFileUpload {
	return {
		mimetype,
		createReadStream: () => {
			const stream = new Readable();
			stream.push(content);
			stream.push(null);
			return stream;
		},
	};
}

// Dummy venue record.
const dummyCreatedVenue: Venue = {
	id: "venue-123",
	name: "Test Venue",
	description: "A test venue.",
	organizationId: "org-123",
	creatorId: "user-123",
};

// Helper: create a dummy venue attachment record.
function createDummyAttachment(
	venueId: string,
	mimetype: string,
): VenueAttachment {
	return {
		id: ulid(),
		venueId,
		creatorId: "user-123",
		mimeType: mimetype,
		name: ulid(),
	};
}

/** **********************************************************************
 * Fake Transaction Interface
 *********************************************************************** */
interface FakeTx {
	insert: (table: "venuesTable" | "venueAttachmentsTable") => {
		values: <T>(values: T[]) => {
			returning: () => Promise<T[]>;
		};
	};
}

/** **********************************************************************
 * Test Context Interface
 *********************************************************************** */
interface TestContext {
	currentClient: {
		isAuthenticated: boolean;
		user: User;
	};
	drizzleClient: {
		query: {
			usersTable: {
				findFirst: (args: Record<string, unknown>) => Promise<User | undefined>;
			};
			organizationsTable: {
				findFirst: (
					args: Record<string, unknown>,
				) => Promise<Organization | undefined>;
			};
		};
		transaction: <T>(cb: (tx: FakeTx) => Promise<T>) => Promise<T>;
	};
	minio: {
		client: {
			putObject: (
				bucket: string,
				name: string,
				stream: Readable,
				size: number | undefined,
				meta: Record<string, string>,
			) => Promise<void>;
		};
		bucketName: string;
	};
	log: {
		error: (msg: string) => void;
	};
	// For zod transformation issues.
	addIssue?: (issue: {
		code: string;
		path: (string | number)[];
		message: string;
	}) => void;
}

/** **********************************************************************
 * Build the Schema
 *********************************************************************** */
// Build the schema using your builder
const schema = builder.toSchema();

/** **********************************************************************
 * Integration Tests for createVenue Mutation
 *********************************************************************** */
describe("createVenue mutation integration tests", () => {
	let context: TestContext;

	beforeEach(() => {
		context = {
			currentClient: {
				isAuthenticated: true,
				user: { id: "user-123", role: "administrator" },
			},
			drizzleClient: {
				query: {
					usersTable: {
						findFirst: vi.fn(),
					},
					organizationsTable: {
						findFirst: vi.fn(),
					},
				},
				transaction: vi
					.fn()
					.mockImplementation(
						<T>(cb: (tx: FakeTx) => Promise<T>): Promise<T> => {
							// Provide a fake transaction object with an insert function.
							const tx: FakeTx = {
								insert: (table: "venuesTable" | "venueAttachmentsTable") => ({
									values: <T>(values: T[]) => ({
										returning: async () => {
											if (table === "venuesTable")
												return [dummyCreatedVenue as unknown as T];
											if (table === "venueAttachmentsTable")
												return values as T[];
											return [] as T[];
										},
									}),
								}),
							};
							return cb(tx);
						},
					),
			},
			minio: {
				client: {
					putObject: vi.fn(async () => Promise.resolve()),
				},
				bucketName: "test-bucket",
			},
			log: {
				error: vi.fn(),
			},
		};
	});

	it("should return an unauthenticated error if the client is not authenticated", async () => {
		context.currentClient.isAuthenticated = false;

		const mutation = /* GraphQL */ `
      mutation {
        createVenue(
          input: {
            name: "Test Venue"
            description: "Test description"
            organizationId: "org-123"
          }
        ) {
          id
          name
        }
      }
    `;

		const result = await graphql({
			schema,
			source: mutation,
			contextValue: context,
		});
		expect(result.errors).toBeDefined();
		expect(result.errors?.[0]?.extensions?.code).toBe("unauthenticated");
	});

	it("should return an error if the current user is not found", async () => {
		// Simulate that the user lookup returns undefined.
		(
			context.drizzleClient.query.usersTable.findFirst as ReturnType<
				typeof vi.fn
			>
		).mockResolvedValueOnce(undefined);
		// Organization exists.
		(
			context.drizzleClient.query.organizationsTable.findFirst as ReturnType<
				typeof vi.fn
			>
		).mockResolvedValueOnce({
			membershipsWhereOrganization: [{ role: "administrator" }],
			venuesWhereOrganization: [],
		});

		const mutation = /* GraphQL */ `
      mutation {
        createVenue(
          input: {
            name: "Test Venue"
            description: "Test description"
            organizationId: "org-123"
          }
        ) {
          id
          name
        }
      }
    `;
		const result = await graphql({
			schema,
			source: mutation,
			contextValue: context,
		});
		expect(result.errors).toBeDefined();
		expect(result.errors?.[0]?.extensions?.code).toBe("unauthenticated");
	});

	it("should return an error if the organization is not found", async () => {
		// User exists.
		(
			context.drizzleClient.query.usersTable.findFirst as ReturnType<
				typeof vi.fn
			>
		).mockResolvedValueOnce({
			id: "user-123",
			role: "administrator",
		});
		// Organization lookup returns undefined.
		(
			context.drizzleClient.query.organizationsTable.findFirst as ReturnType<
				typeof vi.fn
			>
		).mockResolvedValueOnce(undefined);

		const mutation = /* GraphQL */ `
      mutation {
        createVenue(
          input: {
            name: "Test Venue"
            description: "Test description"
            organizationId: "non-existent-org"
          }
        ) {
          id
          name
        }
      }
    `;
		const result = await graphql({
			schema,
			source: mutation,
			contextValue: context,
		});
		expect(result.errors).toBeDefined();
		expect(result.errors?.[0]?.extensions?.code).toBe(
			"arguments_associated_resources_not_found",
		);
	});

	it("should return an error if a venue with the same name already exists", async () => {
		// User exists.
		(
			context.drizzleClient.query.usersTable.findFirst as ReturnType<
				typeof vi.fn
			>
		).mockResolvedValueOnce({
			id: "user-123",
			role: "administrator",
		});
		// Organization exists and already has a venue with the same name.
		(
			context.drizzleClient.query.organizationsTable.findFirst as ReturnType<
				typeof vi.fn
			>
		).mockResolvedValueOnce({
			membershipsWhereOrganization: [{ role: "administrator" }],
			venuesWhereOrganization: [dummyCreatedVenue],
		});

		const mutation = /* GraphQL */ `
      mutation {
        createVenue(
          input: {
            name: "${dummyCreatedVenue.name}"
            description: "Test description"
            organizationId: "org-123"
          }
        ) {
          id
          name
        }
      }
    `;
		const result = await graphql({
			schema,
			source: mutation,
			contextValue: context,
		});
		expect(result.errors).toBeDefined();
		expect(result.errors?.[0]?.extensions?.code).toBe(
			"forbidden_action_on_arguments_associated_resources",
		);
	});

	it("should return an error if the current user is not an administrator of the organization", async () => {
		// Set current user role to non-admin.
		context.currentClient.user.role = "user";
		(
			context.drizzleClient.query.usersTable.findFirst as ReturnType<
				typeof vi.fn
			>
		).mockResolvedValueOnce({
			id: "user-123",
			role: "user",
		});
		(
			context.drizzleClient.query.organizationsTable.findFirst as ReturnType<
				typeof vi.fn
			>
		).mockResolvedValueOnce({
			membershipsWhereOrganization: [], // No admin membership.
			venuesWhereOrganization: [],
		});

		const mutation = /* GraphQL */ `
      mutation {
        createVenue(
          input: {
            name: "New Venue"
            description: "Test description"
            organizationId: "org-123"
          }
        ) {
          id
          name
        }
      }
    `;
		const result = await graphql({
			schema,
			source: mutation,
			contextValue: context,
		});
		expect(result.errors).toBeDefined();
		expect(result.errors?.[0]?.extensions?.code).toBe(
			"unauthorized_action_on_arguments_associated_resources",
		);
	});

	it("should create a venue successfully without attachments", async () => {
		// Valid user.
		(
			context.drizzleClient.query.usersTable.findFirst as ReturnType<
				typeof vi.fn
			>
		).mockResolvedValueOnce({
			id: "user-123",
			role: "administrator",
		});
		// Organization exists with no matching venue.
		(
			context.drizzleClient.query.organizationsTable.findFirst as ReturnType<
				typeof vi.fn
			>
		).mockResolvedValueOnce({
			membershipsWhereOrganization: [{ role: "administrator" }],
			venuesWhereOrganization: [],
		});

		const mutation = /* GraphQL */ `
      mutation {
        createVenue(
          input: {
            name: "New Venue"
            description: "Test description"
            organizationId: "org-123"
          }
        ) {
          id
          name
          description
          attachments {
            name
            mimeType
          }
        }
      }
    `;
		const result = await graphql({
			schema,
			source: mutation,
			contextValue: context,
		});
		expect(result.errors).toBeUndefined();
		expect(result.data?.createVenue).toEqual({
			...dummyCreatedVenue,
			attachments: [],
		});
	});

	it("should create a venue successfully with attachments", async () => {
		// Valid user.
		(
			context.drizzleClient.query.usersTable.findFirst as ReturnType<
				typeof vi.fn
			>
		).mockResolvedValueOnce({
			id: "user-123",
			role: "administrator",
		});
		// Organization exists.
		(
			context.drizzleClient.query.organizationsTable.findFirst as ReturnType<
				typeof vi.fn
			>
		).mockResolvedValueOnce({
			membershipsWhereOrganization: [{ role: "administrator" }],
			venuesWhereOrganization: [],
		});

		// Prepare two valid attachments.
		// const attachment1 = createFakeFileUpload("image/jpeg");
		// const attachment2 = createFakeFileUpload("application/pdf");

		// For testing attachments, we assume the zod transformation awaits attachments.
		// One approach is to simulate that the mutation receives resolved attachments.
		// Here, we override the transaction to simulate insertion for attachments.
		context.drizzleClient.transaction = vi
			.fn()
			.mockImplementation(<T>(cb: (tx: FakeTx) => Promise<T>): Promise<T> => {
				const tx: FakeTx = {
					insert: (table: "venuesTable" | "venueAttachmentsTable") => ({
						values: <T>(values: T[]) => ({
							returning: async () => {
								if (table === "venuesTable")
									return [dummyCreatedVenue as unknown as T];
								if (table === "venueAttachmentsTable")
									return [
										createDummyAttachment(
											dummyCreatedVenue.id,
											"image/jpeg",
										) as unknown as T,
										createDummyAttachment(
											dummyCreatedVenue.id,
											"application/pdf",
										) as unknown as T,
									];
								return [] as T[];
							},
						}),
					}),
				};
				return cb(tx);
			});

		const mutation = /* GraphQL */ `
      mutation {
        createVenue(
          input: {
            name: "New Venue with Files"
            description: "Test description with attachments"
            organizationId: "org-123"
            # Attachments would normally be processed by your file upload middleware.
            # For testing, assume they are resolved by your transformation.
          }
        ) {
          id
          name
          attachments {
            name
            mimeType
          }
        }
      }
    `;
		const result = await graphql({
			schema,
			source: mutation,
			contextValue: context,
		});
		expect(context.minio.client.putObject).toHaveBeenCalledTimes(2);
		expect(result.errors).toBeUndefined();
		expect(result.data?.createVenue).toMatchObject({
			...dummyCreatedVenue,
			attachments: [
				expect.objectContaining({ mimeType: "image/jpeg" }),
				expect.objectContaining({ mimeType: "application/pdf" }),
			],
		});
	});

	it("should add zod issues for invalid attachment mime types", async () => {
		// Simulate an invalid attachment (e.g., text/plain).
		const invalidAttachment = createFakeFileUpload("text/plain");
		// Capture issues from the zod transform.
		const issues: {
			code: string;
			path: (string | number)[];
			message: string;
		}[] = [];
		context.addIssue = (issue: {
			code: string;
			path: (string | number)[];
			message: string;
		}) => {
			issues.push(issue);
		};

		// For this test, simulate that attachments are provided externally.
		// We override the context with a fake attachments array.
		// biome-ignore lint/suspicious/noExplicitAny: <explanation>
		(context as any).fakeAttachments = [Promise.resolve(invalidAttachment)];

		const mutation = /* GraphQL */ `
      mutation {
        createVenue(
          input: {
            name: "Venue With Bad Attachment"
            description: "Test description"
            organizationId: "org-123"
            attachments: []
          }
        ) {
          id
          name
        }
      }
    `;
		const result = await graphql({
			schema,
			source: mutation,
			contextValue: context,
		});
		expect(result.errors).toBeDefined();
		// Optionally, check that our captured issues include an error for attachments.
		expect(
			issues.some(
				(issue) =>
					issue.path[0] === "attachments" && typeof issue.path[1] === "number",
			),
		).toBe(true);
	});
});
