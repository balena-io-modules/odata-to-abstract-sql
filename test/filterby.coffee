expect = require('chai').expect
{operandToAbstractSQL, pilotFields, licenceFields, planeFields, pilotCanFlyPlaneFields} = require('./chai-sql')
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
	sub: 'Subtract'
	mul: 'Multiply'
	div: 'Divide'

createExpression = (lhs, op, rhs) ->
	if lhs is 'not'
		return {
			odata: 'not ' + if op.odata? then '(' + op.odata + ')' else op
			abstractsql: ['Not', operandToAbstractSQL(op)]
		}
	if !rhs?
		return {
			odata: if lhs.odata? then '(' + lhs.odata + ')' else lhs
			abstractsql: operandToAbstractSQL(lhs)
		}
	return {
		odata: (lhs.odata ? lhs) + ' ' + op + ' ' + (rhs.odata ? rhs)
		abstractsql: [sqlOps[op], operandToAbstractSQL(lhs), operandToAbstractSQL(rhs)]
	}
createMethodCall = (method, args...) ->
	return {
		odata: method + '(' + (arg.odata ? arg for arg in args).join(',') + ')'
		abstractsql: [_.capitalize(method)].concat(operandToAbstractSQL(arg) for arg in args)
	}

operandTest = (lhs, op, rhs) ->
	{odata, abstractsql} = createExpression(lhs, op, rhs)
	test '/pilot?$filter=' + odata, (result) ->
		it 'should select from pilot where "' + odata + '"', ->
			expect(result).to.be.a.query.that.
				selects(pilotFields).
				from('pilot').
				where(abstractsql)

methodTest = (args...) ->
	{odata, abstractsql} = createMethodCall.apply(null, args)
	test '/pilot?$filter=' + odata, (result) ->
		it 'should select from pilot where "' + odata + '"', ->
			expect(result).to.be.a.query.that.
				selects(pilotFields).
				from('pilot').
				where(abstractsql)

operandTest(2, 'eq', 'name')
operandTest(2, 'ne', 'name')
operandTest(2, 'gt', 'name')
operandTest(2, 'ge', 'name')
operandTest(2, 'lt', 'name')
operandTest(2, 'le', 'name')

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
	operandTest('is_experienced')
	operandTest('not', 'is_experienced')
	operandTest('not', left)

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
				selects(pilotFields).
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
				selects(pilotCanFlyPlaneFields).
				from('pilot', 'pilot-can_fly-plane').
				where(['And'
					['Equals'
						['ReferencedField', 'pilot', 'id']
						['Number', 1]
					]
					['Equals'
						['ReferencedField', 'plane', 'id']
						['ReferencedField', 'pilot-can_fly-plane', 'plane']
					]
					abstractsql
					['Equals'
						['ReferencedField', 'pilot', 'id']
						['ReferencedField', 'pilot-can_fly-plane', 'pilot']
					]
				])

do ->
	odata = 'pilot__can_fly__plane/plane/id eq 10'
	test '/pilot?$filter=' + odata, (result) ->
		it 'should select from pilot where "' + odata + '"', ->
			expect(result).to.be.a.query.that.
				selects(pilotFields).
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

do ->
	concat = createMethodCall('concat', 'name', "'%20'")
	operandTest(concat, 'eq', "'Pete%20'")
	operandTest(createMethodCall('trim', concat), 'eq', "'Pete'")

operandTest(createMethodCall('round', 'age'), 'eq', 25)
operandTest(createMethodCall('floor', 'age'), 'eq', 25)
operandTest(createMethodCall('ceiling', 'age'), 'eq', 25)


lambdaTest = (methodName) ->
	test '/pilot?$filter=pilot__can_fly__plane/' + methodName + "(d:d/plane/name eq 'Concorde')", (result) ->
		it 'should select from pilot where ...', ->
			expect(result).to.be.a.query.that.
				selects(pilotFields).
				from('pilot').
				where(['Exists'
					['SelectQuery'
						['Select', []]
						['From', 'pilot-can_fly-plane']
						['From', 'plane']
						['Where',
							['And'
								['Equals'
									['ReferencedField', 'pilot', 'id']
									['ReferencedField', 'pilot-can_fly-plane', 'pilot']
								]
								['Equals'
									['ReferencedField', 'plane', 'id']
									['ReferencedField', 'pilot-can_fly-plane', 'plane']
								]
								['Equals'
									['ReferencedField', 'plane', 'name']
									['Text', 'Concorde']
								]
							]
						]
					]
				])

lambdaTest('any')
# lambdaTest('all')
