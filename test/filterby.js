import { expect } from 'chai';

import {
	operandToAbstractSQLFactory as $operandToAbstractSQLFactory,
	operandToOData,
	aliasFields,
	licenceFields,
	pilotFields,
	pilotCanFlyPlaneFields,
	teamFields,
	$count,
} from './chai-sql';

let operandToAbstractSQLFactory = $operandToAbstractSQLFactory;

import test from './test';
import * as _ from 'lodash';

let operandToAbstractSQL = null;

const run = (function () {
	let running = false;
	return function (keyBinds, fn) {
		if (fn == null) {
			fn = keyBinds;
			keyBinds = [];
		}
		if (!running) {
			running = true;
			operandToAbstractSQL = operandToAbstractSQLFactory(keyBinds);
			fn();
			return (running = false);
		} else {
			return fn();
		}
	};
})();

const sqlOps = {
	eq: 'IsNotDistinctFrom',
	ne: 'IsDistinctFrom',
	gt: 'GreaterThan',
	ge: 'GreaterThanOrEqual',
	lt: 'LessThan',
	le: 'LessThanOrEqual',
	and: 'And',
	or: 'Or',
	add: 'Add',
	sub: 'Subtract',
	mul: 'Multiply',
	div: 'Divide',
	in: 'In',
};

const methodMaps = {
	length: 'CharacterLength',
	date: 'ToDate',
	time: 'ToTime',
	tolower: 'Lower',
	toupper: 'Upper',
	concat: 'Concatenate',
	now: 'CurrentTimestamp',
};

const createExpression = function (lhs, op, rhs) {
	if (lhs === 'not') {
		return {
			odata:
				'not ' + (op.odata != null ? '(' + op.odata + ')' : operandToOData(op)),
			abstractsql: ['Not', operandToAbstractSQL(op)],
		};
	}
	if (op === 'in') {
		return {
			odata: operandToOData(lhs) + ' ' + op + ' ' + operandToOData(rhs),
			abstractsql: [sqlOps[op], operandToAbstractSQL(lhs)].concat(
				operandToAbstractSQL(rhs),
			),
		};
	}
	if (rhs == null) {
		return {
			odata: lhs.odata != null ? '(' + lhs.odata + ')' : operandToOData(lhs),
			abstractsql: operandToAbstractSQL(lhs),
		};
	}
	return {
		odata: operandToOData(lhs) + ' ' + op + ' ' + operandToOData(rhs),
		abstractsql: [
			sqlOps[op],
			operandToAbstractSQL(lhs),
			operandToAbstractSQL(rhs),
		],
	};
};
const createMethodCall = function (method, ...args) {
	let arg;
	return {
		odata:
			method +
			'(' +
			(() => {
				const result = [];
				for (arg of args) {
					result.push(operandToOData(arg));
				}
				return result;
			})().join(',') +
			')',
		abstractsql: (function () {
			if (Object.prototype.hasOwnProperty.call(methodMaps, method)) {
				method = methodMaps[method];
			} else {
				method = _.capitalize(method);
			}
			const result = [method].concat(
				args.map((op) => operandToAbstractSQL(op)),
			);
			switch (method) {
				case 'Substring':
					result[2] = ['Add', result[2], ['Number', 1]];
					break;
			}
			return result;
		})(),
	};
};

const operandTest = (lhs, op, rhs) =>
	run(function () {
		const { odata, abstractsql } = createExpression(lhs, op, rhs);
		test('/pilot?$filter=' + odata, (result) =>
			it('should select from pilot where "' + odata + '"', () => {
				expect(result)
					.to.be.a.query.that.selects(pilotFields)
					.from('pilot')
					.where(abstractsql);
			}),
		);

		return test('/pilot/$count?$filter=' + odata, (result) =>
			it('should count(*) from pilot where "' + odata + '"', () => {
				expect(result)
					.to.be.a.query.that.selects($count)
					.from('pilot')
					.where(abstractsql);
			}),
		);
	});

const navigatedOperandTest = (lhs, op, rhs) =>
	run(function () {
		const { odata, abstractsql } = createExpression(lhs, op, rhs);
		test('/pilot?$filter=' + odata, (result) =>
			it('should select from pilot where "' + odata + '"', () => {
				expect(result)
					.to.be.a.query.that.selects(pilotFields)
					.from('pilot', ['licence', 'pilot.licence'])
					.where([
						'And',
						[
							'Equals',
							['ReferencedField', 'pilot', 'licence'],
							['ReferencedField', 'pilot.licence', 'id'],
						],
						abstractsql,
					]);
			}),
		);
		return test('/pilot/$count?$filter=' + odata, (result) =>
			it('should count(*) from pilot where "' + odata + '"', () => {
				expect(result)
					.to.be.a.query.that.selects($count)
					.from('pilot', ['licence', 'pilot.licence'])
					.where([
						'And',
						[
							'Equals',
							['ReferencedField', 'pilot', 'licence'],
							['ReferencedField', 'pilot.licence', 'id'],
						],
						abstractsql,
					]);
			}),
		);
	});

const methodTest = (...args) =>
	run(() => operandTest(createMethodCall(...args)));

const navigatedMethodTest = (...args) =>
	run(() => navigatedOperandTest(createMethodCall(...args)));

operandTest(2, 'eq', 'name');
operandTest(2, 'ne', 'name');
operandTest(2, 'gt', 'name');
operandTest(2, 'ge', 'name');
operandTest(2, 'lt', 'name');
operandTest(2, 'le', 'name');
operandTest('name', 'in', '(1,2)');

// Test each combination of operands
(function () {
	const operands = [
		2,
		-2,
		2.5,
		-2.5,
		"'bar'",
		'name',
		new Date(),
		{ negative: true, day: 3, hour: 4, minute: 5, second: 6.7 },
		true,
		false,
		// null is quoted as otherwise we hit issues with coffeescript defaulting values
		'null',
	];
	return operands.map((lhs) =>
		operands.map((rhs) => operandTest(lhs, 'eq', rhs)),
	);
})();

(function () {
	const left = createExpression('age', 'gt', 2);
	const right = createExpression('age', 'lt', 10);
	operandTest(left, 'and', right);
	operandTest(left, 'or', right);
	operandTest('is_experienced');
	operandTest('not', 'is_experienced');
	return operandTest('not', left);
})();

(function () {
	const mathOps = ['add', 'sub', 'mul', 'div'];
	return mathOps.map((mathOp) =>
		run(function () {
			const mathOpOdata = createExpression('age', mathOp, 2);
			return operandTest(mathOpOdata, 'gt', 10);
		}),
	);
})();

run(function () {
	const odata = operandToOData(true);
	const abstractsql = operandToAbstractSQL(true);

	return test('/pilot?$filter=' + odata, (result) =>
		it('should select from pilot where "' + odata + '"', () => {
			expect(result)
				.to.be.a.query.that.selects(pilotFields)
				.from('pilot')
				.where(abstractsql);
		}),
	);
});

run(function () {
	const { odata, abstractsql } = createExpression(
		'can_fly__plane/id',
		'eq',
		10,
	);
	return test('/pilot?$filter=' + odata, (result) =>
		it('should select from pilot where "' + odata + '"', () => {
			expect(result)
				.to.be.a.query.that.selects(pilotFields)
				.from('pilot', ['pilot-can fly-plane', 'pilot.pilot-can fly-plane'])
				.where([
					'And',
					[
						'Equals',
						['ReferencedField', 'pilot', 'id'],
						['ReferencedField', 'pilot.pilot-can fly-plane', 'pilot'],
					],
					abstractsql,
				]);
		}),
	);
});

run(function () {
	const { odata } = createExpression('created_at', 'gt', new Date());
	return test('/pilot?$filter=' + odata, (result) =>
		it('should select from pilot where "' + odata + '"', () => {
			expect(result)
				.to.be.a.query.that.selects(pilotFields)
				.where([
					'GreaterThan',
					[
						'DateTrunc',
						['EmbeddedText', 'milliseconds'],
						['ReferencedField', 'pilot', 'created at'],
					],
					['Bind', 0],
				]);
		}),
	);
});

run(function () {
	const { odata } = createExpression('created_at', 'gt', new Date());
	return test('/pilot(1)/licence?$filter=' + odata, (result) =>
		it('should select from the licence of pilot with id and created_at greaterThan', () => {
			expect(result)
				.to.be.a.query.that.selects(aliasFields('pilot', licenceFields))
				.from('pilot', ['licence', 'pilot.licence'])
				.where([
					'And',
					[
						'GreaterThan',
						[
							'DateTrunc',
							['EmbeddedText', 'milliseconds'],
							['ReferencedField', 'pilot.licence', 'created at'],
						],
						['Bind', 1],
					],
					[
						'Equals',
						['ReferencedField', 'pilot', 'licence'],
						['ReferencedField', 'pilot.licence', 'id'],
					],
					[
						'IsNotDistinctFrom',
						['ReferencedField', 'pilot', 'id'],
						['Bind', 0],
					],
				]);
		}),
	);
});

run([['Number', 1]], function () {
	const { odata, abstractsql } = createExpression(
		['plane/id', null, 'pilot.pilot-can fly-plane'],
		'eq',
		10,
	);
	return test('/pilot(1)/can_fly__plane?$filter=' + odata, (result) => {
		it('should select from pilot where "' + odata + '"', () => {
			expect(result)
				.to.be.a.query.that.selects(
					aliasFields('pilot', pilotCanFlyPlaneFields),
				)
				.from(
					'pilot',
					['pilot-can fly-plane', 'pilot.pilot-can fly-plane'],
					['plane', 'pilot.pilot-can fly-plane.plane'],
				)
				.where([
					'And',
					[
						'Equals',
						['ReferencedField', 'pilot.pilot-can fly-plane', 'can fly-plane'],
						['ReferencedField', 'pilot.pilot-can fly-plane.plane', 'id'],
					],
					abstractsql,
					[
						'Equals',
						['ReferencedField', 'pilot', 'id'],
						['ReferencedField', 'pilot.pilot-can fly-plane', 'pilot'],
					],
					[
						'IsNotDistinctFrom',
						['ReferencedField', 'pilot', 'id'],
						['Bind', 0],
					],
				]);
		});
	});
});

run(function () {
	const { odata, abstractsql } = createExpression(
		'can_fly__plane/plane/id',
		'eq',
		10,
	);

	const filterWhere = [
		'And',
		[
			'Equals',
			['ReferencedField', 'pilot', 'id'],
			['ReferencedField', 'pilot.pilot-can fly-plane', 'pilot'],
		],
		[
			'Equals',
			['ReferencedField', 'pilot.pilot-can fly-plane', 'can fly-plane'],
			['ReferencedField', 'pilot.pilot-can fly-plane.plane', 'id'],
		],
		abstractsql,
	];
	const insertTest = (result) => {
		expect(result)
			.to.be.a.query.that.inserts.fields('name')
			.values(
				'SelectQuery',
				['Select', [['ReferencedField', '$insert', 'name']]],
				[
					'From',
					[
						'Alias',
						[
							'SelectQuery',
							[
								'Select',
								[
									['Alias', ['Cast', ['Null'], 'Date Time'], 'created at'],
									['Alias', ['Cast', ['Null'], 'Date Time'], 'modified at'],
									['Alias', ['Cast', ['Null'], 'Serial'], 'id'],
									['Alias', ['Cast', ['Null'], 'ConceptType'], 'person'],
									['Alias', ['Cast', ['Null'], 'Boolean'], 'is experienced'],
									[
										'Alias',
										['Cast', ['Bind', 'pilot', 'name'], 'Short Text'],
										'name',
									],
									['Alias', ['Cast', ['Null'], 'Integer'], 'age'],
									['Alias', ['Cast', ['Null'], 'Color'], 'favourite colour'],
									['Alias', ['Cast', ['Null'], 'ForeignKey'], 'is on-team'],
									['Alias', ['Cast', ['Null'], 'ForeignKey'], 'licence'],
									['Alias', ['Cast', ['Null'], 'Date Time'], 'hire date'],
									[
										'Alias',
										['Cast', ['Null'], 'ForeignKey'],
										'was trained by-pilot',
									],
								],
							],
						],
						'$insert',
					],
				],
				[
					'Where',
					[
						'Exists',
						[
							'SelectQuery',
							['Select', []],
							[
								'From',
								[
									'Alias',
									['Table', 'pilot-can fly-plane'],
									'pilot.pilot-can fly-plane',
								],
							],
							[
								'From',
								[
									'Alias',
									['Table', 'plane'],
									'pilot.pilot-can fly-plane.plane',
								],
							],
							[
								'From',
								[
									'Alias',
									[
										'SelectQuery',
										['Select', [['ReferencedField', '$insert', '*']]],
									],
									'pilot',
								],
							],
							['Where', filterWhere],
						],
					],
				],
			)
			.from('pilot');
	};
	const updateWhere = [
		'In',
		['ReferencedField', 'pilot', 'id'],
		[
			'SelectQuery',
			['Select', [['Alias', ['ReferencedField', 'pilot', 'id'], '$modifyid']]],
			['From', ['Table', 'pilot']],
			[
				'From',
				[
					'Alias',
					['Table', 'pilot-can fly-plane'],
					'pilot.pilot-can fly-plane',
				],
			],
			[
				'From',
				['Alias', ['Table', 'plane'], 'pilot.pilot-can fly-plane.plane'],
			],
			['Where', filterWhere],
		],
	];

	test('/pilot?$filter=' + odata, (result) =>
		it('should select from pilot where "' + odata + '"', () => {
			expect(result)
				.to.be.a.query.that.selects(pilotFields)
				.from('pilot', ['pilot-can fly-plane', 'pilot.pilot-can fly-plane'])
				.where([
					'And',
					[
						'Equals',
						['ReferencedField', 'pilot', 'id'],
						['ReferencedField', 'pilot.pilot-can fly-plane', 'pilot'],
					],
					[
						'Equals',
						['ReferencedField', 'pilot.pilot-can fly-plane', 'can fly-plane'],
						['ReferencedField', 'pilot.pilot-can fly-plane.plane', 'id'],
					],
					abstractsql,
				]);
		}),
	);

	test(`/pilot?$filter=${odata}`, 'PATCH', { name: 'Peter' }, (result) =>
		it('should update pilot where "' + odata + '"', () => {
			expect(result)
				.to.be.a.query.that.updates.fields('name')
				.values(['Bind', 'pilot', 'name'])
				.from('pilot')
				.where(updateWhere);
		}),
	);

	test(`/pilot?$filter=${odata}`, 'POST', { name: 'Peter' }, (result) =>
		it(`should insert pilot where '${odata}'`, () => {
			insertTest(result);
		}),
	);

	test(`/pilot?$filter=${odata}`, 'PUT', { name: 'Peter' }, (result) =>
		describe(`should select from pilot where '${odata}'`, function () {
			it('should be an upsert', () => {
				expect(result).to.be.a.query.that.upserts;
			});
			it('that inserts', () => {
				insertTest(result[1]);
			});
			it('and updates', () => {
				expect(result[2])
					.to.be.a.query.that.updates.fields(
						'created at',
						'modified at',
						'id',
						'person',
						'is experienced',
						'name',
						'age',
						'favourite colour',
						'is on-team',
						'licence',
						'hire date',
						'was trained by-pilot',
					)
					.values(
						'Default',
						'Default',
						'Default',
						'Default',
						'Default',
						['Bind', 'pilot', 'name'],
						'Default',
						'Default',
						'Default',
						'Default',
						'Default',
						'Default',
					)
					.from('pilot')
					.where(updateWhere);
			});
		}),
	);

	test('/pilot?$filter=' + odata, 'DELETE', (result) =>
		it('should delete from pilot where "' + odata + '"', () => {
			expect(result)
				.to.be.a.query.that.deletes.from('pilot')
				.where([
					'In',
					['ReferencedField', 'pilot', 'id'],
					[
						'SelectQuery',
						[
							'Select',
							[['Alias', ['ReferencedField', 'pilot', 'id'], '$modifyid']],
						],
						['From', ['Table', 'pilot']],
						[
							'From',
							[
								'Alias',
								['Table', 'pilot-can fly-plane'],
								'pilot.pilot-can fly-plane',
							],
						],
						[
							'From',
							['Alias', ['Table', 'plane'], 'pilot.pilot-can fly-plane.plane'],
						],
						[
							'Where',
							[
								'And',
								[
									'Equals',
									['ReferencedField', 'pilot', 'id'],
									['ReferencedField', 'pilot.pilot-can fly-plane', 'pilot'],
								],
								[
									'Equals',
									[
										'ReferencedField',
										'pilot.pilot-can fly-plane',
										'can fly-plane',
									],
									['ReferencedField', 'pilot.pilot-can fly-plane.plane', 'id'],
								],
								abstractsql,
							],
						],
					],
				]);
		}),
	);
});

run([['Number', 1]], function () {
	const name = 'Peter';
	const { odata, abstractsql } = createExpression('name', 'eq', `'${name}'`);
	const insertTest = (result) => {
		expect(result)
			.to.be.a.query.that.inserts.fields('id', 'name')
			.values(
				'SelectQuery',
				[
					'Select',
					[
						['ReferencedField', '$insert', 'id'],
						['ReferencedField', '$insert', 'name'],
					],
				],
				[
					'From',
					[
						'Alias',
						[
							'SelectQuery',
							[
								'Select',
								[
									['Alias', ['Cast', ['Null'], 'Date Time'], 'created at'],
									['Alias', ['Cast', ['Null'], 'Date Time'], 'modified at'],
									['Alias', ['Cast', ['Bind', 'pilot', 'id'], 'Serial'], 'id'],
									['Alias', ['Cast', ['Null'], 'ConceptType'], 'person'],
									['Alias', ['Cast', ['Null'], 'Boolean'], 'is experienced'],
									[
										'Alias',
										['Cast', ['Bind', 'pilot', 'name'], 'Short Text'],
										'name',
									],
									['Alias', ['Cast', ['Null'], 'Integer'], 'age'],
									['Alias', ['Cast', ['Null'], 'Color'], 'favourite colour'],
									['Alias', ['Cast', ['Null'], 'ForeignKey'], 'is on-team'],
									['Alias', ['Cast', ['Null'], 'ForeignKey'], 'licence'],
									['Alias', ['Cast', ['Null'], 'Date Time'], 'hire date'],
									[
										'Alias',
										['Cast', ['Null'], 'ForeignKey'],
										'was trained by-pilot',
									],
								],
							],
						],
						'$insert',
					],
				],
				[
					'Where',
					[
						'Exists',
						[
							'SelectQuery',
							['Select', []],
							[
								'From',
								[
									'Alias',
									[
										'SelectQuery',
										['Select', [['ReferencedField', '$insert', '*']]],
									],
									'pilot',
								],
							],
							[
								'Where',
								[
									'And',
									abstractsql,
									[
										'IsNotDistinctFrom',
										['ReferencedField', 'pilot', 'id'],
										['Bind', 0],
									],
								],
							],
						],
					],
				],
			)
			.from('pilot');
	};
	const updateWhere = [
		'And',
		['IsNotDistinctFrom', ['ReferencedField', 'pilot', 'id'], ['Bind', 0]],
		[
			'In',
			['ReferencedField', 'pilot', 'id'],
			[
				'SelectQuery',
				[
					'Select',
					[['Alias', ['ReferencedField', 'pilot', 'id'], '$modifyid']],
				],
				['From', ['Table', 'pilot']],
				['Where', abstractsql],
			],
		],
	];

	test('/pilot(1)?$filter=' + odata, 'POST', { name }, (result) =>
		it('should insert into pilot where "' + odata + '"', () => {
			insertTest(result);
		}),
	);

	test('/pilot(1)?$filter=' + odata, 'PATCH', { name }, (result) =>
		it('should update the pilot with id 1', () => {
			expect(result)
				.to.be.a.query.that.updates.fields('name')
				.values(['Bind', 'pilot', 'name'])
				.from('pilot')
				.where(updateWhere);
		}),
	);

	test('/pilot(1)?$filter=' + odata, 'PUT', { name }, (result) =>
		describe('should upsert the pilot with id 1', function () {
			it('should be an upsert', () =>
				expect(result).to.be.a.query.that.upserts);
			it('that inserts', () => {
				insertTest(result[1]);
			});
			it('and updates', () => {
				expect(result[2])
					.to.be.a.query.that.updates.fields(
						'created at',
						'modified at',
						'id',
						'person',
						'is experienced',
						'name',
						'age',
						'favourite colour',
						'is on-team',
						'licence',
						'hire date',
						'was trained by-pilot',
					)
					.values(
						'Default',
						'Default',
						['Bind', 'pilot', 'id'],
						'Default',
						'Default',
						['Bind', 'pilot', 'name'],
						'Default',
						'Default',
						'Default',
						'Default',
						'Default',
						'Default',
					)
					.from('pilot')
					.where(updateWhere);
			});
		}),
	);
});

run(function () {
	const licence = 1;
	const { odata, abstractsql } = createExpression('licence/id', 'eq', licence);
	return test('/pilot?$filter=' + odata, 'POST', { licence }, (result) =>
		it('should insert into pilot where "' + odata + '"', () => {
			expect(result)
				.to.be.a.query.that.inserts.fields('licence')
				.values(
					'SelectQuery',
					['Select', [['ReferencedField', '$insert', 'licence']]],
					[
						'From',
						[
							'Alias',
							[
								'SelectQuery',
								[
									'Select',
									[
										['Alias', ['Cast', ['Null'], 'Date Time'], 'created at'],
										['Alias', ['Cast', ['Null'], 'Date Time'], 'modified at'],
										['Alias', ['Cast', ['Null'], 'Serial'], 'id'],
										['Alias', ['Cast', ['Null'], 'ConceptType'], 'person'],
										['Alias', ['Cast', ['Null'], 'Boolean'], 'is experienced'],
										['Alias', ['Cast', ['Null'], 'Short Text'], 'name'],
										['Alias', ['Cast', ['Null'], 'Integer'], 'age'],
										['Alias', ['Cast', ['Null'], 'Color'], 'favourite colour'],
										['Alias', ['Cast', ['Null'], 'ForeignKey'], 'is on-team'],
										[
											'Alias',
											['Cast', ['Bind', 'pilot', 'licence'], 'ForeignKey'],
											'licence',
										],
										['Alias', ['Cast', ['Null'], 'Date Time'], 'hire date'],
										[
											'Alias',
											['Cast', ['Null'], 'ForeignKey'],
											'was trained by-pilot',
										],
									],
								],
							],
							'$insert',
						],
					],
					[
						'Where',
						[
							'Exists',
							[
								'SelectQuery',
								['Select', []],
								['From', ['Alias', ['Table', 'licence'], 'pilot.licence']],
								[
									'From',
									[
										'Alias',
										[
											'SelectQuery',
											['Select', [['ReferencedField', '$insert', '*']]],
										],
										'pilot',
									],
								],
								[
									'Where',
									[
										'And',
										[
											'Equals',
											['ReferencedField', 'pilot', 'licence'],
											['ReferencedField', 'pilot.licence', 'id'],
										],
										abstractsql,
									],
								],
							],
						],
					],
				)
				.from('pilot');
		}),
	);
});

run(function () {
	const licence = 1;
	const name = 'Licence-1';
	const { odata, abstractsql } = createExpression(
		'licence/name',
		'eq',
		`'${name}'`,
	);
	test(`/pilot?$filter=${odata}`, 'POST', { licence }, (result) =>
		it('should insert into pilot where "' + odata + '"', () => {
			expect(result)
				.to.be.a.query.that.inserts.fields('licence')
				.values(
					'SelectQuery',
					['Select', [['ReferencedField', '$insert', 'licence']]],
					[
						'From',
						[
							'Alias',
							[
								'SelectQuery',
								[
									'Select',
									[
										['Alias', ['Cast', ['Null'], 'Date Time'], 'created at'],
										['Alias', ['Cast', ['Null'], 'Date Time'], 'modified at'],
										['Alias', ['Cast', ['Null'], 'Serial'], 'id'],
										['Alias', ['Cast', ['Null'], 'ConceptType'], 'person'],
										['Alias', ['Cast', ['Null'], 'Boolean'], 'is experienced'],
										['Alias', ['Cast', ['Null'], 'Short Text'], 'name'],
										['Alias', ['Cast', ['Null'], 'Integer'], 'age'],
										['Alias', ['Cast', ['Null'], 'Color'], 'favourite colour'],
										['Alias', ['Cast', ['Null'], 'ForeignKey'], 'is on-team'],
										[
											'Alias',
											['Cast', ['Bind', 'pilot', 'licence'], 'ForeignKey'],
											'licence',
										],
										['Alias', ['Cast', ['Null'], 'Date Time'], 'hire date'],
										[
											'Alias',
											['Cast', ['Null'], 'ForeignKey'],
											'was trained by-pilot',
										],
									],
								],
							],
							'$insert',
						],
					],
					[
						'Where',
						[
							'Exists',
							[
								'SelectQuery',
								['Select', []],
								['From', ['Alias', ['Table', 'licence'], 'pilot.licence']],
								[
									'From',
									[
										'Alias',
										[
											'SelectQuery',
											['Select', [['ReferencedField', '$insert', '*']]],
										],
										'pilot',
									],
								],
								[
									'Where',
									[
										'And',
										[
											'Equals',
											['ReferencedField', 'pilot', 'licence'],
											['ReferencedField', 'pilot.licence', 'id'],
										],
										abstractsql,
									],
								],
							],
						],
					],
				)
				.from('pilot');
		}),
	);
});

methodTest('contains', 'name', "'et'");
methodTest('endswith', 'name', "'ete'");
methodTest('startswith', 'name', "'P'");

navigatedMethodTest('startswith', 'licence/name', "'P'");

run(() => operandTest(createMethodCall('length', 'name'), 'eq', 4));
run(() => operandTest(createMethodCall('indexof', 'name', "'Pe'"), 'eq', 0));
run(() => operandTest(createMethodCall('substring', 'name', 1), 'eq', "'ete'"));
run(() =>
	operandTest(createMethodCall('substring', 'name', 1, 2), 'eq', "'et'"),
);
run(() => operandTest(createMethodCall('tolower', 'name'), 'eq', "'pete'"));
run(() =>
	navigatedOperandTest(
		createMethodCall('tolower', 'licence/name'),
		'eq',
		"'pete'",
	),
);
run(() => operandTest(createMethodCall('toupper', 'name'), 'eq', "'PETE'"));
run(function () {
	const concat = createMethodCall('concat', 'name', "'%20'");
	return operandTest(createMethodCall('trim', concat), 'eq', "'Pete'");
});
run(function () {
	const concat = createMethodCall('concat', 'name', "'%20'");
	return operandTest(concat, 'eq', "'Pete%20'");
});

run(() => operandTest(createMethodCall('month', 'hire_date'), 'eq', 10));
run(() => operandTest(createMethodCall('year', 'hire_date'), 'eq', 2011));
run(() => operandTest(createMethodCall('day', 'hire_date'), 'eq', 3));
run(() => operandTest(createMethodCall('hour', 'hire_date'), 'eq', 12));
run(() => operandTest(createMethodCall('minute', 'hire_date'), 'eq', 10));
run(() => operandTest(createMethodCall('second', 'hire_date'), 'eq', 25));
run(() =>
	operandTest(createMethodCall('fractionalseconds', 'hire_date'), 'eq', 0.222),
);
run(() =>
	operandTest(createMethodCall('date', 'hire_date'), 'eq', "'2011-10-03'"),
);
run(() =>
	operandTest(createMethodCall('time', 'hire_date'), 'eq', "'12:10:25.222'"),
);
run(() =>
	operandTest(createMethodCall('totaloffsetminutes', 'hire_date'), 'eq', 60),
);
run(() =>
	operandTest(createMethodCall('now'), 'eq', new Date('2012-12-03T07:16:23Z')),
);
run(() =>
	operandTest(
		createMethodCall('maxdatetime'),
		'eq',
		new Date('9999-12-31T11:59:59Z'),
	),
);
run(() =>
	operandTest(
		createMethodCall('mindatetime'),
		'eq',
		new Date('1970-01-01T00:00:00Z'),
	),
);
run(() =>
	operandTest(
		createMethodCall('totalseconds', {
			negative: true,
			day: 3,
			hour: 4,
			minute: 5,
			second: 6.7,
		}),
		'eq',
		-273906.7,
	),
);
run(() => operandTest(createMethodCall('round', 'age'), 'eq', 25));
run(() => operandTest(createMethodCall('floor', 'age'), 'eq', 25));
run(() => operandTest(createMethodCall('ceiling', 'age'), 'eq', 25));

run(() => methodTest('substringof', "'Pete'", 'name'));
run(() =>
	operandTest(
		createMethodCall('replace', 'name', "'ete'", "'at'"),
		'eq',
		"'Pat'",
	),
);

run(() => {
	test('/pilot?$filter=can_fly__plane/$count eq 10', (result) => {
		it('should select from pilot where ...', () => {
			expect(result)
				.to.be.a.query.that.selects(pilotFields)
				.from('pilot')
				.where([
					'IsNotDistinctFrom',
					[
						'SelectQuery',
						['Select', [['Count', '*']]],
						[
							'From',
							[
								'Alias',
								['Table', 'pilot-can fly-plane'],
								'pilot.pilot-can fly-plane',
							],
						],
						[
							'Where',
							[
								'Equals',
								['ReferencedField', 'pilot', 'id'],
								['ReferencedField', 'pilot.pilot-can fly-plane', 'pilot'],
							],
						],
					],
					['Bind', 0],
				]);
		});
	});

	test(`/pilot?$filter=trained__pilot/$count($filter=is_experienced eq true) gt 1`, (result) => {
		it('should select from pilot where ...', () => {
			expect(result)
				.to.be.a.query.that.selects(pilotFields)
				.from('pilot')
				.where([
					'GreaterThan',
					[
						'SelectQuery',
						['Select', [['Count', '*']]],
						['From', ['Alias', ['Table', 'pilot'], 'pilot.trained-pilot']],
						[
							'Where',
							[
								'And',
								[
									'Equals',
									['ReferencedField', 'pilot', 'id'],
									[
										'ReferencedField',
										'pilot.trained-pilot',
										'was trained by-pilot',
									],
								],
								[
									'IsNotDistinctFrom',
									['ReferencedField', 'pilot.trained-pilot', 'is experienced'],
									['Bind', 0],
								],
							],
						],
					],
					['Bind', 1],
				]);
		});
	});

	test(`/team?$filter=includes__pilot/$count($filter=is_experienced eq true) gt 0`, (result) => {
		it('should select from pilot where ...', () => {
			expect(result)
				.to.be.a.query.that.selects(teamFields)
				.from('team')
				.where([
					'GreaterThan',
					[
						'SelectQuery',
						['Select', [['Count', '*']]],
						['From', ['Alias', ['Table', 'pilot'], 'team.includes-pilot']],
						[
							'Where',
							[
								'And',
								[
									'Equals',
									[
										'ReferencedField',
										'team',
										// That's b/c it's the team's `Database ID Field`
										'favourite colour',
									],
									['ReferencedField', 'team.includes-pilot', 'is on-team'],
								],
								[
									'IsNotDistinctFrom',
									['ReferencedField', 'team.includes-pilot', 'is experienced'],
									['Bind', 0],
								],
							],
						],
					],
					['Bind', 1],
				]);
		});
	});
});

const lambdaTest = function (methodName) {
	run(function () {
		const subWhere = [
			'And',
			[
				'Equals',
				['ReferencedField', 'pilot', 'id'],
				['ReferencedField', 'pilot.pilot-can fly-plane', 'pilot'],
			],
			[
				'Equals',
				['ReferencedField', 'pilot.pilot-can fly-plane', 'can fly-plane'],
				['ReferencedField', 'pilot.pilot-can fly-plane.plane', 'id'],
			],
		];
		const filterWhere = [
			'IsNotDistinctFrom',
			['ReferencedField', 'pilot.pilot-can fly-plane.plane', 'name'],
			['Bind', 0],
		];
		// All is implemented as where none fail
		if (methodName === 'all') {
			// @ts-expect-error Pushing valid AbstractSql
			subWhere.push(['Not', filterWhere]);
		} else {
			// @ts-expect-error Pushing valid AbstractSql
			subWhere.push(filterWhere);
		}

		let where = [
			'Exists',
			[
				'SelectQuery',
				['Select', []],
				[
					'From',
					[
						'Alias',
						['Table', 'pilot-can fly-plane'],
						'pilot.pilot-can fly-plane',
					],
				],
				[
					'From',
					['Alias', ['Table', 'plane'], 'pilot.pilot-can fly-plane.plane'],
				],
				['Where', subWhere],
			],
		];
		// All is implemented as where none fail
		if (methodName === 'all') {
			// @ts-expect-error the types should be fine but it's not feasible to do in js
			where = ['Not', where];
		}

		test(
			'/pilot?$filter=can_fly__plane/' +
				methodName +
				"(d:d/plane/name eq 'Concorde')",
			(result) =>
				it('should select from pilot where ...', () => {
					expect(result)
						.to.be.a.query.that.selects(pilotFields)
						.from('pilot')
						.where(where);
				}),
		);

		return test(
			'/pilot/$count?$filter=can_fly__plane/' +
				methodName +
				"(d:d/plane/name eq 'Concorde')",
			(result) =>
				it('should select count(*) from pilot where ...', () => {
					expect(result)
						.to.be.a.query.that.selects($count)
						.from('pilot')
						.where(where);
				}),
		);
	});

	return run(function () {
		const subWhere = [
			'And',
			[
				'Equals',
				['ReferencedField', 'pilot.pilot-can fly-plane', 'can fly-plane'],
				['ReferencedField', 'pilot.pilot-can fly-plane.plane', 'id'],
			],
		];
		const filterWhere = [
			'IsNotDistinctFrom',
			['ReferencedField', 'pilot.pilot-can fly-plane.plane', 'name'],
			['Bind', 0],
		];
		// All is implemented as where none fail
		if (methodName === 'all') {
			// @ts-expect-error Pushing valid AbstractSql
			subWhere.push(['Not', filterWhere]);
		} else {
			// @ts-expect-error Pushing valid AbstractSql
			subWhere.push(filterWhere);
		}

		let innerWhere = [
			'Exists',
			[
				'SelectQuery',
				['Select', []],
				[
					'From',
					['Alias', ['Table', 'plane'], 'pilot.pilot-can fly-plane.plane'],
				],
				['Where', subWhere],
			],
		];

		// All is implemented as where none fail
		if (methodName === 'all') {
			// @ts-expect-error the types should be fine but it's not feasible to do in js
			innerWhere = ['Not', innerWhere];
		}

		const where = [
			'And',
			[
				'Equals',
				['ReferencedField', 'pilot', 'id'],
				['ReferencedField', 'pilot.pilot-can fly-plane', 'pilot'],
			],
			innerWhere,
		];

		test(
			'/pilot?$filter=can_fly__plane/plane/' +
				methodName +
				"(d:d/name eq 'Concorde')",
			(result) =>
				it('should select from pilot where ...', () => {
					expect(result)
						.to.be.a.query.that.selects(pilotFields)
						.from('pilot', ['pilot-can fly-plane', 'pilot.pilot-can fly-plane'])
						.where(where);
				}),
		);

		return test(
			'/pilot/$count?$filter=can_fly__plane/plane/' +
				methodName +
				"(d:d/name eq 'Concorde')",
			(result) =>
				it('should select count(*) from pilot where ...', () => {
					expect(result)
						.to.be.a.query.that.selects($count)
						.from('pilot', ['pilot-can fly-plane', 'pilot.pilot-can fly-plane'])
						.where(where);
				}),
		);
	});
};

lambdaTest('any');
lambdaTest('all');

// Switch operandToAbstractSQLFactory permanently to using 'team' as the resource,
// as we are switch to using that as our base resource from here on.
operandToAbstractSQLFactory = _.partialRight(
	operandToAbstractSQLFactory,
	'team',
);
run(function () {
	const favouriteColour = 'purple';
	const { odata, abstractsql } = createExpression(
		'favourite_colour',
		'eq',
		`'${favouriteColour}'`,
	);
	return test(
		'/team?$filter=' + odata,
		'POST',
		{ favourite_colour: favouriteColour },
		(result) =>
			it('should insert into team where "' + odata + '"', () => {
				expect(result)
					.to.be.a.query.that.inserts.fields('favourite colour')
					.values(
						'SelectQuery',
						['Select', [['ReferencedField', '$insert', 'favourite colour']]],
						[
							'From',
							[
								'Alias',
								[
									'SelectQuery',
									[
										'Select',
										[
											['Alias', ['Cast', ['Null'], 'Date Time'], 'created at'],
											['Alias', ['Cast', ['Null'], 'Date Time'], 'modified at'],
											[
												'Alias',
												['Cast', ['Bind', 'team', 'favourite_colour'], 'Color'],
												'favourite colour',
											],
										],
									],
								],
								'$insert',
							],
						],
						[
							'Where',
							[
								'Exists',
								[
									'SelectQuery',
									['Select', []],
									[
										'From',
										[
											'Alias',
											[
												'SelectQuery',
												['Select', [['ReferencedField', '$insert', '*']]],
											],
											'team',
										],
									],
									['Where', abstractsql],
								],
							],
						],
					)
					.from('team');
			}),
	);
});

run(function () {
	const planeName = 'Concorde';
	const { odata, abstractsql } = createExpression(
		'includes__pilot/can_fly__plane/plane/name',
		'eq',
		`'${planeName}'`,
	);
	return test('/team?$filter=' + odata, (result) =>
		it('should select from team where "' + odata + '"', () => {
			expect(result)
				.to.be.a.query.that.selects(teamFields)
				.from(
					'team',
					['pilot', 'team.includes-pilot'],
					['pilot-can fly-plane', 'team.includes-pilot.pilot-can fly-plane'],
					['plane', 'team.includes-pilot.pilot-can fly-plane.plane'],
				)
				.where([
					'And',
					[
						'Equals',
						['ReferencedField', 'team', 'favourite colour'],
						['ReferencedField', 'team.includes-pilot', 'is on-team'],
					],
					[
						'Equals',
						['ReferencedField', 'team.includes-pilot', 'id'],
						[
							'ReferencedField',
							'team.includes-pilot.pilot-can fly-plane',
							'pilot',
						],
					],
					[
						'Equals',
						[
							'ReferencedField',
							'team.includes-pilot.pilot-can fly-plane',
							'can fly-plane',
						],
						[
							'ReferencedField',
							'team.includes-pilot.pilot-can fly-plane.plane',
							'id',
						],
					],
					abstractsql,
				]);
		}),
	);
});

test(`/copilot?$select=id,rank&$filter=rank eq 'major'`, (result) =>
	it(`should get and filter copilot on computed field rank`, () => {
		expect(result).to.be.a.query.to.deep.equal([
			'SelectQuery',
			[
				'Select',
				[
					['ReferencedField', 'copilot', 'id'],
					['ReferencedField', 'copilot', 'rank'],
				],
			],
			[
				'From',
				[
					'Alias',
					[
						'SelectQuery',
						[
							'Select',
							[
								['Field', '*'],
								['Alias', ['Boolean', false], 'is blocked'],
								['Alias', ['Text', 'Junior'], 'rank'],
							],
						],
						['From', ['Table', 'copilot']],
					],
					'copilot',
				],
			],
			[
				'Where',
				[
					'IsNotDistinctFrom',
					['ReferencedField', 'copilot', 'rank'],
					['Bind', 0],
				],
			],
		]);
	}));

test(
	`/copilot?$select=id,rank&$filter=rank eq 'major'`,
	'PATCH',
	{ assists__pilot: 1 },
	(result) =>
		it(`should PATCH copilot based on filtered computed field rank`, () => {
			expect(result).to.be.a.query.to.deep.equal([
				'UpdateQuery',
				['From', ['Table', 'copilot']],
				[
					'Where',
					[
						'In',
						['ReferencedField', 'copilot', 'id'],
						[
							'SelectQuery',
							['Select', [['ReferencedField', 'copilot', '$modifyid']]],
							[
								'From',
								[
									'Alias',
									[
										'SelectQuery',
										[
											'Select',
											[
												['Field', '*'],
												['Alias', ['Boolean', false], 'is blocked'],
												['Alias', ['Text', 'Junior'], 'rank'],
												[
													'Alias',
													['ReferencedField', 'copilot', 'id'],
													'$modifyid',
												],
											],
										],
										['From', ['Table', 'copilot']],
									],
									'copilot',
								],
							],
							[
								'Where',
								[
									'IsNotDistinctFrom',
									['ReferencedField', 'copilot', 'rank'],
									['Bind', 0],
								],
							],
						],
					],
				],
				['Fields', ['assists-pilot']],
				['Values', [['Bind', 'copilot', 'assists__pilot']]],
			]);
		}),
);

test(
	`/copilot?$select=id,rank&$filter=rank eq 'major'`,
	'DELETE',
	{ assists__pilot: 1 },
	(result) =>
		it(`should DELETE copilot based on filtered computed field rank`, () => {
			expect(result).to.be.a.query.to.deep.equal([
				'DeleteQuery',
				['From', ['Table', 'copilot']],
				[
					'Where',
					[
						'In',
						['ReferencedField', 'copilot', 'id'],
						[
							'SelectQuery',
							['Select', [['ReferencedField', 'copilot', '$modifyid']]],
							[
								'From',
								[
									'Alias',
									[
										'SelectQuery',
										[
											'Select',
											[
												['Field', '*'],
												['Alias', ['Boolean', false], 'is blocked'],
												['Alias', ['Text', 'Junior'], 'rank'],
												[
													'Alias',
													['ReferencedField', 'copilot', 'id'],
													'$modifyid',
												],
											],
										],
										['From', ['Table', 'copilot']],
									],
									'copilot',
								],
							],
							[
								'Where',
								[
									'IsNotDistinctFrom',
									['ReferencedField', 'copilot', 'rank'],
									['Bind', 0],
								],
							],
						],
					],
				],
			]);
		}),
);
