import { cn } from "@/lib/utils"

interface AIOrbAvatarProps {
  className?: string
}

export function AIOrbAvatar({ className }: AIOrbAvatarProps) {
  return (
    <div
      className={cn(
        "relative isolate size-full overflow-hidden rounded-full",
        className,
      )}
      aria-hidden="true"
    >
      <div
        className="absolute inset-0 animate-spin"
        style={{
          animationDuration: "11s",
          background:
            "conic-gradient(from 0deg at 50% 50%, #7c3aed, #06b6d4, #a855f7, #3b82f6, #f0abfc, #f59e0b, #7c3aed)",
        }}
      />

      <div
        className="absolute inset-0 -rotate-90 animate-spin opacity-80 mix-blend-screen"
        style={{
          animationDuration: "17s",
          background:
            "conic-gradient(from 180deg at 50% 50%, transparent 0deg, rgba(255,255,255,0.6) 35deg, transparent 95deg, transparent 200deg, rgba(186,230,253,0.55) 250deg, transparent 305deg)",
          filter: "blur(7px)",
        }}
      />

      <svg
        className="absolute inset-0 size-full"
        viewBox="0 0 100 100"
        fill="none"
      >
        <defs>
          <filter id="ai-orb-warp" x="-20%" y="-20%" width="140%" height="140%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.018"
              numOctaves="2"
              seed="3"
              result="noise"
            >
              <animate
                attributeName="baseFrequency"
                values="0.012;0.04;0.022;0.05;0.012"
                dur="9s"
                repeatCount="indefinite"
              />
              <animate
                attributeName="seed"
                values="0;5;2;7;1;0"
                dur="13s"
                repeatCount="indefinite"
              />
            </feTurbulence>
            <feDisplacementMap
              in="SourceGraphic"
              in2="noise"
              scale="14"
              xChannelSelector="R"
              yChannelSelector="G"
            >
              <animate
                attributeName="scale"
                values="6;22;10;26;6"
                dur="7s"
                repeatCount="indefinite"
              />
            </feDisplacementMap>
          </filter>

          <filter
            id="ai-orb-warp-soft"
            x="-20%"
            y="-20%"
            width="140%"
            height="140%"
          >
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.03"
              numOctaves="3"
              seed="6"
            >
              <animate
                attributeName="baseFrequency"
                values="0.02;0.06;0.025;0.05;0.02"
                dur="6s"
                repeatCount="indefinite"
              />
              <animate
                attributeName="seed"
                values="0;9;3;5;2;0"
                dur="11s"
                repeatCount="indefinite"
              />
            </feTurbulence>
            <feDisplacementMap
              in="SourceGraphic"
              scale="6"
              xChannelSelector="R"
              yChannelSelector="G"
            >
              <animate
                attributeName="scale"
                values="3;10;5;12;3"
                dur="5.5s"
                repeatCount="indefinite"
              />
            </feDisplacementMap>
          </filter>

          <radialGradient id="ai-orb-rim" cx="50%" cy="45%" r="55%">
            <stop offset="65%" stopColor="white" stopOpacity="0" />
            <stop offset="100%" stopColor="white" stopOpacity="0.4" />
          </radialGradient>

          <radialGradient id="ai-orb-core" cx="42%" cy="38%" r="60%">
            <stop offset="0%" stopColor="white" stopOpacity="0.95" />
            <stop offset="35%" stopColor="#f5d0fe" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#7c3aed" stopOpacity="0" />
          </radialGradient>

          <path
            id="ai-orb-path-a"
            d="M50,50 m-30,0 a30,30 0 1,0 60,0 a30,30 0 1,0 -60,0"
            fill="none"
          />
          <path
            id="ai-orb-path-b"
            d="M50,50 c25,-35 45,15 0,40 c-30,5 -45,-30 0,-40 z"
            fill="none"
          />
          <path
            id="ai-orb-path-c"
            d="M22,30 q20,-22 40,8 q22,22 -6,42 q-30,16 -38,-12 q-12,-22 4,-38 z"
            fill="none"
          />
        </defs>

        <circle cx="50" cy="50" r="49.4" fill="url(#ai-orb-rim)" />

        <g filter="url(#ai-orb-warp)">
          <ellipse cx="50" cy="50" rx="32" ry="32" fill="url(#ai-orb-core)">
            <animate
              attributeName="rx"
              values="30;36;28;34;30"
              dur="5.5s"
              repeatCount="indefinite"
            />
            <animate
              attributeName="ry"
              values="34;28;36;30;34"
              dur="6.3s"
              repeatCount="indefinite"
            />
            <animate
              attributeName="cx"
              values="50;52;48;51;50"
              dur="7.1s"
              repeatCount="indefinite"
            />
            <animate
              attributeName="cy"
              values="50;48;52;49;50"
              dur="6.7s"
              repeatCount="indefinite"
            />
          </ellipse>
        </g>

        <g filter="url(#ai-orb-warp-soft)" opacity="0.85">
          <circle
            cx="50"
            cy="50"
            r="40"
            stroke="rgba(255,255,255,0.55)"
            strokeWidth="0.45"
            strokeDasharray="2 5"
          >
            <animateTransform
              attributeName="transform"
              type="rotate"
              from="0 50 50"
              to="360 50 50"
              dur="19s"
              repeatCount="indefinite"
            />
            <animate
              attributeName="r"
              values="38;42;36;43;38"
              dur="8.4s"
              repeatCount="indefinite"
            />
          </circle>

          <circle
            cx="50"
            cy="50"
            r="30"
            stroke="rgba(186,230,253,0.5)"
            strokeWidth="0.35"
            strokeDasharray="1 3"
          >
            <animateTransform
              attributeName="transform"
              type="rotate"
              from="360 50 50"
              to="0 50 50"
              dur="13s"
              repeatCount="indefinite"
            />
            <animate
              attributeName="r"
              values="28;33;26;31;28"
              dur="7.2s"
              repeatCount="indefinite"
            />
          </circle>

          <ellipse
            cx="50"
            cy="50"
            rx="44"
            ry="14"
            stroke="rgba(255,255,255,0.35)"
            strokeWidth="0.35"
          >
            <animateTransform
              attributeName="transform"
              type="rotate"
              values="0 50 50; 360 50 50"
              dur="9.7s"
              repeatCount="indefinite"
            />
            <animate
              attributeName="ry"
              values="10;22;8;18;10"
              dur="5.9s"
              repeatCount="indefinite"
            />
          </ellipse>

          <ellipse
            cx="50"
            cy="50"
            rx="14"
            ry="44"
            stroke="rgba(240,171,252,0.5)"
            strokeWidth="0.35"
          >
            <animateTransform
              attributeName="transform"
              type="rotate"
              values="0 50 50; -360 50 50"
              dur="11.4s"
              repeatCount="indefinite"
            />
            <animate
              attributeName="rx"
              values="12;20;9;17;12"
              dur="6.5s"
              repeatCount="indefinite"
            />
          </ellipse>
        </g>

        <g>
          <circle r="1.7" fill="white">
            <animateMotion
              dur="4.8s"
              repeatCount="indefinite"
              rotate="auto"
              path="M50,50 c20,-30 45,15 5,38 c-32,18 -38,-22 -8,-42 c25,-16 38,12 3,4 z"
              keyTimes="0;0.3;0.55;0.8;1"
              keyPoints="0;0.3;0.55;0.8;1"
              calcMode="spline"
              keySplines="0.3 0 0.7 1; 0.2 0.8 0.4 1; 0.5 0 0.5 1; 0.3 0.6 0.7 1"
            />
            <animate
              attributeName="opacity"
              values="0.2;1;0.4;0.9;0.2"
              dur="2.1s"
              repeatCount="indefinite"
            />
            <animate
              attributeName="r"
              values="1;2.2;0.6;1.8;1"
              dur="3.4s"
              repeatCount="indefinite"
            />
          </circle>
        </g>

        <g>
          <circle r="1.2" fill="#fde68a">
            <animateMotion
              dur="6.6s"
              repeatCount="indefinite"
              path="M30,28 c18,18 -10,30 8,42 c22,14 38,-18 22,-30 c-18,-14 -28,12 -38,-2 c-10,-14 18,-18 8,-10 z"
              calcMode="spline"
              keyTimes="0;0.25;0.6;0.85;1"
              keyPoints="0;0.25;0.6;0.85;1"
              keySplines="0.4 0 0.6 1; 0.1 0.9 0.3 1; 0.5 0 0.5 1; 0.3 0.5 0.7 1"
            />
            <animate
              attributeName="opacity"
              values="0.1;1;0.3;0.95;0.1"
              dur="1.7s"
              repeatCount="indefinite"
            />
          </circle>
        </g>

        <g>
          <circle r="1" fill="#a5f3fc">
            <animateMotion
              dur="5.2s"
              repeatCount="indefinite"
              path="M68,18 c-22,8 -38,22 -18,38 c18,14 36,-10 22,-26 c-12,-14 -30,4 -8,-20 z"
              calcMode="spline"
              keyTimes="0;0.4;0.7;1"
              keyPoints="0;0.4;0.7;1"
              keySplines="0.2 0.7 0.4 1; 0.6 0 0.4 1; 0.3 0.6 0.7 1"
            />
            <animate
              attributeName="opacity"
              values="0.15;0.95;0.25;0.85;0.15"
              dur="2.6s"
              repeatCount="indefinite"
            />
            <animate
              attributeName="r"
              values="0.6;1.6;0.4;1.3;0.6"
              dur="2.9s"
              repeatCount="indefinite"
            />
          </circle>
        </g>

        <g>
          <circle r="0.8" fill="#f0abfc">
            <animateMotion
              dur="7.4s"
              repeatCount="indefinite"
              path="M22,60 c8,-22 26,-14 38,4 c14,18 -2,38 -22,28 c-22,-12 -30,-10 -18,-32 z"
              calcMode="spline"
              keyTimes="0;0.3;0.6;0.9;1"
              keyPoints="0;0.3;0.6;0.9;1"
              keySplines="0.4 0 0.6 1; 0.2 0.8 0.4 1; 0.5 0 0.5 1; 0.3 0.5 0.7 1"
            />
            <animate
              attributeName="opacity"
              values="0.2;0.9;0.3;0.85;0.2"
              dur="3.1s"
              repeatCount="indefinite"
            />
          </circle>
        </g>

        <g>
          <circle r="0.6" fill="white">
            <animateMotion
              dur="3.9s"
              repeatCount="indefinite"
              path="M44,72 c12,-28 28,-8 12,18 c-12,18 -28,2 -12,-18 z"
              calcMode="spline"
              keyTimes="0;0.5;1"
              keyPoints="0;0.5;1"
              keySplines="0.3 0 0.7 1; 0.3 0.7 0.7 1"
            />
            <animate
              attributeName="opacity"
              values="0;1;0;0.6;0"
              dur="1.4s"
              repeatCount="indefinite"
            />
          </circle>
        </g>
      </svg>
    </div>
  )
}
