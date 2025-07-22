import React, { useLayoutEffect, useMemo, useState } from "react";

import { Button, Flex, Text, ThemeProvider } from "@gravity-ui/uikit";
import type { Meta, StoryFn } from "@storybook/react";

import { GraphAnimationAdvanced } from "../../../services/animation";

import "@gravity-ui/uikit/styles/styles.css";

import { globalScheduler } from "../../../lib";

const meta: Meta = {
  title: "Examples/Animation/Advanced Animation",
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;

// Типы для демонстрации дженериков
interface CircleParams {
  x: number;
  y: number;
  radius: number;
  color: { r: number; g: number; b: number };
}

interface RenderParams {
  x: number;
  y: number;
  size: number;
  colorR: number;
  colorG: number;
  colorB: number;
}

globalScheduler.start();

export const AdvancedAnimationExample: StoryFn = () => {
  const [circleStyle, setCircleStyle] = useState<React.CSSProperties>({
    position: "absolute",
    left: 50,
    top: 50,
    width: 60,
    height: 60,
    borderRadius: "50%",
    backgroundColor: "rgb(100, 149, 237)",
    border: "3px solid rgb(70, 130, 180)",
    transition: "none",
  });

  const [log, setLog] = useState<string[]>([]);

  const addToLog = (message: string) => {
    setLog((prev) => [
      ...prev.slice(-4), // Keep only last 4 messages
      `${new Date().toLocaleTimeString()}: ${message}`,
    ]);
  };

  const advancedAnimation = useMemo(() => {
    // Создаем продвинутую анимацию с типизированными параметрами
    return new GraphAnimationAdvanced<CircleParams, RenderParams>(
      (renderParams: RenderParams) => {
        const backgroundColor = `rgb(${renderParams.colorR}, ${renderParams.colorG}, ${renderParams.colorB})`;
        const borderColor = `rgb(${Math.round(renderParams.colorR * 0.7)}, ${Math.round(renderParams.colorG * 0.7)}, ${Math.round(renderParams.colorB * 0.7)})`;

        setCircleStyle({
          position: "absolute",
          left: renderParams.x,
          top: renderParams.y,
          width: renderParams.size,
          height: renderParams.size,
          borderRadius: "50%",
          backgroundColor,
          border: `3px solid ${borderColor}`,
          transition: "none",
        });
      },
      {
        timing: "ease-in-out",
        duration: 2000,
        infinite: true,

        // Хук init - обрабатываем входные параметры
        init: (startParams: CircleParams) => {
          addToLog(`🚀 Init: Начинаем анимацию к x=${startParams.x}, y=${startParams.y}`);
          // Можем модифицировать параметры перед началом
          return {
            ...startParams,
            radius: Math.max(startParams.radius, 30), // Минимальный радиус
          };
        },

        // Хук progress - кастомная логика интерполяции
        progress: ({ progress, params }) => {
          const currentRadius = params.radius;
          const currentColor = params.color;

          // Создаем пульсирующий эффект
          const pulseEffect = 1 + Math.sin(progress * Math.PI * 4) * 0.1;
          const finalSize = currentRadius * 2 * pulseEffect;

          // Анимируем цвет
          const animatedColor = {
            r: Math.round(currentColor.r + Math.sin(progress * Math.PI * 2) * 50),
            g: Math.round(currentColor.g + Math.cos(progress * Math.PI * 2) * 50),
            b: Math.round(currentColor.b + Math.sin(progress * Math.PI * 3) * 50),
          };

          // Ограничиваем значения цвета
          const clampedColor = {
            r: Math.max(0, Math.min(255, animatedColor.r)),
            g: Math.max(0, Math.min(255, animatedColor.g)),
            b: Math.max(0, Math.min(255, animatedColor.b)),
          };

          addToLog(`🏁 progress:  progress=${progress.toFixed(2)}, ${JSON.stringify(params)}`);

          // Возвращаем числовые значения для совместимости с AnimationParameters
          return {
            x: params.x,
            y: params.y,
            size: finalSize,
            colorR: clampedColor.r,
            colorG: clampedColor.g,
            colorB: clampedColor.b,
          };
        },

        // Хук end - действия при завершении цикла
        end: ({ currentTime, startTime, progress, infinite }) => {
          const duration = currentTime - startTime;
          addToLog(
            `🏁 End: Цикл завершен за ${duration.toFixed(0)}мс, progress=${progress.toFixed(2)}, infinite=${infinite}`
          );
        },
      }
    );
  }, []);

  useLayoutEffect(() => {
    // Запускаем анимацию
    advancedAnimation.setCurrentParams({
      x: 50,
      y: 50,
      radius: 30,
      color: { r: 100, g: 149, b: 237 },
    });

    advancedAnimation.start({
      x: 400,
      y: 200,
      radius: 50,
      color: { r: 237, g: 100, b: 149 },
    });

    return () => {
      advancedAnimation.stop();
    };
  }, [advancedAnimation]);

  const restartAnimation = () => {
    setLog([]);
    console.log("restartAnimation");
    advancedAnimation.stop();
    advancedAnimation.setCurrentParams({
      x: 50,
      y: 50,
      radius: 30,
      color: { r: 100, g: 149, b: 237 },
    });
    advancedAnimation.start({
      x: 400,
      y: 200,
      radius: 50,
      color: { r: 237, g: 100, b: 149 },
    });
    // Перезагружаем компонент для демонстрации
    // window.location.reload();
  };

  return (
    <ThemeProvider theme="light">
      <div style={{ width: "100%", height: "100vh", position: "relative", background: "#f8f9fa" }}>
        {/* Анимированный круг */}
        <div style={circleStyle} />

        {/* Панель управления */}
        <div
          style={{
            position: "absolute",
            top: 320,
            left: 50,
            background: "white",
            border: "1px solid #ddd",
            borderRadius: "12px",
            padding: "24px",
            minWidth: "600px",
            maxWidth: "800px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
          }}
        >
          <Text variant="header-2" style={{ marginBottom: "16px" }}>
            GraphAnimationAdvanced с дженериками и хуками
          </Text>

          <div style={{ marginBottom: "16px" }}>
            <Text variant="body-1" style={{ marginBottom: "8px", fontWeight: "bold" }}>
              Особенности:
            </Text>
            <Text variant="caption-1" style={{ color: "#666" }}>
              • <strong>Типизированные параметры:</strong> <code>CircleParams</code> → <code>RenderParams</code>
              <br />• <strong>init hook:</strong> Обработка параметров перед началом анимации
              <br />• <strong>progress hook:</strong> Кастомная интерполяция с пульсацией и цветовыми переходами
              <br />• <strong>end hook:</strong> Логирование завершения каждого цикла
              <br />• <strong>infinite: true:</strong> Автоматические циклы туда-обратно
            </Text>
          </div>

          <div style={{ marginBottom: "16px" }}>
            <Text variant="body-1" style={{ marginBottom: "8px", fontWeight: "bold" }}>
              Лог событий:
            </Text>
            <div
              style={{
                background: "#f5f5f5",
                border: "1px solid #ddd",
                borderRadius: "6px",
                padding: "12px",
                minHeight: "100px",
                fontFamily: "monospace",
                fontSize: "12px",
                maxHeight: "120px",
                overflowY: "auto",
              }}
            >
              {log.length === 0 ? (
                <Text variant="caption-1" style={{ color: "#999" }}>
                  Ожидание событий анимации...
                </Text>
              ) : (
                log.map((entry, index) => (
                  <div key={index} style={{ marginBottom: "4px" }}>
                    {entry}
                  </div>
                ))
              )}
            </div>
          </div>

          <Flex gap={2}>
            <Button size="m" view="action" onClick={restartAnimation}>
              🔄 Перезапустить анимацию
            </Button>
          </Flex>

          <div style={{ marginTop: "16px" }}>
            <Text variant="caption-1" style={{ color: "#666" }}>
              <strong>Код:</strong>
              <br />
              <code>
                new GraphAnimationAdvanced&lt;CircleParams, RenderParams&gt;(callback, &#123; init, progress, end
                &#125;)
              </code>
            </Text>
          </div>
        </div>
      </div>
    </ThemeProvider>
  );
};
