expect = require('chai').expect
{pilotFields} = require('./chai-sql')
test = require('./test')

filterString = [1..2000].map((i) -> 'id eq ' + i).join(' or ')
test '/pilot?$filter=' + filterString, (result) ->
	it 'should select from pilot with a very long where', ->
		expect(result).to.be.a.query.that.
			selects(pilotFields).
			from('pilot')
			# with a very long where.
