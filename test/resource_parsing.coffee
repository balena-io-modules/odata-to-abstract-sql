expect = require('chai').expect
require('./chai-sql')
test = require('./test')

test '/', (result) ->
	it 'Service root should have no model', ->
		expect(result).to.be.empty


test '/model', (result) ->
	it 'should select from model', ->
		expect(result).to.be.a.query.that.selects(['model', '*']).from('model')


test '/model(1)', (result) ->
	it 'should select from model with id', ->
		expect(result).to.be.a.query.that.selects(['model', '*']).from('model').where(['Equals', ['ReferencedField', 'model', 'id'], ['Number', 1]])


test '/model(1)/child', (result) ->
	it 'should select from the child of model with id', ->
		expect(result).to.be.a.query.that.
			selects(['child', '*']).
			from('model', 'child').
			where(
				['Equals', ['ReferencedField', 'model', 'id'], ['Number', 1]]
				['Equals', ['ReferencedField', 'child', 'id'], ['ReferencedField', 'model', 'child']]
			)


test '/model(1)/$links/child', (result) ->
	it 'should select the list of children ids, for generating the links', ->
		expect(result).to.be.a.query.that.
			selects(['ReferencedField', 'model', 'child']).
			from('model').
			where(['Equals', ['ReferencedField', 'model', 'id'], ['Number', 1]])


test.skip '/method(1)/child?foo=bar', (result) ->
	it 'should do something..'
