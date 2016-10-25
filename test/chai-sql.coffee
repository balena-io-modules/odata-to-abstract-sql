chai = require('chai')
chai.use(require('chai-things'))
_ = require 'lodash'

chai.use((chai, utils) ->
	expect = chai.expect
	assertionPrototype = chai.Assertion.prototype
	chai.Assertion.prototype.contains = chai.Assertion.prototype.contain
	utils.addProperty(assertionPrototype, 'query', ->
		obj = utils.flag(this, 'object')
		expect(obj).to.be.an.instanceof Array
	)
	queryType = (type) ->
		->
			obj = utils.flag(this, 'object')
			expect(obj).to.contain.something.that.equals type
	bodyClause = (bodyType) ->
		(bodyClauses...) ->
			obj = utils.flag(this, 'object')
			for bodyClause, i in bodyClauses
				expect(obj).to.contain.something.that.deep.equals([bodyType, bodyClause], bodyType + ' - ' + i)
			return this
	multiBodyClause = (bodyType) ->
		(bodyClauses...) ->
			obj = utils.flag(this, 'object')
			expect(obj).to.contain.something.that.deep.equals([bodyType, bodyClauses], bodyType)
			return this

	select = do ->
		bodySelect = bodyClause('Select')
		typeSelect = queryType('SelectQuery')
		->
			typeSelect.call(this)
			bodySelect.apply(this, arguments)
	utils.addMethod(assertionPrototype, 'select', select)
	utils.addChainableMethod(assertionPrototype, 'selects', select)

	utils.addProperty(assertionPrototype, 'inserts', queryType('InsertQuery'))
	utils.addProperty(assertionPrototype, 'updates', queryType('UpdateQuery'))
	utils.addProperty(assertionPrototype, 'upserts', queryType('UpsertQuery'))
	utils.addProperty(assertionPrototype, 'deletes', queryType('DeleteQuery'))

	utils.addMethod(assertionPrototype, 'fields', multiBodyClause('Fields'))
	utils.addMethod(assertionPrototype, 'values', multiBodyClause('Values'))
	utils.addMethod(assertionPrototype, 'from', bodyClause('From'))
	utils.addMethod(assertionPrototype, 'where', bodyClause('Where'))
	utils.addMethod(assertionPrototype, 'orderby', (bodyClauses...) ->
		bodyType = 'OrderBy'
		obj = utils.flag(this, 'object')
		expect(obj).to.contain.something.that.deep.equals([bodyType].concat(bodyClauses), bodyType)
		return this
	)
	utils.addMethod(assertionPrototype, 'groupby', multiBodyClause('GroupBy'))
	utils.addMethod(assertionPrototype, 'where', bodyClause('Where'))
	utils.addMethod(assertionPrototype, 'limit', bodyClause('Limit'))
	utils.addMethod(assertionPrototype, 'offset', bodyClause('Offset'))
)

clientModel = require('./client-model.json')
exports.operandToAbstractSQLFactory = (binds = [], defaultResource = 'pilot', defaultParentAlias = defaultResource) ->
	return operandToAbstractSQL = (operand, resource = defaultResource, parentAlias = defaultParentAlias) ->
		if operand.abstractsql?
			return operand.abstractsql
		if _.isBoolean(operand)
			binds.push(['Boolean', operand])
			return ['Bind', binds.length - 1]
		if _.isNumber(operand)
			binds.push(['Number', operand])
			return ['Bind', binds.length - 1]
		if _.isDate(operand)
			binds.push(['Date', operand])
			return ['Bind', binds.length - 1]
		if _.isString(operand)
			if operand is 'null'
				return 'Null'
			if operand.charAt(0) is "'"
				binds.push(['Text', decodeURIComponent(operand[1...(operand.length - 1)])])
				return ['Bind', binds.length - 1]
			fieldParts = operand.split('/')
			if fieldParts.length > 1
				alias = parentAlias
				for fieldPart in fieldParts[...-2]
					alias = "#{alias}.#{fieldPart.replace(/__/g, '-')}"
				mapping = clientModel.resourceToSQLMappings[fieldParts[fieldParts.length - 2]][fieldParts[fieldParts.length - 1]]
				mapping = ["#{alias}.#{mapping[0]}", mapping[1...]...]
			else
				mapping = clientModel.resourceToSQLMappings[resource][operand]
			return ['ReferencedField'].concat(mapping)
		if _.isArray(operand)
			return operandToAbstractSQL(operand...)
		if _.isObject(operand)
			return [ 'Duration', operand ]
		throw new Error('Unknown operand type: ' + operand)

exports.operandToOData = operandToOData = (operand) ->
	if operand.odata?
		return operand.odata
	if _.isDate(operand)
		return "datetime'" + encodeURIComponent(operand.toISOString()) + "'"
	if _.isArray(operand)
		return operandToOData(operand[0])
	if _.isObject(operand)
		duration = []
		t = false
		if operand.negative
			duration.push('-')
		duration.push('P')
		if operand.day?
			duration.push(operand.day, 'D')
		if operand.hour?
			t = true
			duration.push('T', operand.hour, 'H')
		if operand.minute?
			if not t
				t = true
				duration.push('T')
			duration.push(operand.minute, 'M')
		if operand.second?
			if not t
				t = true
				duration.push('T')
			duration.push(operand.second, 'S')
		if duration.length < 3
			throw new Error('Duration must contain at least 1 component')
		return "duration'#{duration.join('')}'"
	return operand

exports.shortenAlias = shortenAlias = (alias) ->
	if alias.length >= 64
		return alias.replace(/pilot/, 'pi')
	return alias

exports.aliasFields = do ->
	aliasField = (resourceAlias, field) ->
		if field[0] is 'ReferencedField'
			return [field[0], shortenAlias("#{resourceAlias}.#{field[1]}"), field[2]]
		if field.length is 2 and field[0][0] is 'ReferencedField'
			return [
				aliasField(resourceAlias, field[0])
				field[1]
			]
		else
			return field
	return (resourceAlias, fields) ->
		_.map(fields, _.partial(aliasField, resourceAlias))

exports.pilotFields = [
	[['ReferencedField', 'pilot', 'created at'], 'created_at']
	['ReferencedField', 'pilot', 'id']
	['ReferencedField', 'pilot', 'person']
	[['ReferencedField', 'pilot', 'is experienced'], 'is_experienced']
	['ReferencedField', 'pilot', 'name']
	['ReferencedField', 'pilot', 'age']
	[['ReferencedField', 'pilot', 'favourite colour'], 'favourite_colour']
	['ReferencedField', 'pilot', 'team']
	['ReferencedField', 'pilot', 'licence']
	[['ReferencedField', 'pilot', 'hire date'], 'hire_date']
	['ReferencedField', 'pilot', 'pilot']
]

exports.licenceFields = [
	[['ReferencedField', 'licence', 'created at'], 'created_at']
	['ReferencedField', 'licence', 'id']
	['ReferencedField', 'licence', 'name']
]

exports.planeFields = [
	[['ReferencedField', 'plane', 'created at'], 'created_at']
	['ReferencedField', 'plane', 'id']
	['ReferencedField', 'plane', 'name']
]

exports.pilotCanFlyPlaneFields = [
	[['ReferencedField', 'pilot-can_fly-plane', 'created at'], 'created_at']
	['ReferencedField', 'pilot-can_fly-plane', 'pilot']
	['ReferencedField', 'pilot-can_fly-plane', 'plane']
	['ReferencedField', 'pilot-can_fly-plane', 'id']
]

exports.teamFields = [
	[['ReferencedField', 'team', 'created at'], 'created_at']
	[['ReferencedField', 'team', 'favourite colour'], 'favourite_colour']
]
