expect = require('chai').expect
require('./chai-sql')
test = require('./test')

test '/pilot?$orderby=name', (result) ->
	it 'should order by name desc', ->
		expect(result).to.be.a.query.that.
			selects(['pilot', '*']).
			from('pilot').
			orderby(['DESC', ['Field', 'name']])


test '/pilot?$orderby=name,age', (result) ->
	it 'should order by name desc, age desc', ->
		expect(result).to.be.a.query.that.
			selects(['pilot', '*']).
			from('pilot').
			orderby(
				['DESC', ['Field', 'name']]
				['DESC', ['Field', 'age']]
			)

			
test '/pilot?$orderby=name desc', (result) ->
	it 'should order by name desc', ->
		expect(result).to.be.a.query.that.
			selects(['pilot', '*']).
			from('pilot').
			orderby(['DESC', ['Field', 'name']])

			
test '/pilot?$orderby=name asc', (result) ->
	it 'should order by name asc', ->
		expect(result).to.be.a.query.that.
			selects(['pilot', '*']).
			from('pilot').
			orderby(['ASC', ['Field', 'name']])


test '/pilot?$orderby=name asc,age desc', (result) ->
	it 'should order by name desc, age desc', ->
		expect(result).to.be.a.query.that.
			selects(['pilot', '*']).
			from('pilot').
			orderby(
				['ASC', ['Field', 'name']]
				['DESC', ['Field', 'age']]
			)


test '/pilot?$orderby=licence/id asc', (result) ->
	it 'should order by licence/id asc', ->
		expect(result).to.be.a.query.that.
			selects(['pilot', '*']).
			from('pilot', 'licence').
			where(
				['Equals'
					['ReferencedField', 'licence', 'id']
					['ReferencedField', 'pilot', 'licence']
				]
			).
			orderby(
				['ASC', ['ReferencedField', 'licence', 'id']]
			)


test '/pilot?$orderby=pilot__can_fly__plane/plane/id asc', (result) ->
	it 'should order by pilot__can_fly__plane/plane/id asc', ->
		expect(result).to.be.a.query.that.
			selects(['pilot', '*']).
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
			]).
			orderby(
				['ASC', ['ReferencedField', 'plane', 'id']]
			)


test.skip '/pilot?$orderby=favourite_colour/red', (result) ->
	it "should order by how red the pilot's favourite colour is"