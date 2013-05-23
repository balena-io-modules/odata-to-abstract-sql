expect = require('chai').expect
{operandToAbstractSQL, pilotFields, licenceFields, planeFields} = require('./chai-sql')
test = require('./test')

test '/pilot?$expand=licence', (result) ->
	it 'should select from pilot.*, licence.*', ->
		expect(result).to.be.a.query.that.
			selects([
				['licence', '*']
			].concat(pilotFields)).
			from('pilot', 'licence').
			where(
				['Equals'
					['ReferencedField', 'licence', 'id']
					['ReferencedField', 'pilot', 'licence']
				]
			)


test '/pilot?$expand=pilot__can_fly__plane/plane', (result) ->
	it 'should select from pilot.*, plane.*', ->
		expect(result).to.be.a.query.that.
			selects([
				['plane', '*']
			].concat(pilotFields)).
			from('pilot', 'pilot-can_fly-plane', 'pilot').
			where(['And'
				['Equals'
					['ReferencedField', 'pilot', 'id']
					['ReferencedField', 'pilot-can_fly-plane', 'pilot']
				]
				['Equals'
					['ReferencedField', 'plane', 'id']
					['ReferencedField', 'pilot-can_fly-plane', 'plane']
				]
			])


test '/pilot?$expand=pilot__can_fly__plane/plane,licence', (result) ->
	it 'should select from pilot.*, plane.*, licence.*', ->
		expect(result).to.be.a.query.that.
			selects([
				['plane', '*']
				['licence', '*']
			].concat(pilotFields)).
			from('pilot', 'pilot-can_fly-plane', 'pilot', 'licence').
			where(['And'
				['Equals'
					['ReferencedField', 'pilot', 'id']
					['ReferencedField', 'pilot-can_fly-plane', 'pilot']
				]
				['Equals'
					['ReferencedField', 'plane', 'id']
					['ReferencedField', 'pilot-can_fly-plane', 'plane']
				]
				['Equals'
					['ReferencedField', 'licence', 'id']
					['ReferencedField', 'pilot', 'licence']
				]
			])
