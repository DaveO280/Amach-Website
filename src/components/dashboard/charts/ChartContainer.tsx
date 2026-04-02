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
          className="px-3 py-1 rounded-lg text-xs font-medium transition-colors disabled:opacity-40"
          style={{
            background: "transparent",
            border: "1px solid rgba(0,107,79,0.25)",
            color: "#006B4F",
          }}
          onMouseEnter={(e) => {
            if (canZoomOut)
              (e.currentTarget as HTMLButtonElement).style.background =
                "rgba(0,107,79,0.07)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background =
              "transparent";
          }}
        >
          Zoom Out
        </button>
      </div>
      <div style={{ width: "100%", height: "100%" }}>
        {chartData.length === 0 ? (
          <div className="flex items-center justify-center h-full py-12">
            <p style={{ color: "#6B8C7A", fontSize: 13 }}>{fallbackMessage}</p>
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
};
