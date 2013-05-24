expect = require('chai').expect
{operandToAbstractSQL, pilotFields, licenceFields, planeFields} = require('./chai-sql')
test = require('./test')

pilotCanFlyPlane =
	plane: [
		[	'SelectQuery'
			[	'Select'
				[	[['AggregateJSON', ['plane', '*']], 'plane']
					['ReferencedField', 'pilot-can_fly-plane', 'pilot']
					['ReferencedField', 'pilot-can_fly-plane', 'id']
				]
			]
			[	'From'
				'pilot-can_fly-plane'
			]
			[	'From'
				'plane'
			]
			[	'Where'
				[	'Equals'
					['ReferencedField', 'plane', 'id']
					['ReferencedField', 'pilot-can_fly-plane', 'plane']
				]
			]
			[	'GroupBy'
				[['ReferencedField', 'pilot-can_fly-plane', 'id']]
			]
		]
		'pilot-can_fly-plane'
	]

test '/pilot?$expand=licence', (result) ->
	it 'should select from pilot.*, licence.*', ->
		expect(result).to.be.a.query.that.
			selects([
				[['AggregateJSON', ['licence', '*']], 'licence']
			].concat(_.reject(pilotFields, 2: 'licence'))).
			from('pilot', 'licence').
			where(
				['Equals'
					['ReferencedField', 'licence', 'id']
					['ReferencedField', 'pilot', 'licence']
				]
			).
			groupby(
				['ReferencedField', 'pilot', 'id']
			)


test '/pilot?$expand=pilot__can_fly__plane/plane', (result) ->
	it 'should select from pilot.*, plane.*', ->
		expect(result).to.be.a.query.that.
			selects([
				[['AggregateJSON', ['pilot-can_fly-plane', '*']], 'pilot-can_fly-plane']
			].concat(pilotFields)).
			from(
				'pilot'
				pilotCanFlyPlane.plane
			).
			where(
				['Equals'
					['ReferencedField', 'pilot', 'id']
					['ReferencedField', 'pilot-can_fly-plane', 'pilot']
				]
			).
			groupby(
				['ReferencedField', 'pilot', 'id']
			)


test '/pilot?$expand=pilot__can_fly__plane/plane,licence', (result) ->
	it 'should select from pilot.*, plane.*, licence.*', ->
		expect(result).to.be.a.query.that.
			selects([
				[['AggregateJSON', ['pilot-can_fly-plane', '*']], 'pilot-can_fly-plane']
				[['AggregateJSON', ['licence', '*']], 'licence']
			].concat(_.reject(pilotFields, 2: 'licence'))).
			from(
				'pilot'
				pilotCanFlyPlane.plane
				'licence'
			).
			where(['And'
				['Equals'
					['ReferencedField', 'pilot', 'id']
					['ReferencedField', 'pilot-can_fly-plane', 'pilot']
				]
				['Equals'
					['ReferencedField', 'licence', 'id']
					['ReferencedField', 'pilot', 'licence']
				]
			]).
			groupby(
				['ReferencedField', 'pilot', 'id']
			)
