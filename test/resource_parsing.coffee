chai = require('chai')
chai.use(require('chai-things'))
chai.use((chai, utils) ->
	expect = chai.expect
	assertionPrototype = chai.Assertion.prototype
	# containPropertyDesc = Object.getOwnPropertyDescriptor(assertionPrototype, 'contain')
	# Object.defineProperty(assertionPrototype, 'contains', containPropertyDesc)
	# Object.defineProperty(assertionPrototype, 'includes', containPropertyDesc)
	chai.Assertion.prototype.contains = chai.Assertion.prototype.contain
	utils.addProperty(assertionPrototype, 'query', ->
		obj = utils.flag(this, 'object')
		expect(obj).to.be.an.instanceof Array
	)
	bodyClause = (bodyType) ->
		(bodyClauses...) ->
			obj = utils.flag(@, 'object')
			for bodyClause in bodyClauses
				expect(obj).to.contain.something.that.deep.equals([bodyType, bodyClause])
			return @
	select = bodyClause('Select')
	utils.addMethod(assertionPrototype, 'select', select)
	utils.addChainableMethod(assertionPrototype, 'selects', select)
	utils.addMethod(assertionPrototype, 'from', bodyClause('From'))
	utils.addMethod(assertionPrototype, 'where', bodyClause('Where'))
)
expect = chai.expect
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
	it 'should select from model with id', ->
		expect(result).to.be.a.query.that.selects(['child', '*']).from('model', 'child').where(['Equals', ['ReferencedField', 'model', 'id'], ['Number', 1]])
