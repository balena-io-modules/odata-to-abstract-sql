expect = require('chai').expect
{ pilotFields } = require('./chai-sql')
test = require('./test')


test '/pilot?$top=5', (result) ->
	it 'should select from pilot limited by 5', ->
		expect(result).to.be.a.query.that.
			selects(pilotFields).
			from('pilot').
			limit(['Number', 5])


test '/pilot?$skip=100', (result) ->
	it 'should select from pilot offset by 100', ->
		expect(result).to.be.a.query.that.
			selects(pilotFields).
			from('pilot').
			offset(['Number', 100])


test '/pilot?$top=5&$skip=100', (result) ->
	it 'should select from pilot limited by 5 and offset by 100', ->
		expect(result).to.be.a.query.that.
			selects(pilotFields).
			from('pilot').
			limit(['Number', 5]).
			offset(['Number', 100])

name = 'Peter'
test '/pilot?$top=5&$skip=100', 'PATCH', { name }, (result) ->
	it 'should update pilot limited by 5 and offset by 100', ->
		expect(result).to.be.a.query.that.updates.
			fields(
				'name'
			).
			values(
				['Bind', 'pilot', 'name']
			).
			from('pilot').
			where([
				'In',
				[ 'ReferencedField', 'pilot', 'id' ],
				[	'SelectQuery'
					[	'Select',
						[	[ 'ReferencedField', 'pilot', 'id' ]
						]
					]
					[ 'From', ['Table', 'pilot'] ]
					[ 'Limit', [ 'Number', 5 ] ]
					[ 'Offset', [ 'Number', 100 ] ]
				]
			])
test '/pilot?$top=5&$skip=100', 'DELETE', (result) ->
	it 'should delete from pilot limited by 5 and offset by 100', ->
		expect(result).to.be.a.query.that.deletes.
			from('pilot').
			where([
				'In',
				[ 'ReferencedField', 'pilot', 'id' ],
				[	'SelectQuery'
					[	'Select',
						[	[ 'ReferencedField', 'pilot', 'id' ]
						]
					]
					[ 'From', ['Table', 'pilot'] ]
					[ 'Limit', [ 'Number', 5 ] ]
					[ 'Offset', [ 'Number', 100 ] ]
				]
			])
