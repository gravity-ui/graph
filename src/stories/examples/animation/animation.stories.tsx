import React, { useCallback, useEffect, useRef, useState } from "react";

import { Meta, StoryFn } from "@storybook/react";

import { globalScheduler } from "../../../lib";
import { GraphAnimation, TimingFunction, useGraphAnimation } from "../../../services/animation";

export default {
  title: "Examples/Animation",
  parameters: {
    docs: {
      description: {
        component: "Демонстрация системы анимаций GraphAnimation с различными timing функциями",
      },
    },
  },
} as Meta;

interface AnimationBoxProps {
  style: React.CSSProperties;
}

globalScheduler.start();

const AnimationBox: React.FC<AnimationBoxProps> = ({ style }) => (
  <div
    style={{
      position: "absolute",
      backgroundColor: "#4CAF50",
      border: "2px solid #2196F3",
      borderRadius: "8px",
      transition: "none", // Disable CSS transitions
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "white",
      fontWeight: "bold",
      ...style, // Spread animated style props
    }}
  >
    Animation Box
  </div>
);

export const BasicAnimation: StoryFn = () => {
  const [style, setStyle] = useState<React.CSSProperties>({
    left: 50,
    top: 50,
    width: 100,
    height: 100,
    opacity: 1,
  });
  const [isRunning, setIsRunning] = useState(false);
  const animationRef = useRef<GraphAnimation | null>(null);

  const animationCallback = useCallback((newParams: any) => {
    setStyle({
      left: newParams.x,
      top: newParams.y,
      width: newParams.width,
      height: newParams.height,
      opacity: newParams.opacity,
    });
  }, []);

  useEffect(() => {
    animationRef.current = new GraphAnimation(animationCallback, {
      timing: "ease-in-out",
      duration: 2000,
    });

    return () => {
      animationRef.current?.stop();
    };
  }, [animationCallback]);

  const startAnimation = () => {
    if (!animationRef.current) return;

    setIsRunning(true);
    // Convert current style to animation params
    const currentParams = {
      x: (style.left as number) || 50,
      y: (style.top as number) || 50,
      width: (style.width as number) || 100,
      height: (style.height as number) || 100,
      opacity: (style.opacity as number) || 1,
    };

    animationRef.current.setCurrentParams(currentParams);
    animationRef.current.start(
      {
        x: 400,
        y: 200,
        width: 150,
        height: 150,
        opacity: 0.7,
      },
      {
        duration: 2000,
        timing: "ease-in-out",
      }
    );

    // Monitor animation state
    const checkState = () => {
      if (animationRef.current?.animationState === "completed") {
        setIsRunning(false);
      } else if (animationRef.current?.animationState === "running") {
        setTimeout(checkState, 50);
      }
    };
    setTimeout(checkState, 50);
  };

  const resetAnimation = () => {
    animationRef.current?.stop();
    setStyle({ left: 50, top: 50, width: 100, height: 100, opacity: 1 });
    setIsRunning(false);
  };

  return (
    <div style={{ position: "relative", width: "600px", height: "400px", border: "1px solid #ccc" }}>
      <AnimationBox style={style} />

      <div style={{ position: "absolute", bottom: "10px", left: "10px" }}>
        <button onClick={startAnimation} disabled={isRunning} style={{ marginRight: "10px" }}>
          {isRunning ? "Анимация идет..." : "Запустить анимацию"}
        </button>
        <button onClick={resetAnimation}>Сбросить</button>
      </div>
    </div>
  );
};

export const TimingComparison: StoryFn = () => {
  const [positions, setPositions] = useState({
    linear: { x: 50 },
    "ease-in": { x: 50 },
    "ease-out": { x: 50 },
    "ease-in-out": { x: 50 },
  });

  const animationsRef = useRef<Record<TimingFunction, GraphAnimation>>({} as any);
  const rafIdsRef = useRef<Record<TimingFunction, number | null>>({} as any);

  useEffect(() => {
    const timings: TimingFunction[] = ["linear", "ease-in", "ease-out", "ease-in-out"];

    timings.forEach((timing) => {
      rafIdsRef.current[timing] = null;

      animationsRef.current[timing] = new GraphAnimation(
        (params) => {
          // Cancel previous RAF for this timing
          if (rafIdsRef.current[timing]) {
            cancelAnimationFrame(rafIdsRef.current[timing]!);
          }

          // Schedule state update on next frame
          rafIdsRef.current[timing] = requestAnimationFrame(() => {
            setPositions((prev) => ({
              ...prev,
              [timing]: params,
            }));
            rafIdsRef.current[timing] = null;
          });
        },
        { timing, duration: 2000 }
      );
    });

    return () => {
      Object.values(animationsRef.current).forEach((animation) => animation?.stop());
      // Cancel all pending RAFs
      Object.values(rafIdsRef.current).forEach((rafId) => {
        if (rafId) {
          cancelAnimationFrame(rafId);
        }
      });
    };
  }, []);

  const startComparison = () => {
    Object.entries(animationsRef.current).forEach(([_timing, animation]) => {
      if (animation) {
        animation.setCurrentParams({ x: 50 });
        animation.start({ x: 450 });
      }
    });
  };

  const resetComparison = () => {
    Object.values(animationsRef.current).forEach((animation) => animation?.stop());
    setPositions({
      linear: { x: 50 },
      "ease-in": { x: 50 },
      "ease-out": { x: 50 },
      "ease-in-out": { x: 50 },
    });
  };

  return (
    <div style={{ width: "600px", height: "400px", border: "1px solid #ccc" }}>
      {Object.entries(positions).map(([timing, pos], index) => (
        <div key={timing} style={{ position: "relative", height: "80px", marginBottom: "10px" }}>
          <span style={{ position: "absolute", left: "10px", top: "30px", fontWeight: "bold" }}>{timing}:</span>
          <div
            style={{
              position: "absolute",
              left: pos.x,
              top: "25px",
              width: "40px",
              height: "30px",
              backgroundColor: ["#FF5722", "#2196F3", "#4CAF50", "#FF9800"][index],
              borderRadius: "4px",
            }}
          />
        </div>
      ))}

      <div style={{ position: "absolute", bottom: "10px", left: "10px" }}>
        <button onClick={startComparison} style={{ marginRight: "10px" }}>
          Сравнить timing функции
        </button>
        <button onClick={resetComparison}>Сбросить</button>
      </div>
    </div>
  );
};

export const RestartableAnimation: StoryFn = () => {
  const [params, setParams] = useState({ x: 50, y: 100 });
  const animationRef = useRef<GraphAnimation | null>(null);
  const rafIdRef = useRef<number | null>(null);

  useEffect(() => {
    animationRef.current = new GraphAnimation(
      (newParams) => {
        // Cancel previous RAF if it exists
        if (rafIdRef.current) {
          cancelAnimationFrame(rafIdRef.current);
        }

        // Schedule state update on next frame
        rafIdRef.current = requestAnimationFrame(() => {
          setParams(newParams as { x: number; y: number });
          rafIdRef.current = null;
        });
      },
      {
        timing: "ease-in-out",
        duration: 1500,
      }
    );

    return () => {
      animationRef.current?.stop();
      // Cancel any pending RAF
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, []);

  const animateToRandom = () => {
    if (!animationRef.current) return;

    const targetX = Math.random() * 400 + 50;
    const targetY = Math.random() * 200 + 50;

    animationRef.current.setCurrentParams(params);
    animationRef.current.start({ x: targetX, y: targetY });
  };

  return (
    <div style={{ position: "relative", width: "600px", height: "400px", border: "1px solid #ccc" }}>
      <div
        style={{
          position: "absolute",
          left: params.x,
          top: params.y,
          width: "60px",
          height: "60px",
          backgroundColor: "#9C27B0",
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "white",
          fontSize: "12px",
          fontWeight: "bold",
        }}
      >
        Click!
      </div>

      <div style={{ position: "absolute", bottom: "10px", left: "10px" }}>
        <button onClick={animateToRandom}>Переместить в случайную точку</button>
        <p style={{ margin: "10px 0", fontSize: "14px" }}>Кликайте несколько раз подряд - анимация перезапускается!</p>
      </div>
    </div>
  );
};

export const WithHook: StoryFn = () => {
  const [style, setStyle] = useState<React.CSSProperties>({
    transform: "translate(50px, 100px) scale(1)",
    opacity: 1,
  });

  const { start, stop, isRunning } = useGraphAnimation({
    onUpdate: (newParams) => {
      setStyle({
        transform: `translate(${newParams.x}px, ${newParams.y}px) scale(${newParams.scale})`,
        opacity: newParams.opacity,
      });
    },
    defaultConfig: {
      timing: "ease-in-out",
      duration: 1500,
    },
  });

  const animateToRandom = () => {
    const targetX = Math.random() * 400 + 50;
    const targetY = Math.random() * 200 + 50;
    const targetScale = 0.5 + Math.random() * 1.5; // 0.5 to 2.0
    const targetOpacity = 0.3 + Math.random() * 0.7; // 0.3 to 1.0

    start({
      x: targetX,
      y: targetY,
      scale: targetScale,
      opacity: targetOpacity,
    });
  };

  const resetPosition = () => {
    start({
      x: 50,
      y: 100,
      scale: 1,
      opacity: 1,
    });
  };

  return (
    <div style={{ position: "relative", width: "600px", height: "400px", border: "1px solid #ccc" }}>
      <div
        style={{
          position: "absolute",
          width: "80px",
          height: "80px",
          backgroundColor: "#E91E63",
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "white",
          fontSize: "12px",
          fontWeight: "bold",
          transition: "none",
          ...style, // Apply animated styles (transform and opacity)
        }}
      >
        Hook!
      </div>

      <div style={{ position: "absolute", bottom: "10px", left: "10px" }}>
        <button onClick={animateToRandom} disabled={isRunning} style={{ marginRight: "10px" }}>
          {isRunning ? "Анимация..." : "Случайная позиция"}
        </button>
        <button onClick={resetPosition} style={{ marginRight: "10px" }}>
          Сбросить
        </button>
        <button onClick={stop}>Остановить</button>
        <p style={{ margin: "10px 0", fontSize: "14px" }}>
          Пример с useGraphAnimation hook - автоматическая синхронизация с React!
        </p>
      </div>
    </div>
  );
};

export const StyleBasedAnimation: StoryFn = () => {
  const [style, setStyle] = useState<React.CSSProperties>({
    transform: "translate(100px, 100px) scale(1) rotate(0deg)",
    opacity: 1,
    backgroundColor: "#2196F3",
  });

  const { start, stop, isRunning } = useGraphAnimation({
    onUpdate: (params) => {
      setStyle({
        transform: `translate(${params.x}px, ${params.y}px) scale(${params.scale}) rotate(${params.rotation}deg)`,
        opacity: params.opacity,
        backgroundColor: `hsl(${params.hue}, 70%, 50%)`,
      });
    },
    defaultConfig: {
      timing: "ease-in-out",
      duration: 2000,
    },
  });

  const morphAnimation = () => {
    start({
      x: Math.random() * 400 + 50,
      y: Math.random() * 200 + 50,
      scale: 0.5 + Math.random() * 2,
      rotation: Math.random() * 360,
      opacity: 0.4 + Math.random() * 0.6,
      hue: Math.random() * 360,
    });
  };

  const resetMorph = () => {
    start({
      x: 100,
      y: 100,
      scale: 1,
      rotation: 0,
      opacity: 1,
      hue: 210, // Blue
    });
  };

  return (
    <div style={{ position: "relative", width: "600px", height: "400px", border: "1px solid #ccc" }}>
      <div
        style={{
          position: "absolute",
          width: "100px",
          height: "100px",
          borderRadius: "20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "white",
          fontSize: "14px",
          fontWeight: "bold",
          transition: "none",
          ...style, // All animated properties through style
        }}
      >
        Style!
      </div>

      <div style={{ position: "absolute", bottom: "10px", left: "10px" }}>
        <button onClick={morphAnimation} disabled={isRunning} style={{ marginRight: "10px" }}>
          {isRunning ? "Морфирую..." : "Морфинг"}
        </button>
        <button onClick={resetMorph} style={{ marginRight: "10px" }}>
          Сбросить
        </button>
        <button onClick={stop}>Остановить</button>
        <p style={{ margin: "10px 0", fontSize: "14px" }}>
          Анимация только через style - position, scale, rotation, color, opacity!
        </p>
      </div>
    </div>
  );
};
