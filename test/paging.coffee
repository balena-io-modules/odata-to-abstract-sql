expect = require('chai').expect
require('./chai-sql')
test = require('./test')


test '/pilot?$top=5', (result) ->
	it 'should select from pilot limited by 5', ->
		expect(result).to.be.a.query.that.
			selects(['pilot', '*']).
			from('pilot').
			limit(5)


test '/pilot?$skip=100', (result) ->
	it 'should select from pilot offset by 100', ->
		expect(result).to.be.a.query.that.
			selects(['pilot', '*']).
			from('pilot').
			offset(100)


test '/pilot?$top=5&$skip=100', (result) ->
	it 'should select from pilot limited by 5 and offset by 100', ->
		expect(result).to.be.a.query.that.
			selects(['pilot', '*']).
			from('pilot').
			limit(5).
			offset(100)