expect = require('chai').expect
{operandToAbstractSQL} = require('./chai-sql')
test = require('./test')

test '/pilot?$select=name', (result) ->
	it 'should select name from pilot', ->
		expect(result).to.be.a.query.that.
			selects(operandToAbstractSQL('name')).
			from('pilot')

test.skip '/pilot?$select=pilot/name', (result) ->
	it 'should select name from pilot', ->
		expect(result).to.be.a.query.that.
			selects(operandToAbstractSQL('pilot/name')).
			from('pilot')
