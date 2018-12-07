import * as _ from 'lodash';
import * as memoize from 'memoizee';
import * as randomstring from 'randomstring';
import {
	AbstractSqlQuery,
	AbstractSqlModel,
	AbstractSqlTable,
	Relationship,
	DurationNode,
	AbstractSqlType,
	SelectNode,
	FromNode,
	WhereNode,
	OrderByNode,
	LimitNode,
	OffsetNode,
	NumberTypeNodes,
	FieldsNode,
	ValuesNode,
	ReferencedFieldNode,
	AliasNode,
	BooleanTypeNodes,
	UnionQueryNode,
	SelectQueryNode,
	InNode,
	BindNode,
	CastNode,
} from '@resin/abstract-sql-compiler';

export type ResourceNode = ['Resource', string];

declare module '@resin/abstract-sql-compiler' {
	interface AbstractSqlTable {
		definition?: Definition;
	}
	interface FromNode {
		1:
			| SelectQueryNode
			| UnionQueryNode
			| TableNode
			| ResourceNode
			| AliasNode<SelectQueryNode | UnionQueryNode | TableNode | ResourceNode>;
	}
}

export type SupportedMethod =
	| 'GET'
	| 'PUT'
	| 'POST'
	| 'PATCH'
	| 'MERGE'
	| 'DELETE'
	| 'OPTIONS';
export type ODataQuery = _.Dictionary<any>;
export interface ODataBinds extends Array<any> {
	[key: string]: any;
}

export interface Definition {
	extraBinds: ODataBinds;
	abstractSqlQuery: SelectQueryNode | UnionQueryNode | ResourceNode;
}

interface Resource extends AbstractSqlTable {
	tableAlias?: string;
	definition?: Definition;
}

const comparison = {
	eq: 'Equals' as 'Equals',
	ne: 'NotEquals' as 'NotEquals',
	gt: 'GreaterThan' as 'GreaterThan',
	ge: 'GreaterThanOrEqual' as 'GreaterThanOrEqual',
	lt: 'LessThan' as 'LessThan',
	le: 'LessThanOrEqual' as 'LessThanOrEqual',
};
const operations = {
	add: 'Add',
	sub: 'Subtract',
	mul: 'Multiply',
	div: 'Divide',
};

const rewriteDefinition = (
	abstractSqlModel: AbstractSqlModel,
	definition: Definition,
	extraBindVars: ODataBinds,
	bindVarsLength: number,
) => {
	const rewrittenDefinition = _.cloneDeep(definition);
	rewriteBinds(rewrittenDefinition, extraBindVars, bindVarsLength);
	modifyAbstractSql(
		'Resource',
		rewrittenDefinition.abstractSqlQuery as AbstractSqlQuery,
		(resource: AbstractSqlQuery) => {
			const resourceName = resource[1] as string;
			const referencedResource = abstractSqlModel.tables[resourceName];
			if (!referencedResource) {
				throw new Error(`Could not resolve resource ${resourceName}`);
			}
			if (referencedResource.definition) {
				const subDefinition = rewriteDefinition(
					abstractSqlModel,
					referencedResource.definition,
					extraBindVars,
					bindVarsLength,
				);
				resource.splice(
					0,
					resource.length,
					...(subDefinition.abstractSqlQuery as AbstractSqlType[]),
				);
			} else {
				resource.splice(
					0,
					resource.length,
					...['Table', referencedResource.name],
				);
			}
		},
	);
	return rewrittenDefinition;
};

class Query {
	public select: SelectNode[1][] = [];
	public from: FromNode[1][] = [];
	public where: WhereNode[1][] = [];
	public extras: Array<
		FieldsNode | ValuesNode | OrderByNode | LimitNode | OffsetNode
	> = [];

	constructor() {}

	merge(otherQuery: Query) {
		this.select = this.select.concat(otherQuery.select);
		this.from = this.from.concat(otherQuery.from);
		this.where = this.where.concat(otherQuery.where);
		this.extras = this.extras.concat(otherQuery.extras);
	}
	fromResource(
		abstractSqlModel: AbstractSqlModel,
		resource: Resource,
		args: { extraBindVars: ODataBinds; bindVarsLength: number },
		bypassDefinition?: boolean,
	) {
		if (bypassDefinition !== true && resource.definition) {
			const definition = rewriteDefinition(
				abstractSqlModel,
				resource.definition,
				args.extraBindVars,
				args.bindVarsLength,
			);
			this.from.push([
				'Alias',
				definition.abstractSqlQuery,
				resource.tableAlias!,
			]);
		} else if (resource.name !== resource.tableAlias) {
			this.from.push(['Alias', ['Table', resource.name], resource.tableAlias!]);
		} else {
			this.from.push(['Table', resource.name]);
		}
	}
	compile(queryType: string) {
		const compiled: AbstractSqlQuery = [queryType];
		let where = this.where;
		if (queryType === 'SelectQuery') {
			compiled.push(['Select', this.select] as SelectNode);
		}
		_.each(this.from, tableName => {
			compiled.push(['From', tableName] as AbstractSqlQuery);
		});
		if (where.length > 0) {
			if (where.length > 1) {
				where = [['And', ...where]];
			}
			compiled.push(['Where', ...where]);
		}
		return compiled.concat(this.extras as AbstractSqlType[]);
	}
}

export const sqlNameToODataName = memoize(
	(sqlName: string): string => sqlName.replace(/-/g, '__').replace(/ /g, '_'),
	{ primitive: true },
);
export const odataNameToSqlName = memoize(
	(odataName: string): string =>
		odataName.replace(/__/g, '-').replace(/_/g, ' '),
	{ primitive: true },
);

const modifyAbstractSql = (
	match: string,
	abstractSql: AbstractSqlQuery,
	fn: (abstractSql: AbstractSqlQuery) => void,
): void => {
	if (_.isArray(abstractSql)) {
		if (abstractSql[0] === match) {
			fn(abstractSql);
		} else {
			_.each(abstractSql, abstractSqlComponent => {
				modifyAbstractSql(match, abstractSqlComponent as AbstractSqlQuery, fn);
			});
		}
	}
};
export const rewriteBinds = (
	definition: NonNullable<Resource['definition']>,
	existingBinds: ODataBinds,
	inc: number = 0,
): void => {
	inc += existingBinds.length;
	modifyAbstractSql(
		'Bind',
		definition.abstractSqlQuery as AbstractSqlQuery,
		(bind: AbstractSqlQuery) => {
			if (_.isNumber(bind[1])) {
				(bind[1] as any) += inc;
			}
		},
	);
	existingBinds.push(...definition.extraBinds);
};

export class OData2AbstractSQL {
	private extraBodyVars: _.Dictionary<any>;
	public extraBindVars: ODataBinds;
	private resourceAliases: _.Dictionary<Resource>;
	private defaultResource: Resource | undefined;
	public bindVarsLength: number;
	private checkAlias: (alias: string) => string;

	constructor(private clientModel: AbstractSqlModel) {
		const MAX_ALIAS_LENGTH = 64;
		const RANDOM_ALIAS_LENGTH = 12;
		const shortAliases = generateShortAliases(clientModel);
		this.checkAlias = memoize((alias: string) => {
			let aliasLength = alias.length;
			if (aliasLength < MAX_ALIAS_LENGTH) {
				return alias;
			}
			alias = _(alias)
				.split('.')
				.map(part => {
					if (aliasLength < MAX_ALIAS_LENGTH) {
						return part;
					}
					aliasLength -= part.length;
					const shortAlias = _(part)
						.split('-')
						.map(part => {
							part = _(part)
								.split(' ')
								.map(part => {
									const shortPart = shortAliases[part];
									if (shortPart) {
										return shortPart;
									}
									return part;
								})
								.join(' ');
							const shortPart = shortAliases[part];
							if (shortPart) {
								return shortPart;
							}
							return part;
						})
						.join('-');
					aliasLength += shortAlias.length;
					return shortAlias;
				})
				.join('.');

			if (aliasLength < MAX_ALIAS_LENGTH) {
				return alias;
			}

			const randStr = randomstring.generate(RANDOM_ALIAS_LENGTH) + '$';
			return (
				randStr + alias.slice(randStr.length + alias.length - MAX_ALIAS_LENGTH)
			);
		});
	}
	match(
		path: ODataQuery,
		method: SupportedMethod,
		bodyKeys: string[],
		bindVarsLength: number,
	) {
		this.reset();
		this.bindVarsLength = bindVarsLength;
		let tree;
		if (_.isEmpty(path)) {
			tree = ['$serviceroot'];
		} else if (_.includes(['$metadata', '$serviceroot'], path.resource)) {
			tree = [path.resource];
		} else {
			const query = this.PathSegment(method, bodyKeys, path);
			switch (method) {
				case 'PUT':
					// For PUT the initial pass generates the update query,
					// so we run it through the parser a second time to get the insert query,
					// for a full upsert query
					this.putReset();
					const insertQuery = this.PathSegment('PUT-INSERT', bodyKeys, path);
					tree = [
						'UpsertQuery',
						insertQuery.compile('InsertQuery'),
						query.compile('UpdateQuery'),
					];
					break;
				case 'GET':
					tree = query.compile('SelectQuery');
					break;
				case 'PATCH':
				case 'MERGE':
					tree = query.compile('UpdateQuery');
					break;
				case 'POST':
					tree = query.compile('InsertQuery');
					break;
				case 'DELETE':
					tree = query.compile('DeleteQuery');
					break;
				default:
					throw new SyntaxError(`Unknown method "${method}"`);
			}
		}
		return {
			tree,
			extraBodyVars: this.extraBodyVars,
			extraBindVars: this.extraBindVars,
		};
	}
	PathSegment(method: string, bodyKeys: string[], path: any): Query {
		if (!path.resource) {
			throw new SyntaxError('Path segment must contain a resource');
		}
		const resource = this.Resource(path.resource, this.defaultResource);
		this.defaultResource = resource;
		const query = new Query();
		// For non-GETs we bypass definitions for the actual update/insert as we need to write to the base table
		const bypassDefinition = method !== 'GET';
		query.fromResource(this.clientModel, resource, this, bypassDefinition);

		// We can't use the ReferencedField rule as resource.idField is the model name (using spaces),
		// not the resource name (with underscores), meaning that the attempts to map fail for a custom id field with spaces.
		const referencedIdField: ReferencedFieldNode = [
			'ReferencedField',
			resource.tableAlias!,
			resource.idField,
		];
		this.PathKey(method, path, query, resource, referencedIdField, bodyKeys);

		if (path.options && path.options.$expand) {
			this.Expands(resource, query, path.options.$expand.properties);
		}
		let bindVars: ReturnType<OData2AbstractSQL['BindVars']> | undefined;
		if (path.property) {
			const childQuery = this.PathSegment(method, bodyKeys, path.property);
			query.merge(childQuery);
			if (!path.property.resource) {
				throw new SyntaxError('PathSegment has a property without a resource?');
			}
			const navigation = this.NavigateResources(
				resource,
				path.property.resource,
			);
			query.where.push(navigation.where);
		} else if (path.link) {
			if (!path.link.resource) {
				throw new SyntaxError('PathSegment has a link without a resource?');
			}
			const linkResource = this.Resource(path.link.resource, resource);
			let aliasedField: AliasNode<ReferencedFieldNode>;
			let referencedField: ReferencedFieldNode;
			if (this.FieldContainedIn(linkResource.resourceName, resource)) {
				referencedField = this.ReferencedField(
					resource,
					linkResource.resourceName,
				);
				aliasedField = ['Alias', referencedField, linkResource.resourceName];
			} else if (this.FieldContainedIn(resource.resourceName, linkResource)) {
				referencedField = this.ReferencedField(
					linkResource,
					resource.resourceName,
				);
				aliasedField = ['Alias', referencedField, resource.resourceName];
			} else {
				throw new Error('Cannot navigate links');
			}
			this.PathKey(
				method,
				path.link,
				query,
				linkResource,
				referencedField,
				bodyKeys,
			);
			query.select.push(aliasedField);
		} else if (
			method == 'PUT' ||
			method == 'PUT-INSERT' ||
			method == 'POST' ||
			method == 'PATCH' ||
			method == 'MERGE'
		) {
			const resourceMapping = this.ResourceMapping(resource);
			bindVars = this.BindVars(
				method,
				bodyKeys,
				resource.resourceName,
				_.toPairs(resourceMapping),
			);
			query.extras.push(['Fields', _.map(bindVars, 0)]);
			query.extras.push(['Values', _.map(bindVars, 1)]);
		} else if (path.count) {
			this.AddCountField(path, query);
		} else {
			this.AddSelectFields(path, query, resource);
		}

		// For updates/deletes that we use a `WHERE id IN (SELECT...)` subquery to apply options and in the case of a definition
		// we make sure to always apply it. This means that the definition will still be applied for these queries
		const subQueryMethod =
			method == 'PUT' ||
			method == 'PATCH' ||
			method == 'MERGE' ||
			method == 'DELETE';
		if ((path.options || resource.definition) && subQueryMethod) {
			// For update/delete statements we need to use a  style query
			const subQuery = new Query();
			subQuery.select.push(referencedIdField);
			subQuery.fromResource(this.clientModel, resource, this);
			if (path.options) {
				this.AddQueryOptions(resource, path, subQuery);
			}
			query.where.push([
				'In',
				referencedIdField,
				subQuery.compile('SelectQuery') as SelectQueryNode,
			]);
		} else if (path.options) {
			if (method == 'POST' || method == 'PUT-INSERT') {
				// TODO: Inserts should obey a table definition but that requires us to be able to pass the "base" table
				// to the definition to select from, which in the case of an insert would be a select subquery with our insert binds
				if (path.options.$filter) {
					const subQuery = this.InsertFilter(
						path.options.$filter,
						resource,
						bindVars!,
					);
					const valuesIndex = _.findIndex(query.extras, v => v[0] === 'Values');
					// Replace the values bind var list with our filtered SELECT query.
					query.extras[valuesIndex] = [
						'Values',
						subQuery.compile('SelectQuery') as SelectQueryNode,
					];
				}
			} else if (method == 'GET') {
				this.AddQueryOptions(resource, path, query);
			}
		}

		return query;
	}
	PathKey(
		method: string,
		path: any,
		query: Query,
		resource: Resource,
		referencedField: ReferencedFieldNode,
		bodyKeys: string[],
	) {
		if (path.key != null) {
			if (method == 'PUT' || method == 'PUT-INSERT' || method == 'POST') {
				// Add the id field value to the body if it doesn't already exist and we're doing an INSERT or a REPLACE.
				const qualifiedIDField = resource.resourceName + '.' + resource.idField;
				if (
					!_.includes(bodyKeys, qualifiedIDField) &&
					!_.includes(bodyKeys, resource.idField)
				) {
					bodyKeys.push(qualifiedIDField);
					this.extraBodyVars[qualifiedIDField] = path.key;
				}
			}
			for (const matcher of [this.Bind, this.NumberMatch, this.TextMatch]) {
				const key = matcher.call(this, path.key, true);
				if (key) {
					query.where.push(['Equals', referencedField, key]);
					return;
				}
			}
			throw new SyntaxError('Could not match path key');
		}
	}
	Bind(bind: any): AbstractSqlType | undefined {
		if (bind != null && bind.bind != null) {
			return ['Bind', bind.bind];
		}
	}
	SelectFilter(filter: any, query: Query, resource: Resource) {
		this.AddExtraFroms(query, resource, filter);
		filter = this.BooleanMatch(filter);
		query.where.push(filter);
	}
	InsertFilter(
		filter: any,
		resource: Resource,
		bindVars: ReturnType<OData2AbstractSQL['BindVars']>,
	) {
		// For insert statements we need to use an INSERT INTO ... SELECT * FROM (binds) WHERE ... style query
		const query = new Query();
		this.AddExtraFroms(query, resource, filter);
		const where = this.BooleanMatch(filter);
		query.select = _.map(
			bindVars,
			bindVar =>
				[
					'ReferencedField',
					resource.tableAlias,
					bindVar[0],
				] as ReferencedFieldNode,
		);
		query.from.push([
			'Alias',
			[
				'SelectQuery',
				[
					'Select',
					_.map(
						resource.fields,
						(field): AliasNode<CastNode> => {
							const alias = field.fieldName;
							const bindVar = _.find(bindVars, v => v[0] === alias);
							const value = bindVar ? bindVar[1] : 'Null';
							return ['Alias', ['Cast', value, field.dataType], alias];
						},
					),
				],
			],
			resource.tableAlias!,
		]);
		query.where.push(where);
		return query;
	}
	OrderBy(orderby: any, query: Query, resource: Resource) {
		this.AddExtraFroms(query, resource, orderby.properties);
		query.extras.push([
			'OrderBy',
			...this.OrderByProperties(orderby.properties),
		]);
	}
	OrderByProperties(orderings: any[]): Array<OrderByNode[1]> {
		return orderings.map(ordering => {
			const field = this.ReferencedProperty(ordering);
			return [ordering.order.toUpperCase(), field] as OrderByNode[1];
		});
	}
	BindVars(
		method: string,
		bodyKeys: string[],
		resourceName: string,
		match: Array<[string, [string, string]]>,
	): Array<[string, 'Default' | BindNode]> {
		const fields = match.map(
			(field): [string, 'Default' | BindNode] | undefined => {
				const [fieldName, [, mappedFieldName]] = field;
				if (
					_.includes(bodyKeys, fieldName) ||
					_.includes(bodyKeys, resourceName + '.' + fieldName)
				) {
					return [mappedFieldName, ['Bind', resourceName, fieldName]];
				}
				// The body doesn't contain a bind var for this field.
				if (method === 'PUT') {
					return [mappedFieldName, 'Default'];
				}
			},
		);
		return _.compact(fields);
	}
	Resource(resourceName: string, parentResource?: Resource): Resource {
		const resourceAlias = this.resourceAliases[resourceName];
		if (resourceAlias) {
			return resourceAlias;
		}
		let resource: Resource;
		if (parentResource) {
			const relationshipMapping = this.ResolveRelationship(
				parentResource,
				resourceName,
			);
			resource = this.clientModel.tables[relationshipMapping[1][0]];
		} else {
			let sqlName = odataNameToSqlName(resourceName);
			sqlName = this.Synonym(sqlName);
			resource = this.clientModel.tables[sqlName];
		}
		if (!resource) {
			throw new SyntaxError('Could not match resource');
		}
		resource = _.clone(resource);
		let tableAlias;
		if (parentResource) {
			let resourceAlias;
			if (_.includes(resourceName, '__') && !_.includes(resource.name, '-')) {
				// If we have a __ in the resource name to navigate then we used a verb for navigation,
				// and no dash in the resulting resource name means we don't have the verb in the alias, so we need to add it
				const verb = odataNameToSqlName(resourceName).split('-')[0];
				resourceAlias = verb + '-' + resource.name;
			} else {
				resourceAlias = resource.name;
			}
			tableAlias = parentResource.tableAlias + '.' + resourceAlias;
		} else {
			tableAlias = resource.name;
		}
		resource.tableAlias = this.checkAlias(tableAlias);
		return resource;
	}
	FieldContainedIn(fieldName: string, resource: Resource): boolean {
		try {
			this.ResolveRelationship(resource, fieldName);
			return true;
		} catch (e) {
			if (e instanceof SyntaxError) {
				return false;
			}
			throw e;
		}
	}
	ResourceMapping(resource: Resource): _.Dictionary<[string, string]> {
		const tableAlias = resource.tableAlias
			? resource.tableAlias
			: resource.name;
		return _(resource.fields)
			.map((field): [string, string] => [tableAlias, field.fieldName])
			.keyBy(mapping => sqlNameToODataName(mapping[1]))
			.value();
	}
	ResolveRelationship(resource: string | Resource, relationship: string) {
		let resourceName;
		if (typeof resource === 'object') {
			resourceName = resource.resourceName;
		} else if (this.resourceAliases[resource]) {
			resourceName = this.resourceAliases[resource].resourceName;
		} else {
			resourceName = resource;
		}
		resourceName = this.Synonym(resourceName);
		const resourceRelations = this.clientModel.relationships[resourceName];
		if (!resourceRelations) {
			throw new SyntaxError('Could not resolve relationship');
		}
		const relationshipPath = _(relationship)
			.split('__')
			.map(odataNameToSqlName)
			.flatMap(sqlName => this.Synonym(sqlName).split('-'))
			.value();
		const relationshipMapping = _.get(resourceRelations, relationshipPath);
		if (!relationshipMapping || !relationshipMapping.$) {
			throw new SyntaxError('Could not resolve relationship mapping');
		}
		return relationshipMapping.$;
	}
	AddCountField(path: any, query: Query) {
		if (path.count) {
			query.select.push(['Alias', ['Count', '*'], '$count']);
		}
	}
	AddSelectFields(path: any, query: Query, resource: Resource) {
		let fields;
		if (
			path.options &&
			path.options.$select &&
			path.options.$select.properties
		) {
			this.AddExtraFroms(query, resource, path.options.$select.properties);
			fields = path.options.$select.properties.map((prop: any) =>
				this.Property(prop),
			);
			fields = _(fields)
				.reject(field =>
					_.some(
						query.select,
						existingField => _.last(existingField) == field.name,
					),
				)
				.map(field => this.AliasSelectField(field.resource, field.name))
				.value();
		} else {
			const resourceMapping = this.ResourceMapping(resource);
			fields = _(resourceMapping)
				.keys()
				.reject(fieldName =>
					_.some(
						query.select,
						existingField => _.last(existingField) == fieldName,
					),
				)
				.map(field => this.AliasSelectField(resource, field))
				.value();
		}
		query.select = query.select.concat(fields);
	}
	AliasSelectField(resource: Resource, fieldName: string) {
		const referencedField = this.ReferencedField(resource, fieldName);
		if (referencedField[2] === fieldName) {
			return referencedField;
		}
		return ['Alias', referencedField, fieldName];
	}
	ReferencedField(
		resource: Resource,
		resourceField: string,
	): ReferencedFieldNode {
		const mapping = this.ResourceMapping(resource);
		if (mapping[resourceField]) {
			return [
				'ReferencedField',
				mapping[resourceField][0],
				mapping[resourceField][1],
			];
		} else {
			const relationshipMapping = this.ResolveRelationship(
				resource,
				resourceField,
			);
			const tableAlias = resource.tableAlias
				? resource.tableAlias
				: resource.name;
			if (
				relationshipMapping.length > 1 &&
				relationshipMapping[0] === resource.idField
			) {
				throw new SyntaxError(
					'Attempted to directly fetch a virtual field: "' +
						resourceField +
						'"',
				);
			}
			return ['ReferencedField', tableAlias, relationshipMapping[0]];
		}
	}
	BooleanMatch(match: any, optional: true): BooleanTypeNodes | undefined;
	BooleanMatch(match: any): BooleanTypeNodes;
	BooleanMatch(match: any, optional = false): BooleanTypeNodes | undefined {
		switch (match) {
			case true:
			case false:
				return ['Boolean', match];
			default:
				if (_.isArray(match)) {
					const [type, ...rest] = match;
					switch (type) {
						case 'eq':
						case 'ne':
						case 'gt':
						case 'ge':
						case 'lt':
						case 'le':
							const op1 = this.Operand(rest[0]);
							const op2 = this.Operand(rest[1]);
							return [
								comparison[type as keyof typeof comparison],
								op1,
								op2,
							] as BooleanTypeNodes;
						case 'and':
						case 'or':
							return [
								_.capitalize(type),
								...rest.map(v => this.BooleanMatch(v)),
							] as BooleanTypeNodes;
						case 'not':
							const bool = this.BooleanMatch(rest[0]);
							return ['Not', bool];
						case 'in':
							return [
								'In',
								this.Operand(rest[0]),
								...rest[1].map((v: any) => this.Operand(v)),
							] as InNode;
						case 'call':
							const { method } = match[1];
							switch (method) {
								case 'contains':
								case 'endswith':
								case 'startswith':
								case 'isof':
								case 'substringof':
									return this.FunctionMatch(method, match) as BooleanTypeNodes;
								default:
									if (optional) {
										return;
									}
									throw new SyntaxError(`${method} is not a boolean function`);
							}
						default:
							if (optional) {
								return;
							}
							throw new SyntaxError(`Boolean does not support ${type}`);
					}
				} else {
					try {
						return this.ReferencedProperty(match);
					} catch (e) {
						if (optional) {
							return;
						}
						throw e;
					}
				}
		}
	}
	AliasedFunction(
		odataName: string,
		sqlName: string,
		match: any,
	): AbstractSqlType {
		const fn = this.FunctionMatch(odataName, match);
		return [sqlName, ...fn.slice(1)];
	}
	FunctionMatch(name: string, match: any): AbstractSqlQuery {
		if (!_.isArray(match) || match[0] !== 'call') {
			throw new SyntaxError('Not a function call');
		}
		const properties = match[1];
		if (properties.method !== name) {
			throw new SyntaxError('Unexpected function name');
		}
		const args = properties.args.map((v: any) => this.Operand(v));
		return [_.capitalize(name), ...args] as AbstractSqlQuery;
	}
	Operand(match: any): AbstractSqlType {
		for (const matcher of [
			this.Bind,
			this.NullMatch,
			this.BooleanMatch,
			this.NumberMatch,
			this.TextMatch,
			this.DateMatch,
			this.DurationMatch,
			this.Math,
		]) {
			const result = matcher.call(this, match, true);
			if (result) {
				return result;
			}
		}
		throw new SyntaxError('Could not match operand');
	}
	Math(match: any): AbstractSqlType | undefined {
		const [type, ...rest] = match;
		switch (type) {
			case 'add':
			case 'sub':
			case 'mul':
			case 'div':
				return [
					operations[type as keyof typeof operations],
					this.Operand(rest[0]),
					this.Operand(rest[1]),
				];
			default:
				return;
		}
	}
	Lambda(resourceName: string, lambda: any): BooleanTypeNodes {
		const resourceAliases = this.resourceAliases;
		const defaultResource = this.defaultResource;
		try {
			const query = new Query();
			const resource = this.AddNavigation(
				query,
				this.defaultResource!,
				resourceName,
			);
			this.resourceAliases = _.clone(this.resourceAliases);
			this.resourceAliases[lambda.identifier] = resource;

			this.defaultResource = resource;
			this.AddExtraFroms(query, resource, lambda.expression);
			const filter = this.BooleanMatch(lambda.expression);
			if (lambda.method === 'any') {
				query.where.push(filter);
				return ['Exists', query.compile('SelectQuery') as SelectQueryNode];
			} else if (lambda.method === 'all') {
				// We use `NOT EXISTS NOT ($filter)` to implement all, but we want to leave existing where components intact, as they are for joins
				query.where.push(['Not', filter]);
				return [
					'Not',
					['Exists', query.compile('SelectQuery') as SelectQueryNode],
				];
			} else {
				throw new SyntaxError(
					`Lambda method does not support ${lambda.method}`,
				);
			}
		} finally {
			// Make sure resourceAliases/defaultResource are always reset at the end.
			this.resourceAliases = resourceAliases;
			this.defaultResource = defaultResource;
		}
	}
	ReferencedProperty(match: any): BooleanTypeNodes {
		const prop = this.Property(match);
		if (_.isArray(prop)) {
			// It's the result of a lambda
			return prop;
		} else {
			return this.ReferencedField(prop.resource, prop.name);
		}
	}
	Property(prop: any): BooleanTypeNodes | { resource: Resource; name: string } {
		if (!prop.name) {
			throw new SyntaxError('Property is missing name');
		}
		if (prop.property) {
			const defaultResource = this.defaultResource;
			let propResource;
			try {
				propResource = this.Resource(prop.name, this.defaultResource);
			} catch (e) {}
			if (propResource) {
				try {
					this.defaultResource = propResource;
					return this.Property(prop.property);
				} finally {
					this.defaultResource = defaultResource;
				}
			} else {
				return this.Property(prop.property);
			}
		} else if (prop.lambda) {
			return this.Lambda(prop.name, prop.lambda);
		} else {
			return { resource: this.defaultResource!, name: prop.name };
		}
	}
	NumberMatch(match: any, optional: true): NumberTypeNodes | undefined;
	NumberMatch(match: any): NumberTypeNodes;
	NumberMatch(match: any, optional = false): NumberTypeNodes | undefined {
		if (_.isNumber(match)) {
			return ['Number', match];
		} else if (_.isArray(match) && match[0] === 'call') {
			const { method } = match[1];
			switch (method) {
				case 'indexof':
				case 'year':
				case 'month':
				case 'day':
				case 'day':
				case 'hour':
				case 'minute':
				case 'second':
				case 'fractionalseconds':
				case 'totaloffsetminutes':
				case 'totalseconds':
				case 'round':
				case 'floor':
				case 'ceiling':
					return this.FunctionMatch(method, match) as NumberTypeNodes;
				case 'length':
					return this.AliasedFunction(
						'length',
						'CharacterLength',
						match,
					) as NumberTypeNodes;
				default:
					if (optional) {
						return;
					}
					throw new SyntaxError(`${method} is not a number function`);
			}
		} else if (optional) {
			return;
		} else {
			throw new SyntaxError('Failed to match a Number entry');
		}
	}
	NullMatch(match: any): AbstractSqlType | undefined {
		if (match === null) {
			return ['Null'];
		}
	}
	TextMatch(match: any, optional: true): AbstractSqlType | undefined;
	TextMatch(match: any): AbstractSqlType;
	TextMatch(match: any, optional = false): AbstractSqlType | undefined {
		if (_.isString(match)) {
			return ['Text', match];
		} else if (_.isArray(match) && match[0] === 'call') {
			const { method } = match[1];
			switch (method) {
				case 'tolower':
				case 'toupper':
				case 'trim':
				case 'concat':
				case 'replace':
					return this.FunctionMatch(method, match);
				case 'date':
					return this.AliasedFunction('date', 'ToDate', match);
				case 'time':
					return this.AliasedFunction('time', 'ToTime', match);
				case 'substring':
					const fn = this.FunctionMatch(method, match);
					// First parameter needs to be increased by 1.
					fn[2] = ['Add', fn[2], ['Number', 1]];
					return fn;
				default:
					if (optional) {
						return;
					}
					throw new SyntaxError(`${method} is not a number function`);
			}
		} else if (optional) {
			return;
		} else {
			throw new SyntaxError('Failed to match a Text entry');
		}
	}
	DateMatch(match: any, optional: true): AbstractSqlType | undefined;
	DateMatch(match: any): AbstractSqlType;
	DateMatch(match: any, optional = false): AbstractSqlType | undefined {
		if (_.isDate(match)) {
			return ['Date', match];
		} else if (_.isArray(match) && match[0] === 'call') {
			const { method } = match[1];
			switch (method) {
				case 'now':
				case 'maxdatetime':
				case 'mindatetime':
					return this.FunctionMatch(method, match);
				default:
					if (optional) {
						return;
					}
					throw new SyntaxError(`${method} is not a date function`);
			}
		} else if (optional) {
			return;
		} else {
			throw new SyntaxError('Failed to match a Date entry');
		}
	}
	DurationMatch(match: DurationNode): AbstractSqlType | undefined {
		if (!_.isObject(match)) {
			return;
		}
		const duration = _(match)
			.pick('negative', 'day', 'hour', 'minute', 'second')
			.omitBy(_.isNil)
			.value();
		if (
			_(duration)
				.omit('negative')
				.isEmpty()
		) {
			return;
		}
		return ['Duration', duration];
	}
	Expands(resource: Resource, query: Query, expands: any): void {
		const defaultResource = this.defaultResource;
		for (const expand of expands) {
			const navigation = this.NavigateResources(resource, expand.name);
			const expandResource = navigation.resource;
			{
				this.defaultResource = expandResource;
			}
			// We need to nest the expand query in order to be able to alias column names to match the OData version.
			const nestedExpandQuery = new Query();
			if (expand.property) {
				this.Expands(expandResource, nestedExpandQuery, [expand.property]);
			}
			if (expand.options && expand.options.$expand) {
				this.Expands(
					expandResource,
					nestedExpandQuery,
					expand.options.$expand.properties,
				);
			}
			nestedExpandQuery.fromResource(this.clientModel, expandResource, this);
			if (expand.count) {
				this.AddCountField(expand, nestedExpandQuery);
			} else {
				this.AddSelectFields(expand, nestedExpandQuery, expandResource);
			}
			if (expand.options) {
				this.AddQueryOptions(expandResource, expand, nestedExpandQuery);
			}

			this.defaultResource = defaultResource;

			nestedExpandQuery.where.push(navigation.where);

			const expandQuery = new Query();
			expandQuery.select.push([
				'Alias',
				['AggregateJSON', [expandResource.tableAlias, '*']],
				expand.name,
			]);
			expandQuery.from.push([
				'Alias',
				nestedExpandQuery.compile('SelectQuery') as SelectQueryNode,
				expandResource.tableAlias!,
			]);
			query.select.push([
				'Alias',
				expandQuery.compile('SelectQuery'),
				expand.name,
			]);
		}
	}
	AddQueryOptions(resource: Resource, path: any, query: Query): void {
		if (path.options.$filter) {
			this.SelectFilter(path.options.$filter, query, resource);
		}
		// When querying /$count, $orderby/$top/$skip must be ignored
		if (!path.count) {
			if (path.options.$orderby) {
				this.OrderBy(path.options.$orderby, query, resource);
			}
			if (path.options.$top) {
				const limit = this.NumberMatch(path.options.$top);
				query.extras.push(['Limit', limit]);
			}
			if (path.options.$skip) {
				const offset = this.NumberMatch(path.options.$skip);
				query.extras.push(['Offset', offset]);
			}
		}
	}
	NavigateResources(
		resource: Resource,
		navigation: string,
	): { resource: Resource; where: BooleanTypeNodes } {
		const relationshipMapping = this.ResolveRelationship(resource, navigation);
		const linkedResource = this.Resource(navigation, resource);
		const tableAlias = resource.tableAlias
			? resource.tableAlias
			: resource.name;
		const linkedTableAlias = linkedResource.tableAlias
			? linkedResource.tableAlias
			: linkedResource.name;
		return {
			resource: linkedResource,
			where: [
				'Equals',
				['ReferencedField', tableAlias, relationshipMapping[0]],
				['ReferencedField', linkedTableAlias, relationshipMapping[1][1]],
			],
		};
	}
	AddExtraFroms(query: Query, parentResource: Resource, match: any) {
		// TODO: try removing
		try {
			if (_.isArray(match)) {
				match.forEach(v => this.AddExtraFroms(query, parentResource, v));
			} else {
				let nextProp = match;
				let prop;
				while (
					(prop = nextProp) &&
					prop.name &&
					prop.property &&
					prop.property.name
				) {
					nextProp = prop.property;
					const resourceAlias = this.resourceAliases[prop.name];
					if (resourceAlias) {
						parentResource = resourceAlias;
					} else {
						parentResource = this.AddNavigation(
							query,
							parentResource,
							prop.name,
						);
					}
				}
				if (nextProp && nextProp.args) {
					this.AddExtraFroms(query, parentResource, prop.args);
				}
			}
		} catch (e) {}
	}
	AddNavigation(
		query: Query,
		resource: Resource,
		extraResource: string,
	): Resource {
		const navigation = this.NavigateResources(resource, extraResource);
		if (
			!_.some(
				query.from,
				from =>
					(from[0] === 'Table' && from[1] === navigation.resource.tableAlias) ||
					(from[0] === 'Alias' && from[2] === navigation.resource.tableAlias),
			)
		) {
			query.fromResource(this.clientModel, navigation.resource, this);
			query.where.push(navigation.where);
			return navigation.resource;
		} else {
			throw new SyntaxError(
				`Could not navigate resources '${
					resource.name
				}' and '${extraResource}'`,
			);
		}
	}

	reset() {
		this.putReset();
		this.extraBodyVars = {};
		this.extraBindVars = [];
	}

	putReset() {
		this.resourceAliases = {};
		this.defaultResource = undefined;
	}
	Synonym(sqlName: string) {
		return _(sqlName)
			.split('-')
			.map(namePart => {
				const synonym = this.clientModel.synonyms[namePart];
				if (synonym) {
					return synonym;
				}
				return namePart;
			})
			.join('-');
	}
}

const generateShortAliases = (clientModel: AbstractSqlModel) => {
	const shortAliases: _.Dictionary<string> = {};
	const addAliases = (origAliasParts: string[]) => {
		const trie = {};
		const buildTrie = (aliasPart: string) => {
			let node: any = trie;
			for (let i = 0; i < aliasPart.length; i++) {
				if (node.$suffix) {
					node[node.$suffix[0]] = {
						$suffix: node.$suffix.slice(1),
					};
					delete node.$suffix;
				}
				const c = aliasPart[i];
				if (node[c]) {
					node = node[c];
				} else {
					node[c] = {
						$suffix: aliasPart.slice(i + 1),
					};
					return;
				}
			}
		};
		const traverseNodes = (str: string, node: any) => {
			if (node.$suffix) {
				const index = lowerCaseAliasParts.indexOf(str + node.$suffix);
				const origAliasPart = origAliasParts[index];
				shortAliases[origAliasPart] = origAliasPart.slice(0, str.length);
			} else {
				_.each(node, (value, key) => {
					traverseNodes(str + key, value);
				});
			}
		};

		const lowerCaseAliasParts = origAliasParts.map(origAliasPart =>
			origAliasPart.toLowerCase(),
		);
		lowerCaseAliasParts
			.slice()
			.sort()
			.forEach(buildTrie);

		// Find the shortest unique alias for each term, using the trie.
		traverseNodes('', trie);
	};

	const getRelationships = (
		relationships: AbstractSqlModel['relationships'] | Relationship,
	): string[] => {
		const relationshipKeys = Object.keys(relationships);
		const nestedRelationships = [];
		for (const key of relationshipKeys) {
			if (key !== '$') {
				nestedRelationships.push(
					getRelationships(relationships[key] as Relationship),
				);
			}
		}
		return relationshipKeys.concat(...nestedRelationships);
	};

	const aliasParts = _(getRelationships(clientModel.relationships))
		.union(Object.keys(clientModel.synonyms))
		.reject(key => key === '$')
		.value();

	// Add the first level of aliases, of names split by `-` and ` `, for short aliases on a word by word basis
	let origAliasParts = _(aliasParts)
		.flatMap(aliasPart => aliasPart.split(/-| /))
		.uniq()
		.value();
	addAliases(origAliasParts);

	// Add the second level of aliases, of names that include a ` `, split by `-`, for short aliases on a verb/term basis
	origAliasParts = _(aliasParts)
		.flatMap(aliasPart => aliasPart.split('-'))
		.filter(aliasPart => _.includes(aliasPart, ' '))
		.map(aliasPart =>
			aliasPart
				.split(' ')
				.map(part => shortAliases[part])
				.join(' '),
		)
		.uniq()
		.value();

	addAliases(origAliasParts);

	// Add the third level of aliases, of names that include a `-`, for short aliases on a fact type basis
	origAliasParts = _(aliasParts)
		.filter(aliasPart => _.includes(aliasPart, '-'))
		.map(aliasPart =>
			aliasPart
				.split('-')
				.map(part => shortAliases[part])
				.join('-'),
		)
		.uniq()
		.value();

	addAliases(origAliasParts);

	return shortAliases;
};
