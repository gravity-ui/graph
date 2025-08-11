const fs = require('fs');
const path = require('path');

// Функция для рекурсивного поиска файлов
function findFiles(dir, ext) {
  const files = [];
  const items = fs.readdirSync(dir);
  
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      files.push(...findFiles(fullPath, ext));
    } else if (item.endsWith(ext)) {
      files.push(fullPath);
    }
  }
  
  return files;
}

// Функция для замены импортов
function fixImports(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;
  
  // Заменяем относительные импорты на пакетные
  const importReplacements = [
    // Основные импорты
    [/from "\.\.\/\.\.\/\.\.\/index"/g, 'from "@gravity-ui/graph"'],
    [/from "\.\.\/\.\.\/\.\.\/graph"/g, 'from "@gravity-ui/graph"'],
    [/from "\.\.\/\.\.\/graph"/g, 'from "@gravity-ui/graph"'],
    [/from "\.\.\/graph"/g, 'from "@gravity-ui/graph"'],
    
    // React компоненты
    [/from "\.\.\/\.\.\/\.\.\/react-components"/g, 'from "@gravity-ui/graph/react"'],
    [/from "\.\.\/\.\.\/react-components"/g, 'from "@gravity-ui/graph/react"'],
    [/from "\.\.\/react-components"/g, 'from "@gravity-ui/graph/react"'],
    
    // Конкретные импорты из react-components
    [/from "\.\.\/\.\.\/\.\.\/react-components\/utils\/hooks\/useFn"/g, 'from "@gravity-ui/graph/react"'],
    [/from "\.\.\/\.\.\/react-components\/utils\/hooks\/useFn"/g, 'from "@gravity-ui/graph/react"'],
    [/from "\.\.\/react-components\/utils\/hooks\/useFn"/g, 'from "@gravity-ui/graph/react"'],
    
    // Компоненты canvas
    [/from "\.\.\/\.\.\/\.\.\/components\/canvas\/blocks\/Block"/g, 'from "@gravity-ui/graph"'],
    [/from "\.\.\/\.\.\/components\/canvas\/blocks\/Block"/g, 'from "@gravity-ui/graph"'],
    [/from "\.\.\/components\/canvas\/blocks\/Block"/g, 'from "@gravity-ui/graph"'],
    
    // Store импорты
    [/from "\.\.\/\.\.\/\.\.\/store\/block\/Block"/g, 'from "@gravity-ui/graph"'],
    [/from "\.\.\/\.\.\/store\/block\/Block"/g, 'from "@gravity-ui/graph"'],
    [/from "\.\.\/store\/block\/Block"/g, 'from "@gravity-ui/graph"'],
    
    [/from "\.\.\/\.\.\/\.\.\/store\/connection\/ConnectionState"/g, 'from "@gravity-ui/graph"'],
    [/from "\.\.\/\.\.\/store\/connection\/ConnectionState"/g, 'from "@gravity-ui/graph"'],
    [/from "\.\.\/store\/connection\/ConnectionState"/g, 'from "@gravity-ui/graph"'],
    
    [/from "\.\.\/\.\.\/\.\.\/store\/group\/Group"/g, 'from "@gravity-ui/graph"'],
    [/from "\.\.\/\.\.\/store\/group\/Group"/g, 'from "@gravity-ui/graph"'],
    [/from "\.\.\/store\/group\/Group"/g, 'from "@gravity-ui/graph"'],
    
    // Services
    [/from "\.\.\/\.\.\/\.\.\/services\/Layer"/g, 'from "@gravity-ui/graph"'],
    [/from "\.\.\/\.\.\/services\/Layer"/g, 'from "@gravity-ui/graph"'],
    [/from "\.\.\/services\/Layer"/g, 'from "@gravity-ui/graph"'],
    
    // Utils
    [/from "\.\.\/\.\.\/\.\.\/utils\/functions"/g, 'from "@gravity-ui/graph"'],
    [/from "\.\.\/\.\.\/utils\/functions"/g, 'from "@gravity-ui/graph"'],
    [/from "\.\.\/utils\/functions"/g, 'from "@gravity-ui/graph"'],
    
    [/from "\.\.\/\.\.\/\.\.\/utils\/types\/helpers"/g, 'from "@gravity-ui/graph"'],
    [/from "\.\.\/\.\.\/utils\/types\/helpers"/g, 'from "@gravity-ui/graph"'],
    [/from "\.\.\/utils\/types\/helpers"/g, 'from "@gravity-ui/graph"'],
    
    [/from "\.\.\/\.\.\/\.\.\/utils\/renderers\/svgPath"/g, 'from "@gravity-ui/graph"'],
    [/from "\.\.\/\.\.\/utils\/renderers\/svgPath"/g, 'from "@gravity-ui/graph"'],
    [/from "\.\.\/utils\/renderers\/svgPath"/g, 'from "@gravity-ui/graph"'],
    
    // Plugins
    [/from "\.\.\/\.\.\/\.\.\/plugins\/devtools\/DevToolsLayer"/g, 'from "@gravity-ui/graph"'],
    [/from "\.\.\/\.\.\/plugins\/devtools\/DevToolsLayer"/g, 'from "@gravity-ui/graph"'],
    [/from "\.\.\/plugins\/devtools\/DevToolsLayer"/g, 'from "@gravity-ui/graph"'],
    
    [/from "\.\.\/\.\.\/\.\.\/plugins\/devtools\/constants"/g, 'from "@gravity-ui/graph"'],
    [/from "\.\.\/\.\.\/plugins\/devtools\/constants"/g, 'from "@gravity-ui/graph"'],
    [/from "\.\.\/plugins\/devtools\/constants"/g, 'from "@gravity-ui/graph"'],
    
    [/from "\.\.\/\.\.\/\.\.\/plugins\/devtools\/types"/g, 'from "@gravity-ui/graph"'],
    [/from "\.\.\/\.\.\/plugins\/devtools\/types"/g, 'from "@gravity-ui/graph"'],
    [/from "\.\.\/plugins\/devtools\/types"/g, 'from "@gravity-ui/graph"'],
    
    // React components types
    [/from "\.\.\/\.\.\/\.\.\/react-components\/elk\/types"/g, 'from "@gravity-ui/graph/react"'],
    [/from "\.\.\/\.\.\/react-components\/elk\/types"/g, 'from "@gravity-ui/graph/react"'],
    [/from "\.\.\/react-components\/elk\/types"/g, 'from "@gravity-ui/graph/react"'],
  ];
  
  for (const [pattern, replacement] of importReplacements) {
    if (pattern.test(content)) {
      content = content.replace(pattern, replacement);
      changed = true;
    }
  }
  
  if (changed) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Fixed imports in: ${filePath}`);
  }
}

// Находим все TypeScript файлы в stories
const storiesDir = path.join(__dirname, 'stories');
const files = findFiles(storiesDir, '.tsx');

console.log(`Found ${files.length} files to process`);

// Обрабатываем каждый файл
for (const file of files) {
  fixImports(file);
}

console.log('Import fixing completed!');
