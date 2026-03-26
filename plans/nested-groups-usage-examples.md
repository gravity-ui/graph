# Примеры использования вложенных групп

## Базовые примеры

### Пример 1: Создание простой иерархии групп

```typescript
import { Graph } from '@graph/core';

const graph = new Graph({
  container: document.getElementById('graph-container')
});

// Создаем блоки
graph.api.setBlocks([
  { id: 'block1', x: 100, y: 100, width: 100, height: 60, name: 'Component A' },
  { id: 'block2', x: 250, y: 100, width: 100, height: 60, name: 'Component B' },
  { id: 'block3', x: 100, y: 200, width: 100, height: 60, name: 'Component C' },
  { id: 'block4', x: 250, y: 200, width: 100, height: 60, name: 'Component D' },
]);

// Создаем дочернюю группу для блоков 1 и 2
graph.api.createNestedGroup({
  id: 'submodule1',
  children: [
    { type: 'block', id: 'block1' },
    { type: 'block', id: 'block2' }
  ],
  cascadeMove: true,
  autoResize: true
});

// Создаем дочернюю группу для блоков 3 и 4
graph.api.createNestedGroup({
  id: 'submodule2',
  children: [
    { type: 'block', id: 'block3' },
    { type: 'block', id: 'block4' }
  ],
  cascadeMove: true,
  autoResize: true
});

// Создаем родительскую группу, содержащую обе подгруппы
graph.api.createNestedGroup({
  id: 'module1',
  children: [
    { type: 'group', id: 'submodule1' },
    { type: 'group', id: 'submodule2' }
  ],
  cascadeMove: true,
  autoResize: true
});

// Теперь при перетаскивании 'module1' все блоки и подгруппы перемещаются вместе
```

### Пример 2: Динамическое добавление элементов в группу

```typescript
// Создаем пустую группу
graph.api.createNestedGroup({
  id: 'dynamic-group',
  children: [],
  rect: { x: 50, y: 50, width: 400, height: 300 }
});

// Добавляем блоки динамически
const block1 = graph.api.addBlock({
  id: 'dynamic-block1',
  x: 100,
  y: 100,
  width: 100,
  height: 60,
  name: 'New Block 1'
});

graph.api.addToGroup('dynamic-group', {
  type: 'block',
  id: block1
});

// Создаем вложенную группу и добавляем её
graph.api.createNestedGroup({
  id: 'nested-dynamic',
  children: [
    { type: 'block', id: 'dynamic-block1' }
  ]
});

graph.api.addToGroup('dynamic-group', {
  type: 'group',
  id: 'nested-dynamic'
});

// Группа автоматически пересчитает свой размер (если autoResize: true)
```

### Пример 3: Перемещение элементов между группами

```typescript
// Создаем две группы
graph.api.createNestedGroup({
  id: 'group-a',
  children: [
    { type: 'block', id: 'block1' },
    { type: 'block', id: 'block2' }
  ]
});

graph.api.createNestedGroup({
  id: 'group-b',
  children: [
    { type: 'block', id: 'block3' }
  ]
});

// Перемещаем block2 из group-a в group-b
graph.api.moveToGroup('block2', 'block', 'group-a', 'group-b');

// Обе группы автоматически пересчитают свои размеры
```

## Продвинутые примеры

### Пример 4: Трехуровневая иерархия (модули → подмодули → компоненты)

```typescript
// Создаем архитектуру приложения с модулями

// Уровень 3: Компоненты (блоки)
const authBlocks = [
  { id: 'login-form', x: 100, y: 100, width: 120, height: 80, name: 'Login Form' },
  { id: 'auth-service', x: 250, y: 100, width: 120, height: 80, name: 'Auth Service' }
];

const userBlocks = [
  { id: 'user-profile', x: 100, y: 250, width: 120, height: 80, name: 'User Profile' },
  { id: 'user-settings', x: 250, y: 250, width: 120, height: 80, name: 'User Settings' }
];

const apiBlocks = [
  { id: 'api-gateway', x: 500, y: 100, width: 120, height: 80, name: 'API Gateway' },
  { id: 'api-routes', x: 650, y: 100, width: 120, height: 80, name: 'API Routes' }
];

graph.api.setBlocks([...authBlocks, ...userBlocks, ...apiBlocks]);

// Уровень 2: Подмодули (группы блоков)
graph.api.createNestedGroup({
  id: 'auth-module',
  children: [
    { type: 'block', id: 'login-form' },
    { type: 'block', id: 'auth-service' }
  ]
});

graph.api.createNestedGroup({
  id: 'user-module',
  children: [
    { type: 'block', id: 'user-profile' },
    { type: 'block', id: 'user-settings' }
  ]
});

graph.api.createNestedGroup({
  id: 'api-module',
  children: [
    { type: 'block', id: 'api-gateway' },
    { type: 'block', id: 'api-routes' }
  ]
});

// Уровень 1: Модули верхнего уровня (группы групп)
graph.api.createNestedGroup({
  id: 'frontend-layer',
  children: [
    { type: 'group', id: 'auth-module' },
    { type: 'group', id: 'user-module' }
  ]
});

graph.api.createNestedGroup({
  id: 'backend-layer',
  children: [
    { type: 'group', id: 'api-module' }
  ]
});

// Уровень 0: Вся система
graph.api.createNestedGroup({
  id: 'application',
  children: [
    { type: 'group', id: 'frontend-layer' },
    { type: 'group', id: 'backend-layer' }
  ]
});
```

### Пример 5: Отключение каскадного перемещения

```typescript
// Создаем группу, которая визуально объединяет элементы,
// но не перемещает их при перетаскивании
graph.api.createNestedGroup({
  id: 'visual-container',
  children: [
    { type: 'block', id: 'block1' },
    { type: 'block', id: 'block2' }
  ],
  cascadeMove: false,  // Отключаем каскадное перемещение
  autoResize: true
});

// При перетаскивании 'visual-container' блоки останутся на месте
// Группа будет перемещаться независимо
```

### Пример 6: Фиксированный размер группы

```typescript
// Создаем группу с фиксированным размером
graph.api.createNestedGroup({
  id: 'fixed-size-group',
  children: [
    { type: 'block', id: 'block1' }
  ],
  rect: { x: 0, y: 0, width: 500, height: 400 },
  autoResize: false,  // Отключаем автоматическое изменение размера
  cascadeMove: true
});

// Добавляем больше блоков - размер группы не изменится
graph.api.addToGroup('fixed-size-group', {
  type: 'block',
  id: 'block2'
});
```

### Пример 7: Получение информации о иерархии

```typescript
// Получаем полную информацию о группе и её иерархии
const hierarchy = graph.api.getGroupHierarchy('module1');

console.log('Группа:', hierarchy.group);
console.log('Прямые дочерние элементы:', hierarchy.children);
console.log('Все потомки (рекурсивно):', hierarchy.descendants);
console.log('Родительская группа:', hierarchy.parent);

// Проверяем глубину вложенности
const depth = hierarchy.descendants.filter(d => 
  d instanceof GroupState
).length;
console.log('Уровней вложенности:', depth);
```

### Пример 8: Программное перемещение группы с дочерними элементами

```typescript
// Получаем сервис иерархии
const hierarchyService = graph.groupHierarchyService;

// Перемещаем группу и все её дочерние элементы на 100px вправо и 50px вниз
hierarchyService.moveGroupWithChildren('module1', 100, 50);

// Пересчитываем размер группы после изменений
hierarchyService.recalculateGroupSize('module1', [20, 20, 20, 20]); // padding
```

## Интеграция с существующим кодом

### Пример 9: Миграция существующих групп

```typescript
// Существующий код с простыми группами
graph.api.setBlocks([
  { id: 'b1', x: 100, y: 100, width: 100, height: 60, name: 'Block 1', group: 'old-group' },
  { id: 'b2', x: 250, y: 100, width: 100, height: 60, name: 'Block 2', group: 'old-group' }
]);

// Миграция на новую систему вложенных групп
const blocksInOldGroup = graph.rootStore.blocksList.$blocks.value
  .filter(b => b.$state.value.group === 'old-group');

graph.api.createNestedGroup({
  id: 'old-group',
  children: blocksInOldGroup.map(b => ({
    type: 'block' as const,
    id: b.id
  }))
});

// Теперь можно создавать вложенные группы
graph.api.createNestedGroup({
  id: 'parent-group',
  children: [
    { type: 'group', id: 'old-group' }
  ]
});
```

### Пример 10: Кастомный компонент группы с индикацией вложенности

```typescript
import { Group, TGroupProps } from '@graph/core';

class CustomNestedGroup extends Group {
  protected override render() {
    const ctx = this.context.ctx;
    const rect = this.getRect();
    const depth = this.getDepth();
    
    // Разные цвета для разных уровней
    const colors = [
      { bg: 'rgba(100, 150, 255, 0.1)', border: 'rgba(100, 150, 255, 0.5)' },
      { bg: 'rgba(150, 100, 255, 0.1)', border: 'rgba(150, 100, 255, 0.5)' },
      { bg: 'rgba(255, 100, 150, 0.1)', border: 'rgba(255, 100, 150, 0.5)' }
    ];
    
    const color = colors[depth % colors.length];
    
    ctx.fillStyle = this.state.selected ? color.border : color.bg;
    ctx.strokeStyle = color.border;
    ctx.lineWidth = 2 + depth;
    
    // Рисуем с увеличенным радиусом для вложенных
    const radius = 8 + depth * 4;
    ctx.beginPath();
    ctx.roundRect(rect.x, rect.y, rect.width, rect.height, radius);
    ctx.fill();
    ctx.stroke();
    
    // Рисуем метку уровня
    ctx.fillStyle = color.border;
    ctx.font = '12px sans-serif';
    ctx.fillText(`Level ${depth}`, rect.x + 10, rect.y + 20);
  }
  
  private getDepth(): number {
    let depth = 0;
    let currentGroupId = this.groupState?.$state.value.parentGroup;
    
    while (currentGroupId) {
      depth++;
      const parentGroup = this.context.graph.rootStore.groupsList.getGroup(currentGroupId);
      currentGroupId = parentGroup?.parentGroup;
    }
    
    return depth;
  }
}

// Использование кастомного компонента
graph.api.createNestedGroup({
  id: 'custom-group',
  children: [
    { type: 'block', id: 'block1' }
  ],
  component: CustomNestedGroup
});
```

## Обработка событий

### Пример 11: Отслеживание изменений в иерархии групп

```typescript
// Подписка на изменения в группах
graph.on('groups-selection-change', (event) => {
  const selectedGroups = event.detail.selected;
  
  selectedGroups.forEach(groupId => {
    const hierarchy = graph.api.getGroupHierarchy(groupId);
    console.log(`Выбрана группа ${groupId}:`);
    console.log(`- Дочерних элементов: ${hierarchy.children.length}`);
    console.log(`- Всего потомков: ${hierarchy.descendants.length}`);
    
    if (hierarchy.parent) {
      console.log(`- Родитель: ${hierarchy.parent.id}`);
    }
  });
});

// Отслеживание перемещения групп
graph.on('block-drag', (event) => {
  const block = event.detail.block;
  const parentGroup = graph.rootStore.blocksList
    .getBlockState(block.id)
    ?.getParentGroup();
  
  if (parentGroup) {
    console.log(`Блок ${block.id} перемещается внутри группы ${parentGroup}`);
  }
});
```

## Производительность

### Пример 12: Оптимизация для больших иерархий

```typescript
// Для больших иерархий рекомендуется батчить операции
const blocks = Array.from({ length: 100 }, (_, i) => ({
  id: `block-${i}`,
  x: (i % 10) * 150,
  y: Math.floor(i / 10) * 100,
  width: 100,
  height: 60,
  name: `Block ${i}`
}));

graph.api.setBlocks(blocks);

// Создаем группы по 10 блоков
const subgroups = Array.from({ length: 10 }, (_, i) => {
  const groupId = `subgroup-${i}`;
  const children = Array.from({ length: 10 }, (_, j) => ({
    type: 'block' as const,
    id: `block-${i * 10 + j}`
  }));
  
  return { id: groupId, children };
});

// Создаем все подгруппы за один раз
subgroups.forEach(({ id, children }) => {
  graph.api.createNestedGroup({
    id,
    children,
    autoResize: true,
    cascadeMove: true
  });
});

// Создаем родительскую группу
graph.api.createNestedGroup({
  id: 'main-group',
  children: subgroups.map(sg => ({
    type: 'group' as const,
    id: sg.id
  })),
  autoResize: true,
  cascadeMove: true
});

// При перетаскивании main-group все 100 блоков перемещаются эффективно
```

## Валидация и обработка ошибок

### Пример 13: Предотвращение циклических зависимостей

```typescript
try {
  // Создаем группу A
  graph.api.createNestedGroup({
    id: 'group-a',
    children: []
  });
  
  // Создаем группу B, дочернюю для A
  graph.api.createNestedGroup({
    id: 'group-b',
    children: [],
    parentGroup: 'group-a'
  });
  
  // Попытка сделать A дочерней для B вызовет ошибку
  graph.api.addToGroup('group-b', {
    type: 'group',
    id: 'group-a'
  });
  // Ошибка: "Cannot create circular group dependency"
  
} catch (error) {
  console.error('Обнаружена циклическая зависимость:', error.message);
}
```

## Интеграция с React

### Пример 14: React-компонент для управления вложенными группами

```typescript
import React, { useEffect, useState } from 'react';
import { useGraph } from '@graph/react';

function NestedGroupManager() {
  const graph = useGraph();
  const [hierarchy, setHierarchy] = useState(null);
  
  useEffect(() => {
    // Создаем иерархию при монтировании
    graph.api.createNestedGroup({
      id: 'react-group',
      children: [
        { type: 'block', id: 'block1' },
        { type: 'block', id: 'block2' }
      ]
    });
    
    // Подписываемся на изменения
    const unsubscribe = graph.on('groups-selection-change', () => {
      const selected = graph.rootStore.groupsList.$selectedGroups.value;
      if (selected.length > 0) {
        const h = graph.api.getGroupHierarchy(selected[0].id);
        setHierarchy(h);
      }
    });
    
    return () => unsubscribe();
  }, [graph]);
  
  const handleAddBlock = () => {
    const newBlockId = `block-${Date.now()}`;
    graph.api.addBlock({
      id: newBlockId,
      x: 100,
      y: 100,
      width: 100,
      height: 60,
      name: 'New Block'
    });
    
    graph.api.addToGroup('react-group', {
      type: 'block',
      id: newBlockId
    });
  };
  
  return (
    <div>
      <button onClick={handleAddBlock}>Добавить блок в группу</button>
      
      {hierarchy && (
        <div>
          <h3>Иерархия группы {hierarchy.group.id}</h3>
          <p>Дочерних элементов: {hierarchy.children.length}</p>
          <p>Всего потомков: {hierarchy.descendants.length}</p>
        </div>
      )}
    </div>
  );
}
```

## Заключение

Эти примеры демонстрируют основные сценарии использования системы вложенных групп:

1. **Базовое использование** - создание простых иерархий
2. **Динамическое управление** - добавление/удаление элементов
3. **Продвинутые сценарии** - многоуровневые иерархии, кастомизация
4. **Интеграция** - работа с существующим кодом и React
5. **Оптимизация** - эффективная работа с большими структурами

Система спроектирована так, чтобы быть интуитивной и гибкой, позволяя создавать сложные иерархические структуры с минимальным количеством кода.
