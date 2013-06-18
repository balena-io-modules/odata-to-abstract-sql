expect = require('chai').expect
{operandToAbstractSQL, pilotFields, licenceFields, planeFields} = require('./chai-sql')
test = require('./test')
aggregateJSON =
	licence: [
		[	'SelectQuery'
			[	'Select'
				[	[	['AggregateJSON', ['licence', '*']]
						'licence'
					]
				]
			]
			[	'From'
				'licence'
			]
			[	'Where'
				[	'Equals'
					['ReferencedField', 'licence', 'id']
					['ReferencedField', 'pilot', 'licence']
				]
			]
		]
		'licence'
	]
	pilotCanFlyPlane:
		plane: [
			[	'SelectQuery'
				[	'Select'
					[	[	['AggregateJSON', ['pilot-can_fly-plane', '*']]
							'pilot-can_fly-plane'
						]
					]
				]
				[	'From'
					[	[	'SelectQuery'
							[	'Select'
								[	[	[	'SelectQuery'
											[	'Select'
												[	[	['AggregateJSON', ['plane', '*']]
														'plane'
													]
												]
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
										]
										'plane'
									]
									['ReferencedField', 'pilot-can_fly-plane', 'pilot']
									['ReferencedField', 'pilot-can_fly-plane', 'id']
								]
							]
							[	'From'
								'pilot-can_fly-plane'
							]
						]
						'pilot-can_fly-plane'
					]
				]
				[	'Where'
					[	'Equals'
						['ReferencedField', 'pilot', 'id']
						['ReferencedField', 'pilot-can_fly-plane', 'pilot']
					]
				]
			]
			'pilot-can_fly-plane'
		]

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
