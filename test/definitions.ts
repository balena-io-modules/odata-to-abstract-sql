import { expect } from 'chai';
import ODataParser from '@balena/odata-parser';
import type { AbstractSqlModel } from '@balena/abstract-sql-compiler';
import { clientModel } from './chai-sql.ts';
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

/**
 * Returns a `[field, value]` pair for every numeric `Bind` node of the translated query, where `field` is the
 * `table.field` that the bind is compared to (or `undefined` if it isn't compared to a field). Pairing the values
 * with their fields catches binds that point at the wrong definition's value, which comparing values alone misses
 */
const getBoundFields = (
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
	const boundFields: Array<[field: string | undefined, value: unknown]> = [];
	const collect = (node: unknown) => {
		if (!Array.isArray(node)) {
			return;
		}
		if (node[0] === 'Bind' && typeof node[1] === 'number') {
			boundFields.push([undefined, allBinds[node[1]]]);
		} else if (
			node[0] === 'IsNotDistinctFrom' &&
			node[1]?.[0] === 'ReferencedField' &&
			node[2]?.[0] === 'Bind' &&
			typeof node[2][1] === 'number'
		) {
			const [, [, tableName, fieldName], [, bindIndex]] = node;
			boundFields.push([`${tableName}.${fieldName}`, allBinds[bindIndex]]);
		} else {
			node.forEach(collect);
		}
	};
	collect(tree);
	return boundFields;
};

const pilotId = ['pilot.id', ['Real', 1]];
const pilotName = ['pilot.name', ['Text', 'pilot bind']];
const licenceName = ['licence.name', ['Text', 'licence bind']];

describe('definitions', function () {
	const cases: Array<
		[url: string, method: SupportedMethod, expected: unknown[]]
	> = [
		['/pilot', 'GET', [pilotName, licenceName]],
		['/pilot(1)', 'DELETE', [pilotId, pilotName, licenceName]],
		['/pilot(1)', 'PATCH', [pilotId, pilotName, licenceName]],
		// Inserts and the insert half of upserts apply the definition via an `INSERT ... SELECT ... WHERE EXISTS` subquery
		['/pilot', 'POST', [pilotName, licenceName]],
		['/pilot', 'PUT', [pilotName, licenceName, pilotName, licenceName]],
		[
			'/pilot(1)',
			'PUT',
			[pilotId, pilotName, licenceName, pilotId, pilotName, licenceName],
		],
	];
	for (const [url, method, expected] of cases) {
		it(`should reference the correct binds of nested definitions for ${method} ${url}`, () => {
			expect(getBoundFields(url, method, ['name'])).to.have.deep.members(
				expected,
			);
		});
	}
});
