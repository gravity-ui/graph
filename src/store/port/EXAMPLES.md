# Примеры использования системы портов

## 🚀 Базовые сценарии

### 1. Создание связи без ожидания инициализации блоков

**Старый способ (проблемный):**
```typescript
// ❌ Нужно ждать полной инициализации
const block1 = await createBlock("block1");
const block2 = await createBlock("block2");
await waitForAnchors([block1, block2]);

// Только теперь можно создать связь
const connection = createConnection({
  sourceBlockId: "block1",
  targetBlockId: "block2"
});
```

**Новый способ с портами:**
```typescript
// ✅ Связь создается немедленно, порты создаются автоматически
const connection = createConnection({
  sourceBlockId: "block1", // Блок может еще не существовать
  targetBlockId: "block2"  // Блок может еще не существовать
});

// Порты создаются автоматически с lookup=true
// Когда блоки готовы, порты обновляются автоматически
```

### 2. Динамическое создание связей

```typescript
// Создаем порт для кастомного элемента
const customPort = graph.rootStore.portsList.getOrCreatePort("custom_element", customComponent);

// Связываем с существующим блоком
const blockPort = graph.rootStore.portsList.getOrCreatePort("block1_output", block);

// Связь работает независимо от порядка создания
createConnection({
  sourcePortId: customPort.id,
  targetPortId: blockPort.id
});
```

### 3. Управление состоянием портов

```typescript
const port = graph.rootStore.portsList.getOrCreatePort("port1", component);

// Порт может быть выбран
port.setSelected(true);

// Порт может быть подсвечен
port.setHighlighted(true);

// Порт может иметь свои стили
port.setStyle({ color: "red", width: 2 });

// Порт может быть временно отключен
port.setEnabled(false);
```

## 🔧 Продвинутые сценарии

### 4. Создание портов для групп блоков

```typescript
// Создаем порт для группы блоков
const groupPort = graph.rootStore.portsList.getOrCreatePort("group1", groupComponent);

// Связываем группу с отдельным блоком
const blockPort = graph.rootStore.portsList.getOrCreatePort("block1", block);

createConnection({
  sourcePortId: groupPort.id,
  targetPortId: blockPort.id
});
```

### 5. Порты для временных элементов

```typescript
// Создаем временный порт для предварительного просмотра связи
const tempPort = graph.rootStore.portsList.getOrCreatePort("temp_preview", null);
tempPort.setPoint(mouseX, mouseY);

// Когда пользователь отпускает кнопку мыши, порт удаляется
graph.rootStore.portsList.deletePort("temp_preview");
```

### 6. Порты для внешних систем

```typescript
// Порт для внешнего API
const apiPort = graph.rootStore.portsList.getOrCreatePort("external_api", null);
apiPort.setPoint(0, 0); // Позиция не важна для внешних систем

// Связываем с внутренним блоком
const internalPort = graph.rootStore.portsList.getOrCreatePort("block1", block);

createConnection({
  sourcePortId: apiPort.id,
  targetPortId: internalPort.id
});
```

## 📊 Сравнение производительности

### Старая система
```typescript
// ❌ Создание всех компонентов сразу
const blocks = createAllBlocks(1000);
const anchors = createAllAnchors(blocks);
const connections = createAllConnections(anchors);

// Результат: 1000 блоков + 2000 якорей + 1000 связей = 4000 объектов в памяти
```

### Новая система с портами
```typescript
// ✅ Создание только нужных компонентов
const connections = createAllConnections(1000);

// Результат: 1000 связей + ~1000 портов (только для видимых блоков)
// Порты создаются только когда блоки становятся видимыми
```

## 🎯 Практические преимущества

### 1. **Отладка и разработка**
```typescript
// Легко отслеживать состояние портов
port.$state.subscribe((state) => {
  console.log(`Порт ${state.id} обновлен:`, state);
});

// Понятная логика создания
const port = portsList.getOrCreatePort("port_id", component);
// Порт либо существует, либо создается автоматически
```

### 2. **Тестирование**
```typescript
// Тестировать связи можно без полной инициализации графа
const port1 = portsList.getOrCreatePort("test1", null);
const port2 = portsList.getOrCreatePort("test2", null);

// Связь работает даже без блоков
const connection = createConnection({
  sourcePortId: port1.id,
  targetPortId: port2.id
});
```

### 3. **Расширяемость**
```typescript
// Легко добавлять новые типы портов
class CustomPort extends PortState {
  public setCustomProperty(value: string) {
    this.$state.value = { ...this.$state.value, customProperty: value };
  }
}

// Использование
const customPort = new CustomPort({ id: "custom", x: 0, y: 0 });
customPort.setCustomProperty("special");
```

## 🚨 Анти-паттерны

### ❌ Не делайте так:
```typescript
// Не создавайте порты заранее
const ports = [];
for (let i = 0; i < 1000; i++) {
  ports.push(portsList.createPort(`port_${i}`, null));
}

// Не ждите готовности всех компонентов
await waitForAllComponents();
```

### ✅ Делайте так:
```typescript
// Создавайте порты по требованию
const port = portsList.getOrCreatePort("port_id", component);

// Создавайте связи когда нужно
const connection = createConnection({
  sourcePortId: "port1",
  targetPortId: "port2"
});
```

## 📚 Заключение

Система портов превращает сложную логику инициализации в простую и предсказуемую систему:

- **Создание по требованию** - порты появляются когда нужны
- **Автоматическое обновление** - позиции обновляются когда компоненты готовы  
- **Гибкость** - связи между любыми объектами
- **Надежность** - нет race conditions и зависимостей от порядка

Это фундаментальное улучшение архитектуры, которое делает `@gravity-ui/graph` более надежной и гибкой библиотекой.
