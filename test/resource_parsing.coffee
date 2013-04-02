expect = require('chai').expect
require('./chai-sql')
test = require('./test')

test '/', (result) ->
	it 'Service root should have no model', ->
		expect(result).to.be.empty


test '/$metadata', (result) ->
	it '$metadata should return the $metadata', ->
		expect(result).to.deep.equal(['$metadata'])


test '/pilot', (result) ->
	it 'should select from pilot', ->
		expect(result).to.be.a.query.that.selects(['pilot', '*']).from('pilot')


test '/pilot(1)', (result) ->
	it 'should select from pilot with id', ->
		expect(result).to.be.a.query.that.selects(['pilot', '*']).from('pilot').where(['Equals', ['ReferencedField', 'pilot', 'id'], ['Number', 1]])


test '/pilot(1)/plane', (result) ->
	it 'should select from the plane of pilot with id', ->
		expect(result).to.be.a.query.that.
			selects(['plane', '*']).
			from('pilot', 'plane').
			where(['And',
				['Equals', ['ReferencedField', 'plane', 'id'], ['ReferencedField', 'pilot', 'plane']]
				['Equals', ['ReferencedField', 'pilot', 'id'], ['Number', 1]]
			])


do ->
	testPilot1 = (result) ->
		it 'should insert/update the pilot with id 1', ->
			expect(result).to.be.a.query.that.have.
				fields(
					['id', ['Bind', 'pilot', 'id']]
					['is experienced', ['Bind', 'pilot', 'is experienced']]
					['name',  ['Bind', 'pilot', 'name']]
					['age',  ['Bind', 'pilot', 'age']]
					['favourite colour',  ['Bind', 'pilot', 'favourite colour']]
				).
				from('pilot').
				where(['Equals', ['ReferencedField', 'pilot', 'id'], ['Number', 1]])
	test '/pilot(1)', 'PUT', testPilot1
	test '/pilot(1)', 'POST', testPilot1


test '/pilot(1)/$links/plane', (result) ->
	it 'should select the list of plane ids, for generating the links', ->
		expect(result).to.be.a.query.that.
			selects(['ReferencedField', 'pilot', 'plane']).
			from('pilot').
			where(['Equals', ['ReferencedField', 'pilot', 'id'], ['Number', 1]])


test.skip '/pilot(1)/favourite_colour/red', (result) ->
	it "should select the red component of the pilot's favourite colour"


test.skip '/method(1)/child?foo=bar', (result) ->
	it 'should do something..'
