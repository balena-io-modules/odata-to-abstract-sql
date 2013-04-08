expect = require('chai').expect
{operandToAbstractSQL} = require('./chai-sql')
test = require('./test')

test '/pilot?$select=name', (result) ->
	it 'should select name from pilot', ->
		expect(result).to.be.a.query.that.
			selects(operandToAbstractSQL('name')).
			from('pilot')


test '/pilot?$select=pilot/name', (result) ->
	it 'should select name from pilot', ->
		expect(result).to.be.a.query.that.
			selects(operandToAbstractSQL('pilot/name')).
			from('pilot')


test '/pilot?$select=pilot/name,age', (result) ->
	it 'should select name, age from pilot', ->
		expect(result).to.be.a.query.that.
			selects(
				operandToAbstractSQL('pilot/name')
				operandToAbstractSQL('age')
			).
			from('pilot')


test '/pilot?$select=*', (result) ->
	it 'should select * from pilot', ->
		expect(result).to.be.a.query.that.
			selects(['pilot', '*']).
			from('pilot')


test '/pilot?$select=licence/id', (result) ->
	it 'should select licence/id for pilots', ->
		expect(result).to.be.a.query.that.
			selects(
				operandToAbstractSQL('licence/id')
			).
			from('pilot', 'licence').
			where(
				['Equals', ['ReferencedField', 'licence', 'id'], ['ReferencedField', 'pilot', 'licence']]
			)
