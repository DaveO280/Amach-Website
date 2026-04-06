import type { ComponentProps } from "react";
import { useState } from "react";
import { BarChart } from "recharts";

export interface ChartZoomState {
  left: string | null;
  right: string | null;
  refAreaLeft: string;
  refAreaRight: string;
  top: number | "auto";
  bottom: number | "auto";
  zoomHistory: Array<{
    left: string | null;
    right: string | null;
    top: number | "auto";
    bottom: number | "auto";
  }>;
}

type ChartPointerHandler = NonNullable<
  ComponentProps<typeof BarChart>["onMouseDown"]
>;

function activeLabelToDayString(activeLabel: unknown): string | undefined {
  if (activeLabel == null) return undefined;
  return String(activeLabel);
}

export function useChartZoom<T extends { day: string }>(
  chartData: T[],
  valueKey: keyof T,
): {
  left: string | null;
  right: string | null;
  refAreaLeft: string;
  refAreaRight: string;
  top: number | "auto";
  bottom: number | "auto";
  zoomHistory: ChartZoomState["zoomHistory"];
  setRefAreaLeft: (v: string) => void;
  setRefAreaRight: (v: string) => void;
  handleZoomIn: () => void;
  handleZoomOut: () => void;
  handleMouseDown: ChartPointerHandler;
  handleMouseMove: ChartPointerHandler;
  handleMouseUp: ChartPointerHandler;
} {
  const [left, setLeft] = useState<string | null>(null);
  const [right, setRight] = useState<string | null>(null);
  const [refAreaLeft, setRefAreaLeft] = useState<string>("");
  const [refAreaRight, setRefAreaRight] = useState<string>("");
  const [top, setTop] = useState<number | "auto">("auto");
  const [bottom, setBottom] = useState<number | "auto">("auto");
  const [zoomHistory, setZoomHistory] = useState<ChartZoomState["zoomHistory"]>(
    [],
  );

  const handleZoomIn = (): void => {
    if (refAreaLeft === refAreaRight || refAreaRight === "") {
      setRefAreaLeft("");
      setRefAreaRight("");
      return;
    }
    setZoomHistory([...zoomHistory, { left, right, top, bottom }]);
    let leftDay = refAreaLeft;
    let rightDay = refAreaRight;
    if (leftDay > rightDay) {
      [leftDay, rightDay] = [rightDay, leftDay];
    }
    const rangeData = chartData.filter(
      (item) => item.day >= leftDay && item.day <= rightDay,
    );
    if (rangeData.length > 0) {
      const minValue = Math.min(
        ...rangeData.map((item) => Number(item[valueKey])),
      );
      const maxValue = Math.max(
        ...rangeData.map((item) => Number(item[valueKey])),
      );
      const padding = (maxValue - minValue) * 0.1;
      setRefAreaLeft("");
      setRefAreaRight("");
      setLeft(leftDay);
      setRight(rightDay);
      setBottom(Math.max(0, Math.floor(minValue - padding)));
      setTop(Math.ceil(maxValue + padding));
    }
  };

  const handleZoomOut = (): void => {
    if (zoomHistory.length === 0) {
      setLeft(null);
      setRight(null);
      setTop("auto");
      setBottom("auto");
      return;
    }
    const lastView = zoomHistory[zoomHistory.length - 1];
    setZoomHistory(zoomHistory.slice(0, -1));
    setLeft(lastView.left);
    setRight(lastView.right);
    setTop(lastView.top);
    setBottom(lastView.bottom);
  };

  const handleMouseDown: ChartPointerHandler = (nextState) => {
    const day = activeLabelToDayString(nextState.activeLabel);
    if (!day) return;
    setRefAreaLeft(day);
  };

  const handleMouseMove: ChartPointerHandler = (nextState) => {
    const day = activeLabelToDayString(nextState.activeLabel);
    if (!day || !refAreaLeft) return;
    setRefAreaRight(day);
  };

  const handleMouseUp: ChartPointerHandler = () => {
    if (refAreaLeft && refAreaRight) {
      handleZoomIn();
    }
    setRefAreaLeft("");
  };

  return {
    left,
    right,
    refAreaLeft,
    refAreaRight,
    top,
    bottom,
    zoomHistory,
    setRefAreaLeft,
    setRefAreaRight,
    handleZoomIn,
    handleZoomOut,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
  };
}
