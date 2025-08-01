import _ from 'lodash';
import * as chai from 'chai';
import chaiThings from 'chai-things';
import fs from 'fs';
import LfToAbstractSql from '@balena/lf-to-abstract-sql';
import { SBVRParser } from '@balena/sbvr-parser';
import sbvrTypes from '@balena/sbvr-types';
import type {
	AliasNode,
	BindNode,
	BooleanNode,
	CountNode,
	DateNode,
	DateTruncNode,
	DurationNode,
	NullNode,
	NumberNode,
	ReferencedFieldNode,
	TextNode,
} from '@balena/abstract-sql-compiler';
import { optimizeSchema } from '@balena/abstract-sql-compiler';

chai.use(chaiThings);

chai.use(function ($chai, utils) {
	const { expect } = $chai;
	const assertionPrototype = $chai.Assertion.prototype;
	utils.addProperty(assertionPrototype, 'query', function () {
		const obj = utils.flag(this, 'object');
		return expect(obj).to.be.an.instanceof(Array);
	});
	const queryType = (type: string) =>
		function () {
			const obj = utils.flag(this, 'object');
			return expect(obj).to.contain.something.that.equals(type);
		};
	const bodyClause = (bodyType: string) =>
		function (...bodyClauses) {
			const obj = utils.flag(this, 'object');
			if (bodyClauses.length === 0) {
				const topLevelBodyTypeNodes = obj.filter(
					(v) => Array.isArray(v) && v[0] === bodyType,
				);
				// We use deep.equal as an easy way to print the diff in case this fails
				expect(topLevelBodyTypeNodes).to.deep.equal([]);
			} else {
				for (let i = 0; i < bodyClauses.length; i++) {
					expect(obj).to.contain.something.that.deep.equals(
						[bodyType, bodyClauses[i]],
						bodyType + ' - ' + i,
					);
				}
			}
			return this;
		};
	const multiBodyClause = (bodyType: string) =>
		function (...bodyClauses) {
			const obj = utils.flag(this, 'object');
			expect(obj).to.contain.something.that.deep.equals(
				[bodyType, bodyClauses],
				bodyType,
			);
			return this;
		};
	const binaryClause = (bodyType: string) =>
		function (...bodyClauses) {
			const obj = utils.flag(this, 'object');
			for (let i = 0; i < bodyClauses.length; i++) {
				expect(obj).to.contain.something.that.deep.equals(
					[bodyType, bodyClauses[i][0], bodyClauses[i][1]],
					bodyType + ' - ' + i,
				);
			}
			return this;
		};

	const select = (function () {
		const bodySelect = bodyClause('Select');
		const typeSelect = queryType('SelectQuery');
		return function (...args) {
			typeSelect.call(this);
			return bodySelect.apply(this, args);
		};
	})();
	utils.addMethod(assertionPrototype, 'select', select);
	utils.addChainableMethod(assertionPrototype, 'selects', select);

	utils.addProperty(assertionPrototype, 'inserts', queryType('InsertQuery'));
	utils.addProperty(assertionPrototype, 'updates', queryType('UpdateQuery'));
	utils.addProperty(assertionPrototype, 'upserts', queryType('UpsertQuery'));
	utils.addProperty(assertionPrototype, 'deletes', queryType('DeleteQuery'));

	utils.addMethod(assertionPrototype, 'fields', multiBodyClause('Fields'));
	utils.addMethod(assertionPrototype, 'values', multiBodyClause('Values'));
	const fromClause = bodyClause('From');
	utils.addMethod(assertionPrototype, 'from', function (...bodyClauses) {
		bodyClauses = bodyClauses.map(function (v) {
			if (typeof v === 'string') {
				return ['Table', v];
			}
			return ['Alias', ['Table', v[0]], v[1]];
		});
		return fromClause.apply(this, bodyClauses);
	});
	const leftJoinClause = binaryClause('LeftJoin');
	utils.addMethod(assertionPrototype, 'leftJoin', function (...bodyClauses) {
		bodyClauses = bodyClauses.map(function ([v, condition]) {
			const resource =
				typeof v === 'string' ? ['Table', v] : ['Alias', ['Table', v[0]], v[1]];
			return [resource, ['On', condition]];
		});
		return leftJoinClause.apply(this, bodyClauses);
	});
	utils.addMethod(assertionPrototype, 'where', bodyClause('Where'));
	utils.addMethod(assertionPrototype, 'orderby', function (...bodyClauses) {
		const bodyType = 'OrderBy';
		const obj = utils.flag(this, 'object');
		expect(obj).to.contain.something.that.deep.equals(
			[bodyType].concat(bodyClauses),
			bodyType,
		);
		return this;
	});
	utils.addMethod(assertionPrototype, 'groupby', multiBodyClause('GroupBy'));
	utils.addMethod(assertionPrototype, 'limit', bodyClause('Limit'));
	utils.addMethod(assertionPrototype, 'offset', bodyClause('Offset'));
});

const generateClientModel = function (input: string) {
	const typeVocab = fs.readFileSync(
		new URL(import.meta.resolve('@balena/sbvr-types/Type.sbvr')),
		'utf8',
	);

	const SBVRParserInstance = SBVRParser.createInstance();
	SBVRParserInstance.enableReusingMemoizations(
		SBVRParserInstance._sideEffectingRules,
	);
	SBVRParserInstance.AddCustomAttribute('Database ID Field:');
	SBVRParserInstance.AddCustomAttribute('Database Table Name:');
	SBVRParserInstance.AddBuiltInVocab(typeVocab);

	const LF2AbstractSQLTranslator = LfToAbstractSql.createTranslator(sbvrTypes);

	const lf = SBVRParserInstance.matchAll(input, 'Process');
	const abstractSql = LF2AbstractSQLTranslator(lf, 'Process');

	abstractSql.tables['copilot'].fields.push({
		fieldName: 'is blocked',
		dataType: 'Boolean',
		computed: ['Boolean', false],
	});

	abstractSql.tables['copilot'].fields.push({
		fieldName: 'rank',
		dataType: 'Text',
		computed: ['Text', 'Junior'],
	});
	return optimizeSchema(abstractSql);
};

const sbvrModel = fs.readFileSync(
	new URL(import.meta.resolve('./model.sbvr')),
	'utf8',
);
export const clientModel = generateClientModel(sbvrModel);

const odataNameToSqlName = (odataName: string) =>
	odataName.replace(/__/g, '-').replace(/_/g, ' ');

export function sqlNameToOdataName(sqlName: string) {
	return sqlName.replace(/-/g, '__').replace(/ /g, '_');
}

type AbstractSqlBind =
	| BindNode
	| NullNode
	| DateTruncNode
	| ReferencedFieldNode
	| DurationNode;
export function operandToAbstractSQLFactory(
	binds: Array<BooleanNode | NumberNode | DateNode | NullNode | TextNode> = [],
	defaultResource = 'pilot',
	defaultParentAlias = defaultResource,
) {
	const operandToAbstractSQL = function (
		operand:
			| string
			| number
			| boolean
			| Date
			| [string, string, string]
			| { abstractsql: AbstractSqlBind },
		resource = defaultResource,
		parentAlias = defaultParentAlias,
	): AbstractSqlBind | AbstractSqlBind[] {
		if (typeof operand === 'object' && 'abstractsql' in operand) {
			return operand.abstractsql;
		}
		if (typeof operand === 'boolean') {
			binds.push(['Boolean', operand]);
			return ['Bind', binds.length - 1];
		}
		if (typeof operand === 'number') {
			binds.push(['Number', operand]);
			return ['Bind', binds.length - 1];
		}
		if (_.isDate(operand)) {
			binds.push(['Date', operand]);
			return ['Bind', binds.length - 1];
		}
		if (typeof operand === 'string') {
			if (operand === 'null') {
				return ['Null'];
			}
			if (operand.startsWith('(')) {
				return operand
					.slice(1, -1)
					.split(',')
					.map(function (op): AbstractSqlBind {
						const n = parseInt(op, 10);
						if (Number.isFinite(n)) {
							return operandToAbstractSQL(n) as AbstractSqlBind;
						}

						return operandToAbstractSQL(op) as AbstractSqlBind;
					});
			}

			if (operand.startsWith("'")) {
				binds.push([
					'Text',
					decodeURIComponent(operand.slice(1, operand.length - 1)),
				]);
				return ['Bind', binds.length - 1];
			}
			let mapping;
			const fieldParts = operand.split('/');
			if (fieldParts.length > 1) {
				let alias = parentAlias;
				let previousResource = _(parentAlias).split('.').last()!;
				for (const resourceName of fieldParts.slice(0, -1)) {
					const sqlName = odataNameToSqlName(resourceName);
					const sqlNameParts = sqlName.split('-');
					mapping = _.get(
						clientModel.relationships[previousResource],
						sqlNameParts,
					).$;
					const refTable = mapping[1][0];
					if (sqlNameParts.length > 1 && !refTable.includes('-')) {
						// Add the verb to tables that don't include the verb already
						alias = `${alias}.${sqlNameParts[0]}-${refTable}`;
					} else {
						alias = `${alias}.${refTable}`;
					}
					previousResource = refTable;
				}
				mapping = [alias, _.last(fieldParts)];
			} else {
				mapping = [resource, odataNameToSqlName(operand)];
			}
			// Data type check by field names that are dates
			if (
				mapping[1] === 'created at' ||
				mapping[1] === 'modified at' ||
				mapping[1] === 'hire date'
			) {
				return [
					'DateTrunc',
					['EmbeddedText', 'milliseconds'],
					['ReferencedField', ...mapping] as ReferencedFieldNode,
					['EmbeddedText', 'UTC'],
				];
			}
			return ['ReferencedField', ...mapping] as ReferencedFieldNode;
		}
		if (Array.isArray(operand)) {
			return operandToAbstractSQL(...operand);
		}
		if (typeof operand === 'object') {
			return ['Duration', operand];
		}
		throw new Error(`Unknown operand type: ${operand}`);
	};
	return operandToAbstractSQL;
}

export const operandToOData = function (operand): string {
	if (operand.odata != null) {
		return operand.odata;
	}
	if (_.isDate(operand)) {
		return "datetime'" + encodeURIComponent(operand.toISOString()) + "'";
	}
	if (Array.isArray(operand)) {
		return operandToOData(operand[0]);
	}
	if (operand !== null && typeof operand === 'object') {
		const duration: string[] = [];
		let t = false;
		if (operand.negative) {
			duration.push('-');
		}
		duration.push('P');
		if (operand.day != null) {
			duration.push(operand.day, 'D');
		}
		if (operand.hour != null) {
			t = true;
			duration.push('T', operand.hour, 'H');
		}
		if (operand.minute != null) {
			if (!t) {
				t = true;
				duration.push('T');
			}
			duration.push(operand.minute, 'M');
		}
		if (operand.second != null) {
			if (!t) {
				t = true;
				duration.push('T');
			}
			duration.push(operand.second, 'S');
		}
		if (duration.length < 3) {
			throw new Error('Duration must contain at least 1 component');
		}
		return `duration'${duration.join('')}'`;
	}
	return operand;
};

export const shortenAlias = function (alias: string) {
	while (alias.length >= 64) {
		alias = alias
			.replace(/(^|[^-])pilot/, '$1pi')
			.replace(/trained-pilot/, 'tr-pi');
	}
	return alias;
};

export const aliasFields = (function () {
	const aliasField = function (
		resourceAlias: string,
		verb: string,
		field: Fields[number],
	): Fields[number] {
		if (field[0] === 'ReferencedField') {
			return [
				field[0],
				shortenAlias(`${resourceAlias}.${verb}${field[1]}`),
				field[2],
			];
		}
		if (field[0] === 'Alias') {
			return [
				'Alias',
				aliasField(resourceAlias, verb, field[1]) as ReferencedFieldNode,
				field[2],
			];
		} else {
			return field;
		}
	};
	return function (resourceAlias: string, fields: Fields, verb?: string) {
		if (verb != null) {
			verb = verb + '-';
		} else {
			verb = '';
		}
		return fields.map(_.partial(aliasField, resourceAlias, verb));
	};
})();

type Fields = Array<ReferencedFieldNode | AliasNode<ReferencedFieldNode>>;

export const pilotFields: Fields = [
	['Alias', ['ReferencedField', 'pilot', 'created at'], 'created_at'],
	['Alias', ['ReferencedField', 'pilot', 'modified at'], 'modified_at'],
	['ReferencedField', 'pilot', 'id'],
	['ReferencedField', 'pilot', 'person'],
	['Alias', ['ReferencedField', 'pilot', 'is experienced'], 'is_experienced'],
	['ReferencedField', 'pilot', 'name'],
	['ReferencedField', 'pilot', 'age'],
	[
		'Alias',
		['ReferencedField', 'pilot', 'favourite colour'],
		'favourite_colour',
	],
	['Alias', ['ReferencedField', 'pilot', 'is on-team'], 'is_on__team'],
	['ReferencedField', 'pilot', 'licence'],
	['Alias', ['ReferencedField', 'pilot', 'hire date'], 'hire_date'],
	[
		'Alias',
		['ReferencedField', 'pilot', 'was trained by-pilot'],
		'was_trained_by__pilot',
	],
];

export const licenceFields: Fields = [
	['Alias', ['ReferencedField', 'licence', 'created at'], 'created_at'],
	['Alias', ['ReferencedField', 'licence', 'modified at'], 'modified_at'],
	['ReferencedField', 'licence', 'id'],
	['ReferencedField', 'licence', 'name'],
];

export const planeFields: Fields = [
	['Alias', ['ReferencedField', 'plane', 'created at'], 'created_at'],
	['Alias', ['ReferencedField', 'plane', 'modified at'], 'modified_at'],
	['ReferencedField', 'plane', 'id'],
	['ReferencedField', 'plane', 'name'],
];

export const pilotCanFlyPlaneFields: Fields = [
	[
		'Alias',
		['ReferencedField', 'pilot-can fly-plane', 'created at'],
		'created_at',
	],
	[
		'Alias',
		['ReferencedField', 'pilot-can fly-plane', 'modified at'],
		'modified_at',
	],
	['ReferencedField', 'pilot-can fly-plane', 'pilot'],
	[
		'Alias',
		['ReferencedField', 'pilot-can fly-plane', 'can fly-plane'],
		'can_fly__plane',
	],
	['ReferencedField', 'pilot-can fly-plane', 'id'],
];

export const teamFields: Fields = [
	['Alias', ['ReferencedField', 'team', 'created at'], 'created_at'],
	['Alias', ['ReferencedField', 'team', 'modified at'], 'modified_at'],
	[
		'Alias',
		['ReferencedField', 'team', 'favourite colour'],
		'favourite_colour',
	],
];

export const $count: [AliasNode<CountNode>] = [
	['Alias', ['Count', '*'], '$count'],
];

export const copilotFields: Fields = [
	['Alias', ['ReferencedField', 'copilot', 'created at'], 'created_at'],
	['Alias', ['ReferencedField', 'copilot', 'modified at'], 'modified_at'],
	['ReferencedField', 'copilot', 'id'],
	['ReferencedField', 'copilot', 'person'],
	['ReferencedField', 'copilot', 'assists-pilot'],
	['Alias', ['ReferencedField', 'copilot', 'is blocked'], 'is_blocked'],
	['ReferencedField', 'copilot', 'rank'],
];
