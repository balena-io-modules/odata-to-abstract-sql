expect = require('chai').expect
{operandToAbstractSQL, operandToOData, pilotFields, licenceFields, planeFields, pilotCanFlyPlaneFields, teamFields} = require('./chai-sql')
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

methodMaps =
	length: 'CharacterLength'
	date: 'ToDate'
	time: 'ToTime'

createExpression = (lhs, op, rhs) ->
	if lhs is 'not'
		return {
			odata: 'not ' + if op.odata? then '(' + op.odata + ')' else operandToOData(op)
			abstractsql: ['Not', operandToAbstractSQL(op)]
		}
	if !rhs?
		return {
			odata: if lhs.odata? then '(' + lhs.odata + ')' else operandToOData(lhs)
			abstractsql: operandToAbstractSQL(lhs)
		}
	return {
		odata: operandToOData(lhs) + ' ' + op + ' ' + operandToOData(rhs)
		abstractsql: [sqlOps[op], operandToAbstractSQL(lhs), operandToAbstractSQL(rhs)]
	}
createMethodCall = (method, args...) ->
	return {
		odata: method + '(' + (operandToOData(arg) for arg in args).join(',') + ')'
		abstractsql: do ->
			if methodMaps.hasOwnProperty(method)
				method = methodMaps[method]
			else
				method = _.capitalize(method)
			switch method
				when 'Substring'
					args[1]++
			[method].concat(operandToAbstractSQL(arg) for arg in args)
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
			new Date()
			true
			false
			# null is quoted as otherwise we hit issues with coffeescript defaulting values
			'null'
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
	{odata, abstractsql} = createExpression('pilot__can_fly__plane/plane/id', 'eq', 10)

	filterWhere = ['And'
		['Equals'
			['ReferencedField', 'pilot', 'id']
			['ReferencedField', 'pilot-can_fly-plane', 'pilot']
		]
		['Equals'
			['ReferencedField', 'plane', 'id']
			['ReferencedField', 'pilot-can_fly-plane', 'plane']
		]
		abstractsql
	]
	insertTest = (result) ->
		expect(result).to.be.a.query.that.inserts.
			fields('name').
			values(
				'SelectQuery'
				[	'Select'
					[	[ 'ReferencedField', 'pilot', 'name' ]
					]
				]
				[ 'From', 'pilot-can_fly-plane' ],
				[ 'From', 'plane' ],
				[	'From'
					[	[	'SelectQuery'
							[	'Select'
								[
									[ 'Null', 'created at' ]
									[ 'Null', 'id' ]
									[ 'Null', 'is experienced' ]
									[	['Cast', ['Bind', 'pilot', 'name'], 'Short Text']
										'name'
									]
									[ 'Null', 'age' ]
									[ 'Null', 'favourite colour' ]
									[ 'Null', 'team' ]
									[ 'Null', 'licence' ]
									[ 'Null', 'hire date' ]
								]
							]
						]
						'pilot'
					]
				]
				[	'Where'
					filterWhere
				]
			).
			from('pilot')
	updateWhere = ['In'
		['ReferencedField', 'pilot', 'id']
		['SelectQuery'
			['Select'
				[	['ReferencedField', 'pilot', 'id']
				]
			],
			['From', 'pilot-can_fly-plane']
			['From', 'plane']
			['From', 'pilot']
			['Where', filterWhere]
		]
	]

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
					abstractsql
				])

	test "/pilot?$filter=#{odata}", 'PATCH', name: 'Peter', (result) ->
		it 'should update pilot where "' + odata + '"', ->
			expect(result).to.be.a.query.that.updates.
				fields('name').
				values(['Bind', 'pilot', 'name']).
				from('pilot').
				where(updateWhere)

	test "/pilot?$filter=#{odata}", 'POST', name: 'Peter', (result) ->
		it "should insert pilot where '#{odata}'", ->
			insertTest(result)

	test "/pilot?$filter=#{odata}", 'PUT', name: 'Peter', (result) ->
		describe "should select from pilot where '#{odata}'", ->
		it 'should be an upsert', ->
			expect(result).to.be.a.query.that.upserts
		it 'that inserts', ->
			insertTest(result[1])
		it 'and updates', ->
			expect(result[2]).to.be.a.query.that.updates.
				fields(
					'created at'
					'id'
					'is experienced'
					'name'
					'age'
					'favourite colour'
					'team'
					'licence'
					'hire date'
				).
				values(
					'Default'
					'Default'
					'Default'
					['Bind', 'pilot', 'name']
					'Default'
					'Default'
					'Default'
					'Default'
					'Default'
				).
				from('pilot').
				where(updateWhere)

	test '/pilot?$filter=' + odata, 'DELETE', (result) ->
		it 'should delete from pilot where "' + odata + '"', ->
			expect(result).to.be.a.query.that.deletes.
				from('pilot').
				where(['In'
					['ReferencedField', 'pilot', 'id']
					['SelectQuery'
						['Select'
							[	['ReferencedField', 'pilot', 'id']
							]
						],
						['From', 'pilot-can_fly-plane']
						['From', 'plane']
						['From', 'pilot']
						['Where'
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
									['ReferencedField', 'plane', 'id']
									['Number', 10]
								]
							]
						]
					]
				])

do ->
	name = 'Peter'
	{odata, abstractsql} = createExpression('name', 'eq', "'#{name}'")
	insertTest = (result) ->
		expect(result).to.be.a.query.that.inserts.
			fields('id', 'name').
			values(
				'SelectQuery'
				[	'Select'
					[	[ 'ReferencedField', 'pilot', 'id' ]
						[ 'ReferencedField', 'pilot', 'name' ]
					]
				]
				[	'From'
					[	[	'SelectQuery'
							[	'Select'
								[
									[ 'Null', 'created at' ]
									[	['Cast', ['Bind', 'pilot', 'id'], 'Serial']
										'id'
									]
									[ 'Null', 'is experienced' ]
									[	['Cast', ['Bind', 'pilot', 'name'], 'Short Text']
										'name'
									]
									[ 'Null', 'age' ]
									[ 'Null', 'favourite colour' ]
									[ 'Null', 'team' ]
									[ 'Null', 'licence' ]
									[ 'Null', 'hire date' ]
								]
							]
						]
						'pilot'
					]
				]
				[	'Where'
					abstractsql
				]
			).
			from('pilot')
	updateWhere = 
		[
			'And'
			[	'Equals'
				['ReferencedField', 'pilot', 'id']
				['Number', 1]
			]
			[	'In'
				['ReferencedField', 'pilot', 'id']
				[	'SelectQuery'
					[	'Select'
						[
							['ReferencedField', 'pilot', 'id']
						]
					]
					['From', 'pilot']
					[	'Where'
						abstractsql
					]
				]
			]
		]

	test '/pilot(1)?$filter=' + odata, 'POST', {name}, (result) ->
		it 'should insert into pilot where "' + odata + '"', ->
			insertTest(result)

	test '/pilot(1)?$filter=' + odata, 'PATCH', {name}, (result) ->
		it 'should update the pilot with id 1', ->
			expect(result).to.be.a.query.that.updates.
				fields(
					'id'
					'name'
				).
				values(
					['Bind', 'pilot', 'id']
					['Bind', 'pilot', 'name']
				).
				from('pilot').
				where(updateWhere)

	test '/pilot(1)?$filter=' + odata, 'PUT', {name}, (result) ->
		describe 'should upsert the pilot with id 1', ->
			it 'should be an upsert', ->
				expect(result).to.be.a.query.that.upserts
			it 'that inserts', ->
				insertTest(result[1])
			it 'and updates', ->
				expect(result[2]).to.be.a.query.that.updates.
				fields(
					'created at'
					'id'
					'is experienced'
					'name'
					'age'
					'favourite colour'
					'team'
					'licence'
					'hire date'
				).
				values(
					'Default'
					['Bind', 'pilot', 'id']
					'Default'
					['Bind', 'pilot', 'name']
					'Default'
					'Default'
					'Default'
					'Default'
					'Default'
				).
				from('pilot').
				where(updateWhere)

do ->
	licence = 1
	{odata, abstractsql} = createExpression('licence/id', 'eq', licence)
	test '/pilot?$filter=' + odata, 'POST', {licence}, (result) ->
		it 'should insert into pilot where "' + odata + '"', ->
			expect(result).to.be.a.query.that.inserts.
				fields('licence').
				values(
					'SelectQuery'
					[	'Select'
						[
							[ 'ReferencedField', 'pilot', 'licence' ]
						]
					]
					[	'From'
						'licence'
					]
					[	'From'
						[	[	'SelectQuery'
								[	'Select'
									[
										[ 'Null', 'created at' ]
										[ 'Null', 'id' ]
										[ 'Null', 'is experienced' ]
										[ 'Null', 'name' ]
										[ 'Null', 'age' ]
										[ 'Null', 'favourite colour' ]
										[ 'Null', 'team' ]
										[	['Cast', ['Bind', 'pilot', 'licence'], 'ForeignKey']
											'licence'
										]
										[ 'Null', 'hire date' ]
									]
								]
							]
							'pilot'
						]
					]
					[	'Where'
						[	'And'
							['Equals', ['ReferencedField', 'licence', 'id'], ['ReferencedField', 'pilot', 'licence']]
							abstractsql
						]
					]
				).
				from('pilot')

do ->
	licence = 1
	name = 'Licence-1'
	{odata, abstractsql} = createExpression('licence/name', 'eq', "'#{name}'")
	test "/pilot?$filter=#{odata}", 'POST', {licence}, (result) ->
		it 'should insert into pilot where "' + odata + '"', ->
			expect(result).to.be.a.query.that.inserts.
				fields('licence').
				values(
					'SelectQuery'
					[	'Select'
						[	[ 'ReferencedField', 'pilot', 'licence' ]
						]
					]
					[	'From'
						'licence'
					]
					[	'From'
						[	[	'SelectQuery'
								[	'Select'
									[	[ 'Null', 'created at' ]
										[ 'Null', 'id' ]
										[ 'Null', 'is experienced' ]
										[ 'Null', 'name' ]
										[ 'Null', 'age' ]
										[ 'Null', 'favourite colour' ]
										[ 'Null', 'team' ]
										[	['Cast', ['Bind', 'pilot', 'licence'], 'ForeignKey']
											'licence'
										]
										[ 'Null', 'hire date' ]
									]
								]
							]
							'pilot'
						]
					]
					[	'Where'
						[	'And'
							['Equals', ['ReferencedField', 'licence', 'id'], ['ReferencedField', 'pilot', 'licence']]
							abstractsql
						]
					]
				).
				from('pilot')

methodTest('contains', 'name', "'et'")
methodTest('endswith', 'name', "'ete'")
methodTest('startswith', 'name', "'P'")
operandTest(createMethodCall('length', 'name'), 'eq', 4)
operandTest(createMethodCall('indexof', 'name', "'Pe'"), 'eq', 0)
operandTest(createMethodCall('substring', 'name', 1), 'eq', "'ete'")
operandTest(createMethodCall('substring', 'name', 1, 2), 'eq', "'et'")
operandTest(createMethodCall('tolower', 'name'), 'eq', "'pete'")
operandTest(createMethodCall('tolower', 'licence/name'), 'eq', "'pete'")
operandTest(createMethodCall('toupper', 'name'), 'eq', "'PETE'")
do ->
	concat = createMethodCall('concat', 'name', "'%20'")
	operandTest(createMethodCall('trim', concat), 'eq', "'Pete'")
	operandTest(concat, 'eq', "'Pete%20'")
operandTest(createMethodCall('year', 'hire_date'), 'eq', 2011)
operandTest(createMethodCall('month', 'hire_date'), 'eq', 10)
operandTest(createMethodCall('day', 'hire_date'), 'eq', 3)
operandTest(createMethodCall('hour', 'hire_date'), 'eq', 12)
operandTest(createMethodCall('minute', 'hire_date'), 'eq', 10)
operandTest(createMethodCall('second', 'hire_date'), 'eq', 25)
operandTest(createMethodCall('fractionalseconds', 'hire_date'), 'eq', .222)
operandTest(createMethodCall('date', 'hire_date'), 'eq', "'2011-10-03'")
operandTest(createMethodCall('time', 'hire_date'), 'eq', "'12:10:25.222'")
operandTest(createMethodCall('totaloffsetminutes', 'hire_date'), 'eq', 60)
operandTest(createMethodCall('now'), 'eq', new Date('2012-12-03T07:16:23Z'))
operandTest(createMethodCall('maxdatetime'), 'eq', new Date('9999-12-31T11:59:59Z'))
operandTest(createMethodCall('mindatetime'), 'eq', new Date('1970-01-01T00:00:00Z'))
operandTest(createMethodCall('round', 'age'), 'eq', 25)
operandTest(createMethodCall('floor', 'age'), 'eq', 25)
operandTest(createMethodCall('ceiling', 'age'), 'eq', 25)

methodTest('substringof', "'Pete'", 'name')
operandTest(createMethodCall('replace', 'name', "'ete'", "'at'"), 'eq', "'Pat'")


lambdaTest = (methodName) ->
	test '/pilot?$filter=pilot__can_fly__plane/' + methodName + "(d:d/plane/name eq 'Concorde')", (result) ->
		it 'should select from pilot where ...', ->
			subWhere = 
				[	'And'
					[	'Equals'
						['ReferencedField', 'pilot', 'id']
						['ReferencedField', 'pilot-can_fly-plane', 'pilot']
					]
					[	'Equals'
						['ReferencedField', 'plane', 'id']
						['ReferencedField', 'pilot-can_fly-plane', 'plane']
					]
					[	'Equals'
						['ReferencedField', 'plane', 'name']
						['Text', 'Concorde']
					]
				]
			# All is implemented as where none fail
			if methodName is 'all'
				subWhere = ['Not', subWhere]

			where =
				[	'Exists'
					[	'SelectQuery'
						['Select', []]
						['From', 'pilot-can_fly-plane']
						['From', 'plane']
						['Where', subWhere]
					]
				]
			# All is implemented as where none fail
			if methodName is 'all'
				where = ['Not', where]

			expect(result).to.be.a.query.that.
				selects(pilotFields).
				from('pilot').
				where(where)

	test '/pilot?$filter=pilot__can_fly__plane/plane/' + methodName + "(d:d/name eq 'Concorde')", (result) ->
		it 'should select from pilot where ...', ->
			subWhere = 
				[	'And'
					[	'Equals'
						['ReferencedField', 'plane', 'id']
						['ReferencedField', 'pilot-can_fly-plane', 'plane']
					]
					[	'Equals'
						['ReferencedField', 'plane', 'name']
						['Text', 'Concorde']
					]
				]
			# All is implemented as where none fail
			if methodName is 'all'
				subWhere = ['Not', subWhere]

			where =
				[	'Exists'
					[	'SelectQuery'
						['Select', []]
						['From', 'plane']
						['Where', subWhere]
					]
				]
			# All is implemented as where none fail
			if methodName is 'all'
				where = ['Not', where]

			expect(result).to.be.a.query.that.
				selects(pilotFields).
				from('pilot', 'pilot-can_fly-plane').
				where([
					'And'
					[	'Equals'
						['ReferencedField', 'pilot', 'id']
						['ReferencedField', 'pilot-can_fly-plane', 'pilot']
					]
					where
				])

lambdaTest('any')
lambdaTest('all')

# Switch operandToAbstractSQL permanently to using 'team' as the resource,
# as we are switch to using that as our base resource from here on.
operandToAbstractSQL = _.partialRight(operandToAbstractSQL, 'team')
do ->
	favouriteColour = 'purple'
	{odata, abstractsql} = createExpression('favourite_colour', 'eq', "'#{favouriteColour}'")
	test '/team?$filter=' + odata, 'POST', {favourite_colour: favouriteColour}, (result) ->
		it 'should insert into team where "' + odata + '"', ->
			expect(result).to.be.a.query.that.inserts.
				fields('favourite colour').
				values(
					'SelectQuery'
					[	'Select'
						[	[ 'ReferencedField', 'team', 'favourite colour' ]
						]
					]
					[	'From'
						[	[	'SelectQuery'
								[	'Select'
									[	[ 'Null', 'created at' ]
										[	['Cast', ['Bind', 'team', 'favourite_colour'], 'Color']
											'favourite colour'
										]
									]
								]
							]
							'team'
						]
					]
					[	'Where'
						abstractsql
					]
				).
				from('team')

do ->
	planeName = 'Concorde'
	{odata, abstractsql} = createExpression('pilot/pilot__can_fly__plane/plane/name', 'eq', "'#{planeName}'")
	test '/team?$filter=' + odata, (result) ->
		it 'should select from team where "' + odata + '"', ->
			expect(result).to.be.a.query.that.
				selects(teamFields).
				from('team', 'pilot', 'pilot-can_fly-plane', 'plane').
				where([
					'And',
					[	'Equals'
						['ReferencedField', 'team', 'favourite colour']
						['ReferencedField', 'pilot', 'team']
					]
					[	'Equals'
						['ReferencedField', 'pilot', 'id' ]
						['ReferencedField', 'pilot-can_fly-plane', 'pilot' ]
					]
					[	'Equals'
						['ReferencedField', 'plane', 'id']
						['ReferencedField', 'pilot-can_fly-plane', 'plane']
					]
					abstractsql
				])
