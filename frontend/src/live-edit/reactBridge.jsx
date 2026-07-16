import React from "react";
import { createRoot } from "react-dom/client";
import { ReactLiveEditor } from "./ReactLiveEditor";

export function mountLiveEditor(container, initialProps) {
  const root = createRoot(container);
  let currentProps = { ...initialProps };

  function render() {
    root.render(<ReactLiveEditor {...currentProps} />);
  }

  render();

  return {
    update(nextProps) {
      currentProps = {
        ...currentProps,
        ...nextProps,
      };
      render();
    },
    unmount() {
      root.unmount();
    },
  };
}
