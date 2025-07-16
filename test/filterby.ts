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
import _ from 'lodash';

let operandToAbstractSQL: ReturnType<typeof operandToAbstractSQLFactory>;

const run = (function () {
	let running = false;
	return function (keyBinds, fn?) {
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
	eqany: 'EqualsAny',
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
			abstractsql: [sqlOps['eqany'], operandToAbstractSQL(lhs), ['Bind', 0]],
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
				const result: string[] = [];
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

const operandTest = (lhs, op?, rhs?) =>
	run(function () {
		const { odata, abstractsql } = createExpression(lhs, op, rhs);
		test('/pilot?$filter=' + odata, (result) => {
			it('should select from pilot where "' + odata + '"', () => {
				expect(result)
					.to.be.a.query.that.selects(pilotFields)
					.from('pilot')
					.where(abstractsql);
			});
		});

		test('/pilot/$count?$filter=' + odata, (result) => {
			it('should count(*) from pilot where "' + odata + '"', () => {
				expect(result)
					.to.be.a.query.that.selects($count)
					.from('pilot')
					.where(abstractsql);
			});
		});
	});

test('/pilot?$filter=name in (null)', (result) => {
	it('should be able to select with list with a single null', () => {
		expect(result)
			.to.be.a.query.that.selects(pilotFields)
			.from('pilot')
			.where(['EqualsAny', ['ReferencedField', 'pilot', 'name'], ['Bind', 0]]);
	});
});

test('/pilot?$filter=p/name eq 2', (result) => {
	// TODO: This should fail
	it('should select from pilot when filtering using a non-existing alias', () => {
		expect(result)
			.to.be.a.query.that.selects(pilotFields)
			.from('pilot')
			.where([
				'IsNotDistinctFrom',
				['ReferencedField', 'pilot', 'name'],
				['Bind', 0],
			]);
	});
});

test(`/pilot?$filter=name eq 'test' or name in (null, 1) or name in (null) or startswith(name,'test1') or name in (1,2,3)`, (result) => {
	it('should be able to select with multiple conditions', () => {
		expect(result)
			.to.be.a.query.that.selects(pilotFields)
			.from('pilot')
			.where([
				'Or',
				[
					'IsNotDistinctFrom',
					['ReferencedField', 'pilot', 'name'],
					['Bind', 0],
				],
				['EqualsAny', ['ReferencedField', 'pilot', 'name'], ['Bind', 1]],
				['EqualsAny', ['ReferencedField', 'pilot', 'name'], ['Bind', 2]],
				['Startswith', ['ReferencedField', 'pilot', 'name'], ['Bind', 3]],
				['EqualsAny', ['ReferencedField', 'pilot', 'name'], ['Bind', 4]],
			]);
	});
});

test('/pilot?$filter=name eq 2 or p eq 2', (result) => {
	it('should select from pilot when filtering using a non-existing property in an or', () => {
		expect(result)
			.to.be.instanceOf(TypeError)
			.and.to.have.property('message', `match is not iterable`);
	});
});

test('/pilot?$filter=name eq 2 or p/name eq 2', (result) => {
	// TODO: This should fail
	it('should select from pilot when filtering using a non-existing alias in an or', () => {
		expect(result)
			.to.be.a.query.that.selects(pilotFields)
			.from('pilot')
			.where([
				'Or',
				[
					'IsNotDistinctFrom',
					['ReferencedField', 'pilot', 'name'],
					['Bind', 0],
				],
				[
					'IsNotDistinctFrom',
					['ReferencedField', 'pilot', 'name'],
					['Bind', 1],
				],
			]);
	});
});

test(`/pilot?$filter=startswith(p/name,'test1')`, (result) => {
	// TODO: This should fail
	it('should select from pilot when filtering using a non-existing alias in a method', () => {
		expect(result)
			.to.be.a.query.that.selects(pilotFields)
			.from('pilot')
			.where(['Startswith', ['ReferencedField', 'pilot', 'name'], ['Bind', 0]]);
	});
});

const navigatedOperandTest = (lhs, op?, rhs?) => {
	run(function () {
		const { odata, abstractsql } = createExpression(lhs, op, rhs);
		test('/pilot?$filter=' + odata, (result) => {
			it('should select from pilot where "' + odata + '"', () => {
				expect(result)
					.to.be.a.query.that.selects(pilotFields)
					.from('pilot')
					.leftJoin([
						['licence', 'pilot.licence'],
						[
							'Equals',
							['ReferencedField', 'pilot', 'licence'],
							['ReferencedField', 'pilot.licence', 'id'],
						],
					])
					.where(abstractsql);
			});
		});
		test('/pilot/$count?$filter=' + odata, (result) => {
			it('should count(*) from pilot where "' + odata + '"', () => {
				expect(result)
					.to.be.a.query.that.selects($count)
					.from('pilot')
					.leftJoin([
						['licence', 'pilot.licence'],
						[
							'Equals',
							['ReferencedField', 'pilot', 'licence'],
							['ReferencedField', 'pilot.licence', 'id'],
						],
					])
					.where(abstractsql);
			});
		});
	});
};

const methodTest = (...args: Parameters<typeof createMethodCall>) =>
	run(() => operandTest(createMethodCall(...args)));

const navigatedMethodTest = (...args: Parameters<typeof createMethodCall>) =>
	run(() => {
		navigatedOperandTest(createMethodCall(...args));
	});

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
	operands.map((lhs) => operands.map((rhs) => operandTest(lhs, 'eq', rhs)));
})();

(function () {
	const left = createExpression('age', 'gt', 2);
	const right = createExpression('age', 'lt', 10);
	operandTest(left, 'and', right);
	operandTest(left, 'or', right);
	operandTest('is_experienced');
	operandTest('not', 'is_experienced');
	operandTest('not', left);
})();

(function () {
	const mathOps = ['add', 'sub', 'mul', 'div'];
	mathOps.map((mathOp) =>
		run(function () {
			const mathOpOdata = createExpression('age', mathOp, 2);
			operandTest(mathOpOdata, 'gt', 10);
		}),
	);
})();

run(function () {
	const odata = operandToOData(true);
	const abstractsql = operandToAbstractSQL(true);

	test('/pilot?$filter=' + odata, (result) => {
		it('should select from pilot where "' + odata + '"', () => {
			expect(result)
				.to.be.a.query.that.selects(pilotFields)
				.from('pilot')
				.where(abstractsql);
		});
	});
});

run(function () {
	const { odata, abstractsql } = createExpression(
		'can_fly__plane/id',
		'eq',
		10,
	);
	test('/pilot?$filter=' + odata, (result) => {
		it('should select from pilot where "' + odata + '"', () => {
			expect(result)
				.to.be.a.query.that.selects(pilotFields)
				.from('pilot')
				.leftJoin([
					['pilot-can fly-plane', 'pilot.pilot-can fly-plane'],
					[
						'Equals',
						['ReferencedField', 'pilot', 'id'],
						['ReferencedField', 'pilot.pilot-can fly-plane', 'pilot'],
					],
				])
				.where(abstractsql);
		});
	});
});

run(function () {
	const { odata } = createExpression('created_at', 'gt', new Date());
	test('/pilot?$filter=' + odata, (result) => {
		it('should select from pilot where "' + odata + '"', () => {
			expect(result)
				.to.be.a.query.that.selects(pilotFields)
				.where([
					'GreaterThan',
					[
						'DateTrunc',
						['EmbeddedText', 'milliseconds'],
						['ReferencedField', 'pilot', 'created at'],
						['EmbeddedText', 'UTC'],
					],
					['Bind', 0],
				]);
		});
	});
});

run(function () {
	const { odata } = createExpression('created_at', 'gt', new Date());
	test('/pilot(1)/licence?$filter=' + odata, (result) => {
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
							['EmbeddedText', 'UTC'],
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
		});
	});
});

run([['Number', 1]], function () {
	const { odata, abstractsql } = createExpression(
		['plane/id', null, 'pilot.pilot-can fly-plane'],
		'eq',
		10,
	);
	test('/pilot(1)/can_fly__plane?$filter=' + odata, (result) => {
		it('should select from pilot where "' + odata + '"', () => {
			expect(result)
				.to.be.a.query.that.selects(
					aliasFields('pilot', pilotCanFlyPlaneFields),
				)
				.from('pilot', ['pilot-can fly-plane', 'pilot.pilot-can fly-plane'])
				.leftJoin([
					['plane', 'pilot.pilot-can fly-plane.plane'],
					[
						'Equals',
						['ReferencedField', 'pilot.pilot-can fly-plane', 'can fly-plane'],
						['ReferencedField', 'pilot.pilot-can fly-plane.plane', 'id'],
					],
				])
				.where([
					'And',
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

	const pilotPilotCanFlyPlaneLeftJoin = [
		'LeftJoin',
		['Alias', ['Table', 'pilot-can fly-plane'], 'pilot.pilot-can fly-plane'],
		[
			'On',
			[
				'Equals',
				['ReferencedField', 'pilot', 'id'],
				['ReferencedField', 'pilot.pilot-can fly-plane', 'pilot'],
			],
		],
	];

	const pilotPilotCanFlyPlanePlaneLeftJoin = [
		'LeftJoin',
		['Alias', ['Table', 'plane'], 'pilot.pilot-can fly-plane.plane'],
		[
			'On',
			[
				'Equals',
				['ReferencedField', 'pilot.pilot-can fly-plane', 'can fly-plane'],
				['ReferencedField', 'pilot.pilot-can fly-plane.plane', 'id'],
			],
		],
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
									[
										'SelectQuery',
										['Select', [['ReferencedField', '$insert', '*']]],
									],
									'pilot',
								],
							],
							pilotPilotCanFlyPlaneLeftJoin,
							pilotPilotCanFlyPlanePlaneLeftJoin,
							['Where', abstractsql],
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
			pilotPilotCanFlyPlaneLeftJoin,
			pilotPilotCanFlyPlanePlaneLeftJoin,
			['Where', abstractsql],
		],
	];

	test('/pilot?$filter=' + odata, (result) => {
		it('should select from pilot where "' + odata + '"', () => {
			expect(result)
				.to.be.a.query.that.selects(pilotFields)
				.from('pilot')
				.leftJoin(
					[
						['pilot-can fly-plane', 'pilot.pilot-can fly-plane'],
						[
							'Equals',
							['ReferencedField', 'pilot', 'id'],
							['ReferencedField', 'pilot.pilot-can fly-plane', 'pilot'],
						],
					],
					[
						['plane', 'pilot.pilot-can fly-plane.plane'],
						[
							'Equals',
							['ReferencedField', 'pilot.pilot-can fly-plane', 'can fly-plane'],
							['ReferencedField', 'pilot.pilot-can fly-plane.plane', 'id'],
						],
					],
				)
				.where(abstractsql);
		});
	});

	test(`/pilot?$filter=${odata}`, 'PATCH', { name: 'Peter' }, (result) => {
		it('should update pilot where "' + odata + '"', () => {
			expect(result)
				.to.be.a.query.that.updates.fields('name')
				.values(['Bind', 'pilot', 'name'])
				.from('pilot')
				.where(updateWhere);
		});
	});

	test(`/pilot?$filter=${odata}`, 'POST', { name: 'Peter' }, (result) => {
		it(`should insert pilot where '${odata}'`, () => {
			insertTest(result);
		});
	});

	test(`/pilot?$filter=${odata}`, 'PUT', { name: 'Peter' }, (result) => {
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
		});
	});

	test('/pilot?$filter=' + odata, 'DELETE', (result) => {
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
							'LeftJoin',
							[
								'Alias',
								['Table', 'pilot-can fly-plane'],
								'pilot.pilot-can fly-plane',
							],
							[
								'On',
								[
									'Equals',
									['ReferencedField', 'pilot', 'id'],
									['ReferencedField', 'pilot.pilot-can fly-plane', 'pilot'],
								],
							],
						],
						[
							'LeftJoin',
							['Alias', ['Table', 'plane'], 'pilot.pilot-can fly-plane.plane'],
							[
								'On',
								[
									'Equals',
									[
										'ReferencedField',
										'pilot.pilot-can fly-plane',
										'can fly-plane',
									],
									['ReferencedField', 'pilot.pilot-can fly-plane.plane', 'id'],
								],
							],
						],
						['Where', abstractsql],
					],
				]);
		});
	});
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

	test('/pilot(1)?$filter=' + odata, 'POST', { name }, (result) => {
		it('should insert into pilot where "' + odata + '"', () => {
			insertTest(result);
		});
	});

	test('/pilot(1)?$filter=' + odata, 'PATCH', { name }, (result) => {
		it('should update the pilot with id 1', () => {
			expect(result)
				.to.be.a.query.that.updates.fields('name')
				.values(['Bind', 'pilot', 'name'])
				.from('pilot')
				.where(updateWhere);
		});
	});

	test('/pilot(1)?$filter=' + odata, 'PUT', { name }, (result) => {
		describe('should upsert the pilot with id 1', function () {
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
		});
	});
});

run(function () {
	const licence = 1;
	const { odata, abstractsql } = createExpression('licence/id', 'eq', licence);
	test('/pilot?$filter=' + odata, 'POST', { licence }, (result) => {
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
									'LeftJoin',
									['Alias', ['Table', 'licence'], 'pilot.licence'],
									[
										'On',
										[
											'Equals',
											['ReferencedField', 'pilot', 'licence'],
											['ReferencedField', 'pilot.licence', 'id'],
										],
									],
								],
								['Where', abstractsql],
							],
						],
					],
				)
				.from('pilot');
		});
	});
});

run(function () {
	const licence = 1;
	const name = 'Licence-1';
	const { odata, abstractsql } = createExpression(
		'licence/name',
		'eq',
		`'${name}'`,
	);
	test(`/pilot?$filter=${odata}`, 'POST', { licence }, (result) => {
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
									'LeftJoin',
									['Alias', ['Table', 'licence'], 'pilot.licence'],
									[
										'On',
										[
											'Equals',
											['ReferencedField', 'pilot', 'licence'],
											['ReferencedField', 'pilot.licence', 'id'],
										],
									],
								],
								['Where', abstractsql],
							],
						],
					],
				)
				.from('pilot');
		});
	});
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
run(() => {
	navigatedOperandTest(
		createMethodCall('tolower', 'licence/name'),
		'eq',
		"'pete'",
	);
});
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
		const getFilterWhereForBind = (bindNumber) => [
			'IsNotDistinctFrom',
			['ReferencedField', 'pilot.identification method', 'identification type'],
			['Bind', bindNumber],
		];

		const getWhereForBind = (...bindNumbers) => {
			const subWhere = [
				'And',
				[
					'Equals',
					['ReferencedField', 'pilot', 'id'],
					['ReferencedField', 'pilot.identification method', 'pilot'],
				],
			];
			const filterWheres = bindNumbers.map(getFilterWhereForBind);
			const filterWhere =
				filterWheres.length > 1 ? ['Or', ...filterWheres] : filterWheres[0];

			// All is implemented as where none fail
			if (methodName === 'all') {
				// @ts-expect-error Pushing valid AbstractSql
				subWhere.push(['Not', filterWhere]);
			} else {
				subWhere.push(filterWhere);
			}

			let $where = [
				'Exists',
				[
					'SelectQuery',
					['Select', []],
					[
						'From',
						[
							'Alias',
							['Table', 'identification method'],
							'pilot.identification method',
						],
					],
					['Where', subWhere],
				],
			];

			// All is implemented as where none fail
			if (methodName === 'all') {
				// @ts-expect-error the types should be fine but it's not feasible to do in js
				$where = ['Not', $where];
			}

			return $where;
		};

		const where = getWhereForBind(0);

		test(`/pilot?$filter=identification_method/${methodName}(d:d/identification_type eq 'passport')`, (result) => {
			it('should select from pilot where ...', () => {
				expect(result)
					.to.be.a.query.that.selects(pilotFields)
					.from('pilot')
					.where(where);
			});
		});

		test(`/pilot/$count?$filter=identification_method/${methodName}(d:d/identification_type eq 'passport')`, (result) => {
			it('should select count(*) from pilot where ...', () => {
				expect(result)
					.to.be.a.query.that.selects($count)
					.from('pilot')
					.where(where);
			});
		});

		// unknown alias
		test(`/pilot?$filter=identification_method/${methodName}(d:x/identification_type eq 'passport')`, (result) => {
			// TODO: This should fail
			it(`should select from pilot when filtering using a non-existing alias in a select path inside an ${methodName}`, () => {
				expect(result)
					.to.be.a.query.that.selects(pilotFields)
					.from('pilot')
					.where(where);
			});
		});

		const twoPartWhere = ['Or', where, getWhereForBind(1)];

		test(`/pilot?$filter=identification_method/${methodName}(d:d/identification_type eq 'passport') or identification_method/${methodName}(d:d/identification_type eq 'idcard')`, (result) => {
			it('should select from pilot where ...', () => {
				expect(result)
					.to.be.a.query.that.selects(pilotFields)
					.from('pilot')
					.where(twoPartWhere);
			});
		});

		test(`/pilot/$count?$filter=identification_method/${methodName}(d:d/identification_type eq 'passport') or identification_method/${methodName}(d:d/identification_type eq 'idcard')`, (result) => {
			it('should select count(*) from pilot where ...', () => {
				expect(result)
					.to.be.a.query.that.selects($count)
					.from('pilot')
					.where(twoPartWhere);
			});
		});

		// unknown property w/o alias
		test(`/pilot?$filter=identification_method/${methodName}(d:d/identification_type eq 'passport') or identification_method/${methodName}(d:x eq 'idcard')`, (result) => {
			expect(result)
				.to.be.instanceOf(TypeError)
				.and.to.have.property('message', `match is not iterable`);
		});

		// unknown sub-property
		test(`/pilot?$filter=identification_method/${methodName}(d:d/identification_type eq 'passport') or identification_method/${methodName}(d:d/identification_type/x eq 'idcard')`, (result) => {
			expect(result)
				.to.be.instanceOf(TypeError)
				.and.to.have.property('message', `match is not iterable`);
		});

		// missing alias
		test(`/pilot?$filter=identification_method/${methodName}(d:d/identification_type eq 'passport') or identification_method/${methodName}(d:identification_type eq 'idcard')`, (result) => {
			it('should select from pilot where ...', () => {
				expect(result)
					.to.be.a.query.that.selects(pilotFields)
					.from('pilot')
					.where(twoPartWhere);
			});
		});

		// unknown alias
		test(`/pilot?$filter=identification_method/${methodName}(d:d/identification_type eq 'passport') or identification_method/${methodName}(d:x/identification_type eq 'idcard')`, (result) => {
			// TODO: This should fail
			it('should select from pilot where ...', () => {
				expect(result)
					.to.be.a.query.that.selects(pilotFields)
					.from('pilot')
					.where(twoPartWhere);
			});
		});

		const nestedTwoPartWhere = getWhereForBind(0, 1);

		test(`/pilot?$filter=identification_method/${methodName}(d:d/identification_type eq 'passport' or d/identification_type eq 'idcard')`, (result) => {
			it('should select from pilot where ...', () => {
				expect(result)
					.to.be.a.query.that.selects(pilotFields)
					.from('pilot')
					.where(nestedTwoPartWhere);
			});
		});

		test(`/pilot/$count?$filter=identification_method/${methodName}(d:d/identification_type eq 'passport' or d/identification_type eq 'idcard')`, (result) => {
			it('should select count(*) from pilot where ...', () => {
				expect(result)
					.to.be.a.query.that.selects($count)
					.from('pilot')
					.where(nestedTwoPartWhere);
			});
		});

		// unknown property w/o alias
		test(`/pilot?$filter=identification_method/${methodName}(d:d/identification_type eq 'passport' or x eq 'idcard')`, (result) => {
			expect(result)
				.to.be.instanceOf(TypeError)
				.and.to.have.property('message', `match is not iterable`);
		});

		// unknown sub-property
		test(`/pilot?$filter=identification_method/${methodName}(d:d/identification_type eq 'passport' or d/identification_type/x eq 'idcard')`, (result) => {
			expect(result)
				.to.be.instanceOf(TypeError)
				.and.to.have.property('message', `match is not iterable`);
		});

		// missing alias
		test(`/pilot?$filter=identification_method/${methodName}(d:d/identification_type eq 'passport' or identification_type eq 'idcard')`, (result) => {
			it('should select from pilot where ...', () => {
				expect(result)
					.to.be.a.query.that.selects(pilotFields)
					.from('pilot')
					.where(nestedTwoPartWhere);
			});
		});

		// unknown alias
		test(`/pilot?$filter=identification_method/${methodName}(d:d/identification_type eq 'passport' or x/identification_type eq 'idcard')`, (result) => {
			// TODO: This should fail
			it('should select from pilot where ...', () => {
				expect(result)
					.to.be.a.query.that.selects(pilotFields)
					.from('pilot')
					.where(nestedTwoPartWhere);
			});
		});
	});

	run(function () {
		const getFilterWhereForBind = (bindNumber) => [
			'IsNotDistinctFrom',
			['ReferencedField', 'pilot.pilot-can fly-plane.plane', 'name'],
			['Bind', bindNumber],
		];

		const getWhereForBind = (bindNumber) => {
			const subWhere = [
				'And',
				[
					'Equals',
					['ReferencedField', 'pilot', 'id'],
					['ReferencedField', 'pilot.pilot-can fly-plane', 'pilot'],
				],
			];
			const filterWhere = getFilterWhereForBind(bindNumber);

			// All is implemented as where none fail
			if (methodName === 'all') {
				// @ts-expect-error Pushing valid AbstractSql
				subWhere.push(['Not', filterWhere]);
			} else {
				subWhere.push(filterWhere);
			}

			let $where = [
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
						'LeftJoin',
						['Alias', ['Table', 'plane'], 'pilot.pilot-can fly-plane.plane'],
						[
							'On',
							[
								'Equals',
								[
									'ReferencedField',
									'pilot.pilot-can fly-plane',
									'can fly-plane',
								],
								['ReferencedField', 'pilot.pilot-can fly-plane.plane', 'id'],
							],
						],
					],
					['Where', subWhere],
				],
			];

			// All is implemented as where none fail
			if (methodName === 'all') {
				// @ts-expect-error the types should be fine but it's not feasible to do in js
				$where = ['Not', $where];
			}

			return $where;
		};

		const where = getWhereForBind(0);

		test(
			'/pilot?$filter=can_fly__plane/' +
				methodName +
				"(d:d/plane/name eq 'Concorde')",
			(result) => {
				it('should select from pilot where ...', () => {
					expect(result)
						.to.be.a.query.that.selects(pilotFields)
						.from('pilot')
						.where(where);
				});
			},
		);

		test(
			'/pilot/$count?$filter=can_fly__plane/' +
				methodName +
				"(d:d/plane/name eq 'Concorde')",
			(result) => {
				it('should select count(*) from pilot where ...', () => {
					expect(result)
						.to.be.a.query.that.selects($count)
						.from('pilot')
						.where(where);
				});
			},
		);

		const twoPartWhere = ['Or', where, getWhereForBind(1)];

		test(`/pilot?$filter=can_fly__plane/${methodName}(d:d/plane/name eq 'Concorde') or can_fly__plane/${methodName}(d:d/plane/name eq '747')`, (result) => {
			it('should select from pilot where ...', () => {
				expect(result)
					.to.be.a.query.that.selects(pilotFields)
					.from('pilot')
					.where(twoPartWhere);
			});
		});

		test(`/pilot/$count?$filter=can_fly__plane/${methodName}(d:d/plane/name eq 'Concorde') or can_fly__plane/${methodName}(d:d/plane/name eq '747')`, (result) => {
			it('should select count(*) from pilot where ...', () => {
				expect(result)
					.to.be.a.query.that.selects($count)
					.from('pilot')
					.where(twoPartWhere);
			});
		});

		test(
			'/pilot?$filter=can_fly__plane/' +
				methodName +
				"(d:x/plane/name eq 'Concorde')",
			(result) => {
				const badSubWhere = [
					'And',
					[
						'Equals',
						['ReferencedField', 'pilot', 'id'],
						['ReferencedField', 'pilot.pilot-can fly-plane', 'pilot'],
					],
				];
				const filterWhere = getFilterWhereForBind(0);
				// All is implemented as where none fail
				if (methodName === 'all') {
					// @ts-expect-error Pushing valid AbstractSql
					badSubWhere.push(['Not', filterWhere]);
				} else {
					badSubWhere.push(filterWhere);
				}
				let badWhere = [
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
						['Where', badSubWhere],
					],
				];
				// All is implemented as where none fail
				if (methodName === 'all') {
					// @ts-expect-error the types should be fine but it's not feasible to do in js
					badWhere = ['Not', badWhere];
				}
				// TODO: This should fail
				it(`should select from pilot when filtering using a non-existing alias in a select path inside an ${methodName}`, () => {
					expect(result)
						.to.be.a.query.that.selects(pilotFields)
						.from('pilot')
						.where(badWhere);
				});
			},
		);
	});

	run(function () {
		const getFilterWhereForBind = (bindNumber) => [
			'IsNotDistinctFrom',
			['ReferencedField', 'pilot.pilot-can fly-plane.plane', 'name'],
			['Bind', bindNumber],
		];

		const getPlaneWhereForBind = (bindNumber) => {
			const subWhere = [
				'And',
				[
					'Equals',
					['ReferencedField', 'pilot.pilot-can fly-plane', 'can fly-plane'],
					['ReferencedField', 'pilot.pilot-can fly-plane.plane', 'id'],
				],
			];
			const filterWhere = getFilterWhereForBind(bindNumber);
			// All is implemented as where none fail
			if (methodName === 'all') {
				// @ts-expect-error Pushing valid AbstractSql
				subWhere.push(['Not', filterWhere]);
			} else {
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

			return innerWhere;
		};

		test(
			'/pilot?$filter=can_fly__plane/plane/' +
				methodName +
				"(d:d/name eq 'Concorde')",
			(result) => {
				it('should select from pilot where ...', () => {
					expect(result)
						.to.be.a.query.that.selects(pilotFields)
						.from('pilot')
						.leftJoin([
							['pilot-can fly-plane', 'pilot.pilot-can fly-plane'],
							[
								'Equals',
								['ReferencedField', 'pilot', 'id'],
								['ReferencedField', 'pilot.pilot-can fly-plane', 'pilot'],
							],
						])
						.where(where);
				});
			},
		);

		const where = getPlaneWhereForBind(0);

		test(
			'/pilot/$count?$filter=can_fly__plane/plane/' +
				methodName +
				"(d:d/name eq 'Concorde')",
			(result) => {
				it('should select count(*) from pilot where ...', () => {
					expect(result)
						.to.be.a.query.that.selects($count)
						.from('pilot')
						.leftJoin([
							['pilot-can fly-plane', 'pilot.pilot-can fly-plane'],
							[
								'Equals',
								['ReferencedField', 'pilot', 'id'],
								['ReferencedField', 'pilot.pilot-can fly-plane', 'pilot'],
							],
						])
						.where(where);
				});
			},
		);

		const twoPartWhere = [
			'Or',
			getPlaneWhereForBind(0),
			getPlaneWhereForBind(1),
		];

		test(`/pilot?$filter=can_fly__plane/plane/${methodName}(d:d/name eq 'Concorde') or can_fly__plane/plane/${methodName}(d:d/name eq '747')`, (result) => {
			it('should select from pilot where ...', () => {
				expect(result)
					.to.be.a.query.that.selects(pilotFields)
					.from('pilot')
					.leftJoin([
						['pilot-can fly-plane', 'pilot.pilot-can fly-plane'],
						[
							'Equals',
							['ReferencedField', 'pilot', 'id'],
							['ReferencedField', 'pilot.pilot-can fly-plane', 'pilot'],
						],
					])
					.where(twoPartWhere);
			});
		});

		test(`/pilot/$count?$filter=can_fly__plane/plane/${methodName}(d:d/name eq 'Concorde') or can_fly__plane/plane/${methodName}(d:d/name eq '747')`, (result) => {
			it('should select count(*) from pilot where ...', () => {
				expect(result)
					.to.be.a.query.that.selects($count)
					.from('pilot')
					.leftJoin([
						['pilot-can fly-plane', 'pilot.pilot-can fly-plane'],
						[
							'Equals',
							['ReferencedField', 'pilot', 'id'],
							['ReferencedField', 'pilot.pilot-can fly-plane', 'pilot'],
						],
					])
					.where(twoPartWhere);
			});
		});

		test(
			'/pilot?$filter=can_fly__plane/plane/' +
				methodName +
				"(d:x/name eq 'Concorde')",
			(result) => {
				// TODO: This should fail
				it(`should select from pilot when filtering using a non-existing alias inside an ${methodName}`, () => {
					expect(result)
						.to.be.a.query.that.selects(pilotFields)
						.from('pilot')
						.leftJoin([
							['pilot-can fly-plane', 'pilot.pilot-can fly-plane'],
							[
								'Equals',
								['ReferencedField', 'pilot', 'id'],
								['ReferencedField', 'pilot.pilot-can fly-plane', 'pilot'],
							],
						])
						.where(where);
				});
			},
		);
	});

	run(function () {
		const getWhereFor = (filterWhere) => {
			const subWhere = [
				'And',
				[
					'Equals',
					['ReferencedField', 'pilot', 'id'],
					['ReferencedField', 'pilot.identification method', 'pilot'],
				],
			];

			// All is implemented as where none fail
			if (methodName === 'all') {
				subWhere.push(['Not', filterWhere]);
			} else {
				subWhere.push(filterWhere);
			}

			let $where = [
				'Exists',
				[
					'SelectQuery',
					['Select', []],
					[
						'From',
						[
							'Alias',
							['Table', 'identification method'],
							'pilot.identification method',
						],
					],
					['Where', subWhere],
				],
			];

			// All is implemented as where none fail
			if (methodName === 'all') {
				// @ts-expect-error the types should be fine but it's not feasible to do in js
				$where = ['Not', $where];
			}

			return $where;
		};

		const whereOneEqOne = getWhereFor([
			'IsNotDistinctFrom',
			['Bind', 0],
			['Bind', 1],
		]);

		test(`/pilot?$filter=identification_method/${methodName}(d:1 eq 1)`, (result) => {
			it('should select from pilot where ...', () => {
				expect(result)
					.to.be.a.query.that.selects(pilotFields)
					.from('pilot')
					.where(whereOneEqOne);
			});
		});

		test(`/pilot/$count?$filter=identification_method/${methodName}(d:1 eq 1)`, (result) => {
			it('should select from pilot where ...', () => {
				expect(result)
					.to.be.a.query.that.selects($count)
					.from('pilot')
					.where(whereOneEqOne);
			});
		});

		const whereTrue = getWhereFor(['Bind', 0]);

		test(`/pilot?$filter=identification_method/${methodName}(d:true)`, (result) => {
			it('should select from pilot where ...', () => {
				expect(result)
					.to.be.a.query.that.selects(pilotFields)
					.from('pilot')
					.where(whereTrue);
			});
		});

		test(`/pilot/$count?$filter=identification_method/${methodName}(d:true)`, (result) => {
			it('should select from pilot where ...', () => {
				expect(result)
					.to.be.a.query.that.selects($count)
					.from('pilot')
					.where(whereTrue);
			});
		});
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
	test(
		'/team?$filter=' + odata,
		'POST',
		{ favourite_colour: favouriteColour },
		(result) => {
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
			});
		},
	);
});

run(function () {
	const planeName = 'Concorde';
	const { odata, abstractsql } = createExpression(
		'includes__pilot/can_fly__plane/plane/name',
		'eq',
		`'${planeName}'`,
	);
	test('/team?$filter=' + odata, (result) => {
		it('should select from team where "' + odata + '"', () => {
			expect(result)
				.to.be.a.query.that.selects(teamFields)
				.from('team')
				.leftJoin(
					[
						['pilot', 'team.includes-pilot'],
						[
							'Equals',
							['ReferencedField', 'team', 'favourite colour'],
							['ReferencedField', 'team.includes-pilot', 'is on-team'],
						],
					],
					[
						['pilot-can fly-plane', 'team.includes-pilot.pilot-can fly-plane'],
						[
							'Equals',
							['ReferencedField', 'team.includes-pilot', 'id'],
							[
								'ReferencedField',
								'team.includes-pilot.pilot-can fly-plane',
								'pilot',
							],
						],
					],
					[
						['plane', 'team.includes-pilot.pilot-can fly-plane.plane'],
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
					],
				)
				.where(abstractsql);
		});
	});
});

// Skipping because the optimization for already computed fields had to be removed due to dangerous interactions with translations
test.skip(`/copilot?$select=id,rank&$filter=rank eq 'major'`, (result) => {
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
	});
});

test(
	`/copilot?$select=id,rank&$filter=rank eq 'major'`,
	'PATCH',
	{ assists__pilot: 1 },
	(result) => {
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
		});
	},
);

test(
	`/copilot?$select=id,rank&$filter=rank eq 'major'`,
	'DELETE',
	{ assists__pilot: 1 },
	(result) => {
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
		});
	},
);
