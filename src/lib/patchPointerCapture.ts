if (typeof window !== "undefined" && typeof Element !== "undefined") {
  const original = Element.prototype.releasePointerCapture;
  Element.prototype.releasePointerCapture = function (pointerId: number) {
    try {
      if (this.hasPointerCapture?.(pointerId)) {
        original.call(this, pointerId);
      }
    } catch {
    }
  };
}