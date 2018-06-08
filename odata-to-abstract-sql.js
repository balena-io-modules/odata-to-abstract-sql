!function(root, factory) {
    "function" == typeof define && define.amd ? define([ "require", "exports", "ometa-core", "lodash", "memoizee", "randomstring" ], factory) : "object" == typeof exports ? factory(require, exports, require("ometa-js").core) : factory(function(moduleName) {
        return root[moduleName];
    }, root, root.OMeta);
}(this, function(require, exports, OMeta) {
    var _ = require("lodash"), memoize = require("memoizee"), randomstring = require("randomstring"), Query = function() {
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
    Query.prototype.fromResource = function(resource, args) {
        if (resource.definition) {
            definition = _.cloneDeep(resource.definition);
            rewriteBinds(definition, args.extraBindVars, args.bindVarsLength);
            this.from.push([ definition.abstractSqlQuery, resource.tableAlias ]);
        } else resource.name !== resource.tableAlias ? this.from.push([ resource.name, resource.tableAlias ]) : this.from.push(resource.name);
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
    var sqlNameToODataName = memoize(function(sqlName) {
        return sqlName.replace(/-/g, "__").replace(/ /g, "_");
    }, {
        primitive: !0
    });
    exports.sqlNameToODataName = sqlNameToODataName;
    var odataNameToSqlName = memoize(function(odataName) {
        return odataName.replace(/__/g, "-").replace(/_/g, " ");
    }, {
        primitive: !0
    });
    exports.odataNameToSqlName = odataNameToSqlName;
    var incrementBinds = function(inc, abstractSql) {
        _.isArray(abstractSql) && ("Bind" === abstractSql[0] ? _.isNumber(abstractSql[1]) && (abstractSql[1] += inc) : _.each(abstractSql, function(abstractSql) {
            incrementBinds(inc, abstractSql);
        }));
    }, rewriteBinds = function(definition, existingBinds, inc) {
        inc = inc || 0;
        incrementBinds(existingBinds.length + inc, definition.abstractSqlQuery);
        existingBinds.push.apply(existingBinds, definition.extraBinds);
    };
    exports.rewriteBinds = rewriteBinds;
    var OData2AbstractSQL = exports.OData2AbstractSQL = OMeta._extend({
        Process: function(method, bodyKeys, bindVarsLength) {
            var $elf = this, _fromIdx = this.input.idx, insertQuery, path, query, queryType, tree;
            path = this.anything();
            this._apply("end");
            this.bindVarsLength = bindVarsLength;
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
                extraBodyVars: this.extraBodyVars,
                extraBindVars: this.extraBindVars
            };
        },
        PathSegment: function(method, bodyKeys, path) {
            var $elf = this, _fromIdx = this.input.idx, aliasedField, bindVars, childQuery, linkResource, navigation, query, referencedField, referencedIdField, resource, resourceMapping, subQuery, valuesIndex;
            this._pred(path.resource);
            resource = this._applyWithArgs("Resource", path.resource, this.defaultResource);
            this.defaultResource = resource;
            query = new Query();
            query.fromResource(resource, this);
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
                navigation = this._applyWithArgs("NavigateResources", resource, path.property.resource);
                return query.where.push(navigation.where);
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
                this._pred("POST" == method || "PUT-INSERT" == method);
                return this._opt(function() {
                    this._pred(path.options.$filter);
                    subQuery = this._applyWithArgs("InsertFilter", path.options.$filter, resource, bindVars);
                    valuesIndex = _.findIndex(query.extras, {
                        0: "Values"
                    });
                    return query.extras[valuesIndex] = [ "Values", subQuery.compile("SelectQuery") ];
                });
            }, function() {
                this._pred("PUT" == method || "PATCH" == method || "MERGE" == method || "DELETE" == method);
                subQuery = new Query();
                (function() {
                    subQuery.select.push(referencedIdField);
                    return subQuery.fromResource(resource, this);
                }).call(this);
                this._applyWithArgs("AddQueryOptions", resource, path, subQuery);
                return query.where.push([ "In", referencedIdField, subQuery.compile("SelectQuery") ]);
            }, function() {
                return this._applyWithArgs("AddQueryOptions", resource, path, query);
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
            this._applyWithArgs("AddExtraFroms", query, resource, filter);
            filter = this._applyWithArgs("Boolean", filter);
            return query.where.push(filter);
        },
        InsertFilter: function(filter, resource, bindVars) {
            var $elf = this, _fromIdx = this.input.idx, query, where;
            query = new Query();
            this._applyWithArgs("AddExtraFroms", query, resource, filter);
            where = this._applyWithArgs("Boolean", filter);
            (function() {
                query.select = _.map(bindVars, function(bindVar) {
                    return [ "ReferencedField", resource.tableAlias, bindVar[0] ];
                });
                query.from.push([ [ "SelectQuery", [ "Select", _.map(resource.fields, function(field) {
                    var cast, alias = field.fieldName, bindVar = _.find(bindVars, {
                        0: alias
                    });
                    return [ [ "Cast", bindVar ? bindVar[1] : "Null", field.dataType ], alias ];
                }) ] ], resource.tableAlias ]);
                return query.where.push(where);
            }).call(this);
            return query;
        },
        OrderBy: function(orderby, query, resource) {
            var $elf = this, _fromIdx = this.input.idx, orderby;
            this._applyWithArgs("AddExtraFroms", query, resource, orderby.properties);
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
            return _.compact(fields);
        },
        ResolveResourceAlias: function(aliasName) {
            var $elf = this, _fromIdx = this.input.idx;
            this._pred(this.resourceAliases[aliasName]);
            return this.resourceAliases[aliasName];
        },
        Resource: function(resourceName, parentResource) {
            var $elf = this, _fromIdx = this.input.idx, relationshipMapping, resource, resourceAlias, sqlName, tableAlias, verb;
            return this._or(function() {
                return this._applyWithArgs("ResolveResourceAlias", resourceName);
            }, function() {
                resource = this._or(function() {
                    this._pred(parentResource);
                    relationshipMapping = this._applyWithArgs("ResolveRelationship", parentResource, resourceName);
                    return this.clientModel.tables[relationshipMapping[1][0]];
                }, function() {
                    sqlName = odataNameToSqlName(resourceName);
                    sqlName = this._applyWithArgs("Synonym", sqlName);
                    return this.clientModel.tables[sqlName];
                });
                this._pred(resource);
                resource = _.clone(resource);
                tableAlias = this._or(function() {
                    this._pred(parentResource);
                    resourceAlias = this._or(function() {
                        this._pred(_.includes(resourceName, "__") && !_.includes(resource.name, "-"));
                        verb = odataNameToSqlName(resourceName).split("-")[0];
                        return verb + "-" + resource.name;
                    }, function() {
                        return resource.name;
                    });
                    return parentResource.tableAlias + "." + resourceAlias;
                }, function() {
                    return resource.name;
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
            var $elf = this, _fromIdx = this.input.idx;
            return this._applyWithArgs("ResolveRelationship", resource, fieldName);
        },
        ResourceMapping: function(resource) {
            var $elf = this, _fromIdx = this.input.idx, tableAlias;
            tableAlias = this._or(function() {
                this._pred(resource.tableAlias);
                return resource.tableAlias;
            }, function() {
                return resource.name;
            });
            return _(resource.fields).map(function(field) {
                return [ tableAlias, field.fieldName ];
            }).keyBy(function(mapping) {
                return sqlNameToODataName(mapping[1]);
            }).value();
        },
        ResolveRelationship: function(resource, relationship) {
            var $elf = this, _fromIdx = this.input.idx, relationshipMapping, relationshipPath, resourceName, resourceRelations;
            resourceName = this._or(function() {
                this._pred(_.isObject(resource));
                return resource.resourceName;
            }, function() {
                this._pred(this.resourceAliases[resourceName]);
                return this.resourceAliases[resourceName].resourceName;
            }, function() {
                return resource;
            });
            resourceName = this._applyWithArgs("Synonym", resourceName);
            resourceRelations = this.clientModel.relationships[resourceName];
            this._pred(resourceRelations);
            relationshipPath = _(relationship).split("__").map(odataNameToSqlName).flatMap(function(sqlName) {
                return $elf.Synonym(sqlName).split("-");
            }).join(".");
            relationshipMapping = _.get(resourceRelations, relationshipPath);
            this._pred(relationshipMapping);
            this._pred(relationshipMapping.$);
            return relationshipMapping.$;
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
                this._applyWithArgs("AddExtraFroms", query, resource, path.options.$select.properties);
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
                    return _.some(query.select, function(existingField) {
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
            var $elf = this, _fromIdx = this.input.idx, mapping, relationshipMapping, tableAlias;
            mapping = this._applyWithArgs("ResourceMapping", resource);
            return this._or(function() {
                this._pred(mapping[resourceField]);
                return [ "ReferencedField" ].concat(mapping[resourceField]);
            }, function() {
                relationshipMapping = this._applyWithArgs("ResolveRelationship", resource, resourceField);
                tableAlias = this._or(function() {
                    this._pred(resource.tableAlias);
                    return resource.tableAlias;
                }, function() {
                    return resource.name;
                });
                return [ "ReferencedField", tableAlias, relationshipMapping[0] ];
            }, function() {
                console.error("Unknown mapping: ", mapping, resource.resourceName, resourceField);
                return function() {
                    throw new Error("Unknown mapping: " + resource.resourceName + " : " + resourceField);
                }.call(this);
            });
        },
        Boolean: function() {
            var $elf = this, _fromIdx = this.input.idx, bool, op1, op2, operation, rest;
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
                    }, function() {
                        switch (this.anything()) {
                          case "in":
                            op1 = this._apply("Operand");
                            this._form(function() {
                                return rest = this._many(function() {
                                    return this._apply("Operand");
                                });
                            });
                            return [ "In", op1 ].concat(rest);

                          case "not":
                            bool = this._apply("Boolean");
                            return [ "Not", bool ];

                          default:
                            throw this._fail();
                        }
                    });
                });
                return bool;
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
        Lambda: function(resourceName, lambda) {
            var $elf = this, _fromIdx = this.input.idx, defaultResource, filter, query, resource, resourceAliases, result;
            resourceAliases = this.resourceAliases;
            defaultResource = this.defaultResource;
            this._or(function() {
                query = new Query();
                resource = this._applyWithArgs("AddNavigation", query, this.defaultResource, resourceName);
                (function() {
                    this.resourceAliases = _.clone(this.resourceAliases);
                    return this.resourceAliases[lambda.identifier] = resource;
                }).call(this);
                this.defaultResource = resource;
                this._applyWithArgs("AddExtraFroms", query, resource, lambda.expression);
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
            var $elf = this, _fromIdx = this.input.idx, defaultResource, prop, propResource, result;
            prop = this.anything();
            this._pred(prop.name);
            return this._or(function() {
                this._pred(prop.property);
                defaultResource = this.defaultResource;
                return this._or(function() {
                    propResource = function() {
                        try {
                            return $elf.Resource(prop.name, this.defaultResource);
                        } catch (e) {}
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
                return this._applyWithArgs("Lambda", prop.name, prop.lambda);
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
            var $elf = this, _fromIdx = this.input.idx, defaultResource, expand, expandQuery, expandResource, navigation, nestedExpandQuery;
            defaultResource = this.defaultResource;
            return this._form(function() {
                return this._many1(function() {
                    expand = this.anything();
                    navigation = this._applyWithArgs("NavigateResources", resource, expand.name);
                    expandResource = navigation.resource;
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
                    nestedExpandQuery.fromResource(expandResource, this);
                    this._or(function() {
                        return this._applyWithArgs("AddCountField", expand, nestedExpandQuery, expandResource);
                    }, function() {
                        return this._applyWithArgs("AddSelectFields", expand, nestedExpandQuery, expandResource);
                    });
                    this._or(function() {
                        return this._pred(!expand.options);
                    }, function() {
                        return this._applyWithArgs("AddQueryOptions", expandResource, expand, nestedExpandQuery);
                    });
                    this.defaultResource = defaultResource;
                    nestedExpandQuery.where.push(navigation.where);
                    expandQuery = new Query();
                    expandQuery.select.push([ [ "AggregateJSON", [ expandResource.tableAlias, "*" ] ], expand.name ]);
                    expandQuery.from.push([ nestedExpandQuery.compile("SelectQuery"), expandResource.tableAlias ]);
                    return query.select.push([ expandQuery.compile("SelectQuery"), expand.name ]);
                });
            });
        },
        AddQueryOptions: function(resource, path, query) {
            var $elf = this, _fromIdx = this.input.idx, limit, offset;
            this._or(function() {
                return this._pred(!path.options.$filter);
            }, function() {
                return this._applyWithArgs("SelectFilter", path.options.$filter, query, resource);
            });
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
        NavigateResources: function(resource, navigation) {
            var $elf = this, _fromIdx = this.input.idx, linkedResource, linkedTableAlias, relationshipMapping, tableAlias;
            return this._or(function() {
                relationshipMapping = this._applyWithArgs("ResolveRelationship", resource, navigation);
                linkedResource = this._applyWithArgs("Resource", navigation, resource);
                tableAlias = this._or(function() {
                    this._pred(resource.tableAlias);
                    return resource.tableAlias;
                }, function() {
                    return resource.name;
                });
                linkedTableAlias = this._or(function() {
                    this._pred(linkedResource.tableAlias);
                    return linkedResource.tableAlias;
                }, function() {
                    return linkedResource.name;
                });
                return {
                    resource: linkedResource,
                    where: [ "Equals", [ "ReferencedField", tableAlias, relationshipMapping[0] ], [ "ReferencedField", linkedTableAlias, relationshipMapping[1][1] ] ]
                };
            }, function() {
                return function() {
                    throw new Error("Cannot navigate resources " + resource.resourceName + " and " + navigation);
                }.call(this);
            });
        },
        AddExtraFroms: function(query, parentResource) {
            var $elf = this, _fromIdx = this.input.idx, nextProp, parentResource, prop;
            return this._or(function() {
                this._pred(_.isArray(this.input.hd));
                return this._form(function() {
                    return this._many(function() {
                        return this._applyWithArgs("AddExtraFroms", query, parentResource);
                    });
                });
            }, function() {
                nextProp = this.anything();
                return this._many1(function() {
                    prop = nextProp;
                    this._pred(prop);
                    this._pred(prop.name);
                    this._pred(prop.property);
                    this._pred(prop.property.name);
                    nextProp = prop.property;
                    return parentResource = this._or(function() {
                        return this._applyWithArgs("ResolveResourceAlias", prop.name);
                    }, function() {
                        return this._applyWithArgs("AddNavigation", query, parentResource, prop.name);
                    });
                });
            }, function() {
                return this.anything();
            });
        },
        AddNavigation: function(query, resource, extraResource) {
            var $elf = this, _fromIdx = this.input.idx, navigation;
            return this._opt(function() {
                navigation = this._applyWithArgs("NavigateResources", resource, extraResource);
                this._pred(!_.some(query.from, function(from) {
                    return from === navigation.resource.tableAlias || _.isArray(from) && from[1] === navigation.resource.tableAlias;
                }));
                query.fromResource(navigation.resource, this);
                query.where.push(navigation.where);
                return navigation.resource;
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
        this.extraBindVars = [];
    };
    OData2AbstractSQL.Synonym = function(sqlName) {
        var $elf = this;
        return _(sqlName).split("-").map(function(namePart) {
            var synonym = $elf.clientModel.synonyms[namePart];
            return synonym || namePart;
        }).join("-");
    };
    OData2AbstractSQL.checkAlias = _.identity;
    var generateShortAliases = function(clientModel) {
        var shortAliases = {}, addAliases = function(origAliasParts) {
            var trie = {}, buildTrie = function(aliasPart) {
                var node = trie;
                _.each(aliasPart, function(c, i) {
                    if (node.$suffix) {
                        node[node.$suffix[0]] = {
                            $suffix: node.$suffix.slice(1)
                        };
                        delete node.$suffix;
                    }
                    if (!node[c]) {
                        node[c] = {
                            $suffix: aliasPart.slice(i + 1)
                        };
                        return !1;
                    }
                    node = node[c];
                });
            }, traverseNodes = function(str, node) {
                _.each(node, function(value, key) {
                    if ("$suffix" === key) {
                        var lowerCaseAliasPart = str + value, origAliasPart = _.find(origAliasParts, function(aliasPart) {
                            return aliasPart.toLowerCase() === lowerCaseAliasPart;
                        });
                        shortAliases[origAliasPart] = origAliasPart.slice(0, str.length);
                    } else traverseNodes(str + key, value, origAliasParts);
                });
            };
            _(origAliasParts).invokeMap("toLowerCase").sort().each(buildTrie);
            traverseNodes("", trie, origAliasParts);
        }, getRelationships = function(relationships) {
            return _.isArray(relationships) ? [] : _(relationships).keys().reject(function(key) {
                return "$" === key;
            }).concat(_.flatMap(relationships, getRelationships)).uniq().value();
        }, aliasParts = getRelationships(clientModel.relationships).concat(_.keys(clientModel.synonyms)), origAliasParts = _(aliasParts).flatMap(function(aliasPart) {
            return aliasPart.split(/-| /);
        }).uniq().value();
        addAliases(origAliasParts);
        trie = {};
        origAliasParts = _(aliasParts).flatMap(function(aliasPart) {
            return aliasPart.split("-");
        }).filter(function(aliasPart) {
            return _.includes(aliasPart, " ");
        }).map(function(aliasPart) {
            return _(aliasPart).split(" ").map(function(part) {
                return shortAliases[part];
            }).join(" ");
        }).uniq().value();
        addAliases(origAliasParts);
        trie = {};
        origAliasParts = _(aliasParts).filter(function(aliasPart) {
            return _.includes(aliasPart, "-");
        }).map(function(aliasPart) {
            return _(aliasPart).split("-").map(function(part) {
                return shortAliases[part];
            }).join("-");
        }).uniq().value();
        addAliases(origAliasParts);
        return shortAliases;
    };
    OData2AbstractSQL.setClientModel = function(clientModel) {
        this.clientModel = clientModel;
        var MAX_ALIAS_LENGTH = 64, shortAliases = generateShortAliases(clientModel);
        this.checkAlias = memoize(function(alias) {
            var aliasLength = alias.length;
            if (aliasLength < MAX_ALIAS_LENGTH) return alias;
            alias = _(alias).split(".").map(function(part) {
                if (aliasLength < MAX_ALIAS_LENGTH) return part;
                aliasLength -= part.length;
                var shortAlias = _(part).split("-").map(function(part) {
                    var part = _(part).split(" ").map(function(part) {
                        var shortPart = shortAliases[part];
                        return shortPart || part;
                    }).join(" ");
                    shortPart = shortAliases[part];
                    return shortPart || part;
                }).join("-");
                aliasLength += shortAlias.length;
                return shortAlias;
            }).join(".");
            if (aliasLength < MAX_ALIAS_LENGTH) return alias;
            var randStr = randomstring.generate(12) + "$";
            return randStr + alias.slice(randStr.length + alias.length - MAX_ALIAS_LENGTH);
        });
    };
});