import { expect } from 'chai';
import {
	operandToAbstractSQLFactory,
	aliasFields,
	pilotFields,
} from './chai-sql';
import test, { itExpectsError } from './test';
import _ from 'lodash';

const operandToAbstractSQL = operandToAbstractSQLFactory();

const pilotName = pilotFields.filter((field) => field[2] === 'name')[0];
const pilotAge = pilotFields.filter((field) => field[2] === 'age')[0];
test('/pilot?$select=name', (result) => {
	it('should select name from pilot', () => {
		expect(result).to.be.a.query.that.selects([pilotName]).from('pilot');
	});
});

test('/pilot?$select=p/name', (result) => {
	// TODO: This should fail
	it('should select name from pilot using a non-existing alias', () => {
		expect(result).to.be.a.query.that.selects([pilotName]).from('pilot');
	});
});

test('/pilot?$select=favourite_colour', (result) => {
	it('should select favourite_colour from pilot', () => {
		expect(result)
			.to.be.a.query.that.selects(
				_.filter(pilotFields, { 2: 'favourite_colour' }),
			)
			.from('pilot');
	});
});

test('/pilot(1)?$select=favourite_colour', (result) => {
	it('should select from pilot with id', () => {
		expect(result)
			.to.be.a.query.that.selects(
				_.filter(pilotFields, { 2: 'favourite_colour' }),
			)
			.from('pilot')
			.where([
				'IsNotDistinctFrom',
				['ReferencedField', 'pilot', 'id'],
				['Bind', 0],
			]);
	});
});

test("/pilot('TextKey')?$select=favourite_colour", (result) => {
	it('should select from pilot with id', () => {
		expect(result)
			.to.be.a.query.that.selects(
				_.filter(pilotFields, { 2: 'favourite_colour' }),
			)
			.from('pilot')
			.where([
				'IsNotDistinctFrom',
				['ReferencedField', 'pilot', 'id'],
				['Bind', 0],
			]);
	});
});

test('/pilot?$select=was_trained_by__pilot/name', (result) => {
	it('should select name from pilot', () => {
		expect(result)
			.to.be.a.query.that.selects(
				aliasFields('pilot', [pilotName], 'was trained by'),
			)
			.from('pilot')
			.leftJoin([
				['pilot', 'pilot.was trained by-pilot'],
				[
					'Equals',
					['ReferencedField', 'pilot', 'was trained by-pilot'],
					['ReferencedField', 'pilot.was trained by-pilot', 'id'],
				],
			])
			.where();
	});
});

test('/pilot?$select=p/was_trained_by__pilot/name', (result) => {
	// TODO: This should fail
	it('generates invalid select name from pilot query when using a non-existing alias', () => {
		expect(result)
			.to.be.a.query.that.selects(
				aliasFields('pilot', [pilotName], 'was trained by'),
			)
			.from('pilot')
			.where();
	});
});

test('/pilot?$select=was_trained_by__pilot/p/name', (result) => {
	// TODO: This should fail
	it('should select name from pilot when using an invalid path', () => {
		expect(result)
			.to.be.a.query.that.selects(
				aliasFields('pilot', [pilotName], 'was trained by'),
			)
			.from('pilot')
			.leftJoin([
				['pilot', 'pilot.was trained by-pilot'],
				[
					'Equals',
					['ReferencedField', 'pilot', 'was trained by-pilot'],
					['ReferencedField', 'pilot.was trained by-pilot', 'id'],
				],
			])
			.where();
	});
});

test('/pilot?$select=was_trained_by__pilot/p', (result) => {
	it('should fail to select from pilot when using an invalid path', () => {
		expect(result)
			.to.be.instanceOf(SyntaxError)
			.and.to.have.property(
				'message',
				`Could not resolve relationship mapping from 'pilot' to 'p'`,
			);
	});
});

test('/pilot?$select=trained__pilot/name', (result) => {
	it('should select name from pilot', () => {
		expect(result)
			.to.be.a.query.that.selects(aliasFields('pilot', [pilotName], 'trained'))
			.from('pilot')
			.leftJoin([
				['pilot', 'pilot.trained-pilot'],
				[
					'Equals',
					['ReferencedField', 'pilot', 'id'],
					['ReferencedField', 'pilot.trained-pilot', 'was trained by-pilot'],
				],
			])
			.where();
	});
});

test('/pilot?$select=was_trained_by__pilot/name,trained__pilot/name', (result) => {
	it('should select name from pilot', () => {
		expect(result)
			.to.be.a.query.that.selects(
				aliasFields('pilot', [pilotName], 'was trained by').concat(
					aliasFields('pilot', [pilotName], 'trained'),
				),
			)
			.from('pilot')
			.leftJoin(
				[
					['pilot', 'pilot.was trained by-pilot'],
					[
						'Equals',
						['ReferencedField', 'pilot', 'was trained by-pilot'],
						['ReferencedField', 'pilot.was trained by-pilot', 'id'],
					],
				],
				[
					['pilot', 'pilot.trained-pilot'],
					[
						'Equals',
						['ReferencedField', 'pilot', 'id'],
						['ReferencedField', 'pilot.trained-pilot', 'was trained by-pilot'],
					],
				],
			)
			.where();
	});
});

test('/pilot?$select=trained__pilot/name,age', (result) => {
	it('should select name, age from pilot', () => {
		expect(result)
			.to.be.a.query.that.selects(
				aliasFields('pilot', [pilotName], 'trained').concat([pilotAge]),
			)
			.from('pilot')
			.leftJoin([
				['pilot', 'pilot.trained-pilot'],
				[
					'Equals',
					['ReferencedField', 'pilot', 'id'],
					['ReferencedField', 'pilot.trained-pilot', 'was trained by-pilot'],
				],
			])
			.where();
	});
});

test('/pilot?$select=*', (result) => {
	it('should select * from pilot', () => {
		expect(result).to.be.a.query.that.selects(pilotFields).from('pilot');
	});
});

test('/pilot?$select=licence/id', (result) => {
	it('should select licence/id for pilots', () => {
		expect(result)
			.to.be.a.query.that.selects([operandToAbstractSQL('licence/id')])
			.from('pilot')
			.leftJoin([
				['licence', 'pilot.licence'],
				[
					'Equals',
					['ReferencedField', 'pilot', 'licence'],
					['ReferencedField', 'pilot.licence', 'id'],
				],
			])
			.where();
	});
});

test('/pilot?$select=can_fly__plane/plane/id', (result) => {
	it('should select can_fly__plane/plane/id for pilots', () => {
		expect(result)
			.to.be.a.query.that.selects([
				operandToAbstractSQL('can_fly__plane/plane/id'),
			])
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
			.where();
	});
});

test('/copilot?$select=*', (result) => {
	it('should select * from copilot', () => {
		expect(result).to.be.a.query.to.deep.equal([
			'SelectQuery',
			[
				'Select',
				[
					['Alias', ['ReferencedField', 'copilot', 'created at'], 'created_at'],
					[
						'Alias',
						['ReferencedField', 'copilot', 'modified at'],
						'modified_at',
					],
					['ReferencedField', 'copilot', 'id'],
					['ReferencedField', 'copilot', 'pilot'],
					[
						'Alias',
						['ReferencedField', 'copilot', 'assists-pilot'],
						'assists__pilot',
					],
					['Alias', ['ReferencedField', 'copilot', 'is blocked'], 'is_blocked'],
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
		]);
	});
});

test('/copilot?$select=id,is_blocked,rank', (result) => {
	it('should select * from copilot', () => {
		expect(result).to.be.a.query.to.deep.equal([
			'SelectQuery',
			[
				'Select',
				[
					['ReferencedField', 'copilot', 'id'],
					['Alias', ['ReferencedField', 'copilot', 'is blocked'], 'is_blocked'],
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
		]);
	});
});

test(`/pilot?$select=name,identification_method(identification_type='passport')/identification_number`, (result) => {
	it(`should select the pilot's name & passport number when using part of the alternate key and infering the rest from the navigation`, () => {
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
			]);
	});
});

test(`/pilot?$select=name,identification_method(identification_type='passport')/identification_number,identification_method(identification_type='passport')/created_at`, (result) => {
	// TODO: This atm doens't work b/c the two JOINs are generated with differnet Bind numbers
	itExpectsError(
		`should select the pilot's name, passport number & passport creation date when using part of the alternate key and infering the rest from the navigation`,
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
					[
						'Alias',
						['ReferencedField', 'pilot.identification method', 'created at'],
						'created_at',
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
				]);
		},
		'expected SyntaxError: Adding JOINs on the same res… to be an instance of Array',
	);
});
