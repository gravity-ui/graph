import React, { useCallback, useLayoutEffect, useState } from "react";

import { Button, Flex, Text, ThemeProvider } from "@gravity-ui/uikit";
import type { Meta, StoryFn } from "@storybook/react";

import { GraphAnimation, useGraphAnimation } from "../../../services/animation";

import "@gravity-ui/uikit/styles/styles.css";

const meta: Meta = {
  title: "Examples/Animation/Infinite Animations",
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;

// Компонент для демонстрации анимации
const AnimationBox: React.FC<{ style: React.CSSProperties }> = ({ style }) => (
  <div
    style={{
      position: "absolute",
      background: "linear-gradient(45deg, #ff6b6b, #4ecdc4)",
      borderRadius: "10px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "white",
      fontWeight: "bold",
      border: "2px solid white",
      boxShadow: "0 4px 15px rgba(0,0,0,0.2)",
      ...style,
    }}
  >
    ∞
  </div>
);

export const InfiniteAnimations: StoryFn = () => {
  // Простая бесконечная анимация
  const [simpleStyle, setSimpleStyle] = useState<React.CSSProperties>({
    left: 50,
    top: 50,
    width: 80,
    height: 80,
  });

  // Пульсирующая анимация
  const [pulseStyle, setPulseStyle] = useState<React.CSSProperties>({
    left: 200,
    top: 50,
    width: 80,
    height: 80,
    transform: "scale(1)",
  });

  // Вращающаяся анимация
  const [rotateStyle, setRotateStyle] = useState<React.CSSProperties>({
    left: 350,
    top: 50,
    width: 80,
    height: 80,
    transform: "rotate(0deg)",
  });

  // Плавающая анимация
  const {
    start: startFloat,
    stop: stopFloat,
    isRunning: isFloatRunning,
    isInfinite: isFloatInfinite,
  } = useGraphAnimation({
    onUpdate: (params) => {
      setFloatStyle({
        left: params.x,
        top: params.y,
        width: 80,
        height: 80,
        opacity: params.opacity,
      });
    },
  });

  const [floatStyle, setFloatStyle] = useState<React.CSSProperties>({
    left: 500,
    top: 50,
    width: 80,
    height: 80,
    opacity: 1,
  });

  useLayoutEffect(() => {
    // 1. Простая бесконечная анимация влево-вправо
    const simpleAnimation = new GraphAnimation(
      (params) => {
        setSimpleStyle({
          left: params.x,
          top: 50,
          width: 80,
          height: 80,
        });
      },
      {
        timing: "ease-in-out",
        duration: 1500,
        infinite: true,
      }
    );

    simpleAnimation.setCurrentParams({ x: 50 });
    simpleAnimation.start({ x: 150 });

    // 2. Пульсирующая анимация
    const pulseAnimation = new GraphAnimation(
      (params) => {
        setPulseStyle({
          left: 200,
          top: 50,
          width: 80,
          height: 80,
          transform: `scale(${params.scale})`,
        });
      },
      {
        timing: "ease-in-out",
        duration: 1000,
        infinite: true,
      }
    );

    pulseAnimation.setCurrentParams({ scale: 1 });
    pulseAnimation.start({ scale: 1.5 });

    // 3. Вращающаяся анимация
    const rotateAnimation = new GraphAnimation(
      (params) => {
        setRotateStyle({
          left: 350,
          top: 50,
          width: 80,
          height: 80,
          transform: `rotate(${params.rotation}deg)`,
        });
      },
      {
        timing: "linear",
        duration: 2000,
        infinite: true,
      }
    );

    rotateAnimation.setCurrentParams({ rotation: 0 });
    rotateAnimation.start({ rotation: 360 });

    // Cleanup
    return () => {
      simpleAnimation.stop();
      pulseAnimation.stop();
      rotateAnimation.stop();
    };
  }, []);

  const startFloatingAnimation = useCallback(() => {
    startFloat(
      {
        x: 600,
        y: 150,
        opacity: 0.5,
      },
      {
        timing: "ease-in-out",
        duration: 2000,
        infinite: true,
      }
    );
  }, [startFloat]);

  const stopFloatingAnimation = useCallback(() => {
    stopFloat();
    setFloatStyle({
      left: 500,
      top: 50,
      width: 80,
      height: 80,
      opacity: 1,
    });
  }, [stopFloat]);

  return (
    <ThemeProvider theme="light">
      <div style={{ width: "100%", height: "100vh", position: "relative", background: "#f5f5f5" }}>
        {/* Анимированные блоки */}
        <AnimationBox style={simpleStyle} />
        <AnimationBox style={pulseStyle} />
        <AnimationBox style={rotateStyle} />
        <AnimationBox style={floatStyle} />

        {/* Подписи */}
        <div style={{ position: "absolute", left: 50, top: 150, fontSize: "12px", textAlign: "center" }}>
          Влево-вправо
          <br />
          ease-in-out
        </div>
        <div style={{ position: "absolute", left: 200, top: 150, fontSize: "12px", textAlign: "center" }}>
          Пульсация
          <br />
          ease-in-out
        </div>
        <div style={{ position: "absolute", left: 350, top: 150, fontSize: "12px", textAlign: "center" }}>
          Вращение
          <br />
          linear
        </div>
        <div style={{ position: "absolute", left: 500, top: 150, fontSize: "12px", textAlign: "center" }}>
          Плавание
          <br />
          {isFloatInfinite ? "♾️ infinite" : "🔄 manual"}
        </div>

        {/* Панель управления */}
        <div
          style={{
            position: "absolute",
            top: 220,
            left: 50,
            background: "rgba(0, 0, 0, 0.8)",
            color: "white",
            padding: "20px",
            borderRadius: "12px",
            minWidth: "600px",
          }}
        >
          <Text variant="header-2" style={{ color: "white", marginBottom: "16px" }}>
            Бесконечные анимации с параметром infinite
          </Text>

          <div style={{ marginBottom: "16px" }}>
            <Text variant="body-1" style={{ color: "rgba(255,255,255,0.9)", marginBottom: "8px" }}>
              Автоматические бесконечные анимации:
            </Text>
            <Text variant="caption-1" style={{ color: "rgba(255,255,255,0.7)" }}>
              • Первые три блока запускаются автоматически с <code>infinite: true</code>
              <br />
              • Они автоматически возвращаются в исходное состояние и повторяются
              <br />• Используют разные timing функции для различных эффектов
            </Text>
          </div>

          <div style={{ marginBottom: "16px" }}>
            <Text variant="body-1" style={{ color: "rgba(255,255,255,0.9)", marginBottom: "8px" }}>
              Управляемая анимация (useGraphAnimation):
            </Text>
            <Flex gap={2}>
              <Button size="m" view="action" onClick={startFloatingAnimation} disabled={isFloatRunning}>
                {isFloatRunning ? "Анимируется..." : "Запустить плавание"}
              </Button>
              <Button size="m" view="outlined" onClick={stopFloatingAnimation} disabled={!isFloatRunning}>
                Остановить
              </Button>
            </Flex>
          </div>

          <div>
            <Text variant="body-1" style={{ color: "rgba(255,255,255,0.9)", marginBottom: "8px" }}>
              Преимущества infinite: true
            </Text>
            <Text variant="caption-1" style={{ color: "rgba(255,255,255,0.7)" }}>
              ✅ Нет необходимости в setTimeout и циклах
              <br />
              ✅ Автоматическое управление через scheduler
              <br />
              ✅ Плавные переходы между циклами
              <br />
              ✅ Простой API - один вызов start()
              <br />❌ Старый подход требовал сложной логики перезапуска
            </Text>
          </div>
        </div>
      </div>
    </ThemeProvider>
  );
};
