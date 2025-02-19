import * as path from "node:path";
// scripts/transformResolvers.ts
import { Project, SyntaxKind } from "ts-morph";
import type {
	ArrowFunction,
	CallExpression,
	ObjectLiteralExpression,
} from "ts-morph";

// Get the file path from command line arguments.
const filePath = process.argv[2];
if (!filePath) {
	console.error("Usage: ts-node scripts/transformResolvers.ts <path-to-file>");
	process.exit(1);
}

const project = new Project({
	tsConfigFilePath: path.resolve("tsconfig.json"),
});

const sourceFile = project.getSourceFile(filePath);
if (!sourceFile) {
	console.error(`File ${filePath} not found.`);
	process.exit(1);
}

// Helper: Determines if a node is a call to builder.mutationField
// biome-ignore lint/suspicious/noExplicitAny: <explanation>
function isBuilderMutationFieldCall(node: any): boolean {
	if (node.getKind() !== SyntaxKind.CallExpression) return false;
	const expression = node.getExpression();
	return expression.getText().includes("builder.mutationField");
}

// Find all builder.mutationField call expressions
const mutationFieldCalls = sourceFile
	.getDescendantsOfKind(SyntaxKind.CallExpression)
	.filter(isBuilderMutationFieldCall);

// biome-ignore lint/complexity/noForEach: <explanation>
mutationFieldCalls.forEach((callExpr) => {
	// The first argument is the mutation name.
	const mutationNameArg = callExpr.getArguments()[0];
	if (!mutationNameArg) return;
	const mutationName = mutationNameArg.getText().replace(/['"`]/g, "");

	// Find the arrow function passed as the second argument.
	const fieldBuilderFn = callExpr.getArguments()[1];
	if (!fieldBuilderFn) return;

	// We expect an arrow function like: (t) => t.field({ ... })
	// biome-ignore lint/suspicious/noImplicitAnyLet: <explanation>
	let fieldCall;
	if (fieldBuilderFn.getKind() === SyntaxKind.ArrowFunction) {
		const arrowFn = fieldBuilderFn as ArrowFunction;
		const body = arrowFn.getBody();
		// The body could be a call expression (if not wrapped in braces)
		if (body.getKind() === SyntaxKind.CallExpression) {
			fieldCall = body;
		} else if (body.getKind() === SyntaxKind.Block) {
			// Optionally, if the arrow function uses a block body, search for a return statement.
			const returnStmt = body.getDescendantsOfKind(
				SyntaxKind.ReturnStatement,
			)[0];
			if (returnStmt) {
				fieldCall = returnStmt.getExpression();
			}
		}
	}
	if (!fieldCall) return;

	// We expect fieldCall to be a call to t.field({ ... })
	const args = (fieldCall as CallExpression).getArguments();
	if (args.length === 0) return;
	const fieldOptions = args[0] as ObjectLiteralExpression;

	// Find the "resolve" property in the options object.
	const resolveProp = fieldOptions.getProperty("resolve");
	if (
		!resolveProp ||
		(!resolveProp.getFirstChildByKind(SyntaxKind.EqualsGreaterThanToken) &&
			!resolveProp.getFirstChildByKind(SyntaxKind.ColonToken))
	) {
		return;
	}
	// Depending on how the object is written, the initializer might be after ":".
	const initializer = resolveProp.getLastChild();
	if (!initializer) return;

	// Check if initializer is an inline function (arrow function or function expression)
	if (
		initializer.getKind() !== SyntaxKind.ArrowFunction &&
		initializer.getKind() !== SyntaxKind.FunctionExpression
	) {
		return; // Already a reference? Nothing to do.
	}

	// Get the text of the inline resolver function
	const resolverFunctionText = initializer.getText();

	// Create a new function declaration with a name like `<mutationName>Resolver`
	const resolverName = `${mutationName}Resolver`;

	// Insert the new function at the top of the file (or choose a different location)
	sourceFile.insertStatements(0, [
		`export async function ${resolverName}(_parent: unknown, args: any, ctx: any) ${resolverFunctionText.substring(resolverFunctionText.indexOf("{"))}`,
	]);

	// Replace the inline resolver with a reference to the new resolver function.
	initializer.replaceWithText(resolverName);

	console.log(
		`Transformed mutation "${mutationName}" with new resolver "${resolverName}"`,
	);
});

// Save the modified file.
sourceFile.save().then(() => {
	console.log("File transformation complete.");
});
