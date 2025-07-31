import React from "react";

interface ChartContainerProps {
  children: React.ReactNode;
  chartData: unknown[];
  onZoomOut: () => void;
  canZoomOut: boolean;
  fallbackMessage: string;
}

export const ChartContainer: React.FC<ChartContainerProps> = ({
  children,
  chartData,
  onZoomOut,
  canZoomOut,
  fallbackMessage,
}) => {
  return (
    <div className="w-full">
      <div className="flex justify-end space-x-2 mb-2">
        <button
          onClick={onZoomOut}
          disabled={!canZoomOut}
          className="p-1 rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-50"
        >
          Zoom Out
        </button>
      </div>
      <div style={{ width: "100%", height: "100%" }}>
        {chartData.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-500">{fallbackMessage}</p>
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
};
