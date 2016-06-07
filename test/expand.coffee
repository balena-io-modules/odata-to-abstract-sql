_ = require 'lodash'
expect = require('chai').expect
chaiSql = require './chai-sql'
{ operandToAbstractSQL, aliasFields, pilotFields, licenceFields, pilotCanFlyPlaneFields, planeFields } = chaiSql
test = require './test'

createAggregate = ({ parentResource, resourceName, attributeOfParent, fields }) ->
	resourceAlias = "#{parentResource}.#{resourceName}"
	odataName = resourceName.replace(/-/g, '__')
	whereClause =
		if attributeOfParent
			[	'Equals'
				['ReferencedField', resourceAlias, 'id']
				['ReferencedField', parentResource, resourceName]
			]
		else
			[	'Equals'
				['ReferencedField', parentResource, 'id']
				['ReferencedField', resourceAlias, parentResource]
			]
	[
		[	'SelectQuery'
			[	'Select'
				[	[	['AggregateJSON', [resourceAlias, '*']]
						odataName
					]
				]
			]
			[	'From'
				[	[	'SelectQuery'
						[	'Select'
							aliasFields(parentResource, fields)
						]
						[	'From'
							[	resourceName
								resourceAlias
							]
						]
						[	'Where'
							whereClause
						]
					]
					resourceAlias
				]
			]
		]
		odataName
	]

aggregateJSON =
	pilot: createAggregate(
		parentResource: 'pilot'
		resourceName: 'pilot'
		attributeOfParent: false
		fields: pilotFields
	)
	licence: createAggregate(
		parentResource: 'pilot'
		resourceName: 'licence'
		attributeOfParent: true
		fields: licenceFields
	)
	pilotCanFlyPlane:
		plane: createAggregate(
			parentResource: 'pilot'
			resourceName: 'pilot-can_fly-plane'
			attributeOfParent: false
			fields: [
				createAggregate(
					parentResource: 'pilot.pilot-can_fly-plane'
					resourceName: 'plane'
					attributeOfParent: true
					fields: planeFields
				)
				_.reject(pilotCanFlyPlaneFields, 2: 'plane')...
			]
		)

test '/pilot?$expand=licence', (result) ->
	it 'should select from pilot.*, licence.*', ->
		expect(result).to.be.a.query.that.
			selects([
				aggregateJSON.licence
			].concat(_.reject(pilotFields, 2: 'licence'))).
			from('pilot')


nestedExpandTest = (result) ->
	it 'should select from pilot ..., (select ... FROM ...)', ->
		expect(result).to.be.a.query.that.
			selects([
				aggregateJSON.pilotCanFlyPlane.plane
			].concat(pilotFields)).
			from('pilot')
test '/pilot?$expand=pilot__can_fly__plane/plane', nestedExpandTest
test '/pilot?$expand=pilot__can_fly__plane($expand=plane)', nestedExpandTest


nestedExpandTest = (result) ->
	it 'should select from pilot.*, plane.*, licence.*', ->
		expect(result).to.be.a.query.that.
			selects([
				aggregateJSON.pilotCanFlyPlane.plane
				aggregateJSON.licence
			].concat(_.reject(pilotFields, 2: 'licence'))).
			from('pilot')
test '/pilot?$expand=pilot__can_fly__plane/plane,licence', nestedExpandTest
test '/pilot?$expand=pilot__can_fly__plane($expand=plane),licence', nestedExpandTest


test '/pilot?$select=licence&$expand=licence', (result) ->
	it 'should select just the expanded licence from pilots', ->
		expect(result).to.be.a.query.that.
			selects([
				aggregateJSON.licence
			]).
			from('pilot')


nestedExpandTest = (result) ->
	it 'should only select the id and expanded field from pilot', ->
		expect(result).to.be.a.query.that.
			selects([
				aggregateJSON.pilotCanFlyPlane.plane
			].concat(_.filter(pilotFields, 2: 'id'))).
			from('pilot')
test '/pilot?$select=id&$expand=pilot__can_fly__plane/plane', nestedExpandTest
test '/pilot?$select=id&$expand=pilot__can_fly__plane($expand=plane)', nestedExpandTest


nestedExpandTest = (result) ->
	it 'should only select id and the expanded fields', ->
		expect(result).to.be.a.query.that.
			selects([
				aggregateJSON.pilotCanFlyPlane.plane
				aggregateJSON.licence
			].concat(_.filter(pilotFields, 2: 'id'))).
			from('pilot')
test '/pilot?$select=id,licence&$expand=pilot__can_fly__plane/plane,licence', nestedExpandTest
test '/pilot?$select=id,licence&$expand=pilot__can_fly__plane($expand=plane),licence', nestedExpandTest


test '/pilot?$expand=pilot__can_fly__plane($select=id)', (result) ->
	it 'should only select id and the expanded fields', ->
		expect(result).to.be.a.query.that.
			selects([
				createAggregate(
					parentResource: 'pilot'
					resourceName: 'pilot-can_fly-plane'
					attributeOfParent: false
					fields: _.filter(pilotCanFlyPlaneFields, 2: 'id')
				)
			].concat(pilotFields)).
			from('pilot')


test '/pilot?$expand=licence($filter=id eq 1)', (result) ->
	agg = _.cloneDeep(aggregateJSON.licence)
	_.chain(agg)
	.find(0: 'SelectQuery')
	.find(0: 'From')
	.find(1: 'pilot.licence')
	.find(0: 'SelectQuery')
	.find(0: 'Where')
	.tap (aggWhere) ->
		currentWhere = aggWhere.splice(1, Infinity)
		aggWhere.push(
			[ 'And',
				[	'Equals'
					[	'ReferencedField'
						'pilot.licence'
						'id'
					]
					[	'Number'
						1
					]
				]
			].concat(currentWhere)
		)
	.value()
	it 'should select from pilot.*, licence.*', ->
		expect(result).to.be.a.query.that.
			selects([
				agg
				_.reject(pilotFields, 2: 'licence')...
			]).
			from('pilot')

test '/pilot?$expand=licence($filter=pilot/id eq 1)', (result) ->
	agg = _.cloneDeep(aggregateJSON.licence)
	_.chain(agg)
	.find(0: 'SelectQuery')
	.find(0: 'From')
	.find(1: 'pilot.licence')
	.find(0: 'SelectQuery')
	.tap (aggSelect) ->
		aggSelect.splice(aggSelect.length - 1, 0,
			[	'From'
				[	'pilot'
					'pilot.licence.pilot'
				]
			]
		)
	.find(0: 'Where')
	.tap (aggWhere) ->
		currentWhere = aggWhere.splice(1, Infinity)
		aggWhere.push(
			[ 'And',
				[ 'Equals',
					[	'ReferencedField'
						'pilot.licence'
						'id'
					]
					[	'ReferencedField'
						'pilot.licence.pilot'
						'licence'
					]
				]
				[
					'Equals'
					[	'ReferencedField'
						'pilot.licence.pilot'
						'id'
					]
					[	'Number'
						1
					]
				]
			].concat(currentWhere)
		)
	.value()
	it 'should select from pilot.*, licence.*', ->
		expect(result).to.be.a.query.that.
			selects([
				agg
				_.reject(pilotFields, 2: 'licence')...
			]).
			from('pilot')

test '/pilot?$expand=licence($orderby=id)', (result) ->
	agg = _.cloneDeep(aggregateJSON.licence)
	_.chain(agg)
	.find(0: 'SelectQuery')
	.find(0: 'From')
	.find(1: 'pilot.licence')
	.find(0: 'SelectQuery')
	.value()
	.push([
		'OrderBy'
		['DESC', ['ReferencedField', 'pilot.licence', 'id']]
	])
	it 'should select from pilot.*, licence.*', ->
		expect(result).to.be.a.query.that.
			selects([
				agg
				_.reject(pilotFields, 2: 'licence')...
			]).
			from('pilot')

test '/pilot?$expand=licence($top=10)', (result) ->
	agg = _.cloneDeep(aggregateJSON.licence)
	_.chain(agg)
	.find(0: 'SelectQuery')
	.find(0: 'From')
	.find(1: 'pilot.licence')
	.find(0: 'SelectQuery')
	.value()
	.push([
		'Limit'
		operandToAbstractSQL(10)
	])
	it 'should select from pilot.*, licence.*', ->
		expect(result).to.be.a.query.that.
			selects([
				agg
				_.reject(pilotFields, 2: 'licence')...
			]).
			from('pilot')

test '/pilot?$expand=licence($skip=10)', (result) ->
	agg = _.cloneDeep(aggregateJSON.licence)
	_.chain(agg)
	.find(0: 'SelectQuery')
	.find(0: 'From')
	.find(1: 'pilot.licence')
	.find(0: 'SelectQuery')
	.value()
	.push([
		'Offset'
		operandToAbstractSQL(10)
	])
	it 'should select from pilot.*, licence.*', ->
		expect(result).to.be.a.query.that.
			selects([
				agg
				_.reject(pilotFields, 2: 'licence')...
			]).
			from('pilot')

test '/pilot?$expand=licence($select=id)', (result) ->
	agg = _.cloneDeep(aggregateJSON.licence)
	select =
		_.chain(agg)
		.find(0: 'SelectQuery')
		.find(0: 'From')
		.find(1: 'pilot.licence')
		.find(0: 'SelectQuery')
		.find(0: 'Select')
		.value()
	select[1] = _.filter(select[1], 2: 'id')

	it 'should select from pilot.*, licence.*', ->
		expect(result).to.be.a.query.that.
			selects([
				agg
				_.reject(pilotFields, 2: 'licence')...
			]).
			from('pilot')

test '/pilot?$expand=pilot', (result) ->
	it 'should select from pilot.*, aggregated pilot.*', ->
		expect(result).to.be.a.query.that.
			selects([
				aggregateJSON.pilot
			].concat(_.reject(pilotFields, 2: 'pilot'))).
			from('pilot')
