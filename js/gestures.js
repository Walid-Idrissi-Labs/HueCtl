const TAP_SLOP_PX = 10;
const DOUBLE_TAP_MS = 280;

// Turns pointer input on the light surface into taps, double-taps and
// single-axis drags (the axis locks once the finger moves past the slop).
export function attachGestures(surface, handlers) {
  let active = null;
  let tapTimer = 0;

  function tap() {
    if (!handlers.doubleTapEnabled()) {
      handlers.onTap();
      return;
    }
    if (tapTimer) {
      window.clearTimeout(tapTimer);
      tapTimer = 0;
      handlers.onDoubleTap();
      return;
    }
    tapTimer = window.setTimeout(() => {
      tapTimer = 0;
      handlers.onTap();
    }, DOUBLE_TAP_MS);
  }

  surface.addEventListener("pointerdown", (event) => {
    if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
    active = { id: event.pointerId, x: event.clientX, y: event.clientY, axis: null };
    surface.setPointerCapture(event.pointerId);
  });

  surface.addEventListener("pointermove", (event) => {
    if (!active || event.pointerId !== active.id) return;
    const dx = event.clientX - active.x;
    const dy = event.clientY - active.y;

    if (!active.axis) {
      if (Math.hypot(dx, dy) < TAP_SLOP_PX) return;
      active.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      handlers.onDragStart(active.axis);
    }
    handlers.onDrag(active.axis, dx, dy);
  });

  surface.addEventListener("pointerup", (event) => {
    if (!active || event.pointerId !== active.id) return;
    if (active.axis) {
      handlers.onDragEnd();
    } else {
      tap();
    }
    active = null;
  });

  surface.addEventListener("pointercancel", () => {
    if (active?.axis) handlers.onDragEnd();
    active = null;
  });
}
