import type { KeyboardEvent } from "react";

/** Enter/Space 로 클릭 가능한 요소를 키보드로도 실행되게 하는 onKeyDown 핸들러 */
export function onActivate(fn: () => void) {
  return (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fn();
    }
  };
}
