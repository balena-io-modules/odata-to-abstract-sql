import * as _ from 'lodash';
import { expect } from 'chai';
import * as chaiSql from './chai-sql';
const {
	sqlNameToOdataName,
	shortenAlias,
	operandToAbstractSQLFactory,
	aliasFields,
	pilotFields,
	licenceFields,
	pilotCanFlyPlaneFields,
	planeFields,
	$count,
} = chaiSql;
const operandToAbstractSQL = operandToAbstractSQLFactory();
import test from './test';

const createAggregate = function (args) {
	let {
		parentResource,
		parentResourceField = parentResource,
		parentResourceAlias = parentResource,
		sqlName,
		resourceAlias,
		resourceField,
		attributeOfParent,
		fields,
		verb,
		odataName = sqlNameToOdataName(sqlName),
	} = args;
	const tableAlias = verb != null ? verb + '-' + sqlName : sqlName;
	resourceAlias ??= `${parentResourceAlias}.${tableAlias}`;
	resourceField ??= tableAlias;

	const whereClause = attributeOfParent
		? [
				'Equals',
				['ReferencedField', parentResourceAlias, resourceField],
				['ReferencedField', resourceAlias, 'id'],
			]
		: [
				'Equals',
				['ReferencedField', parentResourceAlias, 'id'],
				['ReferencedField', resourceAlias, parentResourceField],
			];
	return [
		'Alias',
		[
			'SelectQuery',
			[
				'Select',
				[
					[
						'Alias',
						['AggregateJSON', ['ReferencedField', resourceAlias, '*']],
						odataName,
					],
				],
			],
			[
				'From',
				[
					'Alias',
					[
						'SelectQuery',
						['Select', aliasFields(parentResourceAlias, fields, verb)],
						['From', ['Alias', ['Table', sqlName], resourceAlias]],
						['Where', whereClause],
					],
					resourceAlias,
				],
			],
		],
		odataName,
	];
};

const aggregateJSON = {
	pilot: createAggregate({
		parentResource: 'pilot',
		parentResourceField: 'was trained by-pilot',
		odataName: 'trained__pilot',
		verb: 'trained',
		sqlName: 'pilot',
		attributeOfParent: false,
		fields: pilotFields,
	}),
	licence: createAggregate({
		parentResource: 'pilot',
		sqlName: 'licence',
		attributeOfParent: true,
		fields: licenceFields,
	}),
	pilotCanFlyPlane: {
		plane: createAggregate({
			parentResource: 'pilot',
			odataName: 'can_fly__plane',
			sqlName: 'pilot-can fly-plane',
			attributeOfParent: false,
			fields: [
				createAggregate({
					parentResource: 'pilot.pilot-can fly-plane',
					resourceField: 'can fly-plane',
					sqlName: 'plane',
					attributeOfParent: true,
					fields: planeFields,
				}),
				..._.reject(pilotCanFlyPlaneFields, { 2: 'plane' }),
			],
		}),
	},
};

test('/pilot?$expand=licence', (result) =>
	it('should select from pilot.*, licence.*', () =>
		expect(result)
			.to.be.a.query.that.selects(
				[aggregateJSON.licence].concat(_.reject(pilotFields, { 2: 'licence' })),
			)
			.from('pilot')));

let nestedExpandTest = (result) =>
	it('should select from pilot ..., (select ... FROM ...)', () =>
		expect(result)
			.to.be.a.query.that.selects(
				[aggregateJSON.pilotCanFlyPlane.plane].concat(pilotFields),
			)
			.from('pilot'));
test('/pilot?$expand=can_fly__plane/plane', nestedExpandTest);
test('/pilot?$expand=can_fly__plane($expand=plane)', nestedExpandTest);

nestedExpandTest = (result) =>
	it('should select from pilot.*, plane.*, licence.*', () =>
		expect(result)
			.to.be.a.query.that.selects(
				[aggregateJSON.pilotCanFlyPlane.plane, aggregateJSON.licence].concat(
					_.reject(pilotFields, { 2: 'licence' }),
				),
			)
			.from('pilot'));
test('/pilot?$expand=can_fly__plane/plane,licence', nestedExpandTest);
test('/pilot?$expand=can_fly__plane($expand=plane),licence', nestedExpandTest);

test('/pilot?$select=licence&$expand=licence', (result) =>
	it('should select just the expanded licence from pilots', () =>
		expect(result)
			.to.be.a.query.that.selects([aggregateJSON.licence])
			.from('pilot')));

nestedExpandTest = (result) =>
	it('should only select the id and expanded field from pilot', () =>
		expect(result)
			.to.be.a.query.that.selects(
				[aggregateJSON.pilotCanFlyPlane.plane].concat(
					_.filter(pilotFields, { 2: 'id' }),
				),
			)
			.from('pilot'));
test('/pilot?$select=id&$expand=can_fly__plane/plane', nestedExpandTest);
test(
	'/pilot?$select=id&$expand=can_fly__plane($expand=plane)',
	nestedExpandTest,
);

nestedExpandTest = (result) =>
	it('should only select id and the expanded fields', () =>
		expect(result)
			.to.be.a.query.that.selects(
				[aggregateJSON.pilotCanFlyPlane.plane, aggregateJSON.licence].concat(
					_.filter(pilotFields, { 2: 'id' }),
				),
			)
			.from('pilot'));
test(
	'/pilot?$select=id,licence&$expand=can_fly__plane/plane,licence',
	nestedExpandTest,
);
test(
	'/pilot?$select=id,licence&$expand=can_fly__plane($expand=plane),licence',
	nestedExpandTest,
);

test('/pilot?$expand=can_fly__plane($select=id)', (result) =>
	it('should only select id and the expanded fields', () =>
		expect(result)
			.to.be.a.query.that.selects(
				[
					createAggregate({
						parentResource: 'pilot',
						odataName: 'can_fly__plane',
						sqlName: 'pilot-can fly-plane',
						attributeOfParent: false,
						fields: _.filter(pilotCanFlyPlaneFields, { 2: 'id' }),
					}),
				].concat(pilotFields),
			)
			.from('pilot')));

test('/pilot?$expand=licence($filter=id eq 1)', function (result) {
	const agg = _.cloneDeep(aggregateJSON.licence);
	_.chain(agg)
		.find({ 0: 'SelectQuery' })
		// @ts-expect-error AbstractSql array being an array having .find
		.find({ 0: 'From' })
		.find({ 2: 'pilot.licence' })
		.find({ 0: 'SelectQuery' })
		.find({ 0: 'Where' })
		.tap(function (aggWhere) {
			const currentWhere = aggWhere.splice(1, Infinity);
			return aggWhere.push(
				[
					'And',
					[
						'IsNotDistinctFrom',
						['ReferencedField', 'pilot.licence', 'id'],
						['Bind', 0],
					],
				].concat(currentWhere),
			);
		})
		.value();
	it('should select from pilot.*, licence.*', () =>
		expect(result)
			.to.be.a.query.that.selects([
				agg,
				..._.reject(pilotFields, { 2: 'licence' }),
			])
			.from('pilot'));
});

test('/pilot?$expand=licence($filter=is_of__pilot/id eq 1)', function (result) {
	const agg = _.cloneDeep(aggregateJSON.licence);
	_.chain(agg)
		.find({ 0: 'SelectQuery' })
		// @ts-expect-error AbstractSql array being an array having .find
		.find({ 0: 'From' })
		.find({ 2: 'pilot.licence' })
		.find({ 0: 'SelectQuery' })
		.tap((aggSelect) =>
			aggSelect.splice(aggSelect.length - 1, 0, [
				'From',
				['Alias', ['Table', 'pilot'], 'pilot.licence.is of-pilot'],
			]),
		)
		.find({ 0: 'Where' })
		.tap(function (aggWhere) {
			const currentWhere = aggWhere.splice(1, Infinity);
			return aggWhere.push(
				[
					'And',
					[
						'Equals',
						['ReferencedField', 'pilot.licence', 'id'],
						['ReferencedField', 'pilot.licence.is of-pilot', 'licence'],
					],
					[
						'IsNotDistinctFrom',
						['ReferencedField', 'pilot.licence.is of-pilot', 'id'],
						['Bind', 0],
					],
				].concat(currentWhere),
			);
		})
		.value();
	it('should select from pilot.*, licence.*', () =>
		expect(result)
			.to.be.a.query.that.selects([
				agg,
				..._.reject(pilotFields, { 2: 'licence' }),
			])
			.from('pilot'));
});

test('/pilot?$expand=licence($orderby=id)', function (result) {
	const agg = _.cloneDeep(aggregateJSON.licence);
	_.chain(agg)
		.find({ 0: 'SelectQuery' })
		// @ts-expect-error AbstractSql array being an array having .find
		.find({ 0: 'From' })
		.find({ 2: 'pilot.licence' })
		.find({ 0: 'SelectQuery' })
		.value()
		.push(['OrderBy', ['DESC', ['ReferencedField', 'pilot.licence', 'id']]]);
	it('should select from pilot.*, licence.*', () =>
		expect(result)
			.to.be.a.query.that.selects([
				agg,
				..._.reject(pilotFields, { 2: 'licence' }),
			])
			.from('pilot'));
});

test('/pilot?$expand=licence($top=10)', function (result) {
	const agg = _.cloneDeep(aggregateJSON.licence);
	_.chain(agg)
		.find({ 0: 'SelectQuery' })
		// @ts-expect-error AbstractSql array being an array having .find
		.find({ 0: 'From' })
		.find({ 2: 'pilot.licence' })
		.find({ 0: 'SelectQuery' })
		.value()
		.push(['Limit', ['Bind', 0]]);
	it('should select from pilot.*, licence.*', () =>
		expect(result)
			.to.be.a.query.that.selects([
				agg,
				..._.reject(pilotFields, { 2: 'licence' }),
			])
			.from('pilot'));
});

test('/pilot?$expand=licence($skip=10)', function (result) {
	const agg = _.cloneDeep(aggregateJSON.licence);
	_.chain(agg)
		.find({ 0: 'SelectQuery' })
		// @ts-expect-error AbstractSql array being an array having .find
		.find({ 0: 'From' })
		.find({ 2: 'pilot.licence' })
		.find({ 0: 'SelectQuery' })
		.value()
		.push(['Offset', ['Bind', 0]]);
	it('should select from pilot.*, licence.*', () =>
		expect(result)
			.to.be.a.query.that.selects([
				agg,
				..._.reject(pilotFields, { 2: 'licence' }),
			])
			.from('pilot'));
});

test('/pilot?$expand=licence($select=id)', function (result) {
	const agg = _.cloneDeep(aggregateJSON.licence);
	const select = _.chain(agg)
		.find({ 0: 'SelectQuery' })
		// @ts-expect-error AbstractSql array being an array having .find
		.find({ 0: 'From' })
		.find({ 2: 'pilot.licence' })
		.find({ 0: 'SelectQuery' })
		.find({ 0: 'Select' })
		.value();
	select[1] = _.filter(select[1], { 2: 'id' });

	it('should select from pilot.*, licence.*', () =>
		expect(result)
			.to.be.a.query.that.selects([
				agg,
				..._.reject(pilotFields, { 2: 'licence' }),
			])
			.from('pilot'));
});

test('/pilot?$expand=trained__pilot', (result) =>
	it('should select from pilot.*, aggregated pilot.*', () =>
		expect(result)
			.to.be.a.query.that.selects(
				[aggregateJSON.pilot].concat(_.reject(pilotFields, { 2: 'pilot' })),
			)
			.from('pilot')));

// Tests for /$count
const aggregateJSONCount = {
	pilot: createAggregate({
		parentResource: 'pilot',
		sqlName: 'pilot',
		attributeOfParent: false,
		fields: $count,
	}),
	licence: createAggregate({
		parentResource: 'pilot',
		sqlName: 'licence',
		attributeOfParent: true,
		fields: $count,
	}),
	pilotCanFlyPlane: {
		plane: createAggregate({
			parentResource: 'pilot',
			sqlName: 'pilot-can fly-plane',
			attributeOfParent: false,
			fields: [
				createAggregate({
					parentResource: 'pilot.pilot-can fly-plane',
					sqlName: 'plane',
					attributeOfParent: true,
					fields: $count,
				}),
				..._.reject(pilotCanFlyPlaneFields, { 2: 'plane' }),
			],
		}),
	},
};

test('/pilot?$expand=licence/$count', (result) =>
	it('should select from pilot.*, count(*) licence', () =>
		expect(result)
			.to.be.a.query.that.selects(
				[aggregateJSONCount.licence].concat(
					_.reject(pilotFields, { 2: 'licence' }),
				),
			)
			.from('pilot')));

test('/pilot?$filter=id eq 5&$expand=licence/$count', (result) =>
	it('should select from pilot.*, count(*) licence, for pilot/id eq 5', () =>
		expect(result)
			.to.be.a.query.that.selects(
				[aggregateJSONCount.licence].concat(
					_.reject(pilotFields, { 2: 'licence' }),
				),
			)
			.from('pilot')
			.where([
				'IsNotDistinctFrom',
				['ReferencedField', 'pilot', 'id'],
				['Bind', 0],
			])));

test('/pilot?$orderby=id asc&$expand=licence/$count', (result) =>
	it('should select from pilot.*, count(*) licence, ordered by pilot id', () =>
		expect(result)
			.to.be.a.query.that.selects(
				[aggregateJSONCount.licence].concat(
					_.reject(pilotFields, { 2: 'licence' }),
				),
			)
			.from('pilot')
			.orderby(['ASC', operandToAbstractSQL('id')])));

test('/pilot?$expand=licence/$count($filter=id gt 5)', function (result) {
	const agg = _.cloneDeep(aggregateJSONCount.licence);
	_.chain(agg)
		.find({ 0: 'SelectQuery' })
		// @ts-expect-error  AbstractSql array being an array having .find
		.find({ 0: 'From' })
		.find({ 2: 'pilot.licence' })
		.find({ 0: 'SelectQuery' })
		.find({ 0: 'Where' })
		.tap(function (aggWhere) {
			const currentWhere = aggWhere.splice(1, Infinity);
			return aggWhere.push(
				[
					'And',
					[
						'GreaterThan',
						['ReferencedField', 'pilot.licence', 'id'],
						['Bind', 0],
					],
				].concat(currentWhere),
			);
		})
		.value();
	it('should select from pilot.*, count(*) licence for id gt 5', () =>
		expect(result)
			.to.be.a.query.that.selects([
				agg,
				..._.reject(pilotFields, { 2: 'licence' }),
			])
			.from('pilot'));
});

test('/pilot?$expand=licence/$count($orderby=id asc)', (result) =>
	it('should select from pilot.*, count(*) and ignore orderby', () =>
		expect(result)
			.to.be.a.query.that.selects(
				[aggregateJSONCount.licence].concat(
					_.reject(pilotFields, { 2: 'licence' }),
				),
			)
			.from('pilot')));

test('/pilot?$expand=licence/$count($skip=5)', (result) =>
	it('should select from pilot.*, count(*) and ignore skip', () =>
		expect(result)
			.to.be.a.query.that.selects(
				[aggregateJSONCount.licence].concat(
					_.reject(pilotFields, { 2: 'licence' }),
				),
			)
			.from('pilot')));

test('/pilot?$expand=licence/$count($top=5)', (result) =>
	it('should select from pilot.*, count(*) and ignore top', () =>
		expect(result)
			.to.be.a.query.that.selects(
				[aggregateJSONCount.licence].concat(
					_.reject(pilotFields, { 2: 'licence' }),
				),
			)
			.from('pilot')));

// Alias tests
(function () {
	const remainingPilotFields = _.reject(pilotFields, function (field) {
		if (field.length === 2) {
			// @ts-expect-error Assign field with stil valid AbstractSql
			field = field[1];
		}
		return field[2] === 'pilot';
	});
	const recursions = 9;

	const expandString = (function () {
		const recurse = function (i) {
			if (i <= 0) {
				return '$expand=trained__pilot';
			}
			const child = recurse(i - 1);
			return `$expand=trained__pilot(${child})`;
		};
		return recurse(recursions);
	})();

	const url = '/pilot?' + expandString;
	test(url, function (result) {
		const recurse = function (i, parentAlias) {
			let aliasedFields;
			const alias = shortenAlias(`${parentAlias}.trained-pilot`);
			if (i <= 0) {
				aliasedFields = pilotFields;
			} else {
				aliasedFields = [recurse(i - 1, alias), ...remainingPilotFields];
			}
			return createAggregate({
				parentResource: 'pilot',
				parentResourceAlias: parentAlias,
				parentResourceField: 'was trained by-pilot',
				odataName: 'trained__pilot',
				verb: 'trained',
				sqlName: 'pilot',
				resourceAlias: alias,
				attributeOfParent: false,
				fields: aliasedFields,
			});
		};
		it('should select from pilot.*, aggregated pilot', () =>
			expect(result)
				.to.be.a.query.that.selects([
					recurse(recursions, 'pilot'),
					...remainingPilotFields,
				])
				.from('pilot'));
	});
})();
