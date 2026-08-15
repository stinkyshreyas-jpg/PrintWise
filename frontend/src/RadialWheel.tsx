import React, { useRef, useEffect, useState } from "react";

interface Option {
  label: string;
  value: any;
  iconUrl?: string;
}

interface RadialWheelProps {
  title: string;
  options: Option[];
  selectedIndex: number;
  onChange: (index: number) => void;
  size?: number;
  offsetX?: number;
  offsetY?: number;
  iconSize?: number;
  orientation?: "bottom" | "top" | "right" | "left";
  showCenterText?: boolean;
  fontSizeSelected?: string;
  fontSizeUnselected?: string;
  autoHide?: boolean;
  popDuration?: number; 
}

export default function RadialWheel({
  title,
  options,
  selectedIndex,
  onChange,
  size = 300,
  offsetX = 0,
  offsetY = 0,
  iconSize = 20,
  orientation = "bottom",
  showCenterText = true,
  fontSizeSelected = "18px",
  fontSizeUnselected = "14px",
  autoHide = false,
  popDuration = 750,
}: RadialWheelProps) {
  const isRight = orientation === "right";
  const isLeft = orientation === "left";
  const isTop = orientation === "top";
  const isHorizontal = isRight || isLeft;

  const wheelAreaRef = useRef<HTMLDivElement>(null);
  const isCooldown = useRef(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isAutoPopped, setIsAutoPopped] = useState(false);

  const [rotationDeg, setRotationDeg] = useState(0);

  const selectedIndexRef = useRef(selectedIndex);
  selectedIndexRef.current = selectedIndex;

  const optionsLengthRef = useRef(options.length);
  optionsLengthRef.current = options.length;

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const radius = size / 2;
  const innerRadius = radius * 0.3;
  const labelRadius = (radius + innerRadius) / 2;
  const totalOptions = options.length;
  const sliceAngle = 360 / totalOptions;

  const isFirstRender = useRef(true);
  const currentSelectedValue = options[selectedIndex]?.value ?? options[selectedIndex]?.label;

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    setIsAutoPopped(true);

    const timer = setTimeout(() => {
      setIsAutoPopped(false);
    }, popDuration);

    return () => clearTimeout(timer);
  }, [selectedIndex, currentSelectedValue, options, popDuration]);

  useEffect(() => {
    setRotationDeg((prevRot) => {
      const currentNormalized = ((-prevRot % 360) + 360) % 360;
      const targetNormalized = (selectedIndex * sliceAngle) % 360;

      let diff = targetNormalized - currentNormalized;
      if (diff > 180) diff -= 360;
      if (diff < -180) diff += 360;

      return prevRot - diff;
    });
  }, [selectedIndex, sliceAngle]);

  useEffect(() => {
    const element = wheelAreaRef.current;
    if (!element) return;

    const handleNativeWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (isCooldown.current) return;

      const idx = selectedIndexRef.current;
      const count = optionsLengthRef.current;
      if (count === 0) return;

      if (e.deltaY > 0) {
        const nextIndex = (idx + 1) % count;
        setRotationDeg((prev) => prev - sliceAngle);
        onChangeRef.current(nextIndex);
        triggerCooldown();
      } else if (e.deltaY < 0) {
        const nextIndex = (idx - 1 + count) % count;
        setRotationDeg((prev) => prev + sliceAngle);
        onChangeRef.current(nextIndex);
        triggerCooldown();
      }
    };

    const triggerCooldown = () => {
      isCooldown.current = true;
      setTimeout(() => {
        isCooldown.current = false;
      }, 160);
    };

    element.addEventListener("wheel", handleNativeWheel, { passive: false });
    return () => element.removeEventListener("wheel", handleNativeWheel);
  }, [sliceAngle]);

  const describeArc = (
    cx: number,
    cy: number,
    rInner: number,
    rOuter: number,
    startAngle: number,
    endAngle: number
  ) => {
    const toRad = (deg: number) => ((deg - 90) * Math.PI) / 180.0;
    const p1 = { x: cx + rOuter * Math.cos(toRad(startAngle)), y: cy + rOuter * Math.sin(toRad(startAngle)) };
    const p2 = { x: cx + rOuter * Math.cos(toRad(endAngle)), y: cy + rOuter * Math.sin(toRad(endAngle)) };
    const p3 = { x: cx + rInner * Math.cos(toRad(endAngle)), y: cy + rInner * Math.sin(toRad(endAngle)) };
    const p4 = { x: cx + rInner * Math.cos(toRad(startAngle)), y: cy + rInner * Math.sin(toRad(startAngle)) };

    const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";

    return [
      `M ${p1.x} ${p1.y}`,
      `A ${rOuter} ${rOuter} 0 ${largeArcFlag} 1 ${p2.x} ${p2.y}`,
      `L ${p3.x} ${p3.y}`,
      `A ${rInner} ${rInner} 0 ${largeArcFlag} 0 ${p4.x} ${p4.y}`,
      "Z",
    ].join(" ");
  };

  const handleSectorClick = (i: number) => {
    onChange(i);
  };

  let centerTextY = radius;
  let centerTextX = radius;
  if (isRight) {
    centerTextX = radius + innerRadius / 2.3;
  } else if (isLeft) {
    centerTextX = radius - innerRadius / 2.3;
  } else if (isTop) {
    centerTextY = radius + innerRadius / 2.3;
  } else {
    centerTextY = radius - innerRadius / 2.3;
  }

  const isVisible = isHovered || isAutoPopped;

  const getTransform = () => {
    const baseTranslate = `translate(${offsetX}px, ${offsetY}px)`;
    const scale = `scale(${isVisible ? 1.05 : 1})`;

    if (!autoHide) {
      return `${baseTranslate} ${scale}`;
    }

    if (isRight) {
      const slideX = isVisible ? "10px" : `${radius + 10}px`;
      return `${baseTranslate} translateX(${slideX}) ${scale}`;
    } else if (isLeft) {
      const slideX = isVisible ? "-10px" : `-${radius + 10}px`;
      return `${baseTranslate} translateX(${slideX}) ${scale}`;
    } else if (isTop) {
      const slideY = isVisible ? "-10px" : `-${radius + 10}px`;
      return `${baseTranslate} translateY(${slideY}) ${scale}`;
    } else {
      const slideY = isVisible ? "10px" : `${radius + 10}px`;
      return `${baseTranslate} translateY(${slideY}) ${scale}`;
    }
  };

  const getFlexDirection = () => {
    if (isRight) return "row";
    if (isLeft) return "row-reverse";
    if (isTop) return "column-reverse";
    return "column";
  };

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        display: "flex",
        flexDirection: getFlexDirection(),
        alignItems: "center",
        justifyContent: "flex-end",
        position: "relative",
        transform: getTransform(),
        transformOrigin: isRight
          ? "right center"
          : isLeft
          ? "left center"
          : isTop
          ? "top center"
          : "bottom center",
        transition: "transform 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
        zIndex: isVisible ? 2 : 1,
        padding: "8px",
      }}
    >
      <span
        style={{
          fontSize: "10px",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: isVisible ? "var(--accent-blue)" : "var(--text-tertiary)",
          marginBottom: isHorizontal ? "0" : isTop ? "0" : "6px",
          marginTop: isTop ? "6px" : "0",
          marginRight: isRight ? "8px" : "0",
          marginLeft: isLeft ? "8px" : "0",
          transition: "color 0.2s ease",
          cursor: "pointer",
          whiteSpace: "nowrap",
          userSelect: "none",
        }}
      >
        {title}
      </span>

      <div
        ref={wheelAreaRef}
        style={{
          width: isHorizontal ? `${radius}px` : `${size}px`,
          height: isHorizontal ? `${size}px` : `${radius}px`,
          position: "relative",
          overflow: "hidden",
          userSelect: "none",
          touchAction: "none",
          cursor: "pointer",
          filter: isVisible
            ? "drop-shadow(0 12px 24px rgba(0,0,0,0.3))"
            : "drop-shadow(0 4px 12px rgba(0,0,0,0.15))",
          transition: "filter 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          style={{
            position: "absolute",
            top: isTop ? `-${radius}px` : 0,
            left: isLeft ? `-${radius}px` : 0,
            transform: isRight
              ? "rotate(-90deg)"
              : isLeft
              ? "rotate(90deg)"
              : isTop
              ? "rotate(180deg)"
              : "none",
            transformOrigin: `${radius}px ${radius}px`,
          }}
        >
          <g
            style={{
              transform: `rotate(${rotationDeg}deg)`,
              transformOrigin: `${radius}px ${radius}px`,
              transition: "transform 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          >
            {options.map((opt, i) => {
              const startAngle = i * sliceAngle - sliceAngle / 2;
              const endAngle = startAngle + sliceAngle;
              const midAngle = i * sliceAngle;
              const isSelected = i === selectedIndex;

              const rad = ((midAngle - 90) * Math.PI) / 180;
              const textX = radius + labelRadius * Math.cos(rad);
              const textY = radius + labelRadius * Math.sin(rad);

              let textRotation = -rotationDeg;
              if (isRight) textRotation = -rotationDeg + 90;
              if (isLeft) textRotation = -rotationDeg - 90;
              if (isTop) textRotation = -rotationDeg - 180;

              return (
                <g key={i} onClick={() => handleSectorClick(i)} style={{ cursor: "pointer" }}>
                  <path
                    d={describeArc(radius, radius, innerRadius, radius, startAngle, endAngle)}
                    fill={isSelected ? "var(--accent-blue)" : "var(--wheel-sector-bg)"}
                    stroke="var(--wheel-border)"
                    strokeWidth="1.5"
                    style={{ transition: "fill 0.2s ease, stroke 0.2s ease" }}
                  />

                  {opt.iconUrl ? (
                    <image
                      href={opt.iconUrl}
                      x={textX - iconSize / 2}
                      y={textY - iconSize / 2}
                      width={iconSize}
                      height={iconSize}
                      transform={`rotate(${textRotation}, ${textX}, ${textY})`}
                      style={{ pointerEvents: "none" }}
                    />
                  ) : (
                    <text
                      x={textX}
                      y={textY}
                      fill={isSelected ? "#ffffff" : "var(--text-secondary)"}
                      fontSize={isSelected ? fontSizeSelected : fontSizeUnselected}
                      fontWeight={isSelected ? "700" : "500"}
                      textAnchor="middle"
                      dominantBaseline="central"
                      transform={`rotate(${textRotation}, ${textX}, ${textY})`}
                      style={{ pointerEvents: "none" }}
                    >
                      {opt.label.length > 13 ? `${opt.label.slice(0, 11)}…` : opt.label}
                    </text>
                  )}
                </g>
              );
            })}
          </g>

          <circle
            cx={radius}
            cy={radius}
            r={innerRadius - 1}
            fill="var(--wheel-center-bg)"
            stroke="var(--wheel-border)"
            strokeWidth="1"
          />

          {showCenterText && (
            <text
              x={centerTextX}
              y={centerTextY}
              fill="var(--text-primary)"
              fontSize="12px"
              fontWeight="700"
              textAnchor="middle"
              dominantBaseline="central"
              transform={
                isRight
                  ? `rotate(90, ${centerTextX}, ${centerTextY})`
                  : isLeft
                  ? `rotate(-90, ${centerTextX}, ${centerTextY})`
                  : isTop
                  ? `rotate(180, ${centerTextX}, ${centerTextY})`
                  : undefined
              }
              style={{ pointerEvents: "none" }}
            >
              {options[selectedIndex]?.label}
            </text>
          )}
        </svg>
      </div>
    </div>
  );
}