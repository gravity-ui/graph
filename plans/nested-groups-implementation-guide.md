# Руководство по реализации вложенных групп

## Краткое резюме

Этот документ содержит пошаговое руководство по реализации системы вложенных групп для GraphComponent.

## Связанные документы

- [`nested-groups-architecture.md`](nested-groups-architecture.md) - Детальная архитектура решения
- [`nested-groups-usage-examples.md`](nested-groups-usage-examples.md) - Примеры использования API

## Ключевые решения

### 1. Универсальный интерфейс IGroupable

Вместо жесткой привязки к блокам, вводится интерфейс [`IGroupable`](../src/store/group/types.ts), который могут реализовать любые сущности:

```typescript
interface IGroupable {
  getGeometry(): TRect;
  updatePosition(x: number, y: number): void;
  setParentGroup(groupId?: TGroupId): void;
  getParentGroup(): TGroupId | undefined;
}
```

**Преимущества:**
- Группы могут содержать блоки, другие группы и любые GraphComponent
- Единообразный API для работы с разными типами элементов
- Легко расширяется для новых типов компонентов

### 2. Иерархическая модель данных

Расширение типа [`TGroup`](../src/store/group/Group.ts:10) для поддержки иерархии:

```typescript
interface TGroup {
  id: TGroupId;
  rect: TRect;
  parentGroup?: TGroupId;      // Родительская группа
  children?: TGroupChild[];     // Дочерние элементы
  cascadeMove?: boolean;        // Каскадное перемещение
  autoResize?: boolean;         // Автоматический размер
}
```

**Преимущества:**
- Явная структура иерархии
- Гибкая настройка поведения каждой группы
- Обратная совместимость (все новые поля опциональны)

### 3. Сервис управления иерархией

Новый [`GroupHierarchyService`](../src/services/group/GroupHierarchyService.ts) инкапсулирует логику работы с иерархией:

- Каскадное перемещение элементов
- Автоматический пересчет размеров
- Валидация циклических зависимостей
- Получение потомков рекурсивно

**Преимущества:**
- Централизованная логика
- Легко тестировать
- Переиспользуемый код

## Порядок реализации

### Фаза 1: Базовая инфраструктура (1-2 дня)

#### Шаг 1.1: Создать интерфейс IGroupable
**Файл:** `src/store/group/types.ts`

```typescript
export interface IGroupable {
  id: string | number;
  getGeometry(): TRect;
  updatePosition(x: number, y: number): void;
  setParentGroup(groupId?: TGroupId): void;
  getParentGroup(): TGroupId | undefined;
}

export type TGroupChild = {
  type: 'block' | 'group' | 'component';
  id: string | number;
};
```

#### Шаг 1.2: Расширить TGroup
**Файл:** `src/store/group/Group.ts`

Добавить новые поля в интерфейс [`TGroup`](../src/store/group/Group.ts:10):
```typescript
export interface TGroup {
  // Существующие поля...
  
  // НОВОЕ
  parentGroup?: TGroupId;
  children?: TGroupChild[];
  cascadeMove?: boolean;
  autoResize?: boolean;
}
```

#### Шаг 1.3: Реализовать IGroupable в BlockState
**Файл:** `src/store/block/Block.ts`

Добавить методы в класс [`BlockState`](../src/store/block/Block.ts:16):
```typescript
export class BlockState<T extends TBlock = TBlock> implements IGroupable {
  // Существующий код...
  
  public getGeometry(): TRect {
    return this.$geometry.value;
  }
  
  public updatePosition(x: number, y: number): void {
    this.updateXY(x, y);
  }
  
  public setParentGroup(groupId?: TGroupId): void {
    this.updateBlock({ group: groupId });
  }
  
  public getParentGroup(): TGroupId | undefined {
    return this.$state.value.group;
  }
}
```

#### Шаг 1.4: Реализовать IGroupable в GroupState
**Файл:** `src/store/group/Group.ts`

Добавить методы в класс [`GroupState`](../src/store/group/Group.ts:17):
```typescript
export class GroupState implements IGroupable {
  // Существующий код...
  
  public getGeometry(): TRect {
    return this.$state.value.rect;
  }
  
  public updatePosition(x: number, y: number): void {
    const rect = this.$state.value.rect;
    this.updateGroup({
      rect: { ...rect, x, y }
    });
  }
  
  public setParentGroup(groupId?: TGroupId): void {
    this.updateGroup({ parentGroup: groupId });
  }
  
  public getParentGroup(): TGroupId | undefined {
    return this.$state.value.parentGroup;
  }
  
  public getDescendants(): IGroupable[] {
    return this.store.getDescendants(this.id);
  }
}
```

**Тесты для Фазы 1:**
```typescript
// src/store/group/Group.test.ts
describe('GroupState IGroupable implementation', () => {
  it('should implement getGeometry', () => {
    const group = new GroupState(store, mockGroup, bucket);
    expect(group.getGeometry()).toEqual(mockGroup.rect);
  });
  
  it('should implement updatePosition', () => {
    const group = new GroupState(store, mockGroup, bucket);
    group.updatePosition(100, 200);
    expect(group.$state.value.rect.x).toBe(100);
    expect(group.$state.value.rect.y).toBe(200);
  });
  
  // Другие тесты...
});
```

### Фаза 2: Управление иерархией (2-3 дня)

#### Шаг 2.1: Создать GroupHierarchyService
**Файл:** `src/services/group/GroupHierarchyService.ts`

Реализовать полный сервис согласно архитектурному документу.

**Ключевые методы:**
- `moveGroupWithChildren(groupId, deltaX, deltaY)`
- `recalculateGroupSize(groupId, padding)`
- `validateHierarchy(groupId, parentId)`
- `calculateBoundingRect(rects)`

#### Шаг 2.2: Расширить GroupsListStore
**Файл:** `src/store/group/GroupsList.ts`

Добавить в класс [`GroupsListStore`](../src/store/group/GroupsList.ts:18):

```typescript
// Карта дочерних элементов
public $groupChildren = computed(() => {
  // Реализация из архитектурного документа
});

// Получить потомков рекурсивно
public getDescendants(groupId: TGroupId): IGroupable[] {
  // Реализация из архитектурного документа
}

// Валидация циклов
public validateHierarchy(groupId: TGroupId, parentId: TGroupId): boolean {
  // Реализация из архитектурного документа
}

// Управление дочерними элементами
public addChildToGroup(groupId: TGroupId, child: TGroupChild): void {
  // Реализация из архитектурного документа
}

public removeChildFromGroup(groupId: TGroupId, childId: string | number): void {
  // Реализация из архитектурного документа
}
```

#### Шаг 2.3: Интегрировать сервис в Graph
**Файл:** `src/graph.ts`

```typescript
export class Graph extends EventTarget {
  // Существующие свойства...
  
  public groupHierarchyService: GroupHierarchyService;
}
```

**Файл:** `src/store/index.ts`

```typescript
export class RootStore {
  constructor(public graph: Graph) {
    // Существующий код...
    
    // Инициализация сервиса
    this.graph.groupHierarchyService = new GroupHierarchyService(this.groupsList);
  }
}
```

**Тесты для Фазы 2:**
```typescript
// src/services/group/GroupHierarchyService.test.ts
describe('GroupHierarchyService', () => {
  describe('validateHierarchy', () => {
    it('should detect circular dependencies', () => {
      // Создаем A -> B -> C
      // Проверяем, что нельзя сделать C -> A
    });
  });
  
  describe('getDescendants', () => {
    it('should return all descendants recursively', () => {
      // Создаем иерархию
      // Проверяем, что возвращаются все потомки
    });
  });
  
  describe('moveGroupWithChildren', () => {
    it('should move group and all children when cascadeMove is true', () => {
      // Тест каскадного перемещения
    });
    
    it('should move only group when cascadeMove is false', () => {
      // Тест без каскада
    });
  });
});
```

### Фаза 3: Каскадное перемещение (1-2 дня)

#### Шаг 3.1: Обновить компонент Group
**Файл:** `src/components/canvas/groups/Group.ts`

Модифицировать метод [`handleDrag`](../src/components/canvas/groups/Group.ts:191):

```typescript
export class Group<T extends TGroup = TGroup> extends GraphComponent<...> {
  protected hierarchyService: GroupHierarchyService;
  
  constructor(props: TGroupProps, parent: BlockGroups) {
    super(props, parent);
    // ...
    this.hierarchyService = this.context.graph.groupHierarchyService;
  }
  
  public override handleDrag(diff: DragDiff, _context: DragContext): void {
    // Используем сервис для каскадного перемещения
    this.hierarchyService.moveGroupWithChildren(
      this.props.id, 
      diff.deltaX, 
      diff.deltaY
    );
    
    // Обновляем визуальное представление
    const rect = {
      x: this.state.rect.x + diff.deltaX,
      y: this.state.rect.y + diff.deltaY,
      width: this.state.rect.width,
      height: this.state.rect.height,
    };
    this.setState({ rect });
    this.updateHitBox(rect);
  }
}
```

**Тесты для Фазы 3:**
```typescript
// e2e/tests/group/nested-group-drag.spec.ts
test('should move all children when dragging parent group', async ({ page }) => {
  // Создать иерархию групп
  // Перетащить родительскую группу
  // Проверить, что все дочерние элементы переместились
});
```

### Фаза 4: Рендеринг (1-2 дня)

#### Шаг 4.1: Реализовать z-index на основе глубины
**Файл:** `src/components/canvas/groups/Group.ts`

```typescript
protected calculateZIndex(): number {
  let depth = 0;
  let currentGroupId = this.groupState?.$state.value.parentGroup;
  
  while (currentGroupId) {
    depth++;
    const parentGroup = this.context.graph.rootStore.groupsList.getGroup(currentGroupId);
    currentGroupId = parentGroup?.parentGroup;
  }
  
  return this.context.constants.group.BASE_Z_INDEX - depth;
}

public get zIndex() {
  return this.calculateZIndex();
}
```

#### Шаг 4.2: Добавить визуальную индикацию вложенности
**Файл:** `src/components/canvas/groups/Group.ts`

Обновить метод `render()` согласно архитектурному документу.

#### Шаг 4.3: Добавить константы для групп
**Файл:** `src/graphConfig.ts`

```typescript
export const DEFAULT_GRAPH_CONSTANTS = {
  // Существующие константы...
  
  group: {
    BASE_Z_INDEX: 0,
    DEFAULT_PADDING: [20, 20, 20, 20] as [number, number, number, number]
  }
};
```

### Фаза 5: Публичный API (1 день)

#### Шаг 5.1: Расширить PublicGraphApi
**Файл:** `src/api/PublicGraphApi.ts`

Добавить методы согласно архитектурному документу:
- `createNestedGroup(config)`
- `addToGroup(groupId, child)`
- `removeFromGroup(groupId, childId)`
- `moveToGroup(childId, childType, fromGroupId, toGroupId)`
- `getGroupHierarchy(groupId)`

**Тесты для Фазы 5:**
```typescript
// src/api/PublicGraphApi.test.ts
describe('PublicGraphApi nested groups', () => {
  it('should create nested group', () => {
    const groupId = api.createNestedGroup({
      id: 'test-group',
      children: [{ type: 'block', id: 'block1' }]
    });
    expect(groupId).toBe('test-group');
  });
  
  it('should prevent circular dependencies', () => {
    expect(() => {
      // Попытка создать цикл
    }).toThrow('Cannot create circular group dependency');
  });
});
```

### Фаза 6: Документация и примеры (1 день)

#### Шаг 6.1: Создать Storybook примеры
**Файл:** `src/stories/groups/nested-groups.stories.tsx`

```typescript
export const NestedGroupsBasic: Story = {
  render: () => {
    // Пример из nested-groups-usage-examples.md
  }
};

export const ThreeLevelHierarchy: Story = {
  render: () => {
    // Пример трехуровневой иерархии
  }
};
```

#### Шаг 6.2: Обновить документацию
- Обновить README.md с информацией о вложенных группах
- Добавить миграционное руководство
- Создать API reference

## Критерии приемки

### Функциональные требования

- ✅ Группы могут содержать другие группы
- ✅ Группы могут содержать блоки
- ✅ Поддержка произвольной глубины вложенности
- ✅ Каскадное перемещение работает корректно
- ✅ Автоматический пересчет размеров групп
- ✅ Валидация циклических зависимостей
- ✅ Визуальная индикация уровня вложенности

### Нефункциональные требования

- ✅ Обратная совместимость с существующим кодом
- ✅ Производительность: перемещение группы с 1000 элементов < 16ms
- ✅ Покрытие тестами > 80%
- ✅ Документация и примеры использования
- ✅ TypeScript типизация без `any`

### Тестовые сценарии

1. **Создание иерархии**
   - Создать группу с блоками
   - Создать группу с другими группами
   - Создать 3-уровневую иерархию

2. **Перемещение**
   - Перетащить группу с дочерними элементами
   - Проверить каскадное перемещение
   - Проверить отключение каскада

3. **Изменение размера**
   - Добавить элемент в группу с autoResize
   - Удалить элемент из группы
   - Проверить фиксированный размер

4. **Валидация**
   - Попытка создать циклическую зависимость
   - Добавление несуществующего элемента
   - Удаление несуществующей группы

5. **Производительность**
   - Создать 100 групп с 10 блоками каждая
   - Переместить корневую группу
   - Измерить время выполнения

## Потенциальные проблемы и решения

### Проблема 1: Производительность при глубокой вложенности

**Симптомы:** Медленное перемещение групп с большим количеством потомков

**Решение:**
- Кэшировать список потомков
- Использовать батчинг для обновлений
- Оптимизировать вычисление bounding box

```typescript
// Кэширование потомков
private descendantsCache = new Map<TGroupId, IGroupable[]>();

public getDescendants(groupId: TGroupId): IGroupable[] {
  if (this.descendantsCache.has(groupId)) {
    return this.descendantsCache.get(groupId)!;
  }
  
  const descendants = this.calculateDescendants(groupId);
  this.descendantsCache.set(groupId, descendants);
  return descendants;
}

// Инвалидация кэша при изменениях
public addChildToGroup(groupId: TGroupId, child: TGroupChild): void {
  // ...
  this.invalidateDescendantsCache(groupId);
}
```

### Проблема 2: Конфликты при одновременном перемещении

**Симптомы:** Дочерние элементы перемещаются дважды при перетаскивании

**Решение:**
- Флаг блокировки во время каскадного перемещения
- Проверка, не является ли элемент частью перемещаемой иерархии

```typescript
private movingGroups = new Set<TGroupId>();

public moveGroupWithChildren(groupId: TGroupId, deltaX: number, deltaY: number): void {
  if (this.movingGroups.has(groupId)) {
    return; // Уже перемещается
  }
  
  this.movingGroups.add(groupId);
  try {
    // Логика перемещения
  } finally {
    this.movingGroups.delete(groupId);
  }
}
```

### Проблема 3: Рассинхронизация визуального и логического состояния

**Симптомы:** Группа визуально на одном месте, а в store - на другом

**Решение:**
- Единый источник истины (store)
- Компонент всегда рендерит из store
- Немедленное обновление store при перетаскивании

## Метрики успеха

После реализации измерить:

1. **Производительность**
   - Время перемещения группы с 100 элементами
   - Время создания иерархии из 1000 элементов
   - FPS при перетаскивании

2. **Качество кода**
   - Покрытие тестами
   - Количество TypeScript ошибок
   - Результаты линтера

3. **Удобство использования**
   - Количество строк кода для создания иерархии
   - Время на изучение API (опрос разработчиков)
   - Количество вопросов в документации

## Следующие шаги

После завершения базовой реализации можно рассмотреть:

1. **Расширенные возможности**
   - Drag & drop между группами
   - Автоматическая группировка по критериям
   - Сворачивание/разворачивание групп

2. **Визуальные улучшения**
   - Анимация при изменении размера
   - Индикаторы связей между группами
   - Кастомные стили для разных уровней

3. **Интеграция**
   - Поддержка в React компонентах
   - Экспорт/импорт иерархии
   - Undo/Redo для операций с группами

## Заключение

Данное руководство предоставляет пошаговый план реализации системы вложенных групп. Следуя этому плану, можно создать гибкую и производительную систему, которая будет обратно совместима с существующим кодом и легко расширяема в будущем.

**Общая оценка времени:** 7-11 дней разработки + 2-3 дня тестирования

**Приоритет:** Высокий (значительно расширяет возможности библиотеки)

**Риски:** Средние (требует изменений в core, но с хорошим покрытием тестами)
