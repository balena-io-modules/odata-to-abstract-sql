expect = require('chai').expect
{ operandToAbstractSQLFactory, operandToOData, aliasFields, pilotFields, pilotCanFlyPlaneFields, teamFields } = require('./chai-sql')
test = require('./test')
_ = require('lodash')

operandToAbstractSQL = null

run = do ->
	running = false
	(keyBinds, fn) ->
		if !fn?
			fn = keyBinds
			keyBinds = []
		if not running
			running = true
			operandToAbstractSQL = operandToAbstractSQLFactory(keyBinds)
			fn()
			running = false
		else
			fn()

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
			result = [method].concat(operandToAbstractSQL(arg) for arg in args)
			switch method
				when 'Substring'
					result[2] = ['Add', result[2], ['Number', 1]]
			return result
	}

operandTest = (lhs, op, rhs) ->
	run ->
		{ odata, abstractsql } = createExpression(lhs, op, rhs)
		test '/pilot?$filter=' + odata, (result) ->
			it 'should select from pilot where "' + odata + '"', ->
				expect(result).to.be.a.query.that.
					selects(pilotFields).
					from('pilot').
					where(abstractsql)

		test '/pilot/$count?$filter=' + odata, (result) ->
			it 'should count(*) from pilot where "' + odata + '"', ->
				expect(result).to.be.a.query.that.
				selects([[['Count', '*'], '$count']]).
				from('pilot').
				where(abstractsql)

methodTest = (args...) ->
	run ->
		{ odata, abstractsql } = createMethodCall.apply(null, args)
		test '/pilot?$filter=' + odata, (result) ->
			it 'should select from pilot where "' + odata + '"', ->
				expect(result).to.be.a.query.that.
					selects(pilotFields).
					from('pilot').
					where(abstractsql)
		test '/pilot/$count?$filter=' + odata, (result) ->
			it 'should count(*) from pilot where "' + odata + '"', ->
				expect(result).to.be.a.query.that.
				selects([[['Count', '*'], '$count']]).
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
			-2
			2.5
			-2.5
			"'bar'"
			'name'
			new Date()
			{ negative: true, day: 3, hour: 4, minute: 5, second: 6.7 }
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
		run ->
			mathOp = createExpression('age', mathOp, 2)
			operandTest(mathOp, 'gt', 10)

run ->
	{ odata, abstractsql } = createExpression('can_fly__plane/id', 'eq', 10)
	test '/pilot?$filter=' + odata, (result) ->
		it 'should select from pilot where "' + odata + '"', ->
			expect(result).to.be.a.query.that.
				selects(pilotFields).
				from('pilot', ['pilot-can fly-plane', 'pilot.pilot-can fly-plane']).
				where(['And'
					['Equals', ['ReferencedField', 'pilot', 'id'], ['ReferencedField', 'pilot.pilot-can fly-plane', 'pilot']]
					abstractsql
				])

run [['Number', 1]], ->
	{ odata, abstractsql } = createExpression(['plane/id', null, 'pilot.pilot-can fly-plane'], 'eq', 10)
	test '/pilot(1)/can_fly__plane?$filter=' + odata, (result) ->
		it 'should select from pilot where "' + odata + '"', ->
			expect(result).to.be.a.query.that.
				selects(aliasFields('pilot', pilotCanFlyPlaneFields)).
				from(
					'pilot'
					['pilot-can fly-plane', 'pilot.pilot-can fly-plane']
					['plane', 'pilot.pilot-can fly-plane.plane']
				).
				where(['And'
					['Equals'
						['ReferencedField', 'pilot', 'id']
						['Bind', 0]
					]
					['Equals'
						['ReferencedField', 'pilot.pilot-can fly-plane', 'can fly-plane']
						['ReferencedField', 'pilot.pilot-can fly-plane.plane', 'id']
					]
					abstractsql
					['Equals'
						['ReferencedField', 'pilot', 'id']
						['ReferencedField', 'pilot.pilot-can fly-plane', 'pilot']
					]
				])

run ->
	{ odata, abstractsql } = createExpression('can_fly__plane/plane/id', 'eq', 10)

	filterWhere = ['And'
		['Equals'
			['ReferencedField', 'pilot', 'id']
			['ReferencedField', 'pilot.pilot-can fly-plane', 'pilot']
		]
		['Equals'
			['ReferencedField', 'pilot.pilot-can fly-plane', 'can fly-plane']
			['ReferencedField', 'pilot.pilot-can fly-plane.plane', 'id']
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
				['From', ['pilot-can fly-plane', 'pilot.pilot-can fly-plane']]
				['From', ['plane', 'pilot.pilot-can fly-plane.plane']]
				[	'From'
					[	[	'SelectQuery'
							[	'Select'
								[
									[ 'Null', 'created at' ]
									[ 'Null', 'id' ]
									[ 'Null', 'person' ]
									[ 'Null', 'is experienced' ]
									[	['Cast', ['Bind', 'pilot', 'name'], 'Short Text']
										'name'
									]
									[ 'Null', 'age' ]
									[ 'Null', 'favourite colour' ]
									[ 'Null', 'is on-team' ]
									[ 'Null', 'licence' ]
									[ 'Null', 'hire date' ]
									[ 'Null', 'was trained by-pilot' ]
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
			['From', ['pilot-can fly-plane', 'pilot.pilot-can fly-plane']]
			['From', ['plane', 'pilot.pilot-can fly-plane.plane']]
			['From', 'pilot']
			['Where', filterWhere]
		]
	]

	test '/pilot?$filter=' + odata, (result) ->
		it 'should select from pilot where "' + odata + '"', ->
			expect(result).to.be.a.query.that.
				selects(pilotFields).
				from(
					'pilot'
					['pilot-can fly-plane', 'pilot.pilot-can fly-plane']
				).
				where(['And'
					['Equals'
						['ReferencedField', 'pilot', 'id']
						['ReferencedField', 'pilot.pilot-can fly-plane', 'pilot']
					]
					['Equals'
						['ReferencedField', 'pilot.pilot-can fly-plane', 'can fly-plane']
						['ReferencedField', 'pilot.pilot-can fly-plane.plane', 'id']
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
					'person'
					'is experienced'
					'name'
					'age'
					'favourite colour'
					'is on-team'
					'licence'
					'hire date'
					'was trained by-pilot'
				).
				values(
					'Default'
					'Default'
					'Default'
					'Default'
					['Bind', 'pilot', 'name']
					'Default'
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
						['From', ['pilot-can fly-plane', 'pilot.pilot-can fly-plane']]
						['From', ['plane', 'pilot.pilot-can fly-plane.plane']]
						['From', 'pilot']
						['Where'
							['And'
								['Equals'
									['ReferencedField', 'pilot', 'id']
									['ReferencedField', 'pilot.pilot-can fly-plane', 'pilot']
								]
								['Equals'
									['ReferencedField', 'pilot.pilot-can fly-plane', 'can fly-plane']
									['ReferencedField', 'pilot.pilot-can fly-plane.plane', 'id']
								]
								abstractsql
							]
						]
					]
				])

run [['Number', 1]], ->
	name = 'Peter'
	{ odata, abstractsql } = createExpression('name', 'eq', "'#{name}'")
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
									[ 'Null', 'person' ]
									[ 'Null', 'is experienced' ]
									[	['Cast', ['Bind', 'pilot', 'name'], 'Short Text']
										'name'
									]
									[ 'Null', 'age' ]
									[ 'Null', 'favourite colour' ]
									[ 'Null', 'is on-team' ]
									[ 'Null', 'licence' ]
									[ 'Null', 'hire date' ]
									[ 'Null', 'was trained by-pilot' ]
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
				['Bind', 0]
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

	test '/pilot(1)?$filter=' + odata, 'POST', { name }, (result) ->
		it 'should insert into pilot where "' + odata + '"', ->
			insertTest(result)

	test '/pilot(1)?$filter=' + odata, 'PATCH', { name }, (result) ->
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

	test '/pilot(1)?$filter=' + odata, 'PUT', { name }, (result) ->
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
					'person'
					'is experienced'
					'name'
					'age'
					'favourite colour'
					'is on-team'
					'licence'
					'hire date'
					'was trained by-pilot'
				).
				values(
					'Default'
					['Bind', 'pilot', 'id']
					'Default'
					'Default'
					['Bind', 'pilot', 'name']
					'Default'
					'Default'
					'Default'
					'Default'
					'Default'
					'Default'
				).
				from('pilot').
				where(updateWhere)

run ->
	licence = 1
	{ odata, abstractsql } = createExpression('licence/id', 'eq', licence)
	test '/pilot?$filter=' + odata, 'POST', { licence }, (result) ->
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
						[	'licence'
							'pilot.licence'
						]
					]
					[	'From'
						[	[	'SelectQuery'
								[	'Select'
									[
										[ 'Null', 'created at' ]
										[ 'Null', 'id' ]
										[ 'Null', 'person' ]
										[ 'Null', 'is experienced' ]
										[ 'Null', 'name' ]
										[ 'Null', 'age' ]
										[ 'Null', 'favourite colour' ]
										[ 'Null', 'is on-team' ]
										[	['Cast', ['Bind', 'pilot', 'licence'], 'ForeignKey']
											'licence'
										]
										[ 'Null', 'hire date' ]
										[ 'Null', 'was trained by-pilot' ]
									]
								]
							]
							'pilot'
						]
					]
					[	'Where'
						[	'And'
							['Equals', ['ReferencedField', 'pilot', 'licence'], ['ReferencedField', 'pilot.licence', 'id']]
							abstractsql
						]
					]
				).
				from('pilot')

run ->
	licence = 1
	name = 'Licence-1'
	{ odata, abstractsql } = createExpression('licence/name', 'eq', "'#{name}'")
	test "/pilot?$filter=#{odata}", 'POST', { licence }, (result) ->
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
						[	'licence'
							'pilot.licence'
						]
					]
					[	'From'
						[	[	'SelectQuery'
								[	'Select'
									[	[ 'Null', 'created at' ]
										[ 'Null', 'id' ]
										[ 'Null', 'person' ]
										[ 'Null', 'is experienced' ]
										[ 'Null', 'name' ]
										[ 'Null', 'age' ]
										[ 'Null', 'favourite colour' ]
										[ 'Null', 'is on-team' ]
										[	['Cast', ['Bind', 'pilot', 'licence'], 'ForeignKey']
											'licence'
										]
										[ 'Null', 'hire date' ]
										[ 'Null', 'was trained by-pilot' ]
									]
								]
							]
							'pilot'
						]
					]
					[	'Where'
						[	'And'
							['Equals', ['ReferencedField', 'pilot', 'licence'], ['ReferencedField', 'pilot.licence', 'id']]
							abstractsql
						]
					]
				).
				from('pilot')

methodTest('contains', 'name', "'et'")
methodTest('endswith', 'name', "'ete'")
methodTest('startswith', 'name', "'P'")

run -> operandTest(createMethodCall('length', 'name'), 'eq', 4)
run -> operandTest(createMethodCall('indexof', 'name', "'Pe'"), 'eq', 0)
# x = test
# test = test.only
run -> operandTest(createMethodCall('substring', 'name', 1), 'eq', "'ete'")
# test = x
run -> operandTest(createMethodCall('substring', 'name', 1, 2), 'eq', "'et'")
run -> operandTest(createMethodCall('tolower', 'name'), 'eq', "'pete'")
run -> operandTest(createMethodCall('tolower', 'licence/name'), 'eq', "'pete'")
run -> operandTest(createMethodCall('toupper', 'name'), 'eq', "'PETE'")
run ->
	concat = createMethodCall('concat', 'name', "'%20'")
	operandTest(createMethodCall('trim', concat), 'eq', "'Pete'")
run ->
	concat = createMethodCall('concat', 'name', "'%20'")
	operandTest(concat, 'eq', "'Pete%20'")

run -> operandTest(createMethodCall('month', 'hire_date'), 'eq', 10)
run -> operandTest(createMethodCall('year', 'hire_date'), 'eq', 2011)
run -> operandTest(createMethodCall('day', 'hire_date'), 'eq', 3)
run -> operandTest(createMethodCall('hour', 'hire_date'), 'eq', 12)
run -> operandTest(createMethodCall('minute', 'hire_date'), 'eq', 10)
run -> operandTest(createMethodCall('second', 'hire_date'), 'eq', 25)
run -> operandTest(createMethodCall('fractionalseconds', 'hire_date'), 'eq', .222)
run -> operandTest(createMethodCall('date', 'hire_date'), 'eq', "'2011-10-03'")
run -> operandTest(createMethodCall('time', 'hire_date'), 'eq', "'12:10:25.222'")
run -> operandTest(createMethodCall('totaloffsetminutes', 'hire_date'), 'eq', 60)
run -> operandTest(createMethodCall('now'), 'eq', new Date('2012-12-03T07:16:23Z'))
run -> operandTest(createMethodCall('maxdatetime'), 'eq', new Date('9999-12-31T11:59:59Z'))
run -> operandTest(createMethodCall('mindatetime'), 'eq', new Date('1970-01-01T00:00:00Z'))
run -> operandTest(createMethodCall('totalseconds', { negative: true, day: 3, hour: 4, minute: 5, second: 6.7 }), 'eq', -273906.7)
run -> operandTest(createMethodCall('round', 'age'), 'eq', 25)
run -> operandTest(createMethodCall('floor', 'age'), 'eq', 25)
run -> operandTest(createMethodCall('ceiling', 'age'), 'eq', 25)

run -> methodTest('substringof', "'Pete'", 'name')
run -> operandTest(createMethodCall('replace', 'name', "'ete'", "'at'"), 'eq', "'Pat'")

lambdaTest = (methodName) ->
	run ->
		subWhere =
			[	'And'
				[	'Equals'
					['ReferencedField', 'pilot', 'id']
					['ReferencedField', 'pilot.pilot-can fly-plane', 'pilot']
				]
				[	'Equals'
					['ReferencedField', 'pilot.pilot-can fly-plane', 'can fly-plane']
					['ReferencedField', 'pilot.pilot-can fly-plane.plane', 'id']
				]
			]
		filterWhere =
			[	'Equals'
				['ReferencedField', 'pilot.pilot-can fly-plane.plane', 'name']
				['Bind', 0]
			]
		# All is implemented as where none fail
		if methodName is 'all'
			subWhere.push(['Not', filterWhere])
		else
			subWhere.push(filterWhere)

		where =
			[	'Exists'
				[ 'SelectQuery'
					['Select', []]
					['From', ['pilot-can fly-plane', 'pilot.pilot-can fly-plane']]
					['From', ['plane', 'pilot.pilot-can fly-plane.plane']]
					['Where', subWhere]
				]
			]
		# All is implemented as where none fail
		if methodName is 'all'
			where = ['Not', where]

		test '/pilot?$filter=can_fly__plane/' + methodName + "(d:d/plane/name eq 'Concorde')", (result) ->
			it 'should select from pilot where ...', ->
				expect(result).to.be.a.query.that.
					selects(pilotFields).
					from('pilot').
					where(where)

		test '/pilot/$count?$filter=can_fly__plane/' + methodName + "(d:d/plane/name eq 'Concorde')", (result) ->
			it 'should select count(*) from pilot where ...', ->
				expect(result).to.be.a.query.that.
					selects([[['Count', '*'], '$count']]).
					from('pilot').
					where(where)

	run ->
		subWhere =
			[	'And'
				[	'Equals'
					['ReferencedField', 'pilot.pilot-can fly-plane', 'can fly-plane']
					['ReferencedField', 'pilot.pilot-can fly-plane.plane', 'id']
				]
			]
		filterWhere =
			[	'Equals'
				['ReferencedField', 'pilot.pilot-can fly-plane.plane', 'name']
				['Bind', 0]
			]
		# All is implemented as where none fail
		if methodName is 'all'
			subWhere.push(['Not', filterWhere])
		else
			subWhere.push(filterWhere)

		innerWhere =
			[ 'Exists'
				[ 'SelectQuery'
					['Select', []]
					['From', ['plane', 'pilot.pilot-can fly-plane.plane']]
					['Where', subWhere]
				]
			]

		# All is implemented as where none fail
		if methodName is 'all'
			innerWhere = ['Not', innerWhere]

		where =
			[ 'And'
				[ 'Equals'
					['ReferencedField', 'pilot', 'id']
					['ReferencedField', 'pilot.pilot-can fly-plane', 'pilot']
				]
				innerWhere
			]

		test '/pilot?$filter=can_fly__plane/plane/' + methodName + "(d:d/name eq 'Concorde')", (result) ->
			it 'should select from pilot where ...', ->
				expect(result).to.be.a.query.that.
					selects(pilotFields).
					from('pilot', ['pilot-can fly-plane', 'pilot.pilot-can fly-plane']).
					where(where)

		test '/pilot/$count?$filter=can_fly__plane/plane/' + methodName + "(d:d/name eq 'Concorde')", (result) ->
			it 'should select count(*) from pilot where ...', ->
				expect(result).to.be.a.query.that.
					selects([[['Count', '*'], '$count']]).
					from('pilot', ['pilot-can fly-plane', 'pilot.pilot-can fly-plane']).
					where(where)

lambdaTest('any')
lambdaTest('all')

# Switch operandToAbstractSQLFactory permanently to using 'team' as the resource,
# as we are switch to using that as our base resource from here on.
operandToAbstractSQLFactory = _.partialRight(operandToAbstractSQLFactory, 'team')
run ->
	favouriteColour = 'purple'
	{ odata, abstractsql } = createExpression('favourite_colour', 'eq', "'#{favouriteColour}'")
	test '/team?$filter=' + odata, 'POST', { favourite_colour: favouriteColour }, (result) ->
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

run ->
	planeName = 'Concorde'
	{ odata, abstractsql } = createExpression('includes__pilot/can_fly__plane/plane/name', 'eq', "'#{planeName}'")
	test '/team?$filter=' + odata, (result) ->
		it 'should select from team where "' + odata + '"', ->
			expect(result).to.be.a.query.that.
				selects(teamFields).
				from(
					'team'
					['pilot', 'team.includes-pilot']
					['pilot-can fly-plane', 'team.includes-pilot.pilot-can fly-plane']
					['plane', 'team.includes-pilot.pilot-can fly-plane.plane']
				).
				where([
					'And',
					[ 'Equals'
						['ReferencedField', 'team', 'favourite colour']
						['ReferencedField', 'team.includes-pilot', 'is on-team']
					]
					[	'Equals'
						['ReferencedField', 'team.includes-pilot', 'id' ]
						['ReferencedField', 'team.includes-pilot.pilot-can fly-plane', 'pilot' ]
					]
					[	'Equals'
						['ReferencedField', 'team.includes-pilot.pilot-can fly-plane', 'can fly-plane']
						['ReferencedField', 'team.includes-pilot.pilot-can fly-plane.plane', 'id']
					]
					abstractsql
				])