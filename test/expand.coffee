expect = require('chai').expect
{operandToAbstractSQL} = require('./chai-sql')
test = require('./test')

test '/pilot?$expand=licence', (result) ->
	it 'should select from pilot.*, licence.*', ->
		expect(result).to.be.a.query.that.
			selects(
				['licence', '*']
				['pilot', '*']
			).
			from('pilot', 'licence')
