import React, { useLayoutEffect, useState } from "react";

import { Button, Text, ThemeProvider } from "@gravity-ui/uikit";
import type { Meta, StoryFn } from "@storybook/react";

import { GraphAnimationAdvanced } from "../../../services/animation";

import "@gravity-ui/uikit/styles/styles.css";

const meta: Meta = {
  title: "Examples/Animation/Advanced Simple",
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;

// Простой интерфейс для демонстрации
interface SimpleParams {
  x: number;
  y: number;
  scale: number;
}

export const AdvancedSimpleExample: StoryFn = () => {
  const [style, setStyle] = useState<React.CSSProperties>({
    position: "absolute",
    left: 50,
    top: 50,
    width: 80,
    height: 80,
    borderRadius: "50%",
    backgroundColor: "#4ecdc4",
    border: "3px solid #45b7b8",
    transition: "none",
  });

  const [log, setLog] = useState<string[]>([]);

  const addToLog = (message: string) => {
    setLog((prev) => [...prev.slice(-3), `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  useLayoutEffect(() => {
    // Простая продвинутая анимация
    const animation = new GraphAnimationAdvanced<SimpleParams>(
      (params) => {
        setStyle({
          position: "absolute",
          left: params.x,
          top: params.y,
          width: 80 * params.scale,
          height: 80 * params.scale,
          borderRadius: "50%",
          backgroundColor: "#4ecdc4",
          border: "3px solid #45b7b8",
          transition: "none",
        });
      },
      {
        timing: "ease-in-out",
        duration: 1500,
        infinite: true,

        // Хук init - модифицируем параметры
        init: (startParams) => {
          addToLog(`🚀 Init: x=${startParams.x}, scale=${startParams.scale}`);
          return {
            ...startParams,
            scale: Math.max(startParams.scale, 0.5), // Минимальный scale
          };
        },

        // Хук progress - добавляем пульсацию
        progress: ({ progress, params }) => {
          const pulseEffect = 1 + Math.sin(progress * Math.PI * 6) * 0.1;
          return {
            x: params.x,
            y: params.y,
            scale: params.scale * pulseEffect,
          };
        },

        // Хук end - логируем завершение
        end: ({ progress, infinite }) => {
          addToLog(`🏁 End: progress=${progress.toFixed(2)}, infinite=${infinite}`);
        },
      }
    );

    // Запускаем анимацию
    animation.setCurrentParams({ x: 50, y: 50, scale: 1 });
    animation.start({ x: 300, y: 150, scale: 1.5 });

    return () => {
      animation.stop();
    };
  }, []);

  const restart = () => {
    setLog([]);
    window.location.reload();
  };

  return (
    <ThemeProvider theme="light">
      <div style={{ width: "100%", height: "100vh", position: "relative", background: "#f0f0f0" }}>
        {/* Анимированный элемент */}
        <div style={style} />

        {/* Информационная панель */}
        <div
          style={{
            position: "absolute",
            top: 250,
            left: 50,
            background: "white",
            border: "1px solid #ddd",
            borderRadius: "8px",
            padding: "20px",
            maxWidth: "500px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
          }}
        >
          <Text variant="header-2" style={{ marginBottom: "12px" }}>
            GraphAnimationAdvanced - Простой пример
          </Text>

          <div style={{ marginBottom: "12px" }}>
            <Text variant="body-1" style={{ fontWeight: "bold", marginBottom: "6px" }}>
              API с хуками:
            </Text>
            <Text variant="caption-1" style={{ color: "#666" }}>
              • <code>init</code> - обработка параметров перед началом
              <br />• <code>progress</code> - кастомная интерполяция
              <br />• <code>end</code> - действия при завершении цикла
              <br />• <code>infinite: true</code> - автоматические циклы
            </Text>
          </div>

          <div style={{ marginBottom: "16px" }}>
            <Text variant="body-1" style={{ fontWeight: "bold", marginBottom: "6px" }}>
              Лог событий:
            </Text>
            <div
              style={{
                background: "#f8f8f8",
                border: "1px solid #ddd",
                borderRadius: "4px",
                padding: "8px",
                minHeight: "60px",
                fontFamily: "monospace",
                fontSize: "11px",
              }}
            >
              {log.length === 0 ? "Ожидание..." : log.map((entry, i) => <div key={i}>{entry}</div>)}
            </div>
          </div>

          <Button size="s" view="outlined" onClick={restart}>
            🔄 Перезапустить
          </Button>

          <div style={{ marginTop: "12px" }}>
            <Text variant="caption-1" style={{ color: "#888" }}>
              Использование: <code>new GraphAnimationAdvanced&lt;SimpleParams&gt;(callback, config)</code>
            </Text>
          </div>
        </div>
      </div>
    </ThemeProvider>
  );
};
