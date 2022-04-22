import { expect } from 'chai';

import {
	aliasFields,
	pilotFields,
	licenceFields,
	planeFields,
	teamFields,
	pilotCanFlyPlaneFields,
	$count,
} from './chai-sql';

import test from './test';
import * as ODataParser from '@balena/odata-parser';

test('/', (result) =>
	it('Service root should return $serviceroot', () =>
		expect(result).to.deep.equal(['$serviceroot'])));

test('/$metadata', (result) =>
	it('$metadata should return $metadata', () =>
		expect(result).to.deep.equal(['$metadata'])));

test('/pilot', (result) =>
	it('should select from pilot', () =>
		expect(result).to.be.a.query.that.selects(pilotFields).from('pilot')));

test('/aircraft', (result) =>
	it('should select from aircraft (plane)', () =>
		expect(result).to.be.a.query.that.selects(planeFields).from('plane')));

test('/pilot__can_fly__aircraft', (result) =>
	it('should select from pilot can fly aircraft (pilot can fly plane)', () =>
		expect(result)
			.to.be.a.query.that.selects(pilotCanFlyPlaneFields)
			.from('pilot-can fly-plane')));

test('/pilot(1)', (result) =>
	it('should select from pilot with id', () =>
		expect(result)
			.to.be.a.query.that.selects(pilotFields)
			.from('pilot')
			.where([
				'IsNotDistinctFrom',
				['ReferencedField', 'pilot', 'id'],
				['Bind', 0],
			])));

test('/pilot(0)', (result) =>
	it('should select from pilot with id', () =>
		expect(result)
			.to.be.a.query.that.selects(pilotFields)
			.from('pilot')
			.where([
				'IsNotDistinctFrom',
				['ReferencedField', 'pilot', 'id'],
				['Bind', 0],
			])));

test("/pilot('TextKey')", (result) =>
	it('should select from pilot with id', () =>
		expect(result)
			.to.be.a.query.that.selects(pilotFields)
			.from('pilot')
			.where([
				'IsNotDistinctFrom',
				['ReferencedField', 'pilot', 'id'],
				['Bind', 0],
			])));

test('/pilot(id=1)', (result) =>
	it('should select from pilot with id', () =>
		expect(result)
			.to.be.a.query.that.selects(pilotFields)
			.from('pilot')
			.where([
				'IsNotDistinctFrom',
				['ReferencedField', 'pilot', 'id'],
				['Bind', 0],
			])));

test("/pilot(id='TextKey')", (result) =>
	it('should select from pilot with id', () =>
		expect(result)
			.to.be.a.query.that.selects(pilotFields)
			.from('pilot')
			.where([
				'IsNotDistinctFrom',
				['ReferencedField', 'pilot', 'id'],
				['Bind', 0],
			])));

test('/pilot__can_fly__plane(pilot=12,can_fly__plane=23)', (result) =>
	it('should select from pilot with id', () =>
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
			])));

test('/pilot(1)/licence', (result) =>
	it('should select from the licence of pilot with id', () =>
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
			])));

test('/licence(1)/is_of__pilot', (result) =>
	it('should select from the pilots of licence with id', () =>
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
			])));

test('/pilot(1)/can_fly__plane/plane', (result) =>
	it('should select from the plane of pilot with id', () =>
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
			])));

test('/plane(1)/can_be_flown_by__pilot/pilot', (result) =>
	it('should select from the pilots of plane with id', () =>
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
			])));

test('/pilot(1)', 'DELETE', (result) =>
	it('should delete the pilot with id 1', () =>
		expect(result)
			.to.be.a.query.that.deletes.from('pilot')
			.where([
				'IsNotDistinctFrom',
				['ReferencedField', 'pilot', 'id'],
				['Bind', 0],
			])),
);

test('/pilot(1)', 'PUT', (result) =>
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
								'SelectQuery',
								[
									'Select',
									[
										['Alias', ['Cast', ['Null'], 'Date Time'], 'created at'],
										['Alias', ['Cast', ['Null'], 'Date Time'], 'modified at'],
										[
											'Alias',
											['Cast', ['Bind', 'pilot', 'id'], 'Serial'],
											'id',
										],
										['Alias', ['Cast', ['Null'], 'ConceptType'], 'person'],
										['Alias', ['Cast', ['Null'], 'Boolean'], 'is experienced'],
										['Alias', ['Cast', ['Null'], 'Short Text'], 'name'],
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
					['Bind', 'pilot', 'id'],
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
	}),
);

(function () {
	const testFunc = (result) =>
		it('should update the pilot with id 1', () =>
			expect(result)
				.to.be.a.query.that.updates.fields('is experienced', 'favourite colour')
				.values(
					['Bind', 'pilot', 'is_experienced'],
					['Bind', 'pilot', 'favourite_colour'],
				)
				.from('pilot')
				.where([
					'IsNotDistinctFrom',
					['ReferencedField', 'pilot', 'id'],
					['Bind', 0],
				]));
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

test('/pilot', 'POST', { name: 'Peter' }, (result) =>
	it('should insert a pilot', () =>
		expect(result)
			.to.be.a.query.that.inserts.fields('name')
			.values(['Bind', 'pilot', 'name'])
			.from('pilot')),
);

test('/pilot__can_fly__plane(1)', 'DELETE', (result) =>
	it('should delete the pilot__can_fly__plane with id 1', () =>
		expect(result)
			.to.be.a.query.that.deletes.from('pilot-can fly-plane')
			.where([
				'IsNotDistinctFrom',
				['ReferencedField', 'pilot-can fly-plane', 'id'],
				['Bind', 0],
			])),
);

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
											['Cast', ['Bind', 'pilot-can fly-plane', 'id'], 'Serial'],
											'id',
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
					'pilot-can fly-plane',
					'id',
				])
				.from('pilot-can fly-plane')
				.where(whereClause);
		});
	});
});

(function () {
	const testFunc = (result) =>
		it('should update the pilot__can_fly__plane with id 1', () => {
			expect(result)
				.to.be.a.query.that.updates.fields('pilot')
				.values(['Bind', 'pilot-can fly-plane', 'pilot'])
				.from('pilot-can fly-plane')
				.where([
					'IsNotDistinctFrom',
					['ReferencedField', 'pilot-can fly-plane', 'id'],
					['Bind', 0],
				]);
		});
	test('/pilot__can_fly__plane(1)', 'PATCH', { pilot: 2 }, testFunc);
	test('/pilot__can_fly__plane(1)', 'MERGE', { pilot: 2 }, testFunc);
})();

test(
	'/pilot__can_fly__plane',
	'POST',
	{ pilot: 2, can_fly__plane: 3 },
	(result) =>
		it('should add a pilot__can_fly__plane', () =>
			expect(result)
				.to.be.a.query.that.inserts.fields('pilot', 'can fly-plane')
				.values(
					['Bind', 'pilot-can fly-plane', 'pilot'],
					['Bind', 'pilot-can fly-plane', 'can_fly__plane'],
				)
				.from('pilot-can fly-plane')),
);

test('/pilot(1)/$links/licence', (result) =>
	it('should select the list of licence ids, for generating the links', () =>
		expect(result)
			.to.be.a.query.that.selects([
				['Alias', ['ReferencedField', 'pilot', 'licence'], 'licence'],
			])
			.from('pilot')
			.where([
				'IsNotDistinctFrom',
				['ReferencedField', 'pilot', 'id'],
				['Bind', 0],
			])));

test('/pilot(1)/$links/licence(2)', (result) =>
	it('should select the licence id 2, for generating the link', () =>
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
			])));

test("/pilot('Peter')/$links/licence('X')", (result) =>
	it('should select the licence id 2, for generating the link', () =>
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
			])));

test('/pilot(1)/can_fly__plane/$links/plane', (result) =>
	it('should select the list of plane ids, for generating the links', () =>
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
			])));

test.skip('/pilot(1)/favourite_colour/red', () =>
	it("should select the red component of the pilot's favourite colour"));

test.skip('/method(1)/child?foo=bar', () => it('should do something..'));

test("/team('purple')", (result) =>
	it('should select the team with the "favourite colour" id of "purple"', () =>
		expect(result)
			.to.be.a.query.that.selects(teamFields)
			.from('team')
			.where([
				'IsNotDistinctFrom',
				['ReferencedField', 'team', 'favourite colour'],
				['Bind', 0],
			])));

test('/team', 'POST', { favourite_colour: 'purple' }, (result) =>
	it('should insert a team', () =>
		expect(result)
			.to.be.a.query.that.inserts.fields('favourite colour')
			.values(['Bind', 'team', 'favourite_colour'])
			.from('team')),
);

test('/pilot/$count/$count', (result) =>
	it('should fail because it is invalid', () =>
		expect(result).to.be.instanceOf(ODataParser.SyntaxError)));

test('/pilot/$count', (result) =>
	it('should select count(*) from pilot', () =>
		expect(result).to.be.a.query.that.selects($count).from('pilot')));

test('/pilot(5)/$count', (result) =>
	it('should fail because it is invalid', () =>
		expect(result).to.be.instanceOf(ODataParser.SyntaxError)));

test('/pilot?$filter=id eq 5/$count', (result) =>
	it('should fail because it is invalid', () =>
		expect(result).to.be.instanceOf(ODataParser.SyntaxError)));

test('/pilot/$count?$filter=id gt 5', (result) =>
	it('should select count(*) from pilot where pilot/id > 5 ', () =>
		expect(result)
			.to.be.a.query.that.selects($count)
			.from('pilot')
			.where([
				'GreaterThan',
				['ReferencedField', 'pilot', 'id'],
				['Bind', 0],
			])));

test('/pilot/$count?$filter=id eq 5 or id eq 10', (result) =>
	it('should select count(*) from pilot where id in (5,10)', () =>
		expect(result)
			.to.be.a.query.that.selects($count)
			.from('pilot')
			.where([
				'Or',
				['IsNotDistinctFrom', ['ReferencedField', 'pilot', 'id'], ['Bind', 0]],
				['IsNotDistinctFrom', ['ReferencedField', 'pilot', 'id'], ['Bind', 1]],
			])));

test('/pilot(5)/licence/$count', (result) =>
	it('should select count(*) the licence from pilot where pilot/id', () =>
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
			])));

test('/pilot/$count?$orderby=id asc', (result) =>
	it('should select count(*) from pilot and ignore orderby', () =>
		expect(result)
			.to.be.a.query.that.selects($count)
			.from('pilot')
			.and.has.a.lengthOf(3)));

test('/pilot/$count?$skip=5', (result) =>
	it('should select count(*) from pilot and ignore skip', () =>
		expect(result)
			.to.be.a.query.that.selects($count)
			.from('pilot')
			.and.has.a.lengthOf(3)));

test('/pilot/$count?$top=5', (result) =>
	it('should select count(*) from pilot and ignore top', () =>
		expect(result)
			.to.be.a.query.that.selects($count)
			.from('pilot')
			.and.has.a.lengthOf(3)));

test('/pilot/$count?$top=5&$skip=5', (result) =>
	it('should select count(*) from pilot and ignore top and skip', () =>
		expect(result)
			.to.be.a.query.that.selects($count)
			.from('pilot')
			.and.has.a.lengthOf(3)));

test('/pilot/$count?$select=id', (result) =>
	it('should select count(*) from pilot and ignore select', () =>
		expect(result)
			.to.be.a.query.that.selects($count)
			.from('pilot')
			.and.has.a.lengthOf(3)));
