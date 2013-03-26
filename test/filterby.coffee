expect = require('chai').expect
require('./chai-sql')
test = require('./test')

sqlOps =
	eq: 'Equals'
	ne: 'NotEquals'
	gt: 'GreaterThan'
	ge: 'GreaterThanOrEqual'
	lt: 'LessThan'
	le: 'LessThanOrEqual'

operandTest = (op) ->
	test '/resource?$filterby=Foo ' + op + ' 2', (result) ->
		it 'should select from resource where "Foo" "' + op + '" 2', ->
			expect(result).to.be.a.query.that.
				selects(['resource', '*']).
				from('resource').
				where([sqlOps[op], ['Field', 'Foo'], ['Number', 2]])


operandTest('eq')
operandTest('ne')
operandTest('gt')
operandTest('ge')
operandTest('lt')
operandTest('le')
