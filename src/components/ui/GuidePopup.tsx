"use client";

import { X } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";

interface GuidePopupProps {
  isVisible: boolean;
  onClose: () => void;
  onDontShowAgain: () => void;
  targetElementRef: React.RefObject<HTMLElement>;
  title: string;
  content: React.ReactNode;
  position?: "top" | "bottom" | "left" | "right";
}

export const GuidePopup: React.FC<GuidePopupProps> = ({
  isVisible,
  onClose,
  onDontShowAgain,
  targetElementRef,
  title,
  content,
  position = "bottom",
}) => {
  const popupRef = useRef<HTMLDivElement>(null);
  const [popupPosition, setPopupPosition] = useState({ top: 0, left: 0 });
  const [arrowPosition, setArrowPosition] = useState({
    edge: "bottom" as "top" | "bottom" | "left" | "right",
    offset: 0,
    rotation: 0,
  });

  useEffect(() => {
    if (!isVisible || !targetElementRef.current || !popupRef.current) {
      return;
    }

    const updatePosition = (): void => {
      if (!targetElementRef.current || !popupRef.current) return;

      const targetRect = targetElementRef.current.getBoundingClientRect();
      const popupRect = popupRef.current.getBoundingClientRect();
      const scrollY = window.scrollY;
      const scrollX = window.scrollX;

      // Calculate target center in viewport coordinates
      const targetCenterX = targetRect.left + targetRect.width / 2;
      const targetCenterY = targetRect.top + targetRect.height / 2;

      // Position popup near target (prefer right side, then adjust based on space)
      const gap = 20;
      let top = 0;
      let left = 0;
      let arrowEdge: "top" | "bottom" | "left" | "right" = "left";
      let arrowOffset = 0;

      // Try to position popup to the right of target first
      const spaceOnRight = window.innerWidth - targetRect.right;
      const spaceOnLeft = targetRect.left;
      const spaceOnBottom = window.innerHeight - targetRect.bottom;

      // Determine best position based on available space
      // Arrow edge is the edge of the popup that faces the target
      if (spaceOnRight >= popupRect.width + gap) {
        // Position popup to the right of target
        // Arrow should be on left edge of popup, pointing left toward target
        arrowEdge = "left";
        left = targetRect.right + scrollX + gap;
        top =
          targetRect.top +
          scrollY +
          targetRect.height / 2 -
          popupRect.height / 2;
        arrowOffset = targetCenterY - (top - scrollY);
      } else if (spaceOnLeft >= popupRect.width + gap) {
        // Position popup to the left of target
        // Arrow should be on right edge of popup, pointing right toward target
        arrowEdge = "right";
        left = targetRect.left + scrollX - popupRect.width - gap;
        top =
          targetRect.top +
          scrollY +
          targetRect.height / 2 -
          popupRect.height / 2;
        arrowOffset = targetCenterY - (top - scrollY);
      } else if (spaceOnBottom >= popupRect.height + gap) {
        // Position popup below target
        // Arrow should be on top edge of popup, pointing up toward target
        arrowEdge = "top";
        top = targetRect.bottom + scrollY + gap;
        left =
          targetRect.left +
          scrollX +
          targetRect.width / 2 -
          popupRect.width / 2;
        arrowOffset = targetCenterX - (left - scrollX);
      } else {
        // Position popup above target
        // Arrow should be on bottom edge of popup, pointing down toward target
        arrowEdge = "bottom";
        top = targetRect.top + scrollY - popupRect.height - gap;
        left =
          targetRect.left +
          scrollX +
          targetRect.width / 2 -
          popupRect.width / 2;
        arrowOffset = targetCenterX - (left - scrollX);
      }

      // Keep popup within viewport
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const padding = 10;

      if (left < padding) left = padding;
      if (left + popupRect.width > viewportWidth - padding) {
        left = viewportWidth - popupRect.width - padding;
      }
      if (top < padding) top = padding;
      if (top + popupRect.height > viewportHeight + scrollY - padding) {
        top = viewportHeight + scrollY - popupRect.height - padding;
      }

      // Recalculate arrow offset after viewport adjustments
      // Arrow offset is relative to the popup's position
      if (arrowEdge === "left" || arrowEdge === "right") {
        // Arrow on left/right edge, adjust vertical position to align with target center
        // Calculate where target center is relative to popup top
        const targetYRelativeToPopup = targetCenterY - (top - scrollY);
        arrowOffset = targetYRelativeToPopup;
        // Clamp arrow to popup bounds (with some padding)
        arrowOffset = Math.max(
          20,
          Math.min(popupRect.height - 20, arrowOffset),
        );
      } else {
        // Arrow on top/bottom edge, adjust horizontal position to align with target center
        // Calculate where target center is relative to popup left
        const targetXRelativeToPopup = targetCenterX - (left - scrollX);
        arrowOffset = targetXRelativeToPopup;
        // Clamp arrow to popup bounds (with some padding)
        arrowOffset = Math.max(20, Math.min(popupRect.width - 20, arrowOffset));
      }

      setPopupPosition({ top, left });
      setArrowPosition({ edge: arrowEdge, offset: arrowOffset, rotation: 0 });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isVisible, targetElementRef, position]);

  if (!isVisible || !targetElementRef.current) {
    return null;
  }

  return (
    <>
      {/* Backdrop - very subtle so users can see target elements */}
      <div className="fixed inset-0 z-[200] bg-black/10" onClick={onClose} />
      {/* Popup */}
      <div
        ref={popupRef}
        className="fixed z-[201] bg-gradient-to-br from-emerald-50 to-amber-50 rounded-lg shadow-xl border-2 border-emerald-300 max-w-sm p-5 animate-in fade-in zoom-in-95 duration-200"
        style={{
          top: `${popupPosition.top}px`,
          left: `${popupPosition.left}px`,
        }}
      >
        {/* Arrow pointing FROM popup TO target element */}
        {/* Arrow on bottom edge - points DOWN toward target below popup */}
        {arrowPosition.edge === "bottom" && (
          <svg
            className="absolute"
            style={{
              bottom: "-10px",
              left: `${arrowPosition.offset}px`,
              transform: "translateX(-50%)",
            }}
            width="20"
            height="10"
            viewBox="0 0 20 10"
          >
            <path
              d="M 0 0 L 10 10 L 20 0 Z"
              fill="#86efac"
              stroke="#10b981"
              strokeWidth="2"
            />
          </svg>
        )}
        {/* Arrow on top edge - points UP toward target above popup */}
        {arrowPosition.edge === "top" && (
          <svg
            className="absolute"
            style={{
              top: "-10px",
              left: `${arrowPosition.offset}px`,
              transform: "translateX(-50%)",
            }}
            width="20"
            height="10"
            viewBox="0 0 20 10"
          >
            <path
              d="M 0 10 L 10 0 L 20 10 Z"
              fill="#86efac"
              stroke="#10b981"
              strokeWidth="2"
            />
          </svg>
        )}
        {/* Arrow on right edge - points RIGHT toward target to the right of popup */}
        {arrowPosition.edge === "right" && (
          <svg
            className="absolute"
            style={{
              right: "-10px",
              top: `${arrowPosition.offset}px`,
              transform: "translateY(-50%)",
            }}
            width="10"
            height="20"
            viewBox="0 0 10 20"
          >
            <path
              d="M 0 0 L 10 10 L 0 20 Z"
              fill="#86efac"
              stroke="#10b981"
              strokeWidth="2"
            />
          </svg>
        )}
        {/* Arrow on left edge - points LEFT toward target to the left of popup */}
        {arrowPosition.edge === "left" && (
          <svg
            className="absolute"
            style={{
              left: "-10px",
              top: `${arrowPosition.offset}px`,
              transform: "translateY(-50%)",
            }}
            width="10"
            height="20"
            viewBox="0 0 10 20"
          >
            <path
              d="M 10 0 L 0 10 L 10 20 Z"
              fill="#86efac"
              stroke="#10b981"
              strokeWidth="2"
            />
          </svg>
        )}

        <div className="flex items-start justify-between mb-3">
          <h3 className="font-semibold text-emerald-900 text-base leading-tight">
            {title}
          </h3>
          <button
            onClick={onClose}
            className="text-emerald-600 hover:text-emerald-800 hover:bg-emerald-100 rounded-full p-1 transition-colors ml-2 flex-shrink-0"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="text-sm text-emerald-800 mb-4 leading-relaxed">
          {content}
        </div>

        <div className="flex items-center justify-between gap-3 pt-3 border-t border-emerald-200">
          <label className="flex items-center gap-2 text-xs text-emerald-700 cursor-pointer hover:text-emerald-900 transition-colors">
            <input
              type="checkbox"
              onChange={(e) => {
                if (e.target.checked) {
                  onDontShowAgain();
                }
              }}
              className="rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500 focus:ring-2"
            />
            <span>Don&apos;t show me this again</span>
          </label>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded-md transition-all duration-300 hover:scale-105 shadow-sm"
          >
            Got it
          </button>
        </div>
      </div>
    </>
  );
};
