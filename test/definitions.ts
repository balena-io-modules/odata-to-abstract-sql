import { expect } from 'chai';
import ODataParser from '@balena/odata-parser';
import type { AbstractSqlModel } from '@balena/abstract-sql-compiler';
import { clientModel } from './chai-sql.js';
import {
	OData2AbstractSQL,
	type SupportedMethod,
} from '../out/odata-to-abstract-sql.js';

// A model where `pilot` is defined using a definition that has its own bind and also references the
// `licence` resource, which in turn is defined using a definition that has its own bind
const definitionsModel: AbstractSqlModel = structuredClone(clientModel);
definitionsModel.tables['licence'].definition = {
	binds: [['Text', 'licence bind']],
	abstractSql: [
		'SelectQuery',
		['Select', [['Field', '*']]],
		['From', ['Table', 'licence']],
		[
			'Where',
			[
				'IsNotDistinctFrom',
				['ReferencedField', 'licence', 'name'],
				['Bind', 0],
			],
		],
	],
};
definitionsModel.tables['pilot'].definition = {
	binds: [['Text', 'pilot bind']],
	abstractSql: [
		'SelectQuery',
		['Select', [['Field', '*']]],
		['From', ['Table', 'pilot']],
		[
			'Where',
			[
				'And',
				[
					'IsNotDistinctFrom',
					['ReferencedField', 'pilot', 'name'],
					['Bind', 0],
				],
				[
					'In',
					['ReferencedField', 'pilot', 'licence'],
					[
						'SelectQuery',
						['Select', [['ReferencedField', 'licence', 'id']]],
						['From', ['Alias', ['Resource', 'licence'], 'licence']],
					],
				],
			],
		],
	],
};

const translator = new OData2AbstractSQL(definitionsModel);

/** Returns the value referenced by every numeric `Bind` node of the translated query */
const getBoundValues = (
	url: string,
	method: SupportedMethod,
	bodyKeys: string[] = [],
) => {
	const { tree: odataQuery, binds } = ODataParser.parse(url);
	const { tree, extraBindVars } = translator.match(
		odataQuery,
		method,
		bodyKeys,
		binds.length,
	);
	const allBinds = [...binds, ...extraBindVars];
	const values: unknown[] = [];
	const collect = (node: unknown) => {
		if (!Array.isArray(node)) {
			return;
		}
		if (node[0] === 'Bind' && typeof node[1] === 'number') {
			values.push(allBinds[node[1]]);
		} else {
			node.forEach(collect);
		}
	};
	collect(tree);
	return values;
};

const key = ['Real', 1];
const pilotBind = ['Text', 'pilot bind'];
const licenceBind = ['Text', 'licence bind'];

describe('definitions', function () {
	const cases: Array<
		[url: string, method: SupportedMethod, expected: unknown[]]
	> = [
		['/pilot', 'GET', [pilotBind, licenceBind]],
		['/pilot(1)', 'DELETE', [key, pilotBind, licenceBind]],
		['/pilot(1)', 'PATCH', [key, pilotBind, licenceBind]],
		// Inserts and the insert half of upserts apply the definition via an `INSERT ... SELECT ... WHERE EXISTS` subquery
		['/pilot', 'POST', [pilotBind, licenceBind]],
		['/pilot', 'PUT', [pilotBind, licenceBind, pilotBind, licenceBind]],
		[
			'/pilot(1)',
			'PUT',
			[key, pilotBind, licenceBind, key, pilotBind, licenceBind],
		],
	];
	for (const [url, method, expected] of cases) {
		it(`should reference the correct binds of nested definitions for ${method} ${url}`, () => {
			expect(getBoundValues(url, method, ['name'])).to.have.deep.members(
				expected,
			);
		});
	}
});
