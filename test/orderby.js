import { expect } from 'chai';
import {
	operandToAbstractSQLFactory,
	pilotFields,
	teamFields,
} from './chai-sql';
import test from './test';

const operandToAbstractSQL = operandToAbstractSQLFactory();

test('/pilot?$orderby=name', (result) =>
	it('should order by name desc', () =>
		expect(result)
			.to.be.a.query.that.selects(pilotFields)
			.from('pilot')
			.orderby(['DESC', operandToAbstractSQL('name')])));

test('/pilot?$orderby=name,age', (result) =>
	it('should order by name desc, age desc', () =>
		expect(result)
			.to.be.a.query.that.selects(pilotFields)
			.from('pilot')
			.orderby(
				['DESC', operandToAbstractSQL('name')],
				['DESC', operandToAbstractSQL('age')],
			)));

test('/pilot?$orderby=name desc', (result) =>
	it('should order by name desc', () =>
		expect(result)
			.to.be.a.query.that.selects(pilotFields)
			.from('pilot')
			.orderby(['DESC', operandToAbstractSQL('name')])));

test('/pilot?$orderby=name asc', (result) =>
	it('should order by name asc', () =>
		expect(result)
			.to.be.a.query.that.selects(pilotFields)
			.from('pilot')
			.orderby(['ASC', operandToAbstractSQL('name')])));

test('/pilot?$orderby=name asc,age desc', (result) =>
	it('should order by name desc, age desc', () =>
		expect(result)
			.to.be.a.query.that.selects(pilotFields)
			.from('pilot')
			.orderby(
				['ASC', operandToAbstractSQL('name')],
				['DESC', operandToAbstractSQL('age')],
			)));

test('/pilot?$orderby=licence/id asc', (result) =>
	it('should order by licence/id asc', () =>
		expect(result)
			.to.be.a.query.that.selects(pilotFields)
			.from('pilot', ['licence', 'pilot.licence'])
			.where([
				'Equals',
				['ReferencedField', 'pilot', 'licence'],
				['ReferencedField', 'pilot.licence', 'id'],
			])
			.orderby(['ASC', operandToAbstractSQL('licence/id')])));

test('/pilot?$orderby=can_fly__plane/plane/id asc', (result) =>
	it('should order by can_fly__plane/plane/id asc', () =>
		expect(result)
			.to.be.a.query.that.selects(pilotFields)
			.from(
				'pilot',
				['pilot-can fly-plane', 'pilot.pilot-can fly-plane'],
				['plane', 'pilot.pilot-can fly-plane.plane'],
			)
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
			])
			.orderby(['ASC', operandToAbstractSQL('can_fly__plane/plane/id')])));

test.skip('/pilot?$orderby=favourite_colour/red', () =>
	it("should order by how red the pilot's favourite colour is"));

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
