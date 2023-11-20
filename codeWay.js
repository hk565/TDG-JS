/**
 * 读取源码文件
 */
export const getToolsCode = async(currentToolFiles,tokenizer,{chatGenerator,HumanChatMessage},currentToolId) =>{
  // 1.首先读取package.json文件
  let {name,path} = currentToolFiles.filter(item=>item.name === 'package.json')[0]
  let code = await reader(path,'package')
  // let he3 = JSON.parse(JSON.stringify(code)).he3
  let he3 = code.he3
  // console.log(path,he3,Array.isArray(he3),code);
  if(Array.isArray(he3)) { // 批量工具
    let batchToolsCode = []
    for (let { id, name} of he3) {
      if (currentToolId&&currentToolId !==id) {
        continue;
      }
      let batch = currentToolFiles.filter(item=>item.name === `${id}.ts`)[0]    
      if (batch) {
        let startFile = batch ? batch : false
        let {sourceCode,visited} = await readFileAndParseDependencies(startFile.path,currentToolFiles);
        //批量工具的常用组件
        // sourceCode.includes(`import { transformTool } from '@he3-kit/utils'`) ? sourceCode = sourceCode +'\n'+ "**transformTool**文件的源码如下:" + "\n" +  await reader("/Users/kang/tools/tools/private/tool-description-generator/files/transformTool.vue") : (sourceCode.includes(`import { textTransformTool } from '@he3-kit/utils'`) ? sourceCode = sourceCode +'\n'+ "**textTransformTool**文件的源码如下:" + "\n" + await reader("/Users/kang/tools/tools/private/tool-description-generator/files/textTransform.vue") : false);
        let currentTool = [{
            name:name,
            id:id,
            code:sourceCode
        }]
        let codefilter = filterCode(currentTool,tokenizer)
        batchToolsCode.push({ 
          name:name,
          id:id,
          code:codefilter[0].code
        })
      }
    }
    let batchDesc = await batchGetToolsDesc(batchToolsCode,chatGenerator,HumanChatMessage)
    return batchDesc;
  }else { // 单个工具
    //判断入口文件是否为index.vue || id.ts
    let single = currentToolFiles.filter(item => item.name === 'index.vue')[0]
    let batch = currentToolFiles.filter(item=>item.name === `${he3.id}.ts`)[0]
    if (single || batch) {
        let startFile = single ? single : (batch ? batch : false)
        let {sourceCode,visited} = await readFileAndParseDependencies(startFile.path,currentToolFiles);
        let currentTool = [{
            name:he3.name,
            id:he3.id,
            code:sourceCode
        }]
        let codefilter = filterCode(currentTool,tokenizer)
        let currentToolFilter = [{ 
            name:he3.name,
            id:he3.id,
            code:codefilter[0].code
        }]
        let descTool = await getDescByCode(currentToolFilter,chatGenerator,HumanChatMessage)
        let keywordsTool = await getKeywords(descTool,chatGenerator,HumanChatMessage)
        // download('test.json',keywordsTool)

        return keywordsTool
    }
  }
  
//   return parseData
}

export const getMeta = async (tools, languageArr, {chatGenerator,HumanChatMessage}) => {
  return new Promise(async (resolve) => {
      let promise = [];
      let errArray = [];
      for (const item of tools) {
           let itemLanguage = [];
           languageArr.forEach(item2 =>{
            let prompts = `Please translate the tool name, tool description and tool keywords into ${item2.details}
{
  "$name": ${item.name},
  "$description": ${JSON.stringify(item.newDescription)},
  "$keywords": ${JSON.stringify(item.newKeywords)}
}

Your answer must conform to the following json format:
{
  "$name": "",
  "$description": "",
  "$keywords": []
}`
          itemLanguage.push(chatGenerator.call([new HumanChatMessage(prompts)]))
        })
        promise.push(Promise.all(itemLanguage))
      }
      console.log("promise",promise);
      Promise.all(promise).then(res=>{
        let resDataArr =res.map((resToolItem,resToolIndex)=>{
          tools.forEach((toolItem,toolIndex)=>{
            if (resToolIndex === toolIndex) {
              let meta = {}
              resToolItem.forEach((languageItem,languageIndex)=>{
                try {
                  let toolJSON = JSON.parse(languageItem.text)
                  meta[`${languageArr[languageIndex].name}`] = toolJSON
                } catch (error) {
                  $he3.message.warn(`${toolItem.id}工具翻译失败，请重新翻译`);
                }
              })
              resToolItem = {
                id:toolItem.id,
                meta:meta
              }
            }
          })
          return resToolItem
        })
        resolve(resDataArr)
    })
  })
}

/**
 * 输出文件
 */
export const download = async(name,resData,type='application/json') =>{
  const jsonData = JSON.stringify(resData, null, 2);

  // 创建一个Blob对象
  const blob = new Blob([jsonData], {type: type});

  // 创建一个链接用于下载
  const url = URL.createObjectURL(blob);

  // 创建一个a标签，并设置href和download属性
  const link = document.createElement('a');
  link.href = url;
  link.download = `${name}`;

  // 将a标签添加到页面，并模拟点击
  document.body.appendChild(link);
  link.click();

  // 清除链接
  URL.revokeObjectURL(url);
}
/**
 * 读取本地文件
 */
// function reader(url,isPackage) {
//     return new Promise(function(resolve, reject) {
//       const xhr = new XMLHttpRequest();
//       xhr.open('GET', url);
//       xhr.onload = function() {
//         if (this.status >= 200 && this.status < 300) {
//           isPackage === 'package' ? resolve(xhr.response) : resolve(filterComments(removeStyleTagsFromVueCode(xhr.response)));
//           // resolve(filterComments(removeStyleTagsFromVueCode(xhr.response)));
//           resolve(xhr.response);
//         } else {
//           reject({
//             status: this.status,
//             statusText: xhr.statusText
//           });
//         }
//       };
//       xhr.onerror = function() {
//         reject({
//           status: this.status,
//           statusText: xhr.statusText
//         });
//       };
//       xhr.send();
//     });
// }

/**
 * 读取本地文件
 */
function reader(url, isPackage) {
  return fetch(url)
    .then(response => {
      if (response.ok) {
        return response.text();
      } else {
        throw new Error('Network response was not ok.');
      }
    })
    .then(responseText => {
      if (isPackage === 'package') {
        return JSON.parse(responseText);
      } else {
        return filterComments(removeStyleTagsFromVueCode(responseText));
      }
    })
    .catch(error => {
      console.error('Error fetching file:', error);
    });
}


/**
 * 尝试找到具有给定扩展名的文件
 * @param {*} filePath 
 * @param {*} extensions 
 * @returns 
 */
async function findFileWithExtensions(filePath, extensions,currentToolFiles) {
  
  //判断是否有后缀名
  if (filePath.includes('.vue')||filePath.includes('.ts')) {
    if (currentToolFiles.some(item=>item.path.includes(filePath))) {
        return filePath;
    }else{
        console.log('文件不存在');
    }
  }else{
    for (const ext of extensions) {
        const fullPath = filePath + ext;
        if (currentToolFiles.some(item=>item.path.includes(fullPath))) {
            return filePath;
        }else{
            console.log('文件不存在');
        }
    }
  }
}


//读取文件内容并解析依赖
/**
 * 
 * @param {*} filePath 主入口文件
 * @param {*} visited 
 * @returns 
 */
async function readFileAndParseDependencies(filePath, currentToolFiles, visited = new Set()) {
    if (visited.has(filePath)) {
      // console.log(`Skipping already visited file: ${filePath}`);
      return '';
    }
    visited.add(filePath);
    try {
      await reader(filePath)
      console.log('文件路径存在',filePath);
    } catch (err) {
      console.log('！！！文件路径不存在',filePath);
      return {
        sourceCode : '',
        visited : visited
      }
    }
    let data = await reader(filePath)
    const fileName = filePath.split('/').pop();
    data = `**${fileName}**文件的源码如下:
  \`\`\`
  ${data}
  \`\`\`
  `
    
    const importRegexFileName = /import\s+[\w,{}\s]+\s+from\s+'((?:\.\/|\.+\/)[\w./-]+(?:\.(?:vue|ts))?)/g;

    let match;
    const dependencies = [];
    while ((match = importRegexFileName.exec(data)) !== null) {
        let dependencieFileName = match[1].split('/').pop();
        console.log('match[1]',match[1],currentToolFiles.filter(item=>item.path.includes(dependencieFileName)),currentToolFiles);
        const dependencyPath = currentToolFiles.filter(item=>item.path.includes(dependencieFileName))[0].path
        const fullPath = await findFileWithExtensions(dependencyPath, ['.vue', '.ts'], currentToolFiles);
        // console.log('fullPath',fullPath,visieted,!visited.has(fullPath));
        if (fullPath&& !visited.has(fullPath)) {
          let {sourceCode} = await readFileAndParseDependencies(fullPath, currentToolFiles, visited);
          dependencies.push(sourceCode);
        }
    }
    return {
      sourceCode : data + dependencies.join(''),
      visited : visited
    }
}

/**
 * 过滤注释的内容，去掉空行
 */
function filterComments(code) {
    const singleLineRegex = /\/\/.*$/gm;
    const multiLineRegex = /\/\*[\s\S]*?\*\//gm;
    code = code.replace(singleLineRegex, '');
    code = code.replace(multiLineRegex, '');
    code = code.replace(/^\s*[\r\n]/gm, '');
    return code;
}
  
  /**
   * 滤掉vue文件源码的所有style标签样式代码
   * @param {*} vueCode 
   * @returns 
   */
function removeStyleTagsFromVueCode(vueCode) {
// 匹配<style>标签，包括可选的scoped、lang和module属性，以及它们的任何顺序
const styleTagRegex = /<style(?:\s+(?:scoped|lang=[^\s>]+|module=[^\s>]+))*\s*>([\s\S]*?)<\/style>/gi;

// 使用正则表达式替换所有<style>标签及其内容
const filteredVueCode = vueCode.replace(styleTagRegex, '');

return filteredVueCode;
}

 /**
 * 过滤超过指定token的code依赖文件
 */
function filterCode(data,tokenizer) {
    let filterCodeData = data.map(item=>{
        if (!item.mark) {
          item.mark = []
        }
        let str =`Please generate **tool documentation** based on the source code of the following **${item.name}** tool, for users to **search** and **understand** the tool.
    
The following is the source code of all dependent files of the ${item.name} tool:
${item.code}

Please refer to the following content for the generated format:
\`\`\`
JSON Formatter is a tool for beautifying JSON strings. It can format JSON strings, adding spaces and newlines to make them easier to read.

Function description:

1. Paste or type unreadable JSON data into the tool.

2. The tool will automatically detect the input JSON data and format it.

3. The formatted JSON data will be displayed in the output area of ​​the tool.


scenes to be used:

1. API development and testing: When developing or testing an API, developers often need to view the returned JSON data. Use the JSON Formatting tool to convert hard-to-read JSON data into a human-readable format for quick inspection of data structure and content.

2. Data analysis: Data analysts need to process and analyze various JSON data. Using this tool, they can easily format JSON data to better understand the data structure and content.

3. JSON data review: During code review, reviewers can use the JSON Formatting tool to format JSON data to make it easier to see and understand the data structure.
\`\`\``
        const regex = /\*\*(.*?)\*\*文件的源码如下:/g;
        let match;
        let devDependencies = []
        while ((match = regex.exec(item.code)) !== null) {
          const content = match[1];
          const startIndex = match.index;
          devDependencies.push({
            startIndex:startIndex,
            name:content
          })
        }
        
        while (tokenizer.encode(str).bpe.length > 4090) {
          // if(item['mark'].includes('filterCode')===false){console.log(typeof item['mark'], mark);}
          let {startIndex,name} = devDependencies.pop();
          if(item.code.substring(0,startIndex) === ''){ //判断当个文件是否就已经大于最大tokens
            item['mark'].push('codeTooLong-slice')
            item.isMarked = true
            
            while (tokenizer.encode(str).bpe.length > 4090) { // 判断字符串是否超过指定长度
              item.code = item.code.slice(0, -100); // 如果超过，每次删除最后指定长度的子字符串
              let subStr =`Please generate **tool documentation** based on the source code of the following **${item.name}** tool, for users to **search** and **understand** the tool.

The following is the source code of all dependent files of the ${item.name} tool:
${item.code}

Please refer to the following content for the generated format:
\`\`\`
JSON Formatter is a tool for beautifying JSON strings. It can format JSON strings, adding spaces and newlines to make them easier to read.

Function description:

1. Paste or type unreadable JSON data into the tool.

2. The tool will automatically detect the input JSON data and format it.

3. The formatted JSON data will be displayed in the output area of ​​the tool.


scenes to be used:

1. API development and testing: When developing or testing an API, developers often need to view the returned JSON data. Use the JSON Formatting tool to convert hard-to-read JSON data into a human-readable format for quick inspection of data structure and content.

2. Data analysis: Data analysts need to process and analyze various JSON data. Using this tool, they can easily format JSON data to better understand the data structure and content.

3. JSON data review: During code review, reviewers can use the JSON Formatting tool to format JSON data to make it easier to see and understand the data structure.
\`\`\``
              str = subStr
              console.log(tokenizer.encode(str).bpe.length);
              if (tokenizer.encode(subStr).bpe.length < 4090) {
                console.log('ok');
                break;
              }
            }
            break;
          }else {
            if (item['mark'].indexOf('filterCode') === -1) {
              item['mark'].push('filterCode')
              item.isMarked = true
            }
            item.code = item.code.substring(0,startIndex)
            let subStr =`Please generate **tool documentation** based on the source code of the following **${item.name}** tool, for users to **search** and **understand** the tool.

The following is the source code of all dependent files of the ${item.name} tool:
${item.code}

Please refer to the following content for the generated format:
\`\`\`
JSON Formatter is a tool for beautifying JSON strings. It can format JSON strings, adding spaces and newlines to make them easier to read.

Function description:

1. Paste or type unreadable JSON data into the tool.

2. The tool will automatically detect the input JSON data and format it.

3. The formatted JSON data will be displayed in the output area of ​​the tool.


scenes to be used:

1. API development and testing: When developing or testing an API, developers often need to view the returned JSON data. Use the JSON Formatting tool to convert hard-to-read JSON data into a human-readable format for quick inspection of data structure and content.

2. Data analysis: Data analysts need to process and analyze various JSON data. Using this tool, they can easily format JSON data to better understand the data structure and content.

3. JSON data review: During code review, reviewers can use the JSON Formatting tool to format JSON data to make it easier to see and understand the data structure.
\`\`\``
              str = subStr
            }
        }
          return item
      })
    return filterCodeData
}

/**
 * 获取描述信息
 * @param {*} toolCode 
 * @param {*} chatGenerator 
 * @param {*} HumanChatMessage 
 */
async function getDescByCode (toolCode,chatGenerator,HumanChatMessage){
    return new Promise((resolve)=>{
        let promise = [];
        toolCode.map(item=>{
            let str =`Please generate **tool documentation** based on the source code of the following **${item.name}** tool, for users to **search** and **understand** the tool.

The following is the source code of all dependent files of the ${item.name} tool:
${item.code}

Please refer to the following content for the generated format:
\`\`\`
JSON Formatter is a tool for beautifying JSON strings. It can format JSON strings, adding spaces and newlines to make them easier to read.

Function description:

1. Paste or type unreadable JSON data into the tool.

2. The tool will automatically detect the input JSON data and format it.

3. The formatted JSON data will be displayed in the output area of ​​the tool.


scenes to be used:

1. API development and testing: When developing or testing an API, developers often need to view the returned JSON data. Use the JSON Formatting tool to convert hard-to-read JSON data into a human-readable format for quick inspection of data structure and content.

2. Data analysis: Data analysts need to process and analyze various JSON data. Using this tool, they can easily format JSON data to better understand the data structure and content.

3. JSON data review: During code review, reviewers can use the JSON Formatting tool to format JSON data to make it easier to see and understand the data structure.
\`\`\``
            promise.push(chatGenerator.call([new HumanChatMessage(str)]))
            // promise.push(chatGenerator.call(str))
        })
        Promise.all(promise).then(res=>{
          console.log(res);
            let resDataArr = toolCode.map((item1,index1) => {
                    res.forEach((item2,index2)=>{
                        if (index1 === index2) {
                            item1.newDescription = item2.text
                            if (item2.text.length < 250) {
                                item1.mark.push('tooLow')
                                item1.isMarked = true
                            }
                            // item1.newDescription = item2
                            // if (item2.length < 250) {
                            //     item1.mark.push('tooLow')
                            //     item1.isMarked = true
                            // }
                        }
                    })
                    return item1
            });
            resolve(resDataArr)
        })
    })
}

async function getKeywords (toolCode,chatGenerator,HumanChatMessage){
    return new Promise((resolve)=>{
        let promise = [];
        toolCode.map(item=>{
        let str =`Please combine the basic information of the ${item.name} tool (tool name, tool description) to generate **keywords** that are more in line with the role of the ${item.name} tool, for users to **search** and* *Understand** the tool.

The following is the basic information of the ${item.name} tool:
\`\`\`
{
  "name": "${item.name}",
  "description": "${item. newDescription}"
}
\`\`\`

Your answer must conform to the following json format:
{
  "keywords": []
}`;
            promise.push(chatGenerator.call([new HumanChatMessage(str)]))
            // promise.push(chatGenerator.call(str))
        })
        Promise.all(promise).then(res=>{
          console.log(res);
            let resDataArr = toolCode.map((item1,index1) => {
                res.forEach((item2,index2)=>{
                    if (index1 === index2) {
                        item1.newKeywords = JSON.parse(item2.text).keywords
                        // item1.newKeywords = JSON.parse(item2).keywords
                    }
                })
                return item1
            });
            resolve(resDataArr)
        })
    })
}

/**
 * 批量工具生成关键词和描述
 * @param {*} toolCode 
 * @param {*} chatGenerator 
 * @param {*} HumanChatMessage 
 * @returns 
 */
async function batchGetToolsDesc (toolCode,chatGenerator,HumanChatMessage){
  return new Promise(async (resolve)=>{
    let promise = [];
    toolCode.map(item=>{
        let str =`Please generate **tool documentation** based on the source code of the following **${item.name}** tool, for users to **search** and **understand** the tool.

The following is the source code of all dependent files of the ${item.name} tool:
${item.code}

Please refer to the following content for the generated format:
\`\`\`
JSON Formatter is a tool for beautifying JSON strings. It can format JSON strings, adding spaces and newlines to make them easier to read.

Function description:

1. Paste or type unreadable JSON data into the tool.

2. The tool will automatically detect the input JSON data and format it.

3. The formatted JSON data will be displayed in the output area of ​​the tool.


scenes to be used:

1. API development and testing: When developing or testing an API, developers often need to view the returned JSON data. Use the JSON Formatting tool to convert hard-to-read JSON data into a human-readable format for quick inspection of data structure and content.

2. Data analysis: Data analysts need to process and analyze various JSON data. Using this tool, they can easily format JSON data to better understand the data structure and content.

3. JSON data review: During code review, reviewers can use the JSON Formatting tool to format JSON data to make it easier to see and understand the data structure.
\`\`\``
        promise.push(chatGenerator.call([new HumanChatMessage(str)]))
        // promise.push(chatGenerator.call(str))
    })
    //获取到生成的描述
    let res = await Promise.all(promise)
    let newDesc = toolCode.map((item1,index1) => {
      res.forEach((item2,index2)=>{
          if (index1 === index2) {
              item1.newDescription = item2.text
              if (item2.text.length < 250) {
                  item1.mark.push('tooLow')
                  item1.isMarked = true
              }
              // item1.newDescription = item2
              // if (item2.length < 250) {
              //     item1.mark.push('tooLow')
              //     item1.isMarked = true
              // }
          }
      })
      return item1
    });
    //获取到生成的关键词
    let promiseKeywords = [];
        newDesc.map(item=>{
        let str =`Please combine the basic information of the ${item.name} tool (tool name, tool description) to generate **keywords** that are more in line with the role of the ${item.name} tool, for users to **search** and** Understand** the tool.

The following is the basic information of the ${item.name} tool:
\`\`\`
{
  "name": "${item.name}",
  "description": "${item. newDescription}"
}
\`\`\`

Your answer must conform to the following json format:
{
  "keywords": []
}`;
            promiseKeywords.push(chatGenerator.call([new HumanChatMessage(str)]))
            // promise.push(chatGenerator.call(str))
        })
        Promise.all(promiseKeywords).then(res=>{
            let resDataArr = toolCode.map((item1,index1) => {
                res.forEach((item2,index2)=>{
                    if (index1 === index2) {
                        item1.newKeywords = JSON.parse(item2.text).keywords
                        // item1.newKeywords = JSON.parse(item2).keywords
                    }
                })
                return item1
            });
            resolve(resDataArr)
        })
})
}
