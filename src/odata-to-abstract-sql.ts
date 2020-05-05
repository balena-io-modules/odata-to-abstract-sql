import * as _ from 'lodash';
import * as memoize from 'memoizee';
import * as randomstring from 'randomstring';
import type {
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
	AbstractSqlField,
	TableNode,
} from '@resin/abstract-sql-compiler';
import type {
	ODataBinds,
	ODataQuery,
	SupportedMethod,
} from '@resin/odata-parser';
export type { ODataBinds, ODataQuery, SupportedMethod };

export type ResourceNode = ['Resource', string];

declare module '@resin/abstract-sql-compiler' {
	interface AbstractSqlTable {
		definition?: Definition;
	}
	type ExtendedFromTypeNodes =
		| SelectQueryNode
		| UnionQueryNode
		| TableNode
		| ResourceNode
		| AliasNode<SelectQueryNode | UnionQueryNode | TableNode | ResourceNode>;
	interface FromNode {
		1: ExtendedFromTypeNodes;
	}
	interface InnerJoinNode {
		1: ExtendedFromTypeNodes;
		2?: OnNode;
	}
	interface LeftJoinNode {
		1: ExtendedFromTypeNodes;
		2?: OnNode;
	}
	interface RightJoinNode {
		1: ExtendedFromTypeNodes;
		2?: OnNode;
	}
	interface FullJoinNode {
		1: ExtendedFromTypeNodes;
		2?: OnNode;
	}
}

export interface Definition {
	extraBinds: ODataBinds;
	abstractSqlQuery: SelectQueryNode | UnionQueryNode | ResourceNode | TableNode;
}

interface Resource extends AbstractSqlTable {
	tableAlias?: string;
	definition?: Definition;
}

export type ResourceFunction = (
	this: OData2AbstractSQL,
	property: any,
) => BooleanTypeNodes | { resource: Resource; name: string };

const comparison = {
	eq: 'IsNotDistinctFrom',
	ne: 'IsDistinctFrom',
	gt: 'GreaterThan',
	ge: 'GreaterThanOrEqual',
	lt: 'LessThan',
	le: 'LessThanOrEqual',
} as const;
const operations = {
	add: 'Add',
	sub: 'Subtract',
	mul: 'Multiply',
	div: 'Divide',
};

const rewriteComputed = (
	computed: NonNullable<AbstractSqlField['computed']>,
	tableName: string,
	tableAlias: string,
) => {
	const rewrittenComputed = _.cloneDeep(computed);
	modifyAbstractSql(
		'ReferencedField',
		rewrittenComputed,
		(referencedField: ReferencedFieldNode) => {
			if (referencedField[1] === tableName) {
				referencedField[1] = tableAlias;
			}
		},
	);
	return rewrittenComputed;
};

const containsQueryOption = (opts: object): boolean => {
	for (const key in opts) {
		if (key[0] === '$') {
			return true;
		}
	}
	return false;
};

class Query {
	public select: Array<SelectNode[1]> = [];
	public from: Array<FromNode[1]> = [];
	public where: Array<WhereNode[1]> = [];
	public extras: Array<
		FieldsNode | ValuesNode | OrderByNode | LimitNode | OffsetNode
	> = [];

	merge(otherQuery: Query): void {
		this.select = this.select.concat(otherQuery.select);
		this.from = this.from.concat(otherQuery.from);
		this.where = this.where.concat(otherQuery.where);
		this.extras = this.extras.concat(otherQuery.extras);
	}
	fromResource(
		odataToAbstractSql: OData2AbstractSQL,
		resource: Resource,
		args: {
			extraBindVars: ODataBinds;
			bindVarsLength: number;
		} = odataToAbstractSql,
		bypassDefinition?: boolean,
	): void {
		if (bypassDefinition !== true && resource.definition) {
			const definition = odataToAbstractSql.rewriteDefinition(
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
	compile(queryType: string): AbstractSqlQuery {
		const compiled: AbstractSqlType[] = [];
		let where = this.where;
		if (queryType === 'SelectQuery') {
			compiled.push(['Select', this.select] as SelectNode);
		}
		this.from.forEach((tableName) => {
			compiled.push(['From', tableName] as AbstractSqlQuery);
		});
		if (where.length > 0) {
			if (where.length > 1) {
				where = [['And', ...where]];
			}
			compiled.push(['Where', ...where]);
		}
		return [queryType, ...compiled, ...this.extras] as AbstractSqlQuery;
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
	if (Array.isArray(abstractSql)) {
		if (abstractSql[0] === match) {
			fn(abstractSql);
		} else {
			abstractSql.forEach((abstractSqlComponent) => {
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
			if (typeof bind[1] === 'number') {
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
	public defaultResource: Resource | undefined;
	public bindVarsLength: number;
	private checkAlias: (alias: string) => string;

	constructor(
		private clientModel: AbstractSqlModel,
		private methods: _.Dictionary<ResourceFunction> = {},
	) {
		const MAX_ALIAS_LENGTH = 63;
		const RANDOM_ALIAS_LENGTH = 12;
		const shortAliases = generateShortAliases(clientModel);
		this.checkAlias = memoize((alias: string) => {
			let aliasLength = alias.length;
			if (aliasLength <= MAX_ALIAS_LENGTH) {
				return alias;
			}
			alias = _(alias)
				.split('.')
				.map((part) => {
					if (aliasLength <= MAX_ALIAS_LENGTH) {
						return part;
					}
					aliasLength -= part.length;
					const shortAlias = _(part)
						.split('-')
						.map((part2) => {
							part2 = _(part2)
								.split(' ')
								.map((part3) => {
									const shortPart2 = shortAliases[part3];
									if (shortPart2) {
										return shortPart2;
									}
									return part3;
								})
								.join(' ');
							const shortPart = shortAliases[part2];
							if (shortPart) {
								return shortPart;
							}
							return part2;
						})
						.join('-');
					aliasLength += shortAlias.length;
					return shortAlias;
				})
				.join('.');

			if (aliasLength <= MAX_ALIAS_LENGTH) {
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
	): {
		tree: AbstractSqlQuery;
		extraBodyVars: _.Dictionary<any>;
		extraBindVars: ODataBinds;
	} {
		this.reset();
		this.bindVarsLength = bindVarsLength;
		let tree: AbstractSqlQuery;
		if (_.isEmpty(path)) {
			tree = ['$serviceroot'];
		} else if (['$metadata', '$serviceroot'].includes(path.resource)) {
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
		const hasQueryOpts = containsQueryOption(path.options);

		const resource = this.Resource(path.resource, this.defaultResource);
		this.defaultResource = resource;
		const query = new Query();
		// For non-GETs we bypass definitions for the actual update/insert as we need to write to the base table
		const bypassDefinition = method !== 'GET';
		query.fromResource(this, resource, this, bypassDefinition);

		// We can't use the ReferencedField rule as resource.idField is the model name (using spaces),
		// not the resource name (with underscores), meaning that the attempts to map fail for a custom id field with spaces.
		const referencedIdField: ReferencedFieldNode = [
			'ReferencedField',
			resource.tableAlias!,
			resource.idField,
		];
		const pathKeyWhere = this.PathKey(
			method,
			path,
			resource,
			referencedIdField,
			bodyKeys,
		);
		let addPathKey = true;

		if (hasQueryOpts && path.options.$expand) {
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
			const linkKeyWhere = this.PathKey(
				method,
				path.link,
				linkResource,
				referencedField,
				bodyKeys,
			);
			if (linkKeyWhere) {
				query.where.push(linkKeyWhere);
			}
			query.select.push(aliasedField);
		} else if (
			method === 'PUT' ||
			method === 'PUT-INSERT' ||
			method === 'POST' ||
			method === 'PATCH' ||
			method === 'MERGE'
		) {
			const resourceMapping = this.ResourceMapping(resource);
			bindVars = this.BindVars(
				method,
				bodyKeys,
				resource.resourceName,
				Object.entries(resourceMapping),
			);
			query.extras.push(['Fields', bindVars.map((b) => b[0])]);

			// For updates/deletes that we use a `WHERE id IN (SELECT...)` subquery to apply options and in the case of a definition
			// we make sure to always apply it. This means that the definition will still be applied for these queries
			if (
				(hasQueryOpts || resource.definition || pathKeyWhere != null) &&
				(method === 'POST' || method === 'PUT-INSERT')
			) {
				// For insert statements we need to use an INSERT INTO ... SELECT * FROM (binds) WHERE ... style query
				const subQuery = new Query();
				subQuery.select = bindVars.map(
					(bindVar): ReferencedFieldNode => [
						'ReferencedField',
						resource.tableAlias!,
						bindVar[0],
					],
				);

				const bindVarSelectQuery: SelectQueryNode = [
					'SelectQuery',
					[
						'Select',
						resource.fields.map(
							(field): AliasNode<CastNode> => {
								const alias = field.fieldName;
								const bindVar = bindVars?.find((v) => v[0] === alias);
								const value = bindVar ? bindVar[1] : 'Null';
								return ['Alias', ['Cast', value, field.dataType], alias];
							},
						),
					],
				];

				const unionResource = { ...resource };
				if (
					unionResource.definition == null ||
					!_.isObject(unionResource.definition)
				) {
					unionResource.definition = {
						extraBinds: [],
						abstractSqlQuery: bindVarSelectQuery,
					};
				} else {
					unionResource.definition = { ...unionResource.definition };
					if (unionResource.definition.abstractSqlQuery[0] !== 'SelectQuery') {
						throw new Error(
							'Only select query definitions supported for inserts',
						);
					}

					const isTable = (part: any): part is TableNode =>
						part[0] === 'Table' && part[1] === unionResource.name;

					if (isTable(unionResource.definition.abstractSqlQuery)) {
						unionResource.definition.abstractSqlQuery = bindVarSelectQuery;
					} else {
						let found = false;
						unionResource.definition.abstractSqlQuery = unionResource.definition.abstractSqlQuery.map(
							(part) => {
								if (part[0] === 'From') {
									if (isTable(part[1])) {
										found = true;
										return [
											'From',
											['Alias', bindVarSelectQuery, unionResource.name],
										];
									} else if (part[1][0] === 'Alias' && isTable(part[1][1])) {
										found = true;
										return ['From', ['Alias', bindVarSelectQuery, part[1][2]]];
									}
								}
								return part;
							},
						) as SelectQueryNode;
						if (!found) {
							throw new Error(
								'Could not replace table entry in definition for insert',
							);
						}
					}
				}
				if (hasQueryOpts) {
					this.AddQueryOptions(resource, path, subQuery);
				}
				subQuery.fromResource(this, unionResource);
				addPathKey = false;
				if (pathKeyWhere != null) {
					subQuery.where.push(pathKeyWhere);
				}

				query.extras.push([
					'Values',
					subQuery.compile('SelectQuery') as SelectQueryNode,
				]);
			} else {
				query.extras.push(['Values', bindVars.map((b) => b[1])]);
			}
		} else if (path.count) {
			this.AddCountField(path, query);
		} else {
			this.AddSelectFields(path, query, resource);
		}

		if (addPathKey && pathKeyWhere != null) {
			query.where.push(pathKeyWhere);
		}

		// For updates/deletes that we use a `WHERE id IN (SELECT...)` subquery to apply options and in the case of a definition
		// we make sure to always apply it. This means that the definition will still be applied for these queries, for insert queries
		// this is handled when we set the 'Values'
		if (
			(hasQueryOpts || resource.definition) &&
			(method === 'PUT' ||
				method === 'PATCH' ||
				method === 'MERGE' ||
				method === 'DELETE')
		) {
			// For update/delete statements we need to use a  style query
			const subQuery = new Query();
			subQuery.select.push(referencedIdField);
			subQuery.fromResource(this, resource);
			if (hasQueryOpts) {
				this.AddQueryOptions(resource, path, subQuery);
			}
			query.where.push([
				'In',
				referencedIdField,
				subQuery.compile('SelectQuery') as SelectQueryNode,
			]);
		} else if (hasQueryOpts && method === 'GET') {
			this.AddQueryOptions(resource, path, query);
		}

		return query;
	}
	PathKey(
		method: string,
		path: any,
		resource: Resource,
		referencedField: ReferencedFieldNode,
		bodyKeys: string[],
	): BooleanTypeNodes | void {
		if (path.key != null) {
			if (method === 'PUT' || method === 'PUT-INSERT' || method === 'POST') {
				// Add the id field value to the body if it doesn't already exist and we're doing an INSERT or a REPLACE.
				const qualifiedIDField = resource.resourceName + '.' + resource.idField;
				if (
					!bodyKeys.includes(qualifiedIDField) &&
					!bodyKeys.includes(resource.idField)
				) {
					bodyKeys.push(qualifiedIDField);
					this.extraBodyVars[qualifiedIDField] = path.key;
				}
			}
			for (const matcher of [this.Bind, this.NumberMatch, this.TextMatch]) {
				const key = matcher.call(this, path.key, true);
				if (key) {
					return [comparison.eq, referencedField, key];
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
		const where = this.BooleanMatch(filter);
		query.where.push(where);
	}
	OrderBy(orderby: any, query: Query, resource: Resource) {
		this.AddExtraFroms(query, resource, orderby.properties);
		query.extras.push([
			'OrderBy',
			...this.OrderByProperties(orderby.properties),
		]);
	}
	OrderByProperties(orderings: any[]): Array<OrderByNode[1]> {
		return orderings.map((ordering) => {
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
		const fields = match.map((field):
			| [string, 'Default' | BindNode]
			| undefined => {
			const [fieldName, [, mappedFieldName]] = field;
			if (
				bodyKeys.includes(fieldName) ||
				bodyKeys.includes(resourceName + '.' + fieldName)
			) {
				return [mappedFieldName, ['Bind', resourceName, fieldName]];
			}
			// The body doesn't contain a bind var for this field.
			if (method === 'PUT') {
				return [mappedFieldName, 'Default'];
			}
		});
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
		resource = { ...resource };
		let tableAlias;
		if (parentResource) {
			let resourceAlias2;
			if (resourceName.includes('__') && !resource.name.includes('-')) {
				// If we have a __ in the resource name to navigate then we used a verb for navigation,
				// and no dash in the resulting resource name means we don't have the verb in the alias, so we need to add it
				const verb = odataNameToSqlName(resourceName).split('-')[0];
				resourceAlias2 = verb + '-' + resource.name;
			} else {
				resourceAlias2 = resource.name;
			}
			tableAlias = parentResource.tableAlias + '.' + resourceAlias2;
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
		const resourceMappings: _.Dictionary<[string, string]> = {};
		for (const { fieldName } of resource.fields) {
			resourceMappings[sqlNameToODataName(fieldName)] = [tableAlias, fieldName];
		}
		return resourceMappings;
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
			throw new SyntaxError(
				`Could not resolve relationship for '${resourceName}'`,
			);
		}
		const relationshipPath = _(relationship)
			.split('__')
			.map(odataNameToSqlName)
			.flatMap((sqlName) => this.Synonym(sqlName).split('-'))
			.value();
		const relationshipMapping = _.get(resourceRelations, relationshipPath);
		if (!relationshipMapping || !relationshipMapping.$) {
			throw new SyntaxError(
				`Could not resolve relationship mapping from '${resourceName}' to '${relationshipPath}'`,
			);
		}
		return relationshipMapping.$;
	}
	AddCountField(path: any, query: Query) {
		if (path.count) {
			query.select.push(['Alias', ['Count', '*'], '$count']);
		}
	}
	AddSelectFields(path: any, query: Query, resource: Resource) {
		let odataFieldNames: Array<Parameters<
			OData2AbstractSQL['AliasSelectField']
		>>;
		if (
			path.options &&
			path.options.$select &&
			path.options.$select.properties
		) {
			this.AddExtraFroms(query, resource, path.options.$select.properties);
			odataFieldNames = path.options.$select.properties.map((prop: any) => {
				const field = this.Property(prop) as {
					resource: Resource;
					name: string;
				};
				const resourceField = field.resource.fields.find(
					({ fieldName }) => fieldName === field.name,
				);
				return [field.resource, field.name, resourceField?.computed];
			});
		} else {
			odataFieldNames = resource.fields.map((field) => [
				resource,
				sqlNameToODataName(field.fieldName),
				field.computed,
			]);
		}
		const fields = _.differenceWith(
			odataFieldNames,
			query.select,
			(a, b) => a[1] === _.last(b),
		).map((args) => this.AliasSelectField(...args));
		query.select = query.select.concat(fields);
	}
	AliasSelectField(
		resource: Resource,
		fieldName: string,
		computed?: AbstractSqlQuery,
		alias: string = fieldName,
	) {
		if (computed) {
			if (
				resource.tableAlias != null &&
				resource.tableAlias !== resource.name
			) {
				computed = rewriteComputed(
					computed,
					resource.name,
					resource.tableAlias,
				);
			}
			return ['Alias', computed, alias];
		}
		const referencedField = this.ReferencedField(resource, fieldName);
		if (referencedField[2] === alias) {
			return referencedField;
		}
		return ['Alias', referencedField, alias];
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
				if (Array.isArray(match)) {
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
								...rest.map((v) => this.BooleanMatch(v)),
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
		if (!Array.isArray(match) || match[0] !== 'call') {
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
			this.resourceAliases = { ...this.resourceAliases };
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
		if (Array.isArray(prop)) {
			// It's the result of a lambda
			return prop;
		} else {
			return this.ReferencedField(prop.resource, prop.name);
		}
	}

	Method(
		prop: unknown & {
			method: Array<string | { method: string }>;
		},
	): BooleanTypeNodes | { resource: Resource; name: string } {
		if (!prop.method) {
			throw new SyntaxError('Method is missing method entry');
		}

		if (prop.method[0] !== 'call') {
			throw new SyntaxError(
				`Invalid value for method invocation: ${prop.method[0]}`,
			);
		}

		if (typeof prop.method[1] !== 'object') {
			throw new SyntaxError(
				`Invalid value for method invocation: ${prop.method[1]} should be an object`,
			);
		}

		const { method } = prop.method[1];
		if (!this.methods.hasOwnProperty(method)) {
			throw new SyntaxError(`Method ${method} is unknown`);
		}

		return this.methods[method].call(this, prop);
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
			} catch {
				// ignore
			}
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
		} else if (prop.method) {
			return this.Method(prop);
		} else if (prop.lambda) {
			return this.Lambda(prop.name, prop.lambda);
		} else if (prop.count) {
			const query = new Query();
			query.select.push(['Count', '*']);
			this.AddNavigation(query, this.defaultResource!, prop.name);
			return query.compile('SelectQuery');
		} else {
			return { resource: this.defaultResource!, name: prop.name };
		}
	}
	NumberMatch(match: any, optional: true): NumberTypeNodes | undefined;
	NumberMatch(match: any): NumberTypeNodes;
	NumberMatch(match: any, optional = false): NumberTypeNodes | undefined {
		if (typeof match === 'number') {
			return ['Number', match];
		} else if (Array.isArray(match) && match[0] === 'call') {
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
		if (typeof match === 'string') {
			return ['Text', match];
		} else if (Array.isArray(match) && match[0] === 'call') {
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
		} else if (Array.isArray(match) && match[0] === 'call') {
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
	DurationMatch(match: DurationNode[1]): AbstractSqlType | undefined {
		if (!_.isObject(match)) {
			return;
		}
		const duration = _(match)
			.pick('negative', 'day', 'hour', 'minute', 'second')
			.omitBy(_.isNil)
			.value();
		if (_(duration).omit('negative').isEmpty()) {
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
			nestedExpandQuery.fromResource(this, expandResource);
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
			if (Array.isArray(match)) {
				match.forEach((v) => this.AddExtraFroms(query, parentResource, v));
			} else {
				let nextProp = match;
				let prop;
				while (
					// tslint:disable-next-line:no-conditional-assignment
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
		} catch {
			// ignore
		}
	}
	AddNavigation(
		query: Query,
		resource: Resource,
		extraResource: string,
	): Resource {
		const navigation = this.NavigateResources(resource, extraResource);
		if (
			!query.from.some(
				(from) =>
					(from[0] === 'Table' && from[1] === navigation.resource.tableAlias) ||
					(from[0] === 'Alias' && from[2] === navigation.resource.tableAlias),
			)
		) {
			query.fromResource(this, navigation.resource);
			query.where.push(navigation.where);
			return navigation.resource;
		} else {
			throw new SyntaxError(
				`Could not navigate resources '${resource.name}' and '${extraResource}'`,
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
			.map((namePart) => {
				const synonym = this.clientModel.synonyms[namePart];
				if (synonym) {
					return synonym;
				}
				return namePart;
			})
			.join('-');
	}

	rewriteDefinition(
		definition: Definition,
		extraBindVars: ODataBinds,
		bindVarsLength: number,
	): Definition {
		const rewrittenDefinition = _.cloneDeep(definition);
		rewriteBinds(rewrittenDefinition, extraBindVars, bindVarsLength);
		modifyAbstractSql(
			'Resource',
			rewrittenDefinition.abstractSqlQuery as AbstractSqlQuery,
			(resource: AbstractSqlQuery) => {
				const resourceName = resource[1] as string;
				const referencedResource = this.clientModel.tables[resourceName];
				if (!referencedResource) {
					throw new Error(`Could not resolve resource ${resourceName}`);
				}
				if (referencedResource.definition) {
					const subDefinition = this.rewriteDefinition(
						referencedResource.definition,
						extraBindVars,
						bindVarsLength,
					);
					resource.splice(
						0,
						resource.length,
						...(subDefinition.abstractSqlQuery as AbstractSqlType[]),
					);
				} else if (
					referencedResource.fields.some((field) => field.computed != null)
				) {
					const computedFieldQuery = new Query();
					computedFieldQuery.select = referencedResource.fields.map((field) =>
						this.AliasSelectField(
							referencedResource,
							sqlNameToODataName(field.fieldName),
							field.computed,
							field.fieldName,
						),
					);
					computedFieldQuery.fromResource(this, {
						...referencedResource,
						tableAlias: referencedResource.name,
					});

					resource.splice(
						0,
						resource.length,
						...computedFieldQuery.compile('SelectQuery'),
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
	}
}

const addAliases = (
	shortAliases: _.Dictionary<string>,
	origAliasParts: string[],
) => {
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
			_.forEach(node, (value, key) => {
				traverseNodes(str + key, value);
			});
		}
	};

	const lowerCaseAliasParts = origAliasParts.map((origAliasPart) =>
		origAliasPart.toLowerCase(),
	);
	lowerCaseAliasParts.slice().sort().forEach(buildTrie);

	// Find the shortest unique alias for each term, using the trie.
	traverseNodes('', trie);
};

const getRelationships = (
	relationships: AbstractSqlModel['relationships'] | Relationship,
	/** For recursive usage only */
	nestedRelationships: string[] = [],
): string[] => {
	const relationshipKeys = Object.keys(relationships);
	for (const key of relationshipKeys) {
		if (key !== '$') {
			nestedRelationships.push(key);
			getRelationships(relationships[key] as Relationship, nestedRelationships);
		}
	}
	return nestedRelationships;
};

const generateShortAliases = (clientModel: AbstractSqlModel) => {
	const shortAliases: _.Dictionary<string> = {};

	const aliasParts = _(getRelationships(clientModel.relationships))
		.union(Object.keys(clientModel.synonyms))
		.reject((key) => key === '$')
		.value();

	// Add the first level of aliases, of names split by `-` and ` `, for short aliases on a word by word basis
	let origAliasParts = _(aliasParts)
		.flatMap((aliasPart) => aliasPart.split(/-| /))
		.uniq()
		.value();
	addAliases(shortAliases, origAliasParts);

	// Add the second level of aliases, of names that include a ` `, split by `-`, for short aliases on a verb/term basis
	origAliasParts = _(aliasParts)
		.flatMap((aliasPart) => aliasPart.split('-'))
		.filter((aliasPart) => aliasPart.includes(' '))
		.map((aliasPart) =>
			aliasPart
				.split(' ')
				.map((part) => shortAliases[part])
				.join(' '),
		)
		.uniq()
		.value();

	addAliases(shortAliases, origAliasParts);

	// Add the third level of aliases, of names that include a `-`, for short aliases on a fact type basis
	origAliasParts = _(aliasParts)
		.filter((aliasPart) => aliasPart.includes('-'))
		.map((aliasPart) =>
			aliasPart
				.split('-')
				.map((part) => shortAliases[part])
				.join('-'),
		)
		.uniq()
		.value();

	addAliases(shortAliases, origAliasParts);

	return shortAliases;
};
