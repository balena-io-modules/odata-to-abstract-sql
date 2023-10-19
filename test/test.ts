import { clientModel } from './chai-sql';
import * as ODataParser from '@balena/odata-parser';
import { OData2AbstractSQL } from '../out/odata-to-abstract-sql';
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
