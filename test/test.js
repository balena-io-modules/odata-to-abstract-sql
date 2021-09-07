import * as _ from 'lodash';
import { clientModel } from './chai-sql';
import * as ODataParser from '@balena/odata-parser';
import { OData2AbstractSQL } from '../out/odata-to-abstract-sql';
const translator = new OData2AbstractSQL(clientModel);

const { skip } = describe;
const runExpectation = function (describe, input, method, body, expectation) {
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
					_.keys(body),
					0,
				));
				_.assign(body, extraBodyVars);
			} catch (e) {
				expectation(e);
				return;
			}
			return expectation(tree);
		},
	);
};

const test = runExpectation.bind(null, describe);
test.skip = runExpectation.bind(null, describe.skip);
test.only = runExpectation.bind(null, describe.only);

export default test;
