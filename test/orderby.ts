import { expect } from 'chai';
import {
	operandToAbstractSQLFactory,
	pilotFields,
	teamFields,
} from './chai-sql.js';
import test, { itExpectsError } from './test.js';

const operandToAbstractSQL = operandToAbstractSQLFactory();

test('/pilot?$orderby=name', (result) => {
	it('should order by name desc', () => {
		expect(result)
			.to.be.a.query.that.selects(pilotFields)
			.from('pilot')
			.orderby(['DESC', operandToAbstractSQL('name')]);
	});
});

test('/pilot?$orderby=name,age', (result) => {
	it('should order by name desc, age desc', () => {
		expect(result)
			.to.be.a.query.that.selects(pilotFields)
			.from('pilot')
			.orderby(
				['DESC', operandToAbstractSQL('name')],
				['DESC', operandToAbstractSQL('age')],
			);
	});
});

test('/pilot?$orderby=name desc', (result) => {
	it('should order by name desc', () => {
		expect(result)
			.to.be.a.query.that.selects(pilotFields)
			.from('pilot')
			.orderby(['DESC', operandToAbstractSQL('name')]);
	});
});

test('/pilot?$orderby=name asc', (result) => {
	it('should order by name asc', () => {
		expect(result)
			.to.be.a.query.that.selects(pilotFields)
			.from('pilot')
			.orderby(['ASC', operandToAbstractSQL('name')]);
	});
});

test('/pilot?$orderby=p/name asc', (result) => {
	it('should fail to order by name asc using a non-existing alias', () => {
		expect(result)
			.to.be.instanceOf(SyntaxError)
			.and.to.have.property(
				'message',
				`Could not resolve relationship mapping from 'pilot' to 'p'`,
			);
	});
});

test('/pilot?$orderby=name asc,age desc', (result) => {
	it('should order by name asc, age desc', () => {
		expect(result)
			.to.be.a.query.that.selects(pilotFields)
			.from('pilot')
			.orderby(
				['ASC', operandToAbstractSQL('name')],
				['DESC', operandToAbstractSQL('age')],
			);
	});
});

test('/pilot?$orderby=licence/id asc', (result) => {
	it('should order by licence/id asc', () => {
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
			.where()
			.orderby(['ASC', operandToAbstractSQL('licence/id')]);
	});
});

test('/pilot?$orderby=licence/name asc,licence/id desc', (result) => {
	it('should order by licence/name asc, licence/id desc w/o JOINing the licence twice', () => {
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
			.where()
			.orderby(
				['ASC', operandToAbstractSQL('licence/name')],
				['DESC', operandToAbstractSQL('licence/id')],
			);
	});
});

test('/pilot?$orderby=can_fly__plane/plane/id asc', (result) => {
	it('should order by can_fly__plane/plane/id asc', () => {
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
			.orderby(['ASC', operandToAbstractSQL('can_fly__plane/plane/id')]);
	});
});

test('/pilot?$orderby=can_fly__plane/plane/name desc,can_fly__plane/plane/id asc', (result) => {
	it('should order by can_fly__plane/plane/name desc, can_fly__plane/plane/id asc w/o JOINing the resources twice', () => {
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
			.where()
			.orderby(
				['DESC', operandToAbstractSQL('can_fly__plane/plane/name')],
				['ASC', operandToAbstractSQL('can_fly__plane/plane/id')],
			);
	});
});

test.skip('/pilot?$orderby=favourite_colour/red', () => {
	it("should order by how red the pilot's favourite colour is");
});

test('/pilot?$orderby=trained__pilot/$count asc', (result) => {
	it('should order pilots by how many other pilots they have trained', () => {
		expect(result)
			.to.be.a.query.that.selects(pilotFields)
			.from('pilot')
			.orderby([
				'ASC',
				[
					'SelectQuery',
					['Select', [['Count', '*']]],
					['From', ['Alias', ['Table', 'pilot'], 'pilot.trained-pilot']],
					[
						'Where',
						[
							'Equals',
							['ReferencedField', 'pilot', 'id'],
							[
								'ReferencedField',
								'pilot.trained-pilot',
								'was trained by-pilot',
							],
						],
					],
				],
			]);
	});
});

test('/pilot?$orderby=trained__pilot/$count($filter=is_experienced eq true) asc', (result) => {
	it('should order pilots by how many other pilots that they have trained are now experienced', () => {
		expect(result)
			.to.be.a.query.that.selects(pilotFields)
			.from('pilot')
			.orderby([
				'ASC',
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
			]);
	});
});

test('/team?$orderby=includes__pilot/$count desc', (result) => {
	it('should order teams by the number of pilots', () => {
		expect(result)
			.to.be.a.query.that.selects(teamFields)
			.from('team')
			.orderby([
				'DESC',
				[
					'SelectQuery',
					['Select', [['Count', '*']]],
					['From', ['Alias', ['Table', 'pilot'], 'team.includes-pilot']],
					[
						'Where',
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
					],
				],
			]);
	});
});

test('/team?$orderby=includes__pilot/$count($filter=is_experienced eq true) desc', (result) => {
	it('should order teams by the number of pilots that are experienced', () => {
		expect(result)
			.to.be.a.query.that.selects(teamFields)
			.from('team')
			.orderby([
				'DESC',
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
			]);
	});
});

test('/pilot?$select=name,licence/name&$orderby=name asc,licence/name desc', function (result) {
	it('should select from pilot.name, licence.name, ordered by the pilot name asc and licence name desc w/o JOINing the licence twice', () => {
		expect(result)
			.to.be.a.query.that.selects([
				operandToAbstractSQL('name'),
				operandToAbstractSQL('licence/name'),
			])
			.from('pilot')
			.leftJoin([
				['licence', 'pilot.licence'],
				[
					'Equals',
					['ReferencedField', 'pilot', 'licence'],
					['ReferencedField', 'pilot.licence', 'id'],
				],
			])
			.where()
			.orderby(
				['ASC', operandToAbstractSQL('name')],
				['DESC', operandToAbstractSQL('licence/name')],
			);
	});
});

test(`/pilot?$orderby=identification_method(1)/identification_number desc`, (result) => {
	it('should fail to order pilots by their passport number when using a primitive key', () => {
		expect(result)
			.to.be.instanceOf(SyntaxError)
			.and.to.have.property(
				'message',
				'Using a key bind after a navigation expression is not supported.',
			);
	});
});

test(`/pilot?$orderby=identification_method(pilot=1)/identification_number desc`, (result) => {
	it('should fail to order by an associated resource when providing the navigated FK of the associated resource as the only part of the alternate key', () => {
		expect(result)
			.to.be.instanceOf(SyntaxError)
			.and.to.have.property(
				'message',
				'Specified already navigated field as part of key: pilot',
			);
	});
});

test(`/pilot?$orderby=identification_method(pilot=1,identification_type='passport')/identification_number desc`, (result) => {
	it('should fail to order by an associated resource when providing the navigated FK of the associated resource as part of the alternate key', () => {
		expect(result)
			.to.be.instanceOf(SyntaxError)
			.and.to.have.property(
				'message',
				'Specified already navigated field as part of key: pilot',
			);
	});
});

test(`/pilot?$orderby=identification_method(identification_type='passport') desc`, (result) => {
	it('should fail to order by an associated resource when not defining the associated resource field', () => {
		expect(result)
			.to.be.instanceOf(SyntaxError)
			.and.to.have.property(
				'message',
				'Attempted to directly fetch a virtual field: "identification_method"',
			);
	});
});

test(`/pilot?$orderby=identification_method(not_a_field='12345')/identification_number desc`, (result) => {
	it('should fail to order pilots when the field provided as an alternate key does not exist', () => {
		expect(result)
			.to.be.instanceOf(SyntaxError)
			.and.to.have.property(
				'message',
				'Specified non-existent field for path key',
			);
	});
});

test(`/pilot?$orderby=identification_method(identification_number='12345')/identification_number desc`, (result) => {
	it('should fail to order pilots when the field provided as an alternate key does not complete a natural key when combined with the navigation field', () => {
		expect(result)
			.to.be.instanceOf(SyntaxError)
			.and.to.have.property(
				'message',
				'Specified fields for path key that are not directly unique',
			);
	});
});

test(`/pilot?$orderby=identification_method(identification_type='passport',identification_number='12345')/identification_number desc`, (result) => {
	it('should fail to order pilots when the field provided as an alternate key does not complete a natural key when combined with the navigation field', () => {
		expect(result)
			.to.be.instanceOf(SyntaxError)
			.and.to.have.property(
				'message',
				'Specified fields for path key that are not directly unique',
			);
	});
});

test(`/pilot?$orderby=identification_method(identification_type='passport')/identification_number desc`, (result) => {
	it('should order pilots by their passport number when using part of the alternate key and infering the rest from the navigation', () => {
		expect(result)
			.to.be.a.query.that.selects(pilotFields)
			.from('pilot')
			.leftJoin([
				['identification method', 'pilot.identification method'],
				[
					'And',
					[
						'Equals',
						['ReferencedField', 'pilot', 'id'],
						['ReferencedField', 'pilot.identification method', 'pilot'],
					],
					[
						'IsNotDistinctFrom',
						[
							'ReferencedField',
							'pilot.identification method',
							'identification type',
						],
						['Bind', 0],
					],
				],
			])
			.orderby([
				'DESC',
				[
					'ReferencedField',
					'pilot.identification method',
					'identification number',
				],
			]);
	});
});

test(`/pilot?$orderby=identification_method(identification_type='passport')/identification_number desc,identification_method(identification_type='id card')/identification_number desc`, (result) => {
	it('should order pilots by their passport number & then their ID when using part of the alternate key and infering the rest from the navigation', () => {
		expect(result)
			.to.be.instanceOf(Error)
			.and.to.have.property(
				'message',
				`Adding JOINs on the same resource with different ON clauses is not supported. Found pilot.identification method`,
			);
	});
});

test(`/pilot?$orderby=identification_method(identification_type='passport')/identification_number desc,identification_method(identification_type='passport')/created_at desc`, (result) => {
	// TODO: This atm doens't work b/c the two JOINs are generated with differnet Bind numbers
	itExpectsError(
		`should order pilots by their passport's creation date and then by its number`,
		() => {
			expect(result)
				.to.be.a.query.that.selects(pilotFields)
				.from('pilot')
				.leftJoin([
					['identification method', 'pilot.identification method'],
					[
						'And',
						[
							'Equals',
							['ReferencedField', 'pilot', 'id'],
							['ReferencedField', 'pilot.identification method', 'pilot'],
						],
						[
							'IsNotDistinctFrom',
							[
								'ReferencedField',
								'pilot.identification method',
								'identification type',
							],
							['Bind', 0],
						],
					],
				])
				.orderby(
					[
						'DESC',
						[
							'ReferencedField',
							'pilot.identification method',
							'identification number',
						],
					],
					[
						'DESC',
						['ReferencedField', 'pilot.identification method', 'created at'],
					],
				);
		},
		'expected SyntaxError: Adding JOINs on the same res… to be an instance of Array',
	);
});

test(`/pilot?$select=name,identification_method(identification_type='passport')/identification_number&$orderby=identification_method(identification_type='passport')/created_at desc`, (result) => {
	// TODO: This atm doens't work b/c the two JOINs are generated with differnet Bind numbers
	itExpectsError(
		`should order pilots by their passport's creation date and select their passport number`,
		() => {
			expect(result)
				.to.be.a.query.that.selects([
					operandToAbstractSQL('name'),
					[
						'Alias',
						[
							'ReferencedField',
							'pilot.identification method',
							'identification number',
						],
						'identification_number',
					],
				])
				.from('pilot')
				.leftJoin([
					['identification method', 'pilot.identification method'],
					[
						'And',
						[
							'Equals',
							['ReferencedField', 'pilot', 'id'],
							['ReferencedField', 'pilot.identification method', 'pilot'],
						],
						[
							'IsNotDistinctFrom',
							[
								'ReferencedField',
								'pilot.identification method',
								'identification type',
							],
							['Bind', 0],
						],
					],
				])
				.orderby([
					'DESC',
					['ReferencedField', 'pilot.identification method', 'created at'],
				]);
		},
		'expected SyntaxError: Adding JOINs on the same res… to be an instance of Array',
	);
});
