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
					['ReferencedField', 'pilot', 'licence']
					['ReferencedField', 'pilot.licence', 'id']
				]
			).
			orderby(
				['ASC', operandToAbstractSQL('licence/id')]
			)


test '/pilot?$orderby=can_fly__plane/plane/id asc', (result) ->
	it 'should order by can_fly__plane/plane/id asc', ->
		expect(result).to.be.a.query.that.
			selects(pilotFields).
			from(
				'pilot'
				['pilot-can fly-plane', 'pilot.pilot-can fly-plane']
				['plane', 'pilot.pilot-can fly-plane.plane']
			).
			where(['And'
				['Equals'
					['ReferencedField', 'pilot', 'id']
					['ReferencedField', 'pilot.pilot-can fly-plane', 'pilot']
				]
				['Equals'
					['ReferencedField', 'pilot.pilot-can fly-plane', 'can fly-plane']
					['ReferencedField', 'pilot.pilot-can fly-plane.plane', 'id']
				]
			]).
			orderby(
				['ASC', operandToAbstractSQL('can_fly__plane/plane/id')]
			)


test.skip '/pilot?$orderby=favourite_colour/red', (result) ->
	it "should order by how red the pilot's favourite colour is"