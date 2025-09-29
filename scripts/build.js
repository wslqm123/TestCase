// scripts/build.js
const fs = require('fs');
const path = require('path');

const version = process.argv[2]; // 从命令行获取版本号，例如: node build.js v1.0.0
if (!version) {
    console.error('Error: Please provide a version number. Example: node scripts/build.js v1.0.0');
    process.exit(1);
}

const caseDir = path.join(__dirname, '..', 'cases', version);
const outputFilePath = path.join(caseDir, '_index.md');

if (!fs.existsSync(caseDir)) {
    console.error(`Error: Directory not found for version ${version}`);
    process.exit(1);
}

// 排除 _index.md 文件，只读取其他 .md 文件
const filesToMerge = fs.readdirSync(caseDir)
                        .filter(file => file.endsWith('.md') && file !== '_index.md')
                        .sort(); // 排序以保证合并顺序一致

console.log(`Merging files for version ${version}:`, filesToMerge);

let combinedContent = `# ${version} Test Cases\n\n`;
filesToMerge.forEach(file => {
    const filePath = path.join(caseDir, file);
    combinedContent += fs.readFileSync(filePath, 'utf8') + '\n\n---\n\n'; // 使用 --- 分隔不同模块
});

fs.writeFileSync(outputFilePath, combinedContent);
console.log(`Successfully created ${outputFilePath}`);