expect = require('chai').expect
{ operandToAbstractSQLFactory, pilotFields } = require('./chai-sql')
operandToAbstractSQL = operandToAbstractSQLFactory()
test = require('./test')

test '/pilot?$orderby=name', (result) ->
	it 'should order by name desc', ->
		expect(result).to.be.a.query.that.
			selects(pilotFields).
			from('pilot').
			orderby(['DESC', operandToAbstractSQL('name')])


test '/pilot?$orderby=name,age', (result) ->
	it 'should order by name desc, age desc', ->
		expect(result).to.be.a.query.that.
			selects(pilotFields).
			from('pilot').
			orderby(
				['DESC', operandToAbstractSQL('name')]
				['DESC', operandToAbstractSQL('age')]
			)


test '/pilot?$orderby=name desc', (result) ->
	it 'should order by name desc', ->
		expect(result).to.be.a.query.that.
			selects(pilotFields).
			from('pilot').
			orderby(['DESC', operandToAbstractSQL('name')])


test '/pilot?$orderby=name asc', (result) ->
	it 'should order by name asc', ->
		expect(result).to.be.a.query.that.
			selects(pilotFields).
			from('pilot').
			orderby(['ASC', operandToAbstractSQL('name')])


test '/pilot?$orderby=name asc,age desc', (result) ->
	it 'should order by name desc, age desc', ->
		expect(result).to.be.a.query.that.
			selects(pilotFields).
			from('pilot').
			orderby(
				['ASC', operandToAbstractSQL('name')]
				['DESC', operandToAbstractSQL('age')]
			)


test '/pilot?$orderby=licence/id asc', (result) ->
	it 'should order by licence/id asc', ->
		expect(result).to.be.a.query.that.
			selects(pilotFields).
			from(
				'pilot'
				['licence', 'pilot.licence']
			).
			where(
				['Equals'
					['ReferencedField', 'pilot.licence', 'id']
					['ReferencedField', 'pilot', 'licence']
				]
			).
			orderby(
				['ASC', operandToAbstractSQL('licence/id')]
			)


test '/pilot?$orderby=pilot__can_fly__plane/plane/id asc', (result) ->
	it 'should order by pilot__can_fly__plane/plane/id asc', ->
		expect(result).to.be.a.query.that.
			selects(pilotFields).
			from(
				'pilot'
				['pilot-can_fly-plane', 'pilot.pilot-can_fly-plane']
				['plane', 'pilot.pilot-can_fly-plane.plane']
			).
			where(['And'
				['Equals'
					['ReferencedField', 'pilot', 'id']
					['ReferencedField', 'pilot.pilot-can_fly-plane', 'pilot']
				]
				['Equals'
					['ReferencedField', 'pilot.pilot-can_fly-plane.plane', 'id']
					['ReferencedField', 'pilot.pilot-can_fly-plane', 'plane']
				]
			]).
			orderby(
				['ASC', operandToAbstractSQL('pilot__can_fly__plane/plane/id')]
			)


test.skip '/pilot?$orderby=favourite_colour/red', (result) ->
	it "should order by how red the pilot's favourite colour is"