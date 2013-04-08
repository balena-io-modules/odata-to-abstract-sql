chai = require('chai')
chai.use(require('chai-things'))
chai.use((chai, utils) ->
	expect = chai.expect
	assertionPrototype = chai.Assertion.prototype
	chai.Assertion.prototype.contains = chai.Assertion.prototype.contain
	utils.addProperty(assertionPrototype, 'query', ->
		obj = utils.flag(this, 'object')
		expect(obj).to.be.an.instanceof Array
	)
	bodyClause = (bodyType) ->
		(bodyClauses...) ->
			obj = utils.flag(@, 'object')
			for bodyClause, i in bodyClauses
				expect(obj).to.contain.something.that.deep.equals([bodyType, bodyClause], bodyType + ' - ' + i)
			return @
	multiBodyClause = (bodyType) ->
		(bodyClauses...) ->
			obj = utils.flag(@, 'object')
			expect(obj).to.contain.something.that.deep.equals([bodyType, bodyClauses], bodyType)
			return @
	select = multiBodyClause('Select')
	utils.addMethod(assertionPrototype, 'select', select)
	utils.addChainableMethod(assertionPrototype, 'selects', select)
	utils.addMethod(assertionPrototype, 'fields', multiBodyClause('Fields'))
	utils.addMethod(assertionPrototype, 'from', bodyClause('From'))
	utils.addMethod(assertionPrototype, 'where', bodyClause('Where'))
	utils.addMethod(assertionPrototype, 'orderby', (bodyClauses...) ->
		bodyType = 'OrderBy'
		obj = utils.flag(@, 'object')
		expect(obj).to.contain.something.that.deep.equals([bodyType].concat(bodyClauses), bodyType)
		return @
	)
	utils.addMethod(assertionPrototype, 'where', bodyClause('Where'))
	utils.addMethod(assertionPrototype, 'limit', bodyClause('Limit'))
	utils.addMethod(assertionPrototype, 'offset', bodyClause('Offset'))
)