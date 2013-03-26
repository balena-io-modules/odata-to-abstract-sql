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

operands =
	2: ['Number', 2]
	2.5: ['Number', 2.5]
	"'bar'": ['Text', 'bar']
	"Foo": ['Field', 'Foo']

operandTest = (op, lhs, rhs = 'Foo') ->
	test '/resource?$filterby=' + lhs + ' ' + op + ' ' + rhs, (result) ->
		it 'should select from resource where "' + lhs + '" "' + op + '" "' + rhs + '"', ->
			expect(result).to.be.a.query.that.
				selects(['resource', '*']).
				from('resource').
				where([sqlOps[op], operands[lhs], operands[rhs]])

operandTest('eq', 2)
operandTest('ne', 2)
operandTest('gt', 2)
operandTest('ge', 2)
operandTest('lt', 2)
operandTest('le', 2)

operandTest('eq', "'bar'")
operandTest('eq', 2.5)
