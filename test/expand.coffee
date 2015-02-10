_ = require 'lodash'
expect = require('chai').expect
chaiSql = require './chai-sql'
{operandToAbstractSQL, pilotFields, licenceFields, pilotCanFlyPlaneFields, planeFields} = chaiSql
test = require './test'

createAggregate = (parentResource, resourceName, attributeOfParent, fields, additionalWhere) ->
	odataName = resourceName.replace(/-/g, '__')
	whereClause = 
		if attributeOfParent
			[	'Equals'
				['ReferencedField', resourceName, 'id']
				['ReferencedField', parentResource, resourceName]
			]
		else
			[	'Equals'
				['ReferencedField', parentResource, 'id']
				['ReferencedField', resourceName, parentResource]
			]
	if additionalWhere
		whereClause = [
			'And'
			whereClause
			additionalWhere
		]
	[
		[	'SelectQuery'
			[	'Select'
				[	[	['AggregateJSON', [resourceName, '*']]
						odataName
					]
				]
			]
			[	'From'
				[	[	'SelectQuery'
						[	'Select'
							fields
						]
						[	'From'
							resourceName
						]
						[	'Where'
							whereClause
						]
					]
					resourceName
				]
			]
		]
		odataName
	]

aggregateJSON =
	licence: createAggregate('pilot', 'licence', true, licenceFields)
	pilotCanFlyPlane:
		plane: createAggregate(
			'pilot'
			'pilot-can_fly-plane'
			false
			[
				createAggregate('pilot-can_fly-plane', 'plane', true, planeFields)
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


test '/pilot?$expand=pilot__can_fly__plane/plane', (result) ->
	it 'should select from pilot ..., (select ... FROM ...)', ->
		expect(result).to.be.a.query.that.
			selects([
				aggregateJSON.pilotCanFlyPlane.plane
			].concat(pilotFields)).
			from('pilot')


test '/pilot?$expand=pilot__can_fly__plane/plane,licence', (result) ->
	it 'should select from pilot.*, plane.*, licence.*', ->
		expect(result).to.be.a.query.that.
			selects([
				aggregateJSON.pilotCanFlyPlane.plane
				aggregateJSON.licence
			].concat(_.reject(pilotFields, 2: 'licence'))).
			from('pilot')


test '/pilot?$select=licence&$expand=licence', (result) ->
	it 'should select just the expanded licence from pilots', ->
		expect(result).to.be.a.query.that.
			selects([
				aggregateJSON.licence
			]).
			from('pilot')


test '/pilot?$select=id&$expand=pilot__can_fly__plane/plane', (result) ->
	it 'should only select the id and expanded field from pilot', ->
		expect(result).to.be.a.query.that.
			selects([
				aggregateJSON.pilotCanFlyPlane.plane
			].concat(_.filter(pilotFields, 2: 'id'))).
			from('pilot')


test '/pilot?$select=id,licence&$expand=pilot__can_fly__plane/plane,licence', (result) ->
	it 'should only select id and the expanded fields', ->
		expect(result).to.be.a.query.that.
			selects([
				aggregateJSON.pilotCanFlyPlane.plane
				aggregateJSON.licence
			].concat(_.filter(pilotFields, 2: 'id'))).
			from('pilot')


test '/pilot?$expand=licence($filter=id eq 1)', (result) ->
	it 'should select from pilot.*, licence.*', ->
		expect(result).to.be.a.query.that.
			selects([
				createAggregate('pilot', 'licence', true, licenceFields, [
					'Equals'
					[	'ReferencedField'
						'licence'
						'id'
					]
					[	'Number'
						1
					]
				])
			].concat(_.reject(pilotFields, 2: 'licence'))).
			from('pilot')

test '/pilot?$expand=licence($orderby=id)', (result) ->
	agg = _.cloneDeep(aggregateJSON.licence)
	_.chain(agg)
	.find(0: 'SelectQuery')
	.find(0: 'From')
	.find(1: 'licence')
	.find(0: 'SelectQuery')
	.value()
	.push([
		'OrderBy'
		['DESC', operandToAbstractSQL('id', 'licence')]
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
	.find(1: 'licence')
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
	.find(1: 'licence')
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
		.find(1: 'licence')
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
