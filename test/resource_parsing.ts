import { expect } from 'chai';

import {
	aliasFields,
	pilotFields,
	licenceFields,
	planeFields,
	teamFields,
	pilotCanFlyPlaneFields,
	$count,
} from './chai-sql.js';

import test from './test.js';
import ODataParser from '@balena/odata-parser';

test('/', (result) => {
	it('Service root should return $serviceroot', () => {
		expect(result).to.deep.equal(['$serviceroot']);
	});
});

test('/$metadata', (result) => {
	it('$metadata should return $metadata', () => {
		expect(result).to.deep.equal(['$metadata']);
	});
});

test('/pilot', (result) => {
	it('should select from pilot', () => {
		expect(result).to.be.a.query.that.selects(pilotFields).from('pilot');
	});
});

test('/aircraft', (result) => {
	it('should select from aircraft (plane)', () => {
		expect(result).to.be.a.query.that.selects(planeFields).from('plane');
	});
});

test('/pilot__can_fly__aircraft', (result) => {
	it('should select from pilot can fly aircraft (pilot can fly plane)', () => {
		expect(result)
			.to.be.a.query.that.selects(pilotCanFlyPlaneFields)
			.from('pilot-can fly-plane');
	});
});

test('/pilot(1)', (result) => {
	it('should select from pilot with id', () => {
		expect(result)
			.to.be.a.query.that.selects(pilotFields)
			.from('pilot')
			.where([
				'IsNotDistinctFrom',
				['ReferencedField', 'pilot', 'id'],
				['Bind', 0],
			]);
	});
});

test('/pilot(0)', (result) => {
	it('should select from pilot with id', () => {
		expect(result)
			.to.be.a.query.that.selects(pilotFields)
			.from('pilot')
			.where([
				'IsNotDistinctFrom',
				['ReferencedField', 'pilot', 'id'],
				['Bind', 0],
			]);
	});
});

test("/pilot('TextKey')", (result) => {
	it('should select from pilot with id', () => {
		expect(result)
			.to.be.a.query.that.selects(pilotFields)
			.from('pilot')
			.where([
				'IsNotDistinctFrom',
				['ReferencedField', 'pilot', 'id'],
				['Bind', 0],
			]);
	});
});

test('/pilot(id=1)', (result) => {
	it('should select from pilot with id', () => {
		expect(result)
			.to.be.a.query.that.selects(pilotFields)
			.from('pilot')
			.where([
				'IsNotDistinctFrom',
				['ReferencedField', 'pilot', 'id'],
				['Bind', 0],
			]);
	});
});

test("/pilot(id='TextKey')", (result) => {
	it('should select from pilot with id', () => {
		expect(result)
			.to.be.a.query.that.selects(pilotFields)
			.from('pilot')
			.where([
				'IsNotDistinctFrom',
				['ReferencedField', 'pilot', 'id'],
				['Bind', 0],
			]);
	});
});

test('/pilot__can_fly__plane(pilot=12,can_fly__plane=23)', (result) => {
	it('should select from pilot with id', () => {
		expect(result)
			.to.be.a.query.that.selects(pilotCanFlyPlaneFields)
			.from('pilot-can fly-plane')
			.where([
				'And',
				[
					'IsNotDistinctFrom',
					['ReferencedField', 'pilot-can fly-plane', 'pilot'],
					['Bind', 0],
				],
				[
					'IsNotDistinctFrom',
					['ReferencedField', 'pilot-can fly-plane', 'can fly-plane'],
					['Bind', 1],
				],
			]);
	});
});

test('/pilot(1)/licence', (result) => {
	it('should select from the licence of pilot with id', () => {
		expect(result)
			.to.be.a.query.that.selects(aliasFields('pilot', licenceFields))
			.from('pilot', ['licence', 'pilot.licence'])
			.where([
				'And',
				[
					'Equals',
					['ReferencedField', 'pilot', 'licence'],
					['ReferencedField', 'pilot.licence', 'id'],
				],
				['IsNotDistinctFrom', ['ReferencedField', 'pilot', 'id'], ['Bind', 0]],
			]);
	});
});

test('/pilot(1)/p', (result) => {
	it('should fail to select an invalid path', () => {
		expect(result)
			.to.be.instanceOf(SyntaxError)
			.and.to.have.property(
				'message',
				`Could not resolve relationship mapping from 'pilot' to 'p'`,
			);
	});
});

test('/pilot(1)/p/licence', (result) => {
	it('should fail to select from the licence of pilot with id when using an invalid path', () => {
		expect(result)
			.to.be.instanceOf(SyntaxError)
			.and.to.have.property(
				'message',
				`Could not resolve relationship mapping from 'pilot' to 'p'`,
			);
	});
});

test('/pilot(1)/name', (result) => {
	it('should fail to navigate to a field that is not a resource', () => {
		expect(result)
			.to.be.instanceOf(SyntaxError)
			.and.to.have.property('message', `Could not match resource: "name"`);
	});
});

test('/licence(1)/is_of__pilot', (result) => {
	it('should select from the pilots of licence with id', () => {
		expect(result)
			.to.be.a.query.that.selects(aliasFields('licence', pilotFields, 'is of'))
			.from('licence', ['pilot', 'licence.is of-pilot'])
			.where([
				'And',
				[
					'Equals',
					['ReferencedField', 'licence', 'id'],
					['ReferencedField', 'licence.is of-pilot', 'licence'],
				],
				[
					'IsNotDistinctFrom',
					['ReferencedField', 'licence', 'id'],
					['Bind', 0],
				],
			]);
	});
});

test('/pilot(1)/can_fly__plane/plane', (result) => {
	it('should select from the plane of pilot with id', () => {
		expect(result)
			.to.be.a.query.that.selects(
				aliasFields('pilot.pilot-can fly-plane', planeFields),
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
				[
					'Equals',
					['ReferencedField', 'pilot', 'id'],
					['ReferencedField', 'pilot.pilot-can fly-plane', 'pilot'],
				],
				['IsNotDistinctFrom', ['ReferencedField', 'pilot', 'id'], ['Bind', 0]],
			]);
	});
});

test('/plane(1)/can_be_flown_by__pilot/pilot', (result) => {
	it('should select from the pilots of plane with id', () => {
		expect(result)
			.to.be.a.query.that.selects(
				aliasFields('plane.pilot-can fly-plane', pilotFields),
			)
			.from(
				'plane',
				['pilot-can fly-plane', 'plane.pilot-can fly-plane'],
				['pilot', 'plane.pilot-can fly-plane.pilot'],
			)
			.where([
				'And',
				[
					'Equals',
					['ReferencedField', 'plane.pilot-can fly-plane', 'pilot'],
					['ReferencedField', 'plane.pilot-can fly-plane.pilot', 'id'],
				],
				[
					'Equals',
					['ReferencedField', 'plane', 'id'],
					['ReferencedField', 'plane.pilot-can fly-plane', 'can fly-plane'],
				],
				['IsNotDistinctFrom', ['ReferencedField', 'plane', 'id'], ['Bind', 0]],
			]);
	});
});

test('/pilot(1)', 'DELETE', (result) => {
	it('should delete the pilot with id 1', () => {
		expect(result)
			.to.be.a.query.that.deletes.from('pilot')
			.where([
				'IsNotDistinctFrom',
				['ReferencedField', 'pilot', 'id'],
				['Bind', 0],
			]);
	});
});

test('/pilot(1)', 'PUT', (result) => {
	describe('should upsert the pilot with id 1', function () {
		const whereClause = [
			'IsNotDistinctFrom',
			['ReferencedField', 'pilot', 'id'],
			['Bind', 0],
		];
		it('should be an upsert', () => expect(result).to.be.a.query.that.upserts);
		it('that inserts', () => {
			expect(result[1])
				.to.be.a.query.that.inserts.fields('id')
				.values(
					'SelectQuery',
					['Select', [['ReferencedField', '$insert', 'id']]],
					[
						'From',
						[
							'Alias',
							[
								'ConvertRow',
								[
									'SelectQuery',
									[
										'Select',
										[
											['Alias', ['Cast', ['Null'], 'Date Time'], 'created at'],
											['Alias', ['Cast', ['Null'], 'Date Time'], 'modified at'],
											[
												'Alias',
												['Cast', ['Bind', ['pilot', 'id']], 'Serial'],
												'id',
											],
											['Alias', ['Cast', ['Null'], 'ConceptType'], 'person'],
											[
												'Alias',
												['Cast', ['Null'], 'Boolean'],
												'is experienced',
											],
											['Alias', ['Cast', ['Null'], 'Short Text'], 'name'],
											['Alias', ['Cast', ['Null'], 'Integer'], 'age'],
											[
												'Alias',
												['Cast', ['Null'], 'Color'],
												'favourite colour',
											],
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
								['Table', 'pilot'],
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
										'IsNotDistinctFrom',
										['ReferencedField', 'pilot', 'id'],
										['Bind', 0],
									],
								],
							],
						],
					],
				)
				.from('pilot');
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
					['Bind', ['pilot', 'id']],
					'Default',
					'Default',
					'Default',
					'Default',
					'Default',
					'Default',
					'Default',
					'Default',
					'Default',
				)
				.from('pilot')
				.where(whereClause);
		});
	});
});

(function () {
	const testFunc = (result) => {
		it('should update the pilot with id 1', () => {
			expect(result)
				.to.be.a.query.that.updates.fields('is experienced', 'favourite colour')
				.values(
					['Bind', ['pilot', 'is_experienced']],
					['Bind', ['pilot', 'favourite_colour']],
				)
				.from('pilot')
				.where([
					'IsNotDistinctFrom',
					['ReferencedField', 'pilot', 'id'],
					['Bind', 0],
				]);
		});
	};
	test(
		'/pilot(1)',
		'PATCH',
		{ is_experienced: true, favourite_colour: null },
		testFunc,
	);
	test(
		'/pilot(1)',
		'MERGE',
		{ is_experienced: true, favourite_colour: null },
		testFunc,
	);
})();

test('/pilot', 'POST', { name: 'Peter' }, (result) => {
	it('should insert a pilot', () => {
		expect(result)
			.to.be.a.query.that.inserts.fields('name')
			.values(['Bind', ['pilot', 'name']])
			.from('pilot');
	});
});

test('/pilot__can_fly__plane(1)', 'DELETE', (result) => {
	it('should delete the pilot__can_fly__plane with id 1', () => {
		expect(result)
			.to.be.a.query.that.deletes.from('pilot-can fly-plane')
			.where([
				'IsNotDistinctFrom',
				['ReferencedField', 'pilot-can fly-plane', 'id'],
				['Bind', 0],
			]);
	});
});

test('/pilot__can_fly__plane(1)', 'PUT', (result) => {
	describe('should upsert the pilot__can_fly__plane with id 1', function () {
		const whereClause = [
			'IsNotDistinctFrom',
			['ReferencedField', 'pilot-can fly-plane', 'id'],
			['Bind', 0],
		];
		it('should be an upsert', () => expect(result).to.be.a.query.that.upserts);
		it('that inserts', () => {
			expect(result[1])
				.to.be.a.query.that.inserts.fields('id')
				.values(
					'SelectQuery',
					['Select', [['ReferencedField', '$insert', 'id']]],
					[
						'From',
						[
							'Alias',
							[
								'ConvertRow',
								[
									'SelectQuery',
									[
										'Select',
										[
											['Alias', ['Cast', ['Null'], 'Date Time'], 'created at'],
											['Alias', ['Cast', ['Null'], 'Date Time'], 'modified at'],
											['Alias', ['Cast', ['Null'], 'ForeignKey'], 'pilot'],
											[
												'Alias',
												['Cast', ['Null'], 'ForeignKey'],
												'can fly-plane',
											],
											[
												'Alias',
												[
													'Cast',
													['Bind', ['pilot-can fly-plane', 'id']],
													'Serial',
												],
												'id',
											],
										],
									],
								],
								['Table', 'pilot-can fly-plane'],
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
										'pilot-can fly-plane',
									],
								],
								[
									'Where',
									[
										'IsNotDistinctFrom',
										['ReferencedField', 'pilot-can fly-plane', 'id'],
										['Bind', 0],
									],
								],
							],
						],
					],
				)
				.from('pilot-can fly-plane');
		});
		it('and updates', () => {
			expect(result[2])
				.to.be.a.query.that.updates.fields(
					'created at',
					'modified at',
					'pilot',
					'can fly-plane',
					'id',
				)
				.values('Default', 'Default', 'Default', 'Default', [
					'Bind',
					['pilot-can fly-plane', 'id'],
				])
				.from('pilot-can fly-plane')
				.where(whereClause);
		});
	});
});

(function () {
	const testFunc = (result) => {
		it('should update the pilot__can_fly__plane with id 1', () => {
			expect(result)
				.to.be.a.query.that.updates.fields('pilot')
				.values(['Bind', ['pilot-can fly-plane', 'pilot']])
				.from('pilot-can fly-plane')
				.where([
					'IsNotDistinctFrom',
					['ReferencedField', 'pilot-can fly-plane', 'id'],
					['Bind', 0],
				]);
		});
	};
	test('/pilot__can_fly__plane(1)', 'PATCH', { pilot: 2 }, testFunc);
	test('/pilot__can_fly__plane(1)', 'MERGE', { pilot: 2 }, testFunc);
})();

test(
	'/pilot__can_fly__plane',
	'POST',
	{ pilot: 2, can_fly__plane: 3 },
	(result) => {
		it('should add a pilot__can_fly__plane', () => {
			expect(result)
				.to.be.a.query.that.inserts.fields('pilot', 'can fly-plane')
				.values(
					['Bind', ['pilot-can fly-plane', 'pilot']],
					['Bind', ['pilot-can fly-plane', 'can_fly__plane']],
				)
				.from('pilot-can fly-plane');
		});
	},
);

test('/pilot(1)/$links/licence', (result) => {
	it('should select the list of licence ids, for generating the links', () => {
		expect(result)
			.to.be.a.query.that.selects([
				['Alias', ['ReferencedField', 'pilot', 'licence'], 'licence'],
			])
			.from('pilot')
			.where([
				'IsNotDistinctFrom',
				['ReferencedField', 'pilot', 'id'],
				['Bind', 0],
			]);
	});
});

test('/pilot(1)/$links/licence(2)', (result) => {
	it('should select the licence id 2, for generating the link', () => {
		expect(result)
			.to.be.a.query.that.selects([
				['Alias', ['ReferencedField', 'pilot', 'licence'], 'licence'],
			])
			.from('pilot')
			.where([
				'And',
				[
					'IsNotDistinctFrom',
					['ReferencedField', 'pilot', 'licence'],
					['Bind', 1],
				],
				['IsNotDistinctFrom', ['ReferencedField', 'pilot', 'id'], ['Bind', 0]],
			]);
	});
});

test("/pilot('Peter')/$links/licence('X')", (result) => {
	it('should select the licence id 2, for generating the link', () => {
		expect(result)
			.to.be.a.query.that.selects([
				['Alias', ['ReferencedField', 'pilot', 'licence'], 'licence'],
			])
			.from('pilot')
			.where([
				'And',
				[
					'IsNotDistinctFrom',
					['ReferencedField', 'pilot', 'licence'],
					['Bind', 1],
				],
				['IsNotDistinctFrom', ['ReferencedField', 'pilot', 'id'], ['Bind', 0]],
			]);
	});
});

test('/pilot(1)/can_fly__plane/$links/plane', (result) => {
	it('should select the list of plane ids, for generating the links', () => {
		expect(result)
			.to.be.a.query.that.selects([
				[
					'Alias',
					['ReferencedField', 'pilot.pilot-can fly-plane', 'can fly-plane'],
					'plane',
				],
			])
			.from('pilot', ['pilot-can fly-plane', 'pilot.pilot-can fly-plane'])
			.where([
				'And',
				[
					'Equals',
					['ReferencedField', 'pilot', 'id'],
					['ReferencedField', 'pilot.pilot-can fly-plane', 'pilot'],
				],
				['IsNotDistinctFrom', ['ReferencedField', 'pilot', 'id'], ['Bind', 0]],
			]);
	});
});

test.skip('/pilot(1)/favourite_colour/red', () => {
	it("should select the red component of the pilot's favourite colour");
});

test.skip('/method(1)/child?foo=bar', () => it('should do something..'));

test("/team('purple')", (result) => {
	it('should select the team with the "favourite colour" id of "purple"', () => {
		expect(result)
			.to.be.a.query.that.selects(teamFields)
			.from('team')
			.where([
				'IsNotDistinctFrom',
				['ReferencedField', 'team', 'favourite colour'],
				['Bind', 0],
			]);
	});
});

test('/team', 'POST', { favourite_colour: 'purple' }, (result) => {
	it('should insert a team', () => {
		expect(result)
			.to.be.a.query.that.inserts.fields('favourite colour')
			.values(['Bind', ['team', 'favourite_colour']])
			.from('team');
	});
});

{
	const teamKeyWhere = [
		'IsNotDistinctFrom',
		['ReferencedField', 'team', 'favourite colour'],
		['Bind', 0],
	];
	const teamKeyInsertValues = [
		'SelectQuery',
		['Select', [['ReferencedField', '$insert', 'favourite colour']]],
		[
			'From',
			[
				'Alias',
				[
					'ConvertRow',
					[
						'SelectQuery',
						[
							'Select',
							[
								['Alias', ['Cast', ['Null'], 'Date Time'], 'created at'],
								['Alias', ['Cast', ['Null'], 'Date Time'], 'modified at'],
								[
									'Alias',
									['Cast', ['Bind', ['team', 'favourite_colour']], 'Color'],
									'favourite colour',
								],
							],
						],
					],
					['Table', 'team'],
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
					['Where', teamKeyWhere],
				],
			],
		],
	];

	const postBody = {};
	test("/team('purple')", 'POST', postBody, (result) => {
		it('should insert a team using the key as its "favourite colour" id', () => {
			expect(result)
				.to.be.a.query.that.inserts.fields('favourite colour')
				.values(...teamKeyInsertValues)
				.from('team');
		});
		it('should add the key to the body using the OData field name', () => {
			expect(postBody).to.deep.equal({
				'team.favourite_colour': { bind: 0 },
			});
		});
	});

	test("/team('purple')", 'PUT', {}, (result) => {
		describe('should upsert the team with the "favourite colour" id of "purple"', function () {
			it('should be an upsert', () =>
				expect(result).to.be.a.query.that.upserts);
			it('that inserts using the key as its id', () => {
				expect(result[1])
					.to.be.a.query.that.inserts.fields('favourite colour')
					.values(...teamKeyInsertValues)
					.from('team');
			});
			it('and updates without resetting its id to the default', () => {
				expect(result[2])
					.to.be.a.query.that.updates.fields(
						'created at',
						'modified at',
						'favourite colour',
					)
					.values('Default', 'Default', ['Bind', ['team', 'favourite_colour']])
					.from('team')
					.where(teamKeyWhere);
			});
		});
	});
}

test('/pilot/$count/$count', (result) => {
	it('should fail because it is invalid', () => {
		expect(result).to.be.instanceOf(ODataParser.SyntaxError);
	});
});

test('/pilot/$count', (result) => {
	it('should select count(*) from pilot', () => {
		expect(result).to.be.a.query.that.selects($count).from('pilot');
	});
});

test('/pilot(5)/$count', (result) => {
	it('should fail because it is invalid', () => {
		expect(result).to.be.instanceOf(ODataParser.SyntaxError);
	});
});

test('/pilot?$filter=id eq 5/$count', (result) => {
	it('should fail because it is invalid', () => {
		expect(result).to.be.instanceOf(ODataParser.SyntaxError);
	});
});

test('/pilot/$count?$filter=id gt 5', (result) => {
	it('should select count(*) from pilot where pilot/id > 5 ', () => {
		expect(result)
			.to.be.a.query.that.selects($count)
			.from('pilot')
			.where(['GreaterThan', ['ReferencedField', 'pilot', 'id'], ['Bind', 0]]);
	});
});

test('/pilot/$count?$filter=id eq 5 or id eq 10', (result) => {
	it('should select count(*) from pilot where id in (5,10)', () => {
		expect(result)
			.to.be.a.query.that.selects($count)
			.from('pilot')
			.where([
				'Or',
				['IsNotDistinctFrom', ['ReferencedField', 'pilot', 'id'], ['Bind', 0]],
				['IsNotDistinctFrom', ['ReferencedField', 'pilot', 'id'], ['Bind', 1]],
			]);
	});
});

test('/pilot(5)/licence/$count', (result) => {
	it('should select count(*) the licence from pilot where pilot/id', () => {
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
				['IsNotDistinctFrom', ['ReferencedField', 'pilot', 'id'], ['Bind', 0]],
			]);
	});
});

// $orderby/$top/$skip cannot affect a count, so they are rejected rather than silently ignored
for (const [url, option] of [
	['/pilot/$count?$orderby=id asc', '$orderby'],
	['/pilot/$count?$skip=5', '$skip'],
	['/pilot/$count?$top=5', '$top'],
	['/pilot/$count?$top=5&$skip=5', '$top'],
]) {
	test(url, (result) => {
		it(`should fail as ${option} cannot be used with $count`, () => {
			expect(result)
				.to.be.instanceOf(SyntaxError)
				.and.to.have.property('message', `Cannot use ${option} with $count`);
		});
	});
}

test('/pilot/$count?$select=id', (result) => {
	it('should select count(*) from pilot and ignore select', () => {
		expect(result)
			.to.be.a.query.that.selects($count)
			.from('pilot')
			.and.has.a.lengthOf(3);
	});
});
