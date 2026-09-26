"use client";

import type { View } from "@/lib/derive";

export default function Toast({ v }: { v: View }) {
  if (!v.toastShow) return null;
  return (
    <div className="toast">
      <span className="tdt" />
      {v.toast}
    </div>
  );
}
