expect = require('chai').expect
{operandToAbstractSQL, pilotFields, licenceFields, pilotCanFlyPlaneFields, planeFields} = require('./chai-sql')
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
				[	[	'SelectQuery'
						[	'Select'
							licenceFields
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
			]
		]
		'licence'
	]
	pilotCanFlyPlane:
		plane: [
			[	'SelectQuery'
				[	'Select'
					[	[	['AggregateJSON', ['pilot-can_fly-plane', '*']]
							'pilot__can_fly__plane'
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
												[	[	'SelectQuery'
														[	'Select'
															planeFields
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
											]
										]
										'plane'
									]
								].concat(_.reject(pilotCanFlyPlaneFields, 2: 'plane'))
							]
							[	'From'
								'pilot-can_fly-plane'
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
				]
			]
			'pilot__can_fly__plane'
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
