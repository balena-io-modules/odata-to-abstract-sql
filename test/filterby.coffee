expect = require('chai').expect
require('./chai-sql')
test = require('./test')
_ = require('lodash')
clientModel = require('./client-model.json')

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
	sub: 'Subtract'
	mul: 'Multiply'
	div: 'Divide'

operandToAbstractSQL = (operand) ->
	if _.isNumber(operand)
		return ['Number', operand]
	if _.isString(operand)
		if operand.charAt(0) is "'"
			return ['Text', operand[1...(operand.length - 1)]]
		fieldParts = operand.split('/')
		if fieldParts.length > 1
			tableName = clientModel.resourceToSQLMappings[fieldParts[0]]._name
			return ['ReferencedField', tableName, fieldParts[1]]
		return ['Field', operand]
	throw 'Unknown operand type: ' + operand

createExpression = (lhs, op, rhs) ->
	return {
		odata: (lhs.odata ? lhs) + ' ' + op + ' ' + (rhs.odata ? rhs)
		abstractsql: [sqlOps[op], lhs.abstractsql ? operandToAbstractSQL(lhs), rhs.abstractsql ? operandToAbstractSQL(rhs)]
	}
createMethodCall = (method, args...) ->
	return {
		odata: method + '(' + (arg.odata ? arg for arg in args).join(',') + ')'
		abstractsql: [method].concat(arg.abstractsql ? operandToAbstractSQL(arg) for arg in args)
	}

operandTest = (lhs, op, rhs = 'name') ->
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

methodTest = (args...) ->
	{odata, abstractsql} = createMethodCall.apply(null, args)
	test '/pilot?$filter=' + odata, (result) ->
		it 'should select from pilot where "' + odata + '"', ->
			expect(result).to.be.a.query.that.
				selects(['pilot', '*']).
				from('pilot').
				where(abstractsql)

operandTest(2, 'eq')
operandTest(2, 'ne')
operandTest(2, 'gt')
operandTest(2, 'ge')
operandTest(2, 'lt')
operandTest(2, 'le')

# Test each combination of operands
do ->
	operands = [
			2
			2.5
			"'bar'"
			"name"
			"pilot/name"
		]
	for lhs in operands
		for rhs in operands
			operandTest(lhs, 'eq', rhs)

do ->
	left = createExpression('age', 'gt', 2)
	right = createExpression('age', 'lt', 10)
	operandTest(left, 'and', right)
	operandTest(left, 'or', right)
	notTest('is_experienced')
	notTest(left)

do ->
	mathOps = [
		'add'
		'sub'
		'mul'
		'div'
	]
	for mathOp in mathOps
		mathOp = createExpression('age', mathOp, 2)
		operandTest(mathOp, 'gt', 10)

do ->
	{odata, abstractsql} = createExpression('pilot__can_fly__plane/id', 'eq', 10)
	test '/pilot?$filter=' + odata, (result) ->
		it 'should select from pilot where "' + odata + '"', ->
			expect(result).to.be.a.query.that.
				selects(['pilot', '*']).
				from('pilot', 'pilot-can_fly-plane').
				where(['And'
					['Equals', ['ReferencedField', 'pilot', 'id'], ['ReferencedField', 'pilot-can_fly-plane', 'pilot']]
					abstractsql
				])

do ->
	{odata, abstractsql} = createExpression('plane/id', 'eq', 10)
	test '/pilot(1)/pilot__can_fly__plane?$filter=' + odata, (result) ->
		it 'should select from pilot where "' + odata + '"', ->
			expect(result).to.be.a.query.that.
				selects(['pilot-can_fly-plane', '*']).
				from('pilot', 'pilot-can_fly-plane').
				where(['And'
					['Equals'
						['ReferencedField', 'plane', 'id']
						['ReferencedField', 'pilot-can_fly-plane', 'plane']
					]
					abstractsql
					['Equals'
						['ReferencedField', 'pilot', 'id']
						['ReferencedField', 'pilot-can_fly-plane', 'pilot']
					]
					['Equals'
						['ReferencedField', 'pilot', 'id']
						['Number', 1]
					]
				])

do ->
	odata = 'pilot__can_fly__plane/plane/id eq 10'
	test '/pilot?$filter=' + odata, (result) ->
		it 'should select from pilot where "' + odata + '"', ->
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
					['Equals'
						['ReferencedField', 'plane', 'id']
						['Number', 10]
					]
				])

methodTest('substringof', "'Pete'", 'name')
methodTest('startswith', 'name', "'P'")
methodTest('endswith', 'name', "'ete'")
operandTest(createMethodCall('length', 'name'), 'eq', 4)
operandTest(createMethodCall('indexof', 'name', "'Pe'"), 'eq', 0)
operandTest(createMethodCall('replace', 'name', "'ete'", "'at'"), 'eq', "'Pat'")
operandTest(createMethodCall('substring', 'name', 1), 'eq', "'ete'")
operandTest(createMethodCall('substring', 'name', 1, 2), 'eq', "'et'")
operandTest(createMethodCall('tolower', 'name'), 'eq', "'pete'")
operandTest(createMethodCall('toupper', 'name'), 'eq', "'PETE'")
