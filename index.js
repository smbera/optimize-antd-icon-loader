const parser = require("@babel/parser")
const loaderUtils = require('loader-utils')
const core = require("@babel/core")
const iconDist = require('@ant-design/icons/lib/dist')
const fs = require('fs')
const traverse = require("@babel/traverse").default
const validate = require("schema-utils")
let tempFilePath = ''
const addIconArr = []
const loaderName = require('./package.json').name

function isArray(arrLike) {
    return Object.prototype.toString.call(arrLike) === '[object Array]'
}

function searchIconByName(name, theme = 'outline') {
    const themeLowercase = (theme === 'filled' ? 'fill' : theme).toLowerCase()
    const iconExportKey = Object.keys(iconDist).find((key) => {
        return iconDist[key].name.toLowerCase() === name && iconDist[key].theme === themeLowercase
    })
    if (iconExportKey && addIconArr.indexOf(iconExportKey) < 0) {
        const iconObj = iconDist[iconExportKey]
        const content = `export {
    default as ${iconExportKey}
} from '@ant-design/icons/lib/${iconObj.theme}/${iconExportKey}'
`
        writeTempFile(content, iconExportKey)
        addIconArr.push(iconExportKey)
    }
}

function writeTempFile(content, iconExportName) {
    const iconFileContent = fs.readFileSync(tempFilePath).toString()
    if (iconFileContent.indexOf(iconExportName) < 0) {
        fs.appendFileSync(tempFilePath, content)
    }
}

function getIconProps(astParam) {
    const result = {}
    if (isArray(astParam)) {
        for (let i = 0; i < astParam.length; i++) {
            const keyName = astParam[i].key && astParam[i].key.name
            if (keyName === 'type') {
                if (astParam[i].value.type === 'ConditionalExpression') {
                    result[keyName] = []
                    if (astParam[i].value.consequent) {
                        result[keyName].push(astParam[i].value.consequent.value)
                    }
                    if (astParam[i].value.alternate) {
                        result[keyName].push(astParam[i].value.alternate.value)
                    }
                } else if (astParam[i].value) {
					result[keyName] = astParam[i].value.value
                }
            } else if (['type', 'theme'].indexOf(keyName) >= 0 && astParam[i].value.value) {
                result[keyName] = astParam[i].value.value
            }
        }
	}
    return result
}
module.exports = function(source) {
	const options = loaderUtils.getOptions(this)

	validate({
		type: "object",
		properties: {
			filePath: {
				type: "string"
			}
		},
		required: ["filePath"],
		additionalProperties: false
	  }, options, loaderName)

    tempFilePath = options.filePath
    if (!tempFilePath) {
        return source
	}
	if (!fs.existsSync(tempFilePath)) {
        fs.writeFileSync(tempFilePath, '')
    }
	const ast = parser.parse(source, { sourceType: "module", plugins: ['dynamicImport'] })
    traverse(ast, {
        CallExpression: function(path) {
            if (path.node.callee && isArray(path.node.arguments)) {
                const { object, property } = path.node.callee
				const [ Identifier, ObjectExpression ] = path.node.arguments
                if (!object || !property || !ObjectExpression || !Identifier) {
                    return
				}
                const isReactCreateFn = object.name === 'React' && property.name === 'createElement'
                if (isReactCreateFn && isArray(ObjectExpression.properties)) {
					if (Identifier.name && Identifier.name.toLowerCase() === 'icon') {
                        const iconProps = getIconProps(ObjectExpression.properties)
                        if (Object.keys(iconProps).length > 0) {
                            const type = iconProps.type
                            const theme = iconProps.theme || 'outline'
                            if (isArray(type)) {
                                type.forEach(function(item) {
                                    searchIconByName(item, theme)
                                })
                            } else {
                                searchIconByName(type, theme)
                            }
                        }
                    }
                }
            }
        },
    })
    return core.transformFromAstSync(ast).code
}