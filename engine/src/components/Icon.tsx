import React from "react";

const paths = {
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  target: (
    <>
      <circle cx="12" cy="12" r="9.5" />
      <circle cx="12" cy="12" r="5.5" />
      <circle cx="12" cy="12" r="1.6" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="15.5" r="4" />
      <path d="M11 12.5L20 3.5M16.5 7l3 3" />
    </>
  ),
  crown: <path d="M3 18.5h18M4 8l4.5 4L12 5l3.5 7L20 8l-1.5 10.5h-13z" />,
  rocket: (
    <>
      <path d="M12 2.5c4 2 6 6.500 5 11.500l-3 3h-4l-3-3c-1-5 1-9.500 5-11.500z" />
      <circle cx="12" cy="9.500" r="1.800" />
      <path d="M9 17l-2 4M15 17l2 4" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9.500" />
      <ellipse cx="12" cy="12" rx="4" ry="9.500" />
      <path d="M2.500 12h19" />
    </>
  ),
  heartbreak: (
    <>
      <path d="M12 20.500s-8.500-5-8.500-11.500a4.700 4.700 0 018.500-2.800A4.700 4.700 0 0120.500 9c0 6.500-8.500 11.500-8.500 11.500z" />
      <path d="M12 6.500l-2 3.500 3 2-2 3.500" />
    </>
  ),
  down: <path d="M12 4v14M6 13l6 6 6-6" />,
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4.500 3.600-7 8-7s8 2.500 8 7" />
    </>
  ),
  bulb: (
    <path d="M9 18h6M10 21h4M12 3a6 6 0 00-3.500 10.900c.6.500 1 1.200 1 2.100h5c0-.900.400-1.600 1-2.100A6 6 0 0012 3z" />
  ),
  alert: <path d="M12 3l10 18H2zM12 10v5M12 18v.5" />,
  trend: <path d="M3 7l6 6 4-4 8 8M15 17h6v-6" />,
  spark: <path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9.500" />
      <path d="M12 7v5l3.500 2" />
    </>
  ),
  money: (
    <>
      <circle cx="12" cy="12" r="9.500" />
      <path d="M14.500 8.500c-.5-1-1.500-1.500-2.700-1.500-1.500 0-2.600.8-2.600 2s1 1.700 2.800 2.100c1.800.4 2.800.9 2.800 2.100 0 1.200-1.200 2-2.700 2-1.300 0-2.400-.6-2.800-1.700M12 5.500V7m0 10v1.500" />
    </>
  ),
  team: (
    <>
      <circle cx="9" cy="8" r="3.200" />
      <circle cx="17" cy="9" r="2.500" />
      <path d="M3 20c0-3.500 2.700-5.500 6-5.500s6 2 6 5.500M16 14.500c3 0 5 1.800 5 4.500" />
    </>
  ),
  flag: <path d="M5 21V4M5 4h12l-2.500 4L17 12H5" />,
} as const;

export type IconName = keyof typeof paths;

export const Icon: React.FC<{ name: IconName; size?: number; color?: string; stroke?: number }> = ({
  name,
  size = 64,
  color = "currentColor",
  stroke = 2.2,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={stroke}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {paths[name]}
  </svg>
);
