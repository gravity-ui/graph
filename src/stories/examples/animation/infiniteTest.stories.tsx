import React, { useLayoutEffect, useState } from "react";

import type { Meta, StoryFn } from "@storybook/react";

import { GraphAnimation } from "../../../services/animation";

const meta: Meta = {
  title: "Examples/Animation/Infinite Test",
};

export default meta;

export const InfiniteTest: StoryFn = () => {
  const [position, setPosition] = useState(0);

  useLayoutEffect(() => {
    const animation = new GraphAnimation(
      (params) => {
        setPosition(params.x);
      },
      {
        timing: "ease-in-out",
        duration: 1000,
        infinite: true,
      }
    );

    animation.setCurrentParams({ x: 0 });
    animation.start({ x: 200 });

    return () => {
      animation.stop();
    };
  }, []);

  return (
    <div style={{ padding: "50px", height: "200px", background: "#f0f0f0" }}>
      <div
        style={{
          width: "50px",
          height: "50px",
          background: "blue",
          borderRadius: "50%",
          transform: `translateX(${position}px)`,
          transition: "none",
        }}
      />
      <p>Position: {position.toFixed(1)}</p>
      <p>Infinite animation test - should move back and forth</p>
    </div>
  );
};
