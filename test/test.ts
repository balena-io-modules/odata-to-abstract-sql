import { clientModel } from './chai-sql.js';
import ODataParser from '@balena/odata-parser';
import { OData2AbstractSQL } from '../out/odata-to-abstract-sql.js';
const translator = new OData2AbstractSQL(clientModel);

const { skip } = describe;
const runExpectation = function (
	describe: Mocha.SuiteFunction,
	input: any,
	method: any,
	body?: any,
	expectation?: any,
) {
	if (expectation == null) {
		if (body == null) {
			expectation = method;
			method = 'GET';
		} else {
			expectation = body;
		}
		body = {};
	}

	return describe(
		'Parsing ' + method + ' ' + input + ' ' + JSON.stringify(body),
		function () {
			let tree;
			if (describe === skip) {
				return expectation();
			}
			try {
				let extraBodyVars;
				input = ODataParser.parse(input);
				({ tree, extraBodyVars } = translator.match(
					input.tree,
					method,
					Object.keys(body),
					0,
				));
				Object.assign(body, extraBodyVars);
			} catch (e) {
				expectation(e);
				return;
			}
			return expectation(tree);
		},
	);
};

type TailParameters<T extends (...args: any) => any> = T extends (
	arg,
	...args: infer P
) => any
	? P
	: never;
type TestFn = (
	...args: TailParameters<typeof runExpectation>
) => ReturnType<typeof runExpectation>;
interface Test extends TestFn {
	skip: TestFn;
	only: TestFn;
}
const test = runExpectation.bind(null, describe) as Test;
test.skip = runExpectation.bind(null, describe.skip);
// eslint-disable-next-line no-only-tests/no-only-tests
test.only = runExpectation.bind(null, describe.only);

export default test;

export const itExpectsError = (
	title: string,
	fn: (this: Mocha.Context) => void,
	expectedError: string | RegExp | ((err: Error) => boolean),
) => {
	it(`[Expect test case to fail] ${title}`, function () {
		try {
			fn?.call(this);
			throw new Error(`
				(Maybe a good one) Test case:
				> ${title}

				that was expected to fail, now completed without issues!
				Confirm whether the test was properly fixed and change its 'itExpectsError()' to an 'it()'.
				Thanks for fixing it!
			`);
		} catch (err) {
			if (!(err instanceof Error)) {
				throw err;
			}
			const isExpectedError =
				typeof expectedError === 'function'
					? expectedError
					: (e: Error) => {
							if (typeof expectedError === 'string') {
								return expectedError === e.message;
							}
							if (expectedError instanceof RegExp) {
								return expectedError.test(e.message);
							}
						};
			if (!isExpectedError(err)) {
				throw err;
			}
		}
	});
};
