!function(root, factory) {
    "function" == typeof define && define.amd ? define([ "require", "exports", "ometa-core", "lodash", "memoizee" ], factory) : "object" == typeof exports ? factory(require, exports, require("ometa-js").core) : factory(function(moduleName) {
        return root[moduleName];
    }, root, root.OMeta);
}(this, function(require, exports, OMeta) {
    var _ = require("lodash"), memoize = require("memoizee"), Query = function() {
        _.extend(this, {
            select: [],
            from: [],
            where: [],
            extras: []
        });
    };
    Query.prototype.merge = function(otherQuery) {
        this.select = this.select.concat(otherQuery.select);
        this.from = this.from.concat(otherQuery.from);
        this.where = this.where.concat(otherQuery.where);
        this.extras = this.extras.concat(otherQuery.extras);
    };
    Query.prototype.fromResource = function(resource) {
        resource.tableName !== resource.tableAlias ? this.from.push([ resource.tableName, resource.tableAlias ]) : this.from.push(resource.tableName);
    };
    Query.prototype.compile = function(queryType) {
        var compiled = [ queryType ], where = this.where;
        "SelectQuery" === queryType && compiled.push([ "Select", this.select ]);
        _.each(this.from, function(tableName) {
            compiled.push([ "From", tableName ]);
        });
        if (where.length > 0) {
            where.length > 1 && (where = [ [ "And" ].concat(where) ]);
            compiled.push([ "Where" ].concat(where));
        }
        return compiled.concat(this.extras);
    };
    var OData2AbstractSQL = exports.OData2AbstractSQL = OMeta._extend({
        Process: function(method, bodyKeys) {
            var $elf = this, _fromIdx = this.input.idx, insertQuery, path, query, queryType, tree;
            path = this.anything();
            this._apply("end");
            tree = this._or(function() {
                this._pred(_.isEmpty(path));
                return [ "$serviceroot" ];
            }, function() {
                this._pred(_.includes([ "$metadata", "$serviceroot" ], path.resource));
                return [ path.resource ];
            }, function() {
                this.reset();
                query = this._applyWithArgs("PathSegment", method, bodyKeys, path);
                return this._or(function() {
                    this._pred("PUT" == method);
                    this.reset();
                    insertQuery = this._applyWithArgs("PathSegment", "PUT-INSERT", bodyKeys, path);
                    return [ "UpsertQuery", insertQuery.compile("InsertQuery"), query.compile("UpdateQuery") ];
                }, function() {
                    queryType = this._or(function() {
                        this._pred("GET" == method);
                        return "SelectQuery";
                    }, function() {
                        this._pred("PATCH" == method || "MERGE" == method);
                        return "UpdateQuery";
                    }, function() {
                        this._pred("POST" == method);
                        return "InsertQuery";
                    }, function() {
                        this._pred("DELETE" == method);
                        return "DeleteQuery";
                    });
                    return query.compile(queryType);
                });
            });
            return {
                tree: tree,
                extraBodyVars: this.extraBodyVars
            };
        },
        PathSegment: function(method, bodyKeys, path) {
            var $elf = this, _fromIdx = this.input.idx, aliasedField, bindVars, childQuery, linkResource, navigationWhere, propertyResource, query, referencedField, referencedIdField, resource, resourceMapping, subQuery, valuesIndex;
            this._pred(path.resource);
            resource = this._applyWithArgs("Resource", path.resource, this.defaultResource);
            this.defaultResource = resource;
            query = new Query();
            query.fromResource(resource);
            referencedIdField = [ "ReferencedField", resource.tableAlias, resource.idField ];
            this._applyWithArgs("PathKey", path, query, resource, referencedIdField, bodyKeys);
            this._or(function() {
                return this._pred(!path.options);
            }, function() {
                return this._pred(!path.options.$expand);
            }, function() {
                return this._applyWithArgs("Expands", resource, query, path.options.$expand.properties);
            });
            this._or(function() {
                this._pred(path.property);
                childQuery = this._applyWithArgs("PathSegment", method, bodyKeys, path.property);
                query.merge(childQuery);
                this._or(function() {
                    return this._pred(path.property.resource);
                }, function() {
                    return function() {
                        throw new Error("PathSegment has a property without a resource?");
                    }.call(this);
                });
                propertyResource = this._applyWithArgs("Resource", path.property.resource, resource);
                navigationWhere = this._applyWithArgs("NavigateResources", resource, propertyResource);
                return query.where.push(navigationWhere);
            }, function() {
                this._pred(path.link);
                this._or(function() {
                    return this._pred(path.link.resource);
                }, function() {
                    return function() {
                        throw new Error("PathSegment has a link without a resource?");
                    }.call(this);
                });
                linkResource = this._applyWithArgs("Resource", path.link.resource, resource);
                aliasedField = this._or(function() {
                    this._applyWithArgs("FieldContainedIn", linkResource.resourceName, resource);
                    referencedField = this._applyWithArgs("ReferencedField", resource, linkResource.resourceName);
                    return [ referencedField, linkResource.resourceName ];
                }, function() {
                    this._applyWithArgs("FieldContainedIn", resource.resourceName, linkResource);
                    referencedField = this._applyWithArgs("ReferencedField", linkResource, resource.resourceName);
                    return [ referencedField, resource.resourceName ];
                }, function() {
                    return function() {
                        throw new Error("Cannot navigate links");
                    }.call(this);
                });
                this._applyWithArgs("PathKey", path.link, query, linkResource, referencedField, bodyKeys);
                return query.select.push(aliasedField);
            }, function() {
                this._pred("PUT" == method || "PUT-INSERT" == method || "POST" == method || "PATCH" == method || "MERGE" == method);
                resourceMapping = this._applyWithArgs("ResourceMapping", resource);
                bindVars = this._applyWithArgs("BindVars", method, bodyKeys, resource.resourceName, _.toPairs(resourceMapping));
                query.extras.push([ "Fields", _.map(bindVars, 0) ]);
                return query.extras.push([ "Values", _.map(bindVars, 1) ]);
            }, function() {
                return this._applyWithArgs("AddCountField", path, query, resource);
            }, function() {
                return this._applyWithArgs("AddSelectFields", path, query, resource);
            });
            this._or(function() {
                return this._pred(!path.options);
            }, function() {
                this._or(function() {
                    return this._pred(!path.options.$filter);
                }, function() {
                    this._pred("POST" == method || "PUT-INSERT" == method);
                    subQuery = this._applyWithArgs("InsertFilter", path.options.$filter, resource, bindVars);
                    valuesIndex = _.findIndex(query.extras, {
                        0: "Values"
                    });
                    return query.extras[valuesIndex] = [ "Values", subQuery.compile("SelectQuery") ];
                }, function() {
                    this._pred("PUT" == method || "PATCH" == method || "MERGE" == method || "DELETE" == method);
                    subQuery = this._applyWithArgs("UpdateFilter", path.options.$filter, resource, referencedIdField);
                    return query.where.push([ "In", referencedIdField, subQuery.compile("SelectQuery") ]);
                }, function() {
                    return this._applyWithArgs("SelectFilter", path.options.$filter, query, resource);
                });
                return this._applyWithArgs("AddExtraQueryOptions", resource, path, query);
            });
            return query;
        },
        PathKey: function(path, query, resource, referencedField, bodyKeys) {
            var $elf = this, _fromIdx = this.input.idx, key, qualifiedIDField;
            return this._or(function() {
                return this._pred(null == path.key);
            }, function() {
                qualifiedIDField = resource.resourceName + "." + resource.idField;
                this._opt(function() {
                    this._pred(!_.includes(bodyKeys, qualifiedIDField) && !_.includes(bodyKeys, resource.idField));
                    bodyKeys.push(qualifiedIDField);
                    return this.extraBodyVars[qualifiedIDField] = path.key;
                });
                key = this._or(function() {
                    return this._applyWithArgs("Bind", path.key);
                }, function() {
                    return this._applyWithArgs("Number", path.key);
                }, function() {
                    return this._applyWithArgs("Text", path.key);
                });
                return query.where.push([ "Equals", referencedField, key ]);
            });
        },
        Bind: function() {
            var $elf = this, _fromIdx = this.input.idx, bind;
            bind = this.anything();
            this._pred(null != bind);
            this._pred(null != bind.bind);
            return [ "Bind", bind.bind ];
        },
        SelectFilter: function(filter, query, resource) {
            var $elf = this, _fromIdx = this.input.idx, filter;
            this._applyWithArgs("AddExtraFroms", filter, query, resource);
            filter = this._applyWithArgs("Boolean", filter);
            return query.where.push(filter);
        },
        InsertFilter: function(filter, resource, bindVars) {
            var $elf = this, _fromIdx = this.input.idx, query, where;
            query = new Query();
            this._applyWithArgs("AddExtraFroms", filter, query, resource);
            where = this._applyWithArgs("Boolean", filter);
            (function() {
                query.select = _.map(bindVars, function(bindVar) {
                    return [ "ReferencedField", resource.tableAlias, bindVar[0] ];
                });
                query.from.push([ [ "SelectQuery", [ "Select", _.map($elf.clientModel.resources[resource.resourceName].fields, function(field) {
                    var cast, alias = field.fieldName, bindVar = _.find(bindVars, {
                        0: alias
                    });
                    cast = bindVar ? [ "Cast", bindVar[1], field.dataType ] : "Null";
                    return [ cast, alias ];
                }) ] ], resource.tableAlias ]);
                return query.where.push(where);
            }).call(this);
            return query;
        },
        UpdateFilter: function(filter, resource, referencedIdField) {
            var $elf = this, _fromIdx = this.input.idx, query, where;
            query = new Query();
            this._applyWithArgs("AddExtraFroms", filter, query, resource);
            where = this._applyWithArgs("Boolean", filter);
            (function() {
                query.select.push(referencedIdField);
                query.fromResource(resource);
                return query.where.push(where);
            }).call(this);
            return query;
        },
        OrderBy: function(orderby, query, resource) {
            var $elf = this, _fromIdx = this.input.idx, orderby;
            this._applyWithArgs("AddExtraFroms", orderby.properties, query, resource);
            orderby = this._applyWithArgs("OrderByProperties", orderby.properties);
            return query.extras.push([ "OrderBy" ].concat(orderby));
        },
        OrderByProperties: function() {
            var $elf = this, _fromIdx = this.input.idx, field, orderby, ordering;
            this._form(function() {
                return orderby = this._many1(function() {
                    ordering = this.anything();
                    field = this._applyWithArgs("ReferencedProperty", ordering);
                    return [ ordering.order.toUpperCase(), field ];
                });
            });
            return orderby;
        },
        BindVars: function(method, bodyKeys, resourceName) {
            var $elf = this, _fromIdx = this.input.idx, fieldName, fields, mappedFieldName, mappedTableName;
            this._form(function() {
                return fields = this._many(function() {
                    return this._or(function() {
                        this._form(function() {
                            this._applyWithArgs("exactly", "_name");
                            return this.anything();
                        });
                        return null;
                    }, function() {
                        this._form(function() {
                            fieldName = this.anything();
                            return this._form(function() {
                                mappedTableName = this.anything();
                                return mappedFieldName = this.anything();
                            });
                        });
                        return this._or(function() {
                            this._pred(!_.includes(bodyKeys, fieldName) && !_.includes(bodyKeys, resourceName + "." + fieldName));
                            return this._or(function() {
                                this._pred("PUT" === method);
                                return [ mappedFieldName, "Default" ];
                            }, function() {
                                return null;
                            });
                        }, function() {
                            return [ mappedFieldName, [ "Bind", resourceName, fieldName ] ];
                        });
                    });
                });
            });
            return _.compact(fields);
        },
        ResolveResourceAlias: function(aliasName) {
            var $elf = this, _fromIdx = this.input.idx;
            this._pred(this.resourceAliases[aliasName]);
            return this.resourceAliases[aliasName];
        },
        Resource: function(resourceName, parentResource) {
            var $elf = this, _fromIdx = this.input.idx, resource, resourceMapping, tableAlias;
            return this._or(function() {
                return this._applyWithArgs("ResolveResourceAlias", resourceName);
            }, function() {
                resource = this.clientModel.resources[resourceName];
                this._pred(resource);
                resource = _.clone(resource);
                this._or(function() {
                    return this._pred(resource.tableName);
                }, function() {
                    resourceMapping = this._applyWithArgs("ResourceMapping", resource);
                    return resource.tableName = resourceMapping._name;
                });
                tableAlias = this._or(function() {
                    this._pred(parentResource);
                    return parentResource.tableAlias + "." + resource.tableName;
                }, function() {
                    return resource.tableName;
                });
                resource.tableAlias = this.checkAlias(tableAlias);
                return resource;
            }, function() {
                return function() {
                    throw new Error("Unknown resource: " + resourceName);
                }.call(this);
            });
        },
        FieldContainedIn: function(fieldName, resource) {
            var $elf = this, _fromIdx = this.input.idx, mappedField, mapping;
            mapping = this._applyWithArgs("ResourceMapping", resource);
            mappedField = mapping[fieldName];
            this._pred(mappedField);
            this._pred(mappedField[0] == resource.tableAlias);
            return this._pred(_.some(resource.fields, {
                fieldName: mappedField[1]
            }));
        },
        ResourceMapping: function(resource) {
            var $elf = this, _fromIdx = this.input.idx, resourceMapping;
            return this._or(function() {
                this._pred(this.clientModel.resourceToSQLMappings[resource.resourceName]);
                resourceMapping = this.clientModel.resourceToSQLMappings[resource.resourceName];
                this._opt(function() {
                    this._pred(resource.tableAlias);
                    this._pred(resource.tableAlias != resourceMapping._name);
                    return resourceMapping = _.mapValues(resourceMapping, function(mapping) {
                        return _.isArray(mapping) ? [ resource.tableAlias, mapping[1] ] : resource.tableAlias;
                    });
                });
                return resourceMapping;
            }, function() {
                return function() {
                    throw new Error("Unknown resource: " + resource.resourceName);
                }.call(this);
            });
        },
        AddCountField: function(path, query, resource) {
            var $elf = this, _fromIdx = this.input.idx;
            this._pred(path.count);
            return query.select.push([ [ "Count", "*" ], "$count" ]);
        },
        AddSelectFields: function(path, query, resource) {
            var $elf = this, _fromIdx = this.input.idx, fields, resourceMapping;
            fields = this._or(function() {
                this._pred(path.options);
                this._pred(path.options.$select);
                this._applyWithArgs("AddExtraFroms", path.options.$select.properties, query, resource);
                fields = this._applyWithArgs("Properties", path.options.$select.properties);
                return _(fields).reject(function(field) {
                    return _.some(query.select, function(existingField) {
                        return _.last(existingField) == field.name;
                    });
                }).map(function(field) {
                    return $elf.AliasSelectField(field.resource, field.name);
                }).value();
            }, function() {
                resourceMapping = this._applyWithArgs("ResourceMapping", resource);
                return _(resourceMapping).keys().reject(function(fieldName) {
                    return "_name" === fieldName || _.some(query.select, function(existingField) {
                        return _.last(existingField) == fieldName;
                    });
                }).map(_.bind(this.AliasSelectField, this, resource)).value();
            });
            return query.select = query.select.concat(fields);
        },
        AliasSelectField: function(resource, fieldName) {
            var $elf = this, _fromIdx = this.input.idx, referencedField;
            referencedField = this._applyWithArgs("ReferencedField", resource, fieldName);
            return this._or(function() {
                this._pred(referencedField[2] === fieldName);
                return referencedField;
            }, function() {
                return [ referencedField, fieldName ];
            });
        },
        ReferencedField: function(resource, resourceField) {
            var $elf = this, _fromIdx = this.input.idx, mapping;
            mapping = this._applyWithArgs("ResourceMapping", resource);
            return this._or(function() {
                this._pred(mapping[resourceField]);
                return [ "ReferencedField" ].concat(mapping[resourceField]);
            }, function() {
                console.error("Unknown mapping: ", mapping, resource.resourceName, resourceField);
                return function() {
                    throw new Error("Unknown mapping: " + resource.resourceName + " : " + resourceField);
                }.call(this);
            });
        },
        Boolean: function() {
            var $elf = this, _fromIdx = this.input.idx, bool, op1, op2, operation;
            return this._or(function() {
                return this._apply("True");
            }, function() {
                return this._apply("False");
            }, function() {
                this._form(function() {
                    return bool = this._or(function() {
                        operation = function() {
                            switch (this.anything()) {
                              case "eq":
                                return "Equals";

                              case "ge":
                                return "GreaterThanOrEqual";

                              case "gt":
                                return "GreaterThan";

                              case "le":
                                return "LessThanOrEqual";

                              case "lt":
                                return "LessThan";

                              case "ne":
                                return "NotEquals";

                              default:
                                throw this._fail();
                            }
                        }.call(this);
                        op1 = this._apply("Operand");
                        op2 = this._apply("Operand");
                        return [ operation, op1, op2 ];
                    }, function() {
                        operation = function() {
                            switch (this.anything()) {
                              case "and":
                                return "And";

                              case "or":
                                return "Or";

                              default:
                                throw this._fail();
                            }
                        }.call(this);
                        op1 = this._apply("Boolean");
                        op2 = this._many1(function() {
                            return this._apply("Boolean");
                        });
                        return [ operation, op1 ].concat(op2);
                    });
                });
                return bool;
            }, function() {
                this._form(function() {
                    this._applyWithArgs("exactly", "not");
                    return bool = this._apply("Boolean");
                });
                return [ "Not", bool ];
            }, function() {
                return this._apply("ReferencedProperty");
            }, function() {
                return this._apply("BooleanFunction");
            });
        },
        True: function() {
            var $elf = this, _fromIdx = this.input.idx;
            this._apply("true");
            return [ "Boolean", !0 ];
        },
        False: function() {
            var $elf = this, _fromIdx = this.input.idx;
            this._apply("false");
            return [ "Boolean", !1 ];
        },
        BooleanFunction: function() {
            var $elf = this, _fromIdx = this.input.idx;
            return this._or(function() {
                return this._applyWithArgs("Function", "contains");
            }, function() {
                return this._applyWithArgs("Function", "endswith");
            }, function() {
                return this._applyWithArgs("Function", "startswith");
            }, function() {
                return this._applyWithArgs("Function", "isof");
            }, function() {
                return this._applyWithArgs("Function", "substringof");
            });
        },
        NumberFunction: function() {
            var $elf = this, _fromIdx = this.input.idx;
            return this._or(function() {
                return this._applyWithArgs("AliasedFunction", "length", "CharacterLength");
            }, function() {
                return this._applyWithArgs("Function", "indexof");
            }, function() {
                return this._applyWithArgs("Function", "year");
            }, function() {
                return this._applyWithArgs("Function", "month");
            }, function() {
                return this._applyWithArgs("Function", "day");
            }, function() {
                return this._applyWithArgs("Function", "day");
            }, function() {
                return this._applyWithArgs("Function", "hour");
            }, function() {
                return this._applyWithArgs("Function", "minute");
            }, function() {
                return this._applyWithArgs("Function", "second");
            }, function() {
                return this._applyWithArgs("Function", "fractionalseconds");
            }, function() {
                return this._applyWithArgs("Function", "totaloffsetminutes");
            }, function() {
                return this._applyWithArgs("Function", "totalseconds");
            }, function() {
                return this._applyWithArgs("Function", "round");
            }, function() {
                return this._applyWithArgs("Function", "floor");
            }, function() {
                return this._applyWithArgs("Function", "ceiling");
            });
        },
        TextFunction: function() {
            var $elf = this, _fromIdx = this.input.idx, fn;
            return this._or(function() {
                fn = this._applyWithArgs("Function", "substring");
                fn[2] = [ "Add", fn[2], [ "Number", 1 ] ];
                return fn;
            }, function() {
                return this._applyWithArgs("Function", "tolower");
            }, function() {
                return this._applyWithArgs("Function", "toupper");
            }, function() {
                return this._applyWithArgs("Function", "trim");
            }, function() {
                return this._applyWithArgs("Function", "concat");
            }, function() {
                return this._applyWithArgs("AliasedFunction", "date", "ToDate");
            }, function() {
                return this._applyWithArgs("AliasedFunction", "time", "ToTime");
            }, function() {
                return this._applyWithArgs("Function", "replace");
            });
        },
        DateFunction: function() {
            var $elf = this, _fromIdx = this.input.idx;
            return this._or(function() {
                return this._applyWithArgs("Function", "now");
            }, function() {
                return this._applyWithArgs("Function", "maxdatetime");
            }, function() {
                return this._applyWithArgs("Function", "mindatetime");
            });
        },
        AliasedFunction: function(odataName, sqlName) {
            var $elf = this, _fromIdx = this.input.idx, fn;
            fn = this._applyWithArgs("Function", odataName);
            return [ sqlName ].concat(fn.slice(1));
        },
        Function: function(name) {
            var $elf = this, _fromIdx = this.input.idx, args, properties;
            this._form(function() {
                this._applyWithArgs("exactly", "call");
                properties = this.anything();
                this._pred(properties.method == name);
                return args = this._applyWithArgs("Arguments", properties.args);
            });
            return [ _.capitalize(name) ].concat(args);
        },
        Arguments: function() {
            var $elf = this, _fromIdx = this.input.idx, args;
            this._form(function() {
                return args = this._many(function() {
                    return this._apply("Operand");
                });
            });
            return args;
        },
        Operand: function() {
            var $elf = this, _fromIdx = this.input.idx;
            return this._or(function() {
                return this._apply("Bind");
            }, function() {
                return this._apply("Null");
            }, function() {
                return this._apply("Boolean");
            }, function() {
                return this._apply("Number");
            }, function() {
                return this._apply("Text");
            }, function() {
                return this._apply("Date");
            }, function() {
                return this._apply("Duration");
            }, function() {
                return this._apply("Math");
            });
        },
        Math: function() {
            var $elf = this, _fromIdx = this.input.idx, op1, op2, operation;
            this._form(function() {
                operation = function() {
                    switch (this.anything()) {
                      case "add":
                        return "Add";

                      case "div":
                        return "Divide";

                      case "mul":
                        return "Multiply";

                      case "sub":
                        return "Subtract";

                      default:
                        throw this._fail();
                    }
                }.call(this);
                op1 = this._apply("Operand");
                return op2 = this._apply("Operand");
            });
            return [ operation, op1, op2 ];
        },
        Lambda: function(resource, lambda) {
            var $elf = this, _fromIdx = this.input.idx, defaultResource, filter, query, resourceAliases, result;
            resourceAliases = this.resourceAliases;
            defaultResource = this.defaultResource;
            (function() {
                this.resourceAliases = _.clone(this.resourceAliases);
                return this.resourceAliases[lambda.identifier] = resource;
            }).call(this);
            this._or(function() {
                query = new Query();
                this._applyWithArgs("AddNavigation", query, this.defaultResource, resource);
                this.defaultResource = resource;
                this._applyWithArgs("AddExtraFroms", lambda.expression, query, resource);
                filter = this._applyWithArgs("Boolean", lambda.expression);
                result = this._or(function() {
                    this._pred("any" == lambda.method);
                    query.where.push(filter);
                    return [ "Exists", query.compile("SelectQuery") ];
                }, function() {
                    this._pred("all" == lambda.method);
                    query.where.push([ "Not", filter ]);
                    return [ "Not", [ "Exists", query.compile("SelectQuery") ] ];
                });
                this.resourceAliases = resourceAliases;
                return this.defaultResource = defaultResource;
            }, function() {
                this.resourceAliases = resourceAliases;
                this.defaultResource = defaultResource;
                return this._pred(!1);
            });
            return result;
        },
        Properties: function() {
            var $elf = this, _fromIdx = this.input.idx, props;
            this._form(function() {
                return props = this._many(function() {
                    return this._apply("Property");
                });
            });
            return props;
        },
        ReferencedProperty: function() {
            var $elf = this, _fromIdx = this.input.idx, prop;
            prop = this._apply("Property");
            return this._or(function() {
                this._pred(_.isArray(prop));
                return prop;
            }, function() {
                return this._applyWithArgs("ReferencedField", prop.resource, prop.name);
            });
        },
        Property: function() {
            var $elf = this, _fromIdx = this.input.idx, defaultResource, prop, propResource, resource, result;
            prop = this.anything();
            this._pred(prop.name);
            return this._or(function() {
                this._pred(prop.property);
                defaultResource = this.defaultResource;
                return this._or(function() {
                    propResource = function() {
                        try {
                            return $elf.Resource(prop.name, this.defaultResource);
                        } catch (e) {} finally {}
                    }.call(this);
                    this._pred(propResource);
                    this.defaultResource = propResource;
                    result = this._applyWithArgs("Property", prop.property);
                    this.defaultResource = defaultResource;
                    return result;
                }, function() {
                    this.defaultResource = defaultResource;
                    return this._applyWithArgs("Property", prop.property);
                });
            }, function() {
                this._pred(!prop.property);
                this._pred(prop.lambda);
                resource = this._applyWithArgs("Resource", prop.name, this.defaultResource);
                return this._applyWithArgs("Lambda", resource, prop.lambda);
            }, function() {
                this._pred(!prop.property);
                this._pred(!prop.lambda);
                return {
                    resource: this.defaultResource,
                    name: prop.name
                };
            });
        },
        Number: function() {
            var $elf = this, _fromIdx = this.input.idx, num;
            return this._or(function() {
                num = this._apply("number");
                return [ "Number", num ];
            }, function() {
                return this._apply("NumberFunction");
            });
        },
        Null: function() {
            var $elf = this, _fromIdx = this.input.idx, x;
            x = this.anything();
            this._pred(null === x);
            return "Null";
        },
        Text: function() {
            var $elf = this, _fromIdx = this.input.idx, text;
            return this._or(function() {
                text = this._apply("string");
                return [ "Text", text ];
            }, function() {
                return this._apply("TextFunction");
            });
        },
        Date: function() {
            var $elf = this, _fromIdx = this.input.idx, date;
            return this._or(function() {
                date = this.anything();
                this._pred(_.isDate(date));
                return [ "Date", date ];
            }, function() {
                return this._apply("DateFunction");
            });
        },
        Duration: function() {
            var $elf = this, _fromIdx = this.input.idx, duration;
            duration = this.anything();
            this._pred(_.isObject(duration));
            duration = _(duration).pick("negative", "day", "hour", "minute", "second").omitBy(_.isNil).value();
            this._pred(!_(duration).omit("negative").isEmpty());
            return [ "Duration", duration ];
        },
        Expands: function(resource, query) {
            var $elf = this, _fromIdx = this.input.idx, defaultResource, expand, expandQuery, expandResource, navigationWhere, nestedExpandQuery;
            defaultResource = this.defaultResource;
            return this._form(function() {
                return this._many1(function() {
                    expand = this.anything();
                    expandResource = this._applyWithArgs("Resource", expand.name, defaultResource);
                    this.defaultResource = expandResource;
                    nestedExpandQuery = new Query();
                    this._or(function() {
                        return this._pred(!expand.property);
                    }, function() {
                        return this._applyWithArgs("Expands", expandResource, nestedExpandQuery, [ expand.property ]);
                    });
                    this._or(function() {
                        return this._pred(!expand.options);
                    }, function() {
                        return this._pred(!expand.options.$expand);
                    }, function() {
                        return this._applyWithArgs("Expands", expandResource, nestedExpandQuery, expand.options.$expand.properties);
                    });
                    nestedExpandQuery.fromResource(expandResource);
                    this._or(function() {
                        return this._applyWithArgs("AddCountField", expand, nestedExpandQuery, expandResource);
                    }, function() {
                        return this._applyWithArgs("AddSelectFields", expand, nestedExpandQuery, expandResource);
                    });
                    this._or(function() {
                        return this._pred(!expand.options);
                    }, function() {
                        this._or(function() {
                            return this._pred(!expand.options.$filter);
                        }, function() {
                            return this._applyWithArgs("SelectFilter", expand.options.$filter, nestedExpandQuery, expandResource);
                        });
                        return this._applyWithArgs("AddExtraQueryOptions", expandResource, expand, nestedExpandQuery);
                    });
                    this.defaultResource = defaultResource;
                    navigationWhere = this._applyWithArgs("NavigateResources", resource, expandResource);
                    nestedExpandQuery.where.push(navigationWhere);
                    expandQuery = new Query();
                    expandQuery.select.push([ [ "AggregateJSON", [ expandResource.tableAlias, "*" ] ], expandResource.resourceName ]);
                    expandQuery.from.push([ nestedExpandQuery.compile("SelectQuery"), expandResource.tableAlias ]);
                    return query.select.push([ expandQuery.compile("SelectQuery"), expandResource.resourceName ]);
                });
            });
        },
        AddExtraQueryOptions: function(resource, path, query) {
            var $elf = this, _fromIdx = this.input.idx, limit, offset;
            return this._or(function() {
                return this._pred(path.count);
            }, function() {
                this._or(function() {
                    return this._pred(!path.options.$orderby);
                }, function() {
                    return this._applyWithArgs("OrderBy", path.options.$orderby, query, resource);
                });
                this._or(function() {
                    return this._pred(!path.options.$top);
                }, function() {
                    limit = this._applyWithArgs("Number", path.options.$top);
                    return query.extras.push([ "Limit", limit ]);
                });
                return this._or(function() {
                    return this._pred(!path.options.$skip);
                }, function() {
                    offset = this._applyWithArgs("Number", path.options.$skip);
                    return query.extras.push([ "Offset", offset ]);
                });
            });
        },
        NavigateResources: function(resource1, resource2) {
            var $elf = this, _fromIdx = this.input.idx, fkField;
            return this._or(function() {
                this._applyWithArgs("FieldContainedIn", resource1.resourceName, resource2);
                fkField = this._applyWithArgs("ReferencedField", resource2, resource1.resourceName);
                return [ "Equals", [ "ReferencedField", resource1.tableAlias, resource1.idField ], fkField ];
            }, function() {
                this._applyWithArgs("FieldContainedIn", resource2.resourceName, resource1);
                fkField = this._applyWithArgs("ReferencedField", resource1, resource2.resourceName);
                return [ "Equals", [ "ReferencedField", resource2.tableAlias, resource2.idField ], fkField ];
            }, function() {
                return function() {
                    throw new Error("Cannot navigate resources " + resource1.tableName + " and " + resource2.tableName);
                }.call(this);
            });
        },
        AddExtraFroms: function(searchPoint, query, resource) {
            var $elf = this, _fromIdx = this.input.idx, extraFroms;
            extraFroms = this._applyWithArgs("ExtraFroms", searchPoint);
            return _.each(extraFroms, function(extraResource) {
                var currentResource = resource;
                _.isArray(extraResource) ? _.each(extraResource, function(extraResource) {
                    $elf.AddNavigation(query, currentResource, extraResource);
                    currentResource = extraResource;
                }) : $elf.AddNavigation(query, currentResource, extraResource);
            });
        },
        ExtraFroms: function() {
            var $elf = this, _fromIdx = this.input.idx, extraFroms, froms, nextProp, parentResource, prop;
            froms = [];
            this._or(function() {
                this._pred(_.isArray(this.input.hd));
                return this._form(function() {
                    return this._many(function() {
                        extraFroms = this._apply("ExtraFroms");
                        return froms = froms.concat(extraFroms);
                    });
                });
            }, function() {
                nextProp = this.anything();
                parentResource = this.defaultResource;
                extraFroms = this._many1(function() {
                    prop = nextProp;
                    this._pred(prop);
                    this._pred(prop.name);
                    this._pred(prop.property);
                    this._pred(prop.property.name);
                    nextProp = prop.property;
                    return parentResource = this._applyWithArgs("Resource", prop.name, parentResource);
                });
                return this._or(function() {
                    this._pred(1 == extraFroms.length);
                    return froms.push(extraFroms[0]);
                }, function() {
                    return froms.push(extraFroms);
                });
            }, function() {
                return this.anything();
            });
            return froms;
        },
        AddNavigation: function(query, resource, extraResource) {
            var $elf = this, _fromIdx = this.input.idx, nagivationWhere;
            return this._opt(function() {
                this._pred(!_.some(query.from, function(from) {
                    return from === extraResource.tableAlias || _.isArray(from) && from[1] === extraResource.tableAlias;
                }));
                nagivationWhere = this._applyWithArgs("NavigateResources", resource, extraResource);
                query.fromResource(extraResource);
                return query.where.push(nagivationWhere);
            });
        }
    });
    OData2AbstractSQL.initialize = function() {
        this.reset();
    };
    OData2AbstractSQL.reset = function() {
        this.resourceAliases = {};
        this.defaultResource = null;
        this.extraBodyVars = {};
    };
    OData2AbstractSQL.checkAlias = _.identity;
    var generateShortAliases = function(clientModel) {
        var trie = {}, resourceNames = _.map(clientModel.resources, "resourceName");
        _(resourceNames).reject(function(part) {
            return _.includes(part, "__");
        }).invokeMap("toLowerCase").sort().each(function(resourceName) {
            var node = trie;
            _.each(resourceName, function(c, i) {
                if (node.$suffix) {
                    node[node.$suffix[0]] = {
                        $suffix: node.$suffix.slice(1)
                    };
                    delete node.$suffix;
                }
                if (!node[c]) {
                    node[c] = {
                        $suffix: resourceName.slice(i + 1)
                    };
                    return !1;
                }
                node = node[c];
            });
        });
        var shortAliases = {}, traverseNodes = function(str, node) {
            _.each(node, function(value, key) {
                if ("$suffix" === key) {
                    var lowerCaseResourceName = str + value, origResourceName = _.find(resourceNames, function(resourceName) {
                        return resourceName.toLowerCase() === lowerCaseResourceName;
                    });
                    shortAliases[origResourceName] = origResourceName.slice(0, str.length);
                } else traverseNodes(str + key, value);
            });
        };
        traverseNodes("", trie);
        _(resourceNames).invokeMap("split", "__").filter(function(resource) {
            return resource.length > 1;
        }).each(function(factType) {
            shortAliases[factType.join("__")] = _.map(factType, function(part) {
                return shortAliases[part] ? shortAliases[part] : part;
            }).join("__");
        });
        return shortAliases;
    };
    OData2AbstractSQL.setClientModel = function(clientModel) {
        this.clientModel = clientModel;
        var shortAliases = generateShortAliases(clientModel);
        this.checkAlias = memoize(function(alias) {
            var aliasLength = alias.length;
            return aliasLength < 64 ? alias : _(alias).split(".").map(function(part) {
                if (aliasLength < 64) return part;
                aliasLength -= part.length;
                var shortPart = shortAliases[part];
                if (shortPart) {
                    aliasLength += shortPart.length;
                    return shortPart;
                }
                aliasLength += 1;
                return part[0];
            }).join(".");
        });
    };
});