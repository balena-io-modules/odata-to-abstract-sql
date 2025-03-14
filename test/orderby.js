import { expect } from 'chai';
import {
	operandToAbstractSQLFactory,
	pilotFields,
	teamFields,
} from './chai-sql';
import test from './test';

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

test('/pilot?$orderby=name asc,age desc', (result) => {
	it('should order by name desc, age desc', () => {
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
			.orderby(['ASC', operandToAbstractSQL('licence/id')]);
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

test('/pilot?$orderby=licence/name asc,licence/id asc', (result) => {
	it('should order pilot by licence/name asc and licence/id asc', () => {
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
			.orderby(
				['ASC', operandToAbstractSQL('licence/name')],
				['ASC', operandToAbstractSQL('licence/id')],
			);
	});
});

test(`/pilot?$orderby=identification_method(1)/identification_number desc`, (result) => {
	it('should fail to order pilots by their passport number when using a promitive key', () => {
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
	it('should order pilots by their passport number when defining part of the alternate key and infering the rest from the navigation', () => {
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
