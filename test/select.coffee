expect = require('chai').expect
{ operandToAbstractSQL, pilotFields } = require('./chai-sql')
test = require('./test')

pilotName = _.filter(pilotFields, 2: 'name')[0]
pilotAge = _.filter(pilotFields, 2: 'age')[0]
test '/pilot?$select=name', (result) ->
	it 'should select name from pilot', ->
		expect(result).to.be.a.query.that.
			selects([
				pilotName
			]).
			from('pilot')

test '/pilot?$select=favourite_colour', (result) ->
	it 'should select favourite_colour from pilot', ->
		expect(result).to.be.a.query.that.
			selects(
				_.filter(pilotFields, 1: 'favourite_colour')
			).
			from('pilot')

test '/pilot(1)?$select=favourite_colour', (result) ->
	it 'should select from pilot with id', ->
		expect(result).to.be.a.query.that.
			selects(
				_.filter(pilotFields, 1: 'favourite_colour')
			).
			from('pilot').
			where(['Equals', ['ReferencedField', 'pilot', 'id'], ['Number', 1]])

test "/pilot('TextKey')?$select=favourite_colour", (result) ->
	it 'should select from pilot with id', ->
		expect(result).to.be.a.query.that.
			selects(
				_.filter(pilotFields, 1: 'favourite_colour')
			).
			from('pilot').
			where(['Equals', ['ReferencedField', 'pilot', 'id'], ['Text', 'TextKey']])


test '/pilot?$select=pilot/name', (result) ->
	it 'should select name from pilot', ->
		expect(result).to.be.a.query.that.
			selects([
				pilotName
			]).
			from('pilot')


test '/pilot?$select=pilot/name,age', (result) ->
	it 'should select name, age from pilot', ->
		expect(result).to.be.a.query.that.
			selects([
				pilotName
				pilotAge
			]).
			from('pilot')


test '/pilot?$select=*', (result) ->
	it 'should select * from pilot', ->
		expect(result).to.be.a.query.that.
			selects(pilotFields).
			from('pilot')


test '/pilot?$select=licence/id', (result) ->
	it 'should select licence/id for pilots', ->
		expect(result).to.be.a.query.that.
			selects([
				operandToAbstractSQL('licence/id')
			]).
			from('pilot', 'licence').
			where(
				['Equals', ['ReferencedField', 'licence', 'id'], ['ReferencedField', 'pilot', 'licence']]
			)


test '/pilot?$select=pilot__can_fly__plane/plane/id', (result) ->
	it 'should select pilot__can_fly__plane/plane/id for pilots', ->
		expect(result).to.be.a.query.that.
			selects([
				operandToAbstractSQL('pilot__can_fly__plane/plane/id')
			]).
			from('pilot', 'pilot-can_fly-plane', 'plane').
			where(['And'
				['Equals', ['ReferencedField', 'pilot', 'id'], ['ReferencedField', 'pilot-can_fly-plane', 'pilot']]
				['Equals', ['ReferencedField', 'plane', 'id'], ['ReferencedField', 'pilot-can_fly-plane', 'plane']]
			])
