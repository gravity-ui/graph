# Highlight Styling Guide

Руководство по применению визуальных эффектов для системы подсветки.

## Конфигурация стилей

### Colors (TGraphColors)

```typescript
{
  block: {
    highlightBorder: "#00BFFF",  // Цвет border для highlight режима
    lowlightOpacity: 0.3,         // Прозрачность для lowlight режима
  },
  anchor: {
    highlightBorder: "#00BFFF",
    lowlightOpacity: 0.3,
  },
  connection: {
    highlightStroke: "#00BFFF",   // Цвет линии для highlight режима
    lowlightOpacity: 0.3,
  },
  connectionLabel: {
    lowlightOpacity: 0.3,
  }
}
```

### Constants (TGraphConstants)

```typescript
{
  block: {
    HIGHLIGHT_BORDER_SIZE: 4,     // Размер border для highlight режима
  },
  anchor: {
    HIGHLIGHT_BORDER_SIZE: 3,
  },
  connection: {
    HIGHLIGHT_LINE_WIDTH: 3,      // Толщина линии для highlight режима
  }
}
```

## Применение в Canvas компонентах

### Block Example

```typescript
import { HighlightVisualMode } from "@gravity-ui/graph";

class CustomBlock extends Block {
  protected renderStroke(color: string) {
    const ctx = this.context.ctx;
    const scale = this.context.camera.getCameraScale();
    
    // Определяем параметры border на основе highlightMode
    let strokeColor = color;
    let lineWidth = Math.round(3 / scale);
    
    if (this.state.highlightMode === HighlightVisualMode.Highlight) {
      strokeColor = this.context.colors.block.highlightBorder;
      lineWidth = Math.round(this.context.constants.block.HIGHLIGHT_BORDER_SIZE / scale);
    }
    
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = strokeColor;
    ctx.strokeRect(this.state.x, this.state.y, this.state.width, this.state.height);
  }

  protected render() {
    const ctx = this.context.ctx;
    
    // Применяем lowlight opacity
    if (this.state.highlightMode === HighlightVisualMode.Lowlight) {
      ctx.globalAlpha = this.context.colors.block.lowlightOpacity;
    }
    
    // Стандартная отрисовка
    ctx.fillStyle = this.context.colors.block.background;
    ctx.fillRect(this.state.x, this.state.y, this.state.width, this.state.height);
    
    this.renderStroke(
      this.state.selected 
        ? this.context.colors.block.selectedBorder 
        : this.context.colors.block.border
    );
    
    // Сброс alpha
    if (this.state.highlightMode === HighlightVisualMode.Lowlight) {
      ctx.globalAlpha = 1.0;
    }
  }
}
```

### Connection Example

```typescript
class CustomConnection extends BaseConnection {
  protected render() {
    if (!this.connectionPoints) return;
    
    const ctx = this.context.ctx;
    const [source, target] = this.connectionPoints;
    
    // Определяем параметры линии
    let strokeStyle = this.state.selected 
      ? this.context.colors.connection.selectedBackground 
      : this.context.colors.connection.background;
    let lineWidth = 2;
    let globalAlpha = 1.0;
    
    if (this.state.highlightMode === HighlightVisualMode.Highlight) {
      strokeStyle = this.context.colors.connection.highlightStroke;
      lineWidth = this.context.constants.connection.HIGHLIGHT_LINE_WIDTH;
    } else if (this.state.highlightMode === HighlightVisualMode.Lowlight) {
      globalAlpha = this.context.colors.connection.lowlightOpacity;
    }
    
    // Отрисовка
    ctx.save();
    ctx.globalAlpha = globalAlpha;
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth;
    
    ctx.beginPath();
    ctx.moveTo(source.x, source.y);
    ctx.lineTo(target.x, target.y);
    ctx.stroke();
    
    ctx.restore();
  }
}
```

### Anchor Example

```typescript
class CustomAnchor extends Anchor {
  protected render() {
    const { x, y } = this.props.getPosition(this.props);
    const ctx = this.context.ctx;
    
    // Определяем параметры отрисовки
    let borderColor = null;
    let borderWidth = 0;
    let globalAlpha = 1.0;
    
    if (this.state.highlightMode === HighlightVisualMode.Highlight) {
      borderColor = this.context.colors.anchor.highlightBorder;
      borderWidth = this.context.constants.anchor.HIGHLIGHT_BORDER_SIZE;
    } else if (this.state.highlightMode === HighlightVisualMode.Lowlight) {
      globalAlpha = this.context.colors.anchor.lowlightOpacity;
    }
    
    // Отрисовка
    ctx.save();
    ctx.globalAlpha = globalAlpha;
    
    ctx.fillStyle = this.context.colors.anchor.background;
    ctx.beginPath();
    ctx.arc(x, y, this.state.size * 0.5, 0, 2 * Math.PI);
    ctx.fill();
    
    // Border для highlight или selection
    if (borderColor || this.state.selected) {
      ctx.strokeStyle = borderColor || this.context.colors.anchor.selectedBorder;
      ctx.lineWidth = borderWidth || (this.props.lineWidth + 3);
      ctx.stroke();
    }
    
    ctx.closePath();
    ctx.restore();
  }
}
```

## React HTML Layer

Для HTML компонентов используйте CSS классы:

```tsx
import { GraphBlock } from "@gravity-ui/graph";
import { HighlightVisualMode } from "@gravity-ui/graph";

function CustomBlockContent({ block, highlightMode }: Props) {
  const className = cn(
    "custom-block",
    highlightMode === HighlightVisualMode.Highlight && "custom-block_highlight",
    highlightMode === HighlightVisualMode.Lowlight && "custom-block_lowlight"
  );
  
  return <div className={className}>{block.name}</div>;
}
```

```css
.custom-block {
  border: 2px solid var(--graph-block-border);
  transition: all 0.2s ease;
}

.custom-block_highlight {
  border-color: var(--graph-block-highlight-border, #00BFFF);
  border-width: 4px;
  box-shadow: 0 0 8px var(--graph-block-highlight-border, #00BFFF);
}

.custom-block_lowlight {
  opacity: var(--graph-block-lowlight-opacity, 0.3);
}
```

## Best Practices

1. **Всегда восстанавливайте контекст** - используйте `ctx.save()` / `ctx.restore()` или сбрасывайте `globalAlpha = 1.0`
2. **Учитывайте масштаб** - делите размеры border на `camera.getCameraScale()` для постоянной визуальной толщины
3. **Приоритет состояний**: `selected` > `highlight` > `default` > `lowlight`
4. **Анимации** - для плавных переходов используйте CSS transitions в HTML слое
5. **Производительность** - избегайте сложных вычислений в render методах, кэшируйте результаты

## Кастомизация цветов

```typescript
graph.setColors({
  block: {
    highlightBorder: "#FF6B6B",    // Красный вместо синего
    lowlightOpacity: 0.15,          // Еще более прозрачный
  },
  connection: {
    highlightStroke: "#4ECDC4",     // Бирюзовый
    lowlightOpacity: 0.2,
  }
});

graph.setConstants({
  block: {
    HIGHLIGHT_BORDER_SIZE: 6,       // Более толстый border
  },
  connection: {
    HIGHLIGHT_LINE_WIDTH: 5,
  }
});
```

## Примеры режимов

### Highlight Mode
- Целевые блоки/connections: яркий border/stroke заданного цвета
- Остальные: без изменений

### Focus Mode  
- Целевые: яркий border/stroke (как в highlight)
- Остальные: прозрачность через `lowlightOpacity`

