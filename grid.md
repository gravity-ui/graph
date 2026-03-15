# Magnetic Snapping для блоков

Реализовано через `DragStrategy` в GraphComponent.

## Правила MagneticDragStrategy

**Активация**: 15–25px к краю/центру соседнего блока (настраивается).

**Цели выравнивания**:
- Левая/правая граница к аналогичной границе соседа
- Центр блока к центру или середине края соседа
- Верх/низ к верхнему/нижнему краю

**Конфликты**: приоритет по евклидову расстоянию; при равном расстоянии — по направлению драга (горизонталь > вертикаль).

**Hysteresis**: после снапа держит позицию, пока не отойдёшь на 40–50px (избегает "прыжков").

**Визуализация**: пунктирная линия + подсветка целевого края (зелёный/жёлтый glow).

## Пример использования

```typescript
import {
  Block,
  MagneticDragStrategy,
  MagneticVisualizationLayer,
  NoopDragStrategy,
  useGraph,
  useLayer,
  type DragState,
  type DragStrategy,
} from "@gravity-ui/graph";

const magneticStrategy = new MagneticDragStrategy({
  minDistanceToSnap: 15,
  maxDistanceToSnap: 25,
  hysteresisDistance: 45,
  neighborTypes: [Block],
  gridSize: 10,
});

class MagneticBlock extends Block {
  public override getDragStrategy(dragState: DragState): DragStrategy {
    if (!dragState.isMultiple) return magneticStrategy;
    return new NoopDragStrategy();
  }
}

function App() {
  const { graph } = useGraph({ /* ... */ });
  useLayer(graph, MagneticVisualizationLayer, {});

  return <GraphCanvas graph={graph} />;
}
```

## Опции MagneticDragStrategy

| Опция | По умолчанию | Описание |
|-------|--------------|----------|
| minDistanceToSnap | 15 | Мин. расстояние (px) для активации |
| maxDistanceToSnap | 25 | Макс. расстояние (px) для учёта |
| hysteresisDistance | 45 | Расстояние (px) для сброса снапа |
| neighborTypes | [] | Типы компонентов для привязки |
| gridSize | 0 | Размер сетки при отсутствии соседей |