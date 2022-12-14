"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTsSourceFile = exports.getDecoratorPropertyValueNode = exports.readBootstrapInfo = exports.addEntryComponents = exports.addDeclarationToModule = exports.addProviderToModule = exports.addRoute = exports.getBootstrapComponent = exports.replaceIntoToTestBed = exports.addDeclarationsToTestBed = exports.addImportToTestBed = exports.addImportToModule = exports.removeFromNgModule = exports.getDecoratorMetadata = void 0;
const ts = require("typescript");
const find_nodes_1 = require("@nrwl/workspace/src/utilities/typescript/find-nodes");
const get_source_nodes_1 = require("@nrwl/workspace/src/utilities/typescript/get-source-nodes");
const path = require("path");
const devkit_1 = require("@nrwl/devkit");
const ast_utils_1 = require("@nrwl/workspace/src/utilities/ast-utils");
function _angularImportsFromNode(node, _sourceFile) {
    const ms = node.moduleSpecifier;
    let modulePath;
    switch (ms.kind) {
        case ts.SyntaxKind.StringLiteral:
            modulePath = ms.text;
            break;
        default:
            return {};
    }
    if (!modulePath.startsWith('@angular/')) {
        return {};
    }
    if (node.importClause) {
        if (node.importClause.name) {
            return {};
        }
        else if (node.importClause.namedBindings) {
            const nb = node.importClause.namedBindings;
            if (nb.kind == ts.SyntaxKind.NamespaceImport) {
                return {
                    [`${nb.name.text}.`]: modulePath,
                };
            }
            else {
                const namedImports = nb;
                return namedImports.elements
                    .map((is) => is.propertyName ? is.propertyName.text : is.name.text)
                    .reduce((acc, curr) => {
                    acc[curr] = modulePath;
                    return acc;
                }, {});
            }
        }
        return {};
    }
    else {
        return {};
    }
}
function getDecoratorMetadata(source, identifier, module) {
    const angularImports = (0, find_nodes_1.findNodes)(source, ts.SyntaxKind.ImportDeclaration)
        .map((node) => _angularImportsFromNode(node, source))
        .reduce((acc, current) => {
        for (const key of Object.keys(current)) {
            acc[key] = current[key];
        }
        return acc;
    }, {});
    return (0, get_source_nodes_1.getSourceNodes)(source)
        .filter(node => {
        return (node.kind == ts.SyntaxKind.Decorator &&
            node.expression.kind == ts.SyntaxKind.CallExpression);
    })
        .map(node => node.expression)
        .filter(expr => {
        if (expr.expression.kind == ts.SyntaxKind.Identifier) {
            const id = expr.expression;
            return (id.getFullText(source) == identifier &&
                angularImports[id.getFullText(source)] === module);
        }
        else if (expr.expression.kind == ts.SyntaxKind.PropertyAccessExpression) {
            const paExpr = expr.expression;
            if (paExpr.expression.kind !== ts.SyntaxKind.Identifier) {
                return false;
            }
            const id = paExpr.name.text;
            const moduleId = paExpr.expression.getText(source);
            return id === identifier && angularImports[`${moduleId}.`] === module;
        }
        return false;
    })
        .filter(expr => expr.arguments[0] &&
        expr.arguments[0].kind == ts.SyntaxKind.ObjectLiteralExpression)
        .map(expr => expr.arguments[0]);
}
exports.getDecoratorMetadata = getDecoratorMetadata;
function _addSymbolToNgModuleMetadata(host, source, ngModulePath, metadataField, expression) {
    const nodes = getDecoratorMetadata(source, 'NgModule', '@angular/core');
    let node = nodes[0];
    if (!node) {
        return source;
    }
    const matchingProperties = node.properties
        .filter(prop => prop.kind == ts.SyntaxKind.PropertyAssignment)
        .filter((prop) => {
        const name = prop.name;
        switch (name.kind) {
            case ts.SyntaxKind.Identifier:
                return name.getText(source) == metadataField;
            case ts.SyntaxKind.StringLiteral:
                return name.text == metadataField;
        }
        return false;
    });
    if (!matchingProperties) {
        return source;
    }
    if (matchingProperties.length == 0) {
        const expr = node;
        let position;
        let toInsert;
        if (expr.properties.length == 0) {
            position = expr.getEnd() - 1;
            toInsert = `  ${metadataField}: [${expression}]\n`;
        }
        else {
            node = expr.properties[expr.properties.length - 1];
            position = node.getEnd();
            const text = node.getFullText(source);
            if (text.match('^\r?\r?\n')) {
                toInsert = `,${text.match(/^\r?\n\s+/)[0]}${metadataField}: [${expression}]`;
            }
            else {
                toInsert = `, ${metadataField}: [${expression}]`;
            }
        }
        return (0, ast_utils_1.insertChange)(host, source, ngModulePath, position, toInsert);
    }
    const assignment = matchingProperties[0];
    if (assignment.initializer.kind !== ts.SyntaxKind.ArrayLiteralExpression) {
        return source;
    }
    const arrLiteral = assignment.initializer;
    if (arrLiteral.elements.length == 0) {
        node = arrLiteral;
    }
    else {
        node = arrLiteral.elements;
    }
    if (!node) {
        console.log('No app module found. Please add your new class to your component.');
        return source;
    }
    const isArray = Array.isArray(node);
    if (isArray) {
        const nodeArray = node;
        const symbolsArray = nodeArray.map(node => node.getText());
        if (symbolsArray.includes(expression)) {
            return source;
        }
        node = node[node.length - 1];
    }
    let toInsert;
    let position = node.getEnd();
    if (!isArray && node.kind == ts.SyntaxKind.ObjectLiteralExpression) {
        const expr = node;
        if (expr.properties.length == 0) {
            position = expr.getEnd() - 1;
            toInsert = `  ${metadataField}: [${expression}]\n`;
        }
        else {
            node = expr.properties[expr.properties.length - 1];
            position = node.getEnd();
            const text = node.getFullText(source);
            if (text.match('^\r?\r?\n')) {
                toInsert = `,${text.match(/^\r?\n\s+/)[0]}${metadataField}: [${expression}]`;
            }
            else {
                toInsert = `, ${metadataField}: [${expression}]`;
            }
        }
    }
    else if (!isArray && node.kind == ts.SyntaxKind.ArrayLiteralExpression) {
        position--;
        toInsert = `${expression}`;
    }
    else {
        const text = node.getFullText(source);
        if (text.match(/^\r?\n/)) {
            toInsert = `,${text.match(/^\r?\n(\r?)\s+/)[0]}${expression}`;
        }
        else {
            toInsert = `, ${expression}`;
        }
    }
    return (0, ast_utils_1.insertChange)(host, source, ngModulePath, position, toInsert);
}
function removeFromNgModule(host, source, modulePath, property) {
    const nodes = getDecoratorMetadata(source, 'NgModule', '@angular/core');
    const node = nodes[0];
    if (!node) {
        return source;
    }
    const matchingProperty = getMatchingProperty(source, property, 'NgModule', '@angular/core');
    if (matchingProperty) {
        return (0, ast_utils_1.removeChange)(host, source, modulePath, matchingProperty.getStart(source), matchingProperty.getFullText(source));
    }
}
exports.removeFromNgModule = removeFromNgModule;
function addImportToModule(host, source, modulePath, symbolName) {
    return _addSymbolToNgModuleMetadata(host, source, modulePath, 'imports', symbolName);
}
exports.addImportToModule = addImportToModule;
function addImportToTestBed(host, source, specPath, symbolName) {
    const allCalls = ((0, find_nodes_1.findNodes)(source, ts.SyntaxKind.CallExpression));
    const configureTestingModuleObjectLiterals = allCalls
        .filter(c => c.expression.kind === ts.SyntaxKind.PropertyAccessExpression)
        .filter((c) => c.expression.name.getText(source) === 'configureTestingModule')
        .map(c => c.arguments[0].kind === ts.SyntaxKind.ObjectLiteralExpression
        ? c.arguments[0]
        : null);
    if (configureTestingModuleObjectLiterals.length > 0) {
        const startPosition = configureTestingModuleObjectLiterals[0]
            .getFirstToken(source)
            .getEnd();
        return (0, ast_utils_1.insertChange)(host, source, specPath, startPosition, `imports: [${symbolName}], `);
    }
    return source;
}
exports.addImportToTestBed = addImportToTestBed;
function addDeclarationsToTestBed(host, source, specPath, symbolName) {
    const allCalls = ((0, find_nodes_1.findNodes)(source, ts.SyntaxKind.CallExpression));
    const configureTestingModuleObjectLiterals = allCalls
        .filter(c => c.expression.kind === ts.SyntaxKind.PropertyAccessExpression)
        .filter((c) => c.expression.name.getText(source) === 'configureTestingModule')
        .map(c => c.arguments[0].kind === ts.SyntaxKind.ObjectLiteralExpression
        ? c.arguments[0]
        : null);
    if (configureTestingModuleObjectLiterals.length > 0) {
        const startPosition = configureTestingModuleObjectLiterals[0]
            .getFirstToken(source)
            .getEnd();
        return (0, ast_utils_1.insertChange)(host, source, specPath, startPosition, `declarations: [${symbolName.join(',')}], `);
    }
    return source;
}
exports.addDeclarationsToTestBed = addDeclarationsToTestBed;
function replaceIntoToTestBed(host, source, specPath, newSymbol, previousSymbol) {
    const allCalls = ((0, find_nodes_1.findNodes)(source, ts.SyntaxKind.CallExpression));
    const configureTestingModuleObjectLiterals = allCalls
        .filter(c => c.expression.kind === ts.SyntaxKind.PropertyAccessExpression)
        .filter((c) => c.expression.name.getText(source) === 'configureTestingModule')
        .map(c => c.arguments[0].kind === ts.SyntaxKind.ObjectLiteralExpression
        ? c.arguments[0]
        : null);
    if (configureTestingModuleObjectLiterals.length > 0) {
        const startPosition = configureTestingModuleObjectLiterals[0]
            .getFirstToken(source)
            .getEnd();
        return (0, ast_utils_1.replaceChange)(host, source, specPath, startPosition, newSymbol, previousSymbol);
    }
    return source;
}
exports.replaceIntoToTestBed = replaceIntoToTestBed;
function getBootstrapComponent(source, moduleClassName) {
    const bootstrap = getMatchingProperty(source, 'bootstrap', 'NgModule', '@angular/core');
    if (!bootstrap) {
        throw new Error(`Cannot find bootstrap components in '${moduleClassName}'`);
    }
    const c = bootstrap.getChildren();
    const nodes = c[c.length - 1].getChildren();
    const bootstrapComponent = nodes.slice(1, nodes.length - 1)[0];
    if (!bootstrapComponent) {
        throw new Error(`Cannot find bootstrap components in '${moduleClassName}'`);
    }
    return bootstrapComponent.getText();
}
exports.getBootstrapComponent = getBootstrapComponent;
function getMatchingProperty(source, property, identifier, module) {
    const nodes = getDecoratorMetadata(source, identifier, module);
    const node = nodes[0];
    if (!node)
        return null;
    return getMatchingObjectLiteralElement(node, source, property);
}
function addRoute(host, ngModulePath, source, route) {
    const routes = getListOfRoutes(source);
    if (!routes)
        return source;
    if (routes.hasTrailingComma || routes.length === 0) {
        return (0, ast_utils_1.insertChange)(host, source, ngModulePath, routes.end, route);
    }
    else {
        return (0, ast_utils_1.insertChange)(host, source, ngModulePath, routes.end, `, ${route}`);
    }
}
exports.addRoute = addRoute;
function getListOfRoutes(source) {
    const imports = getMatchingProperty(source, 'imports', 'NgModule', '@angular/core');
    if (imports?.initializer.kind === ts.SyntaxKind.ArrayLiteralExpression) {
        const a = imports.initializer;
        for (const e of a.elements) {
            if (e.kind === ts.SyntaxKind.CallExpression) {
                const ee = e;
                const text = ee.expression.getText(source);
                if ((text === 'RouterModule.forRoot' ||
                    text === 'RouterModule.forChild') &&
                    ee.arguments.length > 0) {
                    const routes = ee.arguments[0];
                    if (routes.kind === ts.SyntaxKind.ArrayLiteralExpression) {
                        return routes.elements;
                    }
                    else if (routes.kind === ts.SyntaxKind.Identifier) {
                        const variableDeclarations = (0, find_nodes_1.findNodes)(source, ts.SyntaxKind.VariableDeclaration);
                        const routesDeclaration = variableDeclarations.find(x => {
                            return x.name.getText() === routes.getText();
                        });
                        if (routesDeclaration) {
                            return routesDeclaration.initializer.elements;
                        }
                    }
                }
            }
        }
    }
    return null;
}
function addProviderToModule(host, source, modulePath, symbolName) {
    return _addSymbolToNgModuleMetadata(host, source, modulePath, 'providers', symbolName);
}
exports.addProviderToModule = addProviderToModule;
function addDeclarationToModule(host, source, modulePath, symbolName) {
    return _addSymbolToNgModuleMetadata(host, source, modulePath, 'declarations', symbolName);
}
exports.addDeclarationToModule = addDeclarationToModule;
function addEntryComponents(host, source, modulePath, symbolName) {
    return _addSymbolToNgModuleMetadata(host, source, modulePath, 'entryComponents', symbolName);
}
exports.addEntryComponents = addEntryComponents;
function readBootstrapInfo(host, app) {
    const config = (0, devkit_1.readProjectConfiguration)(host, app);
    let mainPath;
    try {
        mainPath = config.targets.build.options.main;
    }
    catch (e) {
        throw new Error('Main file cannot be located');
    }
    if (!host.exists(mainPath)) {
        throw new Error('Main file cannot be located');
    }
    const mainSource = host.read(mainPath).toString('utf-8');
    const main = ts.createSourceFile(mainPath, mainSource, ts.ScriptTarget.Latest, true);
    const moduleImports = (0, ast_utils_1.getImport)(main, (s) => s.indexOf('.module') > -1);
    if (moduleImports.length !== 1) {
        throw new Error(`main.ts can only import a single module`);
    }
    const moduleImport = moduleImports[0];
    const moduleClassName = moduleImport.bindings.filter(b => b.endsWith('Module'))[0];
    const modulePath = `${path.join(path.dirname(mainPath), moduleImport.moduleSpec)}.ts`;
    if (!host.exists(modulePath)) {
        throw new Error(`Cannot find '${modulePath}'`);
    }
    const moduleSourceText = host.read(modulePath).toString('utf-8');
    const moduleSource = ts.createSourceFile(modulePath, moduleSourceText, ts.ScriptTarget.Latest, true);
    const bootstrapComponentClassName = getBootstrapComponent(moduleSource, moduleClassName);
    const bootstrapComponentFileName = `./${path.join(path.dirname(moduleImport.moduleSpec), `${(0, devkit_1.names)(bootstrapComponentClassName.substring(0, bootstrapComponentClassName.length - 9)).fileName}.component`)}`;
    return {
        moduleSpec: moduleImport.moduleSpec,
        mainPath,
        modulePath,
        moduleSource,
        moduleClassName,
        bootstrapComponentClassName,
        bootstrapComponentFileName,
    };
}
exports.readBootstrapInfo = readBootstrapInfo;
function getDecoratorPropertyValueNode(host, modulePath, identifier, property, module) {
    const moduleSourceText = host.read(modulePath).toString('utf-8');
    const moduleSource = ts.createSourceFile(modulePath, moduleSourceText, ts.ScriptTarget.Latest, true);
    const templateNode = getMatchingProperty(moduleSource, property, identifier, module);
    return templateNode.getChildAt(templateNode.getChildCount() - 1);
}
exports.getDecoratorPropertyValueNode = getDecoratorPropertyValueNode;
function getMatchingObjectLiteralElement(node, source, property) {
    return (node.properties
        .filter(prop => prop.kind == ts.SyntaxKind.PropertyAssignment)
        .filter((prop) => {
        const name = prop.name;
        switch (name.kind) {
            case ts.SyntaxKind.Identifier:
                return name.getText(source) === property;
            case ts.SyntaxKind.StringLiteral:
                return name.text === property;
        }
        return false;
    })[0]);
}
function getTsSourceFile(host, path) {
    const buffer = host.read(path);
    if (!buffer) {
        throw new Error(`Could not read TS file (${path}).`);
    }
    const content = buffer.toString();
    const source = ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true);
    return source;
}
exports.getTsSourceFile = getTsSourceFile;
//# sourceMappingURL=angular-ast-utils.js.map