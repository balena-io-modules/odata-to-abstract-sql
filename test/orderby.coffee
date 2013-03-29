expect = require('chai').expect
require('./chai-sql')
test = require('./test')

test '/pilot?$orderby=name', (result) ->
	it 'should order by name', ->
		expect(result).to.be.a.query.that.
			selects(['pilot', '*']).
			from('pilot').
			orderby(['DESC', 'name'])


test '/pilot?$orderby=name,age', (result) ->
	it 'should order by name desc, age desc', ->
		expect(result).to.be.a.query.that.
			selects(['pilot', '*']).
			from('pilot').
			orderby(
				['DESC', 'name']
				['DESC', 'age']
			)