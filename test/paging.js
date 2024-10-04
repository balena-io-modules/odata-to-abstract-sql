import { expect } from 'chai';
import { pilotFields } from './chai-sql';
import test from './test';

test('/pilot?$top=5', (result) =>
	it('should select from pilot limited by 5', () =>
		expect(result)
			.to.be.a.query.that.selects(pilotFields)
			.from('pilot')
			.limit(['Bind', 0])));

test('/pilot?$skip=100', (result) =>
	it('should select from pilot offset by 100', () =>
		expect(result)
			.to.be.a.query.that.selects(pilotFields)
			.from('pilot')
			.offset(['Bind', 0])));

test('/pilot?$top=5&$skip=100', (result) =>
	it('should select from pilot limited by 5 and offset by 100', () =>
		expect(result)
			.to.be.a.query.that.selects(pilotFields)
			.from('pilot')
			.limit(['Bind', 0])
			.offset(['Bind', 1])));

const name = 'Peter';
test('/pilot?$top=5&$skip=100', 'PATCH', { name }, (result) =>
	it('should update pilot limited by 5 and offset by 100', () =>
		expect(result)
			.to.be.a.query.that.updates.fields('name')
			.values(['Bind', 'pilot', 'name'])
			.from('pilot')
			.where([
				'In',
				['ReferencedField', 'pilot', 'id'],
				[
					'SelectQuery',
					[
						'Select',
						[['Alias', ['ReferencedField', 'pilot', 'id'], '$modifyid']],
					],
					['From', ['Table', 'pilot']],
					['Limit', ['Bind', 0]],
					['Offset', ['Bind', 1]],
				],
			])),
);
test('/pilot?$top=5&$skip=100', 'DELETE', (result) =>
	it('should delete from pilot limited by 5 and offset by 100', () =>
		expect(result)
			.to.be.a.query.that.deletes.from('pilot')
			.where([
				'In',
				['ReferencedField', 'pilot', 'id'],
				[
					'SelectQuery',
					[
						'Select',
						[['Alias', ['ReferencedField', 'pilot', 'id'], '$modifyid']],
					],
					['From', ['Table', 'pilot']],
					['Limit', ['Bind', 0]],
					['Offset', ['Bind', 1]],
				],
			])),
);
