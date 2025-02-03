import { it, expect, vi, suite, test } from "vitest";
import { mercuriusClient } from "../client";
import { assertToBeNonNullish } from "../../../helpers";
import { server } from "../../../server";
import { mutation_createVenue, Query_signIn } from "../documentNodes";
import type { FileUpload } from "graphql-upload-minimal";
import { Readable } from "node:stream";

suite("Mutation field createVenue", () => {
    
	const mockCtx = {
		currentClient: {
			isAuthenticated: true,
			user: { id: "user-123", role: "administrator" },
		},
		drizzleClient: {
			query: {
				organizationsTable: {
					findFirst: vi.fn().mockResolvedValue({
						countryCode: "US",
						membershipsWhereOrganization: [{ role: "administrator" }],
						venuesWhereOrganization: [],
					}),
				},
			},
			transaction: vi.fn().mockImplementation(async (callback) => {
				const tx = {
					insert: vi.fn().mockResolvedValue([
						{
							id: "venue-123",
							name: "Test Venue with Attachments",
							description: "A test venue",
							organizationId: "org-123",
							attachments: [{ mimeType: "image/jpeg", name: "attachment-1" }],
						},
					]),
				};
				return await callback(tx);
			}),
		},
		minio: {
			client: {
				putObject: vi.fn().mockImplementation((bucket, key, stream) => {
					if (!(stream instanceof Readable)) {
						throw new Error("Invalid stream: Expected a ReadableStream.");
					}
					return Promise.resolve();
				}),
			},
			bucketName: "test-bucket",
		},
	};

	suite("schema operation", () => {
		test("creates venue without attachments", async () => {
			const result = await mercuriusClient.mutate(mutation_createVenue, {
				variables: {
					input: {    
						name: "Test Venue",
						description: "A test venue",
						organizationId: "org-123",
					},
				},
			});

			console.log("result:", result);
			expect(result.data).toBeDefined();
			if (result.data?.createVenue) {
				expect(result.data.createVenue.attachments).toBeUndefined();
			}
		});

		test("creates venue with valid attachments", async () => {
            // Mock a valid FileUpload object
            const mockFile: FileUpload = {
                filename: "test.jpg",
                mimetype: "image/jpeg",
                encoding: "utf-8",
                createReadStream: vi.fn(() => {
                    const stream = Readable.from(Buffer.from([0, 1, 2, 3])) as Readable & {
                        close: () => void;
                        bytesRead: number;
                        path: string;
                        pending: boolean;
                    };
                    stream.close = vi.fn();
                    stream.bytesRead = 0;
                    stream.path = "test.jpg";
                    stream.pending = false;
                    return stream;
                }),
                fieldName: ""
            };
          
            // Mock the transaction to return attachments
            mockCtx.drizzleClient.transaction.mockImplementation(async (callback) => {
              const tx = {
                insert: vi.fn().mockResolvedValue([{
                  id: "venue-123",
                  name: "Test Venue with Attachments",
                  description: "A test venue",
                  organizationId: "org-123",
                  attachments: [{ mimeType: "image/jpeg", name: "attachment-1" }],
                }]),
              };
              return callback(tx);
            });
          
            const result = await mercuriusClient.mutate(mutation_createVenue, {
              variables: {
                input: {
                  name: "Test Venue with Attachments",
                  description: "A test venue",
                  organizationId: "org-123",
                  attachments: [Promise.resolve(mockFile)], // ✅ Wrap in Promise.resolve()
                },
              },
            });
            console.log("result:", result);
            expect(result.data?.createVenue).toBeDefined();
            expect(result.data?.createVenue?.attachments).toEqual([
              { mimeType: "image/jpeg", name: "attachment-1" },
            ]);
          });
          
          test("should reject invalid mime types", async () => {
            // Mock an invalid FileUpload object
            const mockFile: FileUpload = {
                filename: "test.txt",
                mimetype: "text/plain", // Invalid mime type
                encoding: "utf-8",
                createReadStream: vi.fn(() => {
                    const stream = Readable.from(Buffer.from([0, 1, 2, 3])) as Readable & {
                        close: () => void;
                        bytesRead: number;
                        path: string;
                        pending: boolean;
                    };
                    stream.close = vi.fn();
                    stream.bytesRead = 0;
                    stream.path = "test.txt";
                    stream.pending = false;
                    return stream;
                }),
                fieldName: ""
            };
          
            const result = await mercuriusClient.mutate(mutation_createVenue, {
              variables: {
                input: {
                  name: "Test Venue",
                  organizationId: "org-123",
                  attachments: [mockFile], // No Promise.resolve() needed
                },
              },
            });
            console.log("result:", result);

            expect(result.errors).toMatchObject([
              {
                message: 'Mime type "text/plain" is not allowed.',
                extensions: { code: "invalid_arguments" },
              },
            ]);
          });

		test("should handle multiple attachments with one invalid mime type", async () => {
			const mockFile1: FileUpload = {
				filename: "test.jpg",
				mimetype: "image/jpeg",
				encoding: "utf-8",
				createReadStream: vi.fn(),
			} as unknown as FileUpload;
			const mockFile2: FileUpload = {
				filename: "test.txt",
				mimetype: "text/plain",
				encoding: "utf-8",
				createReadStream: vi.fn(),
			} as unknown as FileUpload;

			const ctx = { addIssue: vi.fn() };

			const result = await mercuriusClient.mutate(mutation_createVenue, {
				variables: {
					input: {
						name: "Test Venue with Multiple Attachments",
						description: "A test venue",
						organizationId: "org-123",
						attachments: [
							Promise.resolve(mockFile1),
							Promise.resolve(mockFile2),
						],
					},
				},
			});

			expect(result.data).toBeUndefined();
			expect(ctx.addIssue).toHaveBeenCalledTimes(1);
			expect(ctx.addIssue).toHaveBeenCalledWith({
				code: "custom",
				path: ["attachments", 1],
				message: `Mime type "text/plain" is not allowed.`,
			});
		});

		test("should handle no attachments", async () => {
			const result = await mercuriusClient.mutate(mutation_createVenue, {
				variables: {
					input: {
						name: "Test Venue with No Attachments",
						description: "A test venue",
						organizationId: "org-123",
					},
				},
			});

			expect(result.data).toBeDefined();
			if (result.data?.createVenue) {
				expect(result.data.createVenue.attachments).toBeUndefined();
			}
		});

		test("should invalidate input with invalid mime type", async () => {
			const mockFile: FileUpload = {
				filename: "test.txt",
				mimetype: "text/plain",
				encoding: "utf-8",
				createReadStream: vi.fn(),
			} as unknown as FileUpload;

			const input = {
				name: "Test Venue with Invalid Attachment",
				description: "A test venue",
				organizationId: "org-123",
				attachments: [Promise.resolve(mockFile)],
			};

			const result = await mercuriusClient.mutate(mutation_createVenue, {
				variables: { input },
			});

			expect(result.errors).toBeDefined();
			expect(result.errors?.length).toBe(1);
			expect(result.errors?.[0]?.message).toContain(
				'Mime type "text/plain" is not allowed.',
			);
		});
	});

	// Tests for the GraphQL resolver logic (beyond schema validation)
	suite("resolver operation", () => {
		test("should reject unauthenticated users", async () => {
			mockCtx.currentClient.isAuthenticated = false;

			const result = await mercuriusClient.mutate(mutation_createVenue, {
				variables: {
					input: {
						name: "Unauthorized Venue",
						description: "Test venue",
						organizationId: "org-123",
					},
				},
				headers: {
					Authorization: "false",
				},
			});

			expect(result.errors).toBeDefined();
			expect(result.errors?.[0]?.extensions?.code).toBe("unauthenticated");
		});

		it("should reject unauthorized users", async () => {
			const result = await mercuriusClient.mutate(mutation_createVenue, {
				variables: {
					input: {
						name: "Unauthorized Venue",
						description: "Test venue",
						organizationId: "org-123",
					},
				},
				headers: {
					Authorization: "true",
				},
			});

			expect(result.errors).toBeDefined();
			expect(result.errors?.[0]?.extensions?.code).toBe("unauthenticated");
		});

		//Organization & Venue Name Checks
		test("should reject if organization does not exist", async () => {
			const adminSignInResult = await mercuriusClient.query(Query_signIn, {
				variables: {
					input: {
						emailAddress: server.envConfig.API_ADMINISTRATOR_USER_EMAIL_ADDRESS,
						password: server.envConfig.API_ADMINISTRATOR_USER_PASSWORD,
					},
				},
			});
			assertToBeNonNullish(adminSignInResult.data.signIn?.authenticationToken);

			const result = await mercuriusClient.mutate(mutation_createVenue, {
				variables: {
					input: {
						name: "New Venue",
						description: "Test venue",
						organizationId: "non-existent-org",
					},
				},
				headers: {
					authorization: `Bearer ${adminSignInResult.data.signIn.authenticationToken}`,
				},
			});

			expect(result.errors).toBeDefined();
			expect(result.errors?.[0]?.extensions?.code).toBe(
				"arguments_associated_resources_not_found",
			);
		});

		test("should reject if venue name is already taken", async () => {
			const adminSignInResult = await mercuriusClient.query(Query_signIn, {
				variables: {
					input: {
						emailAddress: server.envConfig.API_ADMINISTRATOR_USER_EMAIL_ADDRESS,
						password: server.envConfig.API_ADMINISTRATOR_USER_PASSWORD,
					},
				},
			});

			assertToBeNonNullish(adminSignInResult.data.signIn?.authenticationToken);
			const ctx = {
				drizzleClient: {
					query: {
						organizationsTable: {
							findFirst: vi.fn(),
						},
					},
				},
			};

			vi.spyOn(
				ctx.drizzleClient.query.organizationsTable,
				"findFirst",
			).mockResolvedValue({
				venuesWhereOrganization: [{ updatedAt: new Date() }], // Mock an existing venue
			});

			const result = await mercuriusClient.mutate(mutation_createVenue, {
				headers: {
					authorization: `Bearer ${adminSignInResult.data.signIn.authenticationToken}`,
				},
				variables: {
					input: {
						name: "Duplicate Venue",
						description: "Test venue",
						organizationId: "org-123",
					},
				},
			});

			expect(result.errors).toBeDefined();
			expect(result.errors?.[0]?.extensions?.code).toBe(
				"forbidden_action_on_arguments_associated_resources",
			);
		});

		//Successful Venue Creation

		test("creates a venue successfully", async () => {
			mockCtx.drizzleClient.transaction.mockImplementation(async (callback) => {
				const tx = {
					insert: vi
						.fn()
						.mockReturnValue([
							{ id: "venue-123", name: "New Venue", organizationId: "org-123" },
						]),
				};
				return callback(tx);
			});

			const result = await mercuriusClient.mutate(mutation_createVenue, {
				variables: {
					input: {
						name: "New Venue",
						description: "Test venue",
						organizationId: "org-123",
					},
				},
			});

			expect(result.data).toBeDefined();
			expect(result.data.createVenue).toMatchObject({ name: "New Venue" });
		});

		//Handling Attachments in Minio
		test("stores attachments in MinIO", async () => {
			const mockFile: FileUpload = {
				filename: "test.jpg",
				mimetype: "image/jpeg",
				encoding: "utf-8",
				createReadStream: vi.fn(),
			} as unknown as FileUpload;

			mockCtx.drizzleClient.transaction.mockImplementation(async (callback) => {
				const tx = {
					insert: vi.fn().mockReturnValue([
						{
							id: "attachment-123",
							name: "ulid-name",
							mimeType: "image/jpeg",
						},
					]),
				};
				return callback(tx);
			});

			const result = await mercuriusClient.mutate(mutation_createVenue, {
				variables: {
					input: {
						name: "Venue with Files",
						description: "A venue",
						organizationId: "org-123",
						attachments: [Promise.resolve(mockFile)],
					},
				},
			});

			expect(result.data).toBeDefined();
			expect(mockCtx.minio.client.putObject).toHaveBeenCalledWith(
				"test-bucket",
				"ulid-name",
				mockFile.createReadStream(),
				undefined,
				{ "content-type": "image/jpeg" },
			);
		});
	});
});
