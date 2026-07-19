import React from "react";
import { createRoot } from "react-dom/client";
import { ReactLiveEditor } from "./ReactLiveEditor";

function arePropsEqual(previousProps, nextProps) {
  if (previousProps === nextProps) {
    return true;
  }

  const previousKeys = Object.keys(previousProps);
  const nextKeys = Object.keys(nextProps);
  if (previousKeys.length !== nextKeys.length) {
    return false;
  }

  for (const key of nextKeys) {
    if (
      !Object.prototype.hasOwnProperty.call(previousProps, key) ||
      !Object.is(previousProps[key], nextProps[key])
    ) {
      return false;
    }
  }

  return true;
}

export function mountLiveEditor(container, initialProps) {
  const root = createRoot(container);
  let currentProps = { ...initialProps };

  function render() {
    root.render(<ReactLiveEditor {...currentProps} />);
  }

  render();

  return {
    update(nextProps) {
      const mergedProps = {
        ...currentProps,
        ...nextProps,
      };
      if (arePropsEqual(currentProps, mergedProps)) {
        return;
      }
      currentProps = mergedProps;
      render();
    },
    unmount() {
      root.unmount();
    },
  };
}
