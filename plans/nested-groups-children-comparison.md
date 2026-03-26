# Сравнение подходов: TGroupChild vs GraphComponent

## Вопрос
Что если в `children` передавать не `TGroupChild` (дескриптор с `{type, id}`), а напрямую `GraphComponent`?

## Вариант 1: Текущий подход (TGroupChild)

```typescript
type TGroupChild = {
  type: 'block' | 'group' | 'component';
  id: string | number;
};

interface TGroup {
  id: TGroupId;
  children?: TGroupChild[];  // Дескрипторы
}
```

### ✅ Преимущества

1. **Сериализация и персистентность**
   ```typescript
   // Легко сохранить в JSON
   const groupData = {
     id: 'group1',
     children: [
       { type: 'block', id: 'block1' },
       { type: 'group', id: 'subgroup1' }
     ]
   };
   
   localStorage.setItem('graph', JSON.stringify(groupData));
   ```

2. **Разделение данных и представления**
   - `TGroup` - чистая модель данных (store)
   - `GraphComponent` - визуальное представление (view)
   - Следует принципу разделения ответственности

3. **Ленивая инициализация**
   ```typescript
   // Компоненты создаются только когда нужны
   public $groupChildren = computed(() => {
     const childrenMap = new Map<TGroupId, IGroupable[]>();
     
     this.$groups.value.forEach(group => {
       const children: IGroupable[] = [];
       
       group.children?.forEach(child => {
         // Создаем/получаем компонент только при необходимости
         if (child.type === 'block') {
           const block = this.rootStore.blocksList.getBlockState(child.id);
           if (block) children.push(block);
         }
       });
       
       childrenMap.set(group.id, children);
     });
     
     return childrenMap;
   });
   ```

4. **Независимость от жизненного цикла компонентов**
   - Группа может существовать до создания компонентов
   - Компоненты могут пересоздаваться без потери связей
   - Данные переживают unmount/remount компонентов

5. **Простота валидации**
   ```typescript
   public validateHierarchy(groupId: TGroupId, parentId: TGroupId): boolean {
     // Работаем только с ID, не нужны экземпляры компонентов
     let current: TGroupId | undefined = parentId;
     
     while (current) {
       if (current === groupId) return false;
       const group = this.getGroup(current);
       current = group?.parentGroup;
     }
     
     return true;
   }
   ```

6. **Совместимость с SSR и гидратацией**
   - На сервере нет DOM и компонентов
   - Можно сериализовать состояние для передачи клиенту

### ❌ Недостатки

1. **Дополнительный уровень индирекции**
   ```typescript
   // Нужно резолвить ID в компонент
   const child = group.children[0];
   const component = this.getComponentById(child.id, child.type);
   ```

2. **Возможность рассинхронизации**
   ```typescript
   // ID может указывать на несуществующий компонент
   children: [{ type: 'block', id: 'deleted-block' }]
   ```

3. **Необходимость type discriminator**
   - Нужно явно указывать тип элемента
   - Дополнительное поле в структуре

## Вариант 2: Прямые ссылки на GraphComponent

```typescript
interface TGroup {
  id: TGroupId;
  children?: GraphComponent[];  // Прямые ссылки
}
```

### ✅ Преимущества

1. **Прямой доступ к компонентам**
   ```typescript
   // Нет необходимости в резолвинге
   group.children.forEach(child => {
     child.updatePosition(x, y);
   });
   ```

2. **Типобезопасность**
   ```typescript
   // TypeScript знает, что это GraphComponent
   const child = group.children[0];
   child.handleDrag(diff, context);  // ✅ Типизировано
   ```

3. **Нет рассинхронизации**
   - Если компонент удален, ссылка становится undefined
   - Нет "мертвых" ID

### ❌ Недостатки

1. **❌ КРИТИЧНО: Невозможность сериализации**
   ```typescript
   const groupData = {
     id: 'group1',
     children: [blockComponent, groupComponent]  // ❌ Нельзя в JSON
   };
   
   // Ошибка при попытке сохранить
   localStorage.setItem('graph', JSON.stringify(groupData));
   // TypeError: Converting circular structure to JSON
   ```

2. **❌ Циклические ссылки**
   ```typescript
   // GraphComponent содержит ссылку на parent
   // Parent содержит ссылку на children
   // Создается циклическая структура
   group.children[0].parent === group  // Цикл!
   ```

3. **❌ Проблемы с жизненным циклом**
   ```typescript
   // Что происходит при unmount компонента?
   component.unmount();
   // group.children[0] теперь указывает на unmounted компонент
   
   // Нужна сложная логика очистки
   ```

4. **❌ Невозможность создать группу до компонентов**
   ```typescript
   // Нельзя сделать так:
   const group = {
     id: 'group1',
     children: [/* компоненты еще не созданы */]
   };
   
   // Нужно сначала создать все компоненты
   const block1 = new Block(...);
   const block2 = new Block(...);
   
   const group = {
     id: 'group1',
     children: [block1, block2]
   };
   ```

5. **❌ Проблемы с SSR**
   - На сервере нет компонентов
   - Невозможно передать состояние клиенту

6. **❌ Сложность тестирования**
   ```typescript
   // Нужно создавать реальные компоненты для тестов
   const mockBlock = new Block(props, parent);  // Тяжелый объект
   
   // Вместо простого:
   const mockChild = { type: 'block', id: 'test-block' };
   ```

## Гибридный подход (Рекомендуемый)

Можно совместить оба подхода:

```typescript
// В store - дескрипторы (источник истины)
interface TGroup {
  id: TGroupId;
  children?: TGroupChild[];  // Сериализуемые дескрипторы
}

// В runtime - кэш компонентов
class GroupState {
  private childComponentsCache?: GraphComponent[];
  
  // Ленивое получение компонентов
  public getChildComponents(): GraphComponent[] {
    if (!this.childComponentsCache) {
      this.childComponentsCache = this.$state.value.children?.map(child => {
        return this.resolveComponent(child);
      }).filter(Boolean) || [];
    }
    return this.childComponentsCache;
  }
  
  // Инвалидация кэша при изменениях
  public updateGroup(group: Partial<TGroup>) {
    this.childComponentsCache = undefined;  // Сбросить кэш
    this.$state.value = { ...this.$state.value, ...group };
  }
  
  private resolveComponent(child: TGroupChild): GraphComponent | undefined {
    switch (child.type) {
      case 'block':
        return this.store.rootStore.blocksList
          .getBlockState(child.id)
          ?.getViewComponent();
      case 'group':
        return this.store.getGroupById(child.id);
      default:
        return undefined;
    }
  }
}
```

### Использование

```typescript
// Сохранение - работаем с дескрипторами
const groupData = group.asTGroup();  // { id, children: [{type, id}] }
localStorage.setItem('graph', JSON.stringify(groupData));

// Runtime - работаем с компонентами
const components = groupState.getChildComponents();
components.forEach(c => c.updatePosition(x, y));

// Лучшее из обоих миров!
```

## Альтернатива: Двойное хранение

```typescript
interface TGroup {
  id: TGroupId;
  
  // Для сериализации
  childrenIds?: TGroupChild[];
  
  // Для runtime (не сериализуется)
  childrenComponents?: GraphComponent[];
}

class GroupState {
  public syncComponents(): void {
    // Синхронизируем компоненты с ID
    this.$state.value.childrenComponents = 
      this.$state.value.childrenIds?.map(child => 
        this.resolveComponent(child)
      ).filter(Boolean);
  }
  
  public toJSON() {
    // При сериализации исключаем компоненты
    const { childrenComponents, ...rest } = this.$state.value;
    return rest;
  }
}
```

### ❌ Проблемы двойного хранения

1. **Сложность синхронизации**
   - Нужно постоянно следить за согласованностью
   - Риск рассинхронизации

2. **Дублирование данных**
   - Больше памяти
   - Больше мест для ошибок

## Рекомендация

**Использовать Вариант 1 (TGroupChild) с гибридным подходом:**

1. **В store (`TGroup`)** - хранить дескрипторы `TGroupChild[]`
   - Сериализуемо
   - Источник истины
   - Независимо от компонентов

2. **В runtime (`GroupState`)** - кэшировать компоненты
   - Быстрый доступ
   - Типобезопасность
   - Автоматическая инвалидация

3. **В API** - предоставить удобные методы
   ```typescript
   // Работа с дескрипторами
   api.addToGroup(groupId, { type: 'block', id: 'block1' });
   
   // Работа с компонентами (внутри)
   const components = groupState.getChildComponents();
   ```

## Пример реализации

```typescript
// src/store/group/Group.ts
export class GroupState implements IGroupable {
  private childComponentsCache?: IGroupable[];
  
  /**
   * Получить дочерние элементы как IGroupable компоненты
   * Результат кэшируется до следующего изменения
   */
  public getChildren(): IGroupable[] {
    if (!this.childComponentsCache) {
      this.childComponentsCache = this.resolveChildren();
    }
    return this.childComponentsCache;
  }
  
  /**
   * Получить дочерние элементы как дескрипторы (для сериализации)
   */
  public getChildrenDescriptors(): TGroupChild[] {
    return this.$state.value.children || [];
  }
  
  public updateGroup(group: Partial<TGroup>): void {
    // Инвалидируем кэш при изменении children
    if (group.children !== undefined) {
      this.childComponentsCache = undefined;
    }
    
    this.$state.value = {
      ...this.$state.value,
      ...group,
    };
  }
  
  private resolveChildren(): IGroupable[] {
    const children: IGroupable[] = [];
    
    this.$state.value.children?.forEach(child => {
      const component = this.resolveChild(child);
      if (component) {
        children.push(component);
      }
    });
    
    return children;
  }
  
  private resolveChild(child: TGroupChild): IGroupable | undefined {
    switch (child.type) {
      case 'block':
        return this.store.rootStore.blocksList.getBlockState(child.id);
      case 'group':
        return this.store.getGroupState(child.id);
      default:
        return undefined;
    }
  }
}
```

## Итоговое сравнение

| Критерий | TGroupChild | GraphComponent | Гибрид |
|----------|-------------|----------------|--------|
| Сериализация | ✅ | ❌ | ✅ |
| Прямой доступ | ❌ | ✅ | ✅ |
| Типобезопасность | ⚠️ | ✅ | ✅ |
| Жизненный цикл | ✅ | ❌ | ✅ |
| SSR | ✅ | ❌ | ✅ |
| Простота | ✅ | ✅ | ⚠️ |
| Производительность | ✅ | ✅ | ✅ |

**Вывод:** Гибридный подход с `TGroupChild` в store и кэшированием компонентов - оптимальное решение.
