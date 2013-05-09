expect = require('chai').expect
require('./chai-sql')
test = require('./test')

test '/', (result) ->
	it 'Service root should return $serviceroot', ->
		expect(result).to.deep.equal(['$serviceroot'])


test '/$metadata', (result) ->
	it '$metadata should return $metadata', ->
		expect(result).to.deep.equal(['$metadata'])


test '/pilot', (result) ->
	it 'should select from pilot', ->
		expect(result).to.be.a.query.that.selects(['pilot', '*']).from('pilot')


test '/pilot(1)', (result) ->
	it 'should select from pilot with id', ->
		expect(result).to.be.a.query.that.selects(['pilot', '*']).from('pilot').where(['Equals', ['ReferencedField', 'pilot', 'id'], ['Number', 1]])


test '/pilot(1)/licence', (result) ->
	it 'should select from the licence of pilot with id', ->
		expect(result).to.be.a.query.that.
			selects(['licence', '*']).
			from('pilot', 'licence').
			where(['And',
				['Equals', ['ReferencedField', 'pilot', 'id'], ['Number', 1]]
				['Equals', ['ReferencedField', 'licence', 'id'], ['ReferencedField', 'pilot', 'licence']]
			])


test '/licence(1)/pilot', (result) ->
	it 'should select from the pilots of licence with id', ->
		expect(result).to.be.a.query.that.
			selects(['pilot', '*']).
			from('pilot', 'licence').
			where(['And',
				['Equals', ['ReferencedField', 'licence', 'id'], ['Number', 1]]
				['Equals', ['ReferencedField', 'licence', 'id'], ['ReferencedField', 'pilot', 'licence']]
			])


test '/pilot(1)/pilot__can_fly__plane/plane', (result) ->
	it 'should select from the plane of pilot with id', ->
		expect(result).to.be.a.query.that.
			selects(['plane', '*']).
			from('pilot', 'pilot-can_fly-plane', 'plane').
			where(['And',
				['Equals', ['ReferencedField', 'pilot', 'id'], ['Number', 1]]
				['Equals', ['ReferencedField', 'plane', 'id'], ['ReferencedField', 'pilot-can_fly-plane', 'plane']]
				['Equals', ['ReferencedField', 'pilot', 'id'], ['ReferencedField', 'pilot-can_fly-plane', 'pilot']]
			])


test '/plane(1)/pilot__can_fly__plane/pilot', (result) ->
	it 'should select from the pilots of plane with id', ->
		expect(result).to.be.a.query.that.
			selects(['pilot', '*']).
			from('pilot', 'plane').
			where(['And',
				['Equals', ['ReferencedField', 'plane', 'id'], ['Number', 1]]
				['Equals', ['ReferencedField', 'pilot', 'id'], ['ReferencedField', 'pilot-can_fly-plane', 'pilot']]
				['Equals', ['ReferencedField', 'plane', 'id'], ['ReferencedField', 'pilot-can_fly-plane', 'plane']]
			])


test '/pilot(1)', 'PUT', (result) ->
	it 'should insert/update the pilot with id 1', ->
		expect(result).to.be.a.query.that.have.
			fields(
				['id', ['Bind', 'pilot', 'id']]
				['is experienced', ['Bind', 'pilot', 'is_experienced']]
				['name', ['Bind', 'pilot', 'name']]
				['age', ['Bind', 'pilot', 'age']]
				['favourite colour', ['Bind', 'pilot', 'favourite colour']]
				['licence', ['Bind', 'pilot', 'licence']]
			).
			from('pilot').
			where(['Equals', ['ReferencedField', 'pilot', 'id'], ['Number', 1]])


do ->
	testFunc = (result) ->
		it 'should update the pilot with id 1', ->
			expect(result).to.be.a.query.that.have.
				fields(
					['id', ['Bind', 'pilot', 'id']]
				).
				from('pilot').
				where(['Equals', ['ReferencedField', 'pilot', 'id'], ['Number', 1]])
	test '/pilot(1)', 'PATCH', testFunc
	test '/pilot(1)', 'MERGE', testFunc

do ->
	testFunc = (result) ->
		it 'should update the pilot with id 1', ->
			expect(result).to.be.a.query.that.have.
				fields(
					['id', ['Bind', 'pilot', 'id']]
					['is experienced', ['Bind', 'pilot', 'is_experienced']]
				).
				from('pilot').
				where(['Equals', ['ReferencedField', 'pilot', 'id'], ['Number', 1]])
	test '/pilot(1)', 'PATCH', {is_experienced: true}, testFunc
	test '/pilot(1)', 'MERGE', {is_experienced: true}, testFunc

test '/pilot', 'POST', (result) ->
	it 'should insert a pilot', ->
		expect(result).to.be.a.query.that.have.
			fields(
				['id', ['Bind', 'pilot', 'id']]
				['is experienced', ['Bind', 'pilot', 'is_experienced']]
				['name', ['Bind', 'pilot', 'name']]
				['age', ['Bind', 'pilot', 'age']]
				['favourite colour', ['Bind', 'pilot', 'favourite colour']]
				['licence', ['Bind', 'pilot', 'licence']]
			).
			from('pilot')


test '/pilot(1)/$links/licence', (result) ->
	it 'should select the list of licence ids, for generating the links', ->
		expect(result).to.be.a.query.that.
			selects(['ReferencedField', 'pilot', 'licence']).
			from('pilot').
			where(['Equals', ['ReferencedField', 'pilot', 'id'], ['Number', 1]])


test '/pilot(1)/$links/licence(2)', (result) ->
	it 'should select the licence id 2, for generating the link', ->
		expect(result).to.be.a.query.that.
			selects(['ReferencedField', 'pilot', 'licence']).
			from('pilot').
			where(['And'
				['Equals', ['ReferencedField', 'pilot', 'id'], ['Number', 1]]
				['Equals', ['ReferencedField', 'pilot', 'licence'], ['Number', 2]]
			])


test '/pilot(1)/pilot__can_fly__plane/$links/plane', (result) ->
	it 'should select the list of plane ids, for generating the links', ->
		expect(result).to.be.a.query.that.
			selects(['ReferencedField', 'pilot-can_fly-plane', 'plane']).
			from('pilot').
			where(['And',
				['Equals', ['ReferencedField', 'pilot', 'id'], ['Number', 1]]
				['Equals', ['ReferencedField', 'pilot', 'id'], ['ReferencedField', 'pilot-can_fly-plane', 'pilot']]
			])


test.skip '/pilot(1)/favourite_colour/red', (result) ->
	it "should select the red component of the pilot's favourite colour"


test.skip '/method(1)/child?foo=bar', (result) ->
	it 'should do something..'
