import { expect } from 'chai';
import { pilotFields } from './chai-sql';
import test from './test';
import * as _ from 'lodash';

const filterString = _.range(1, 2000)
	.map((i) => 'id eq ' + i)
	.join(' or ');
test('/pilot?$filter=' + filterString, (result) => {
	it('should select from pilot with a very long where', () => {
		expect(result).to.be.a.query.that.selects(pilotFields).from('pilot');
		// with a very long where.
	});
});
