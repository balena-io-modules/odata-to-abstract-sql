expect = require('chai').expect
require('./chai-sql')
test = require('./test')
_ = require('lodash')

sqlOps =
	eq: 'Equals'
	ne: 'NotEquals'
	gt: 'GreaterThan'
	ge: 'GreaterThanOrEqual'
	lt: 'LessThan'
	le: 'LessThanOrEqual'
	and: 'And'
	or: 'Or'
	add: 'Add'

operandToAbstractSQL = (operand) ->
	if _.isNumber(operand)
		return ['Number', operand]
	if _.isString(operand)
		if operand.charAt(0) is "'"
			return ['Text', operand[1...(operand.length - 1)]]
		return ['Field', operand]
	throw 'Unknown operand type: ' + operand

createExpression = (lhs, op, rhs) ->
	return {
		odata: (lhs.odata ? lhs) + ' ' + op + ' ' + (rhs.odata ? rhs)
		abstractsql: [sqlOps[op], lhs.abstractsql ? operandToAbstractSQL(lhs), rhs.abstractsql ? operandToAbstractSQL(rhs)]
	}

operandTest = (op, lhs, rhs = 'name') ->
	{odata, abstractsql} = createExpression(lhs, op, rhs)
	test '/pilot?$filter=' + odata, (result) ->
		it 'should select from pilot where "' + odata + '"', ->
			expect(result).to.be.a.query.that.
				selects(['pilot', '*']).
				from('pilot').
				where(abstractsql)

notTest = (expression) ->
	odata = 'not ' + if expression.odata? then '(' + expression.odata + ')' else expression
	abstractsql = ['Not', expression.abstractsql ? operandToAbstractSQL(expression)]
	test '/pilot?$filter=' + odata, (result) ->
		it 'should select from pilot where "' + odata + '"', ->
			expect(result).to.be.a.query.that.
				selects(['pilot', '*']).
				from('pilot').
				where(abstractsql)

operandTest('eq', 2)
operandTest('ne', 2)
operandTest('gt', 2)
operandTest('ge', 2)
operandTest('lt', 2)
operandTest('le', 2)

# Test each combination of operands
do ->
	operands = [
			2
			2.5
			"'bar'"
			"name"
		]
	for lhs in operands
		for rhs in operands
			operandTest('eq', lhs, rhs)

do ->
	left = createExpression('age', 'gt', 2)
	right = createExpression('age', 'lt', 10)
	operandTest('and', left, right)
	operandTest('or', left, right)
	notTest('is_experienced')
	notTest(left)

do ->
	add = createExpression('age', 'add', 2)
	operandTest('gt', add, 10)