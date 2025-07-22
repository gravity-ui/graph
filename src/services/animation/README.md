# GraphAnimation

Система анимаций для @gravity-ui/graph, интегрированная с планировщиком задач.

## Основные возможности

- ✅ Интеграция с системой планировщика
- ✅ Поддержка различных timing функций (linear, ease-in, ease-out, ease-in-out)
- ✅ Перезапускаемые анимации
- ✅ Низкий приоритет в планировщике (после основного рендеринга)
- ✅ TypeScript поддержка
- ✅ Интерполяция любых числовых параметров

## Быстрый старт

```typescript
import { GraphAnimation } from "./services/animation";

const animation = new GraphAnimation((params, progress) => {
  console.log(`x: ${params.x}, y: ${params.y}, progress: ${progress}`);
}, {
  timing: "ease-in-out",
  duration: 2000,
  infinite: false // По умолчанию false
});

// Запуск анимации
animation.start({ x: 100, y: 200 });

// Получение текущего состояния
console.log(animation.animationState); // "running"
console.log(animation.step); // { progress: 0.5, timing: 0.75, elapsed: 1000 }
console.log(animation.isInfinite); // false

// Остановка
animation.stop();
```

## Бесконечные анимации

### Использование параметра `infinite`

Теперь можно создавать бесконечные анимации без дополнительного кода:

```typescript
// Простая бесконечная анимация
const infiniteAnimation = new GraphAnimation(
  (params) => {
    element.style.transform = `translateX(${params.x}px)`;
  },
  {
    timing: "ease-in-out",
    duration: 2000,
    infinite: true, // Бесконечная анимация!
  }
);

// Запускаем один раз - анимация будет повторяться автоматически
infiniteAnimation.setCurrentParams({ x: 0 });
infiniteAnimation.start({ x: 200 });

// Анимация автоматически вернется к x: 0, затем к x: 200, и так далее
// Остановить можно вызовом stop()
infiniteAnimation.stop();
```

### Различные типы бесконечных анимаций

```typescript
// Пульсация
const pulseAnimation = new GraphAnimation(
  (params) => {
    element.style.transform = `scale(${params.scale})`;
  },
  {
    timing: "ease-in-out",
    duration: 1000,
    infinite: true,
  }
);
pulseAnimation.setCurrentParams({ scale: 1 });
pulseAnimation.start({ scale: 1.2 });

// Вращение
const rotateAnimation = new GraphAnimation(
  (params) => {
    element.style.transform = `rotate(${params.rotation}deg)`;
  },
  {
    timing: "linear",
    duration: 2000,
    infinite: true,
  }
);
rotateAnimation.setCurrentParams({ rotation: 0 });
rotateAnimation.start({ rotation: 360 });
```

### С useGraphAnimation

```typescript
const { start, stop, isInfinite } = useGraphAnimation({
  onUpdate: (params) => {
    setPosition({ x: params.x, y: params.y });
  },
});

// Запуск бесконечной анимации
start(
  { x: 300, y: 100 },
  {
    timing: "ease-in-out",
    duration: 1500,
    infinite: true,
  }
);

console.log(isInfinite); // true
```

## GraphAnimationAdvanced

### Расширенная версия с дженериками и хуками

Для сложных сценариев доступна версия `GraphAnimationAdvanced` с поддержкой типизированных параметров и хуков жизненного цикла:

```typescript
import { GraphAnimationAdvanced } from "@gravity-ui/graph";

interface MyParams {
  x: number;
  y: number;
  scale: number;
  rotation: number;
}

const animation = new GraphAnimationAdvanced<MyParams>(
  (params) => {
    element.style.transform = `
      translate(${params.x}px, ${params.y}px) 
      scale(${params.scale}) 
      rotate(${params.rotation}deg)
    `;
  },
  {
    timing: "ease-in-out",
    duration: 2000,
    infinite: true,

    // Хук init - обработка параметров перед началом
    init: (startParams) => {
      console.log("Анимация начинается", startParams);
      return {
        ...startParams,
        scale: Math.max(startParams.scale, 0.5), // Минимальный scale
      };
    },

    // Хук progress - кастомная интерполяция
    progress: ({ currentTime, startTime, progress, params }) => {
      // Добавляем пульсацию
      const pulseEffect = 1 + Math.sin(progress * Math.PI * 4) * 0.1;
      
      return {
        x: params.x,
        y: params.y,
        scale: params.scale * pulseEffect,
        rotation: params.rotation + Math.sin(progress * Math.PI * 2) * 10,
      };
    },

    // Хук end - действия при завершении цикла
    end: ({ currentTime, startTime, progress, infinite }) => {
      const duration = currentTime - startTime;
      console.log(`Цикл завершен за ${duration}мс, progress=${progress}, infinite=${infinite}`);
    },
  }
);

// Запуск типизированной анимации
animation.setCurrentParams({ x: 0, y: 0, scale: 1, rotation: 0 });
animation.start({ x: 200, y: 100, scale: 1.5, rotation: 180 });
```

### Хуки жизненного цикла

#### init(startParams): Params
Вызывается перед началом анимации. Позволяет модифицировать целевые параметры.

#### progress(context): AnimationParameters  
Вызывается на каждом кадре. Позволяет создать кастомную логику интерполяции.

**Контекст:**
- `currentTime` - текущее время
- `startTime` - время начала анимации  
- `progress` - прогресс от 0 до 1
- `params` - текущие параметры

#### end(context): void
Вызывается при завершении каждого цикла анимации.

**Контекст:**
- `currentTime` - время завершения
- `startTime` - время начала анимации
- `progress` - финальный прогресс (обычно 1)
- `infinite` - является ли анимация бесконечной

## API

### GraphAnimation Constructor

```typescript
new GraphAnimation(callback, defaultConfig?)
```

**Параметры:**
- `callback: (params: AnimationParameters, progress: number) => void` - функция, вызываемая на каждом кадре
- `defaultConfig?: AnimationConfig` - конфигурация по умолчанию

### Методы

#### start(toParams, config?)

Запускает анимацию к целевым параметрам.

```typescript
animation.start(
  { x: 100, y: 200, opacity: 0.5 }, 
  { duration: 1000, timing: "ease-out" }
);
```

#### stop()

Останавливает текущую анимацию.

#### setCurrentParams(params)

Устанавливает текущие значения параметров без анимации.

```typescript
animation.setCurrentParams({ x: 50, y: 50 });
```

#### getCurrentParams()

Возвращает текущие значения параметров.

### Свойства

#### animationState

Текущее состояние анимации: `"initial" | "running" | "completed" | "stopped"`

#### isInfinite

Возвращает `true`, если анимация настроена как бесконечная.

#### step

Информация о текущем шаге анимации:

```typescript
{
  progress: number; // 0-1, линейный прогресс
  timing: number;   // 0-1, прогресс с учетом timing функции
  elapsed: number;  // время в миллисекундах с начала анимации
}
```

## Timing Functions

### Доступные функции

- `linear` - линейная анимация
- `ease-in` - ускорение в начале
- `ease-out` - замедление в конце  
- `ease-in-out` - ускорение в начале, замедление в конце

### Создание собственных timing функций

```typescript
import { timingFunctions } from "./services/animation";

// Добавление кастомной функции
timingFunctions["bounce"] = (t: number) => {
  if (t < 0.5) {
    return 2 * t * t;
  }
  return 1 - Math.pow(-2 * t + 2, 2) / 2;
};
```

## Интеграция с планировщиком

GraphAnimation автоматически интегрируется с `globalScheduler` и работает с приоритетом `LOW`, что означает:

- Анимации выполняются после основного рендеринга контента
- Не блокируют критические операции  
- Оптимизированы для производительности

## Примеры использования

### Анимация камеры

```typescript
const cameraAnimation = new GraphAnimation((params) => {
  camera.setPosition(params.x, params.y);
  camera.setScale(params.scale);
}, { timing: "ease-in-out", duration: 1000 });

// Плавное перемещение камеры
cameraAnimation.setCurrentParams({
  x: camera.position.x,
  y: camera.position.y,
  scale: camera.scale
});

cameraAnimation.start({
  x: targetX,
  y: targetY,
  scale: targetScale
});
```

### Анимация блока

```typescript
const blockAnimation = new GraphAnimation((params) => {
  block.updateGeometry({
    x: params.x,
    y: params.y,
    width: params.width,
    height: params.height
  });
}, { duration: 500, timing: "ease-out" });

blockAnimation.start({
  x: newX,
  y: newY,
  width: newWidth,
  height: newHeight
});
```

### Последовательные анимации

```typescript
const sequenceAnimation = new GraphAnimation((params, progress) => {
  updateComponent(params);
  
  // Запуск следующей анимации по завершении
  if (progress === 1) {
    setTimeout(() => {
      nextAnimation.start(nextParams);
    }, 100);
  }
});
```

## Интеграция с React

### Проблема синхронизации

При использовании GraphAnimation в React компонентах может возникнуть проблема: анимации обновляются на каждом кадре (~60 FPS), но React не успевает обрабатывать `setState` так часто. Это приводит к рывкам в анимации.

### Решение: useGraphAnimation Hook

Используйте встроенный hook для автоматической синхронизации:

#### Подход 1: Через CSS style (рекомендуется)

**Лучше для:** CSS transforms, сложных анимаций, комбинированных свойств

```typescript
import { useGraphAnimation } from "./services/animation";

const MyComponent = () => {
  const [style, setStyle] = useState<React.CSSProperties>({
    transform: "translate(0px, 0px) scale(1)",
    opacity: 1,
  });

  const { start, stop, isRunning } = useGraphAnimation({
    onUpdate: (params) => {
      setStyle({
        transform: `translate(${params.x}px, ${params.y}px) scale(${params.scale})`,
        opacity: params.opacity,
      });
    },
    defaultConfig: { timing: "ease-in-out", duration: 1000 },
  });

  return (
    <div>
      <div style={{ ...style, position: "absolute", width: "100px", height: "100px" }}>
        Анимированный элемент
      </div>
      <button onClick={() => start({ x: 100, y: 100, scale: 1.5, opacity: 0.8 })}>
        Анимировать
      </button>
    </div>
  );
};
```

#### Подход 2: Через отдельные параметры

**Лучше для:** простых анимаций, когда нужен доступ к отдельным значениям

```typescript
const MyComponent = () => {
  const [params, setParams] = useState({ x: 0, y: 0 });

  const { start, stop, isRunning } = useGraphAnimation({
    onUpdate: (newParams) => {
      setParams(newParams as typeof params);
    },
    defaultConfig: { timing: "ease-in-out", duration: 1000 },
  });

  return (
    <div>
      <div style={{ transform: `translate(${params.x}px, ${params.y}px)` }}>
        Анимированный элемент
      </div>
      <button onClick={() => start({ x: 100, y: 100 })}>
        Анимировать
      </button>
    </div>
  );
};
```

### Ручная синхронизация

Если не используете hook, синхронизируйте вручную через `requestAnimationFrame`:

```typescript
const rafIdRef = useRef<number | null>(null);

const animation = new GraphAnimation((params) => {
  // Cancel previous RAF
  if (rafIdRef.current) {
    cancelAnimationFrame(rafIdRef.current);
  }
  
  // Schedule state update on next frame
  rafIdRef.current = requestAnimationFrame(() => {
    setParams(params);
    rafIdRef.current = null;
  });
});
```

## Лучшие практики

1. **CSS Style подход**: Используйте CSS style объекты для лучшей производительности и читаемости
2. **React синхронизация**: Используйте `useGraphAnimation` hook или RAF для синхронизации  
3. **Transform vs Position**: Предпочитайте `transform: translate()` вместо `left/top` для позиционирования
4. **Производительность**: Избегайте создания сложных вычислений в callback
5. **Cleanup**: Всегда останавливайте анимации при размонтировании компонентов
6. **Перезапуск**: Анимации можно перезапускать без создания нового экземпляра
7. **Интерполяция**: Используйте `setCurrentParams()` для установки начальных значений
8. **Мониторинг**: Используйте `animationState` для отслеживания состояния

### Преимущества CSS Style подхода

- **Производительность**: CSS transforms обрабатываются GPU, а не CPU
- **Простота**: Один объект style вместо множества отдельных props
- **Гибкость**: Легко добавлять новые CSS свойства (rotation, blur, filters)
- **Читаемость**: Понятнее для разработчиков, знакомых с CSS
- **Композиция**: Легко комбинировать несколько transform'ов

## Примеры для графа

### Анимация блоков в графе

```typescript
import { GraphAnimation } from "./services/animation";

// Анимация изменения размеров блока
const blockAnimation = new GraphAnimation(
  (params) => {
    graph.api.updateBlock({
      id: "block-1",
      width: params.width,
      height: params.height,
      x: params.x,
      y: params.y,
    });
  },
  {
    timing: "ease-in-out",
    duration: 1500,
  }
);

// Получить текущее состояние блока
const currentBlockState = graph.rootStore.blocksList.getBlockState("block-1");
const current = currentBlockState.$state.value;

// Установить начальные параметры и запустить анимацию
blockAnimation.setCurrentParams({
  width: current.width,
  height: current.height,
  x: current.x,
  y: current.y,
});

blockAnimation.start({
  width: current.width * 1.5,
  height: current.height * 1.5,
  x: current.x - 25,
  y: current.y - 25,
});
```

### Пунктирные соединения с анимацией

```typescript
// В конфигурации графа
const connections = [
  {
    id: "conn-1",
    sourceBlockId: "block-1",
    targetBlockId: "block-2",
    dashed: true,
    styles: {
      dashes: [8, 4], // [длина штриха, длина пробела]
      background: "#ff6b6b",
      selectedBackground: "#ff5252",
    },
  },
  {
    id: "conn-2",
    sourceBlockId: "block-1",
    targetBlockId: "block-3",
    dashed: true,
    styles: {
      dashes: [12, 6], // Более длинные штрихи
      background: "#4ecdc4",
      selectedBackground: "#26a69a",
    },
  },
];
```

### CSS Transform анимации для блоков

```typescript
const { start: startAnimation, stop, isRunning } = useGraphAnimation({
  onUpdate: (params) => {
    // Обновляем CSS стили блока
    setBlockStyle({
      transform: `scale(${params.scale}) rotate(${params.rotation}deg)`,
      opacity: params.opacity,
    });
  },
  defaultConfig: {
    timing: "ease-in-out", 
    duration: 2000,
  },
});

// Запуск морфинг анимации
startAnimation({
  scale: 0.5 + Math.random() * 1.5,
  rotation: Math.random() * 360,
  opacity: 0.3 + Math.random() * 0.7,
});
```

### Циклическая анимация

```typescript
const pulsateBlock = () => {
  let growing = true;
  
  const pulse = () => {
    const currentBlockState = graph.rootStore.blocksList.getBlockState("block-1");
    const current = currentBlockState.$state.value;
    
    blockAnimation.setCurrentParams({
      width: current.width,
      height: current.height,
      x: current.x,
      y: current.y,
    });

    if (growing) {
      blockAnimation.start({ width: 250, height: 150, x: 75, y: 85 });
      growing = false;
    } else {
      blockAnimation.start({ width: 200, height: 120, x: 100, y: 100 });
      growing = true;
    }

    // Продолжить пульсацию
    setTimeout(pulse, 1600);
  };
  
  pulse();
};
```

## Storybook примеры

В проекте доступны следующие Storybook примеры:

- **GraphBlockAnimation**: Демонстрация анимации размеров блоков через Graph API
- **GraphHookAnimation**: Использование useGraphAnimation hook для CSS transforms
- **DashedConnectionDemo**: Различные паттерны пунктирных соединений

Запустите `npm run storybook` и перейдите в раздел "Examples/Graph Animation".

## Типы

```typescript
type TimingFunction = "linear" | "ease-in" | "ease-out" | "ease-in-out";
type AnimationState = "initial" | "running" | "completed" | "stopped";

interface AnimationConfig {
  timing?: TimingFunction;
  duration?: number;
  infinite?: boolean;
}

interface AnimationParameters {
  [key: string]: number;
}

interface AnimationStep {
  progress: number;
  timing: number;
  elapsed: number;
}

// React Hook типы
interface UseGraphAnimationOptions {
  onUpdate?: (params: AnimationParameters, progress: number) => void;
  defaultConfig?: AnimationConfig;
  syncWithReact?: boolean;
}

interface UseGraphAnimationReturn {
  animation: GraphAnimation | null;
  start: (toParams: AnimationParameters, config?: AnimationConfig) => void;
  stop: () => void;
  isRunning: boolean;
  isCompleted: boolean;
  currentParams: AnimationParameters;
}
``` 

## Кастомные анимированные компоненты

### Кастомный анимированный блок

Кастомный Canvas-блок, который автоматически запускает анимацию при изменении своих размеров в сторе:

```tsx
class AnimatedCanvasBlock extends Block {
  private animationScale = 1;
  private animationPulse = 1;
  private sizeAnimation: GraphAnimation;
  private prevSize = { width: 0, height: 0 };

  constructor(props: any, parent: any) {
    super(props, parent);
    this.initSizeAnimation();
  }

  private initSizeAnimation() {
    this.sizeAnimation = new GraphAnimation(
      (params) => {
        this.animationScale = params.scale;
        this.animationPulse = params.pulse;
      },
      {
        timing: "ease-out",
        duration: 800,
      }
    );
  }

  protected override render() {
    // Проверяем изменения размера
    const currentSize = { width: this.state.width, height: this.state.height };
    if (currentSize.width !== this.prevSize.width || currentSize.height !== this.prevSize.height) {
      // Запускаем анимацию при изменении размера
      this.sizeAnimation.setCurrentParams({ scale: 1, pulse: 1 });
      this.sizeAnimation.start({ scale: 1.2, pulse: 1.5 });

      // Возвращаем к нормальному состоянию
      setTimeout(() => {
        this.sizeAnimation.start({ scale: 1, pulse: 1 });
      }, 400);

      this.prevSize = currentSize;
    }

    // Применяем анимацию через Canvas трансформации
    this.context.ctx.save();
    
    const centerX = this.state.x + this.state.width / 2;
    const centerY = this.state.y + this.state.height / 2;
    
    this.context.ctx.translate(centerX, centerY);
    this.context.ctx.scale(this.animationScale, this.animationScale);
    this.context.ctx.translate(-centerX, -centerY);

    // Рендерим блок с градиентом
    this.renderAnimatedBlock();
    
    this.context.ctx.restore();
  }

  private renderAnimatedBlock() {
    // Canvas рендеринг с градиентами и эффектами
    const gradient = this.context.ctx.createLinearGradient(/*...*/);
    // ... остальная логика рендеринга
  }

  public unmount() {
    if (this.sizeAnimation) {
      this.sizeAnimation.stop();
    }
    super.unmount();
  }
}
```

**Регистрация кастомного Canvas-блока:**

```js
const { graph } = useGraph({
  settings: {
    blockComponents: {
      AnimatedBlock: AnimatedCanvasBlock, // Canvas-класс, не React-компонент!
    },
  },
});
```

### Кастомная анимированная связь

Кастомная связь с анимацией пунктирных линий:

```tsx
class AnimatedDashedConnection extends BlockConnection<TConnection> {
  private dashOffset = 0;
  private dashAnimation: GraphAnimation;

  constructor(props: any, parent: any) {
    super(props, parent);
    this.startDashAnimation();
  }

  private startDashAnimation = () => {
    // Используем GraphAnimation для анимации dashOffset с infinite
    this.dashAnimation = new GraphAnimation(
      (params) => {
        this.dashOffset = params.offset;
      },
      {
        timing: "linear",
        duration: 2000, // 2 секунды на полный цикл
        infinite: true, // Бесконечная анимация!
      }
    );

    // Запускаем бесконечную анимацию - теперь просто!
    this.dashAnimation.setCurrentParams({ offset: 0 });
    this.dashAnimation.start({ offset: 20 });
  };

  protected setRenderStyles(ctx: CanvasRenderingContext2D, state = this.state, withDashed = true) {
    ctx.lineWidth = state.selected ? 6 : 4;
    ctx.strokeStyle = state.selected ? "#ff6b6b" : "#4ecdc4";
    
    if (withDashed && state.dashed) {
      ctx.setLineDash([8, 8]);
      ctx.lineDashOffset = this.dashOffset;
    }
  }

  public unmount() {
    if (this.dashAnimation) {
      this.dashAnimation.stop();
    }
    super.unmount();
  }
}
```

**Регистрация кастомной связи:**

```js
const { graph } = useGraph({
  settings: {
    connection: AnimatedDashedConnection,
  },
});
```

### Полный пример

Полный рабочий пример смотрите в Storybook: `Examples/Animation/Custom Animated Components`

**Основные принципы:**

1. **Кастомные блоки** - регистрируются через `blockComponents` в настройках графа
2. **Кастомные связи** - регистрируются через `connection` в настройках графа
3. **⚠️ Важно:** В `blockComponents` передавайте **Canvas-классы** (наследники `Block`), а НЕ React-компоненты!
4. **Анимация** - используйте `GraphAnimation` для Canvas-компонентов и `useGraphAnimation` для React-компонентов
5. **Очистка ресурсов** - не забывайте останавливать анимации в `unmount()`

**Различие между Canvas и React блоками:**

- **Canvas-блоки** (`blockComponents`) - рендерятся на Canvas для производительности, используют Canvas API
- **React-блоки** (`renderBlock` в `GraphCanvas`) - рендерятся в HTML для интерактивности, используют JSX

**Почему использовать `GraphAnimation` вместо `requestAnimationFrame`:**

- ✅ **Интеграция с Scheduler** - автоматически работает с приоритетом `ESchedulerPriority.LOW`
- ✅ **Единая система** - все анимации управляются централизованно
- ✅ **Функции easing** - встроенные `linear`, `ease-in`, `ease-out`, `ease-in-out`
- ✅ **Управление состоянием** - автоматическое отслеживание `running`, `completed`, `stopped`
- ✅ **Оптимизация** - анимации выполняются после основного рендеринга
- ✅ **Простота** - меньше кода для управления циклами анимации
- ✅ **Бесконечные анимации** - встроенная поддержка с параметром `infinite: true`

**Преимущества `infinite: true`:**

```typescript
// Старый подход - сложно
const animation = new GraphAnimation(callback);
const loop = () => {
  animation.start(toParams);
  setTimeout(() => {
    if (animation.animationState === "completed") {
      loop(); // Ручной перезапуск
    }
  }, duration + 100);
};
loop();

// Новый подход - просто
const animation = new GraphAnimation(callback, { infinite: true });
animation.start(toParams); // Автоматические циклы!
``` 