import type { SVGProps } from "react";
import {
  Grid3X3,
  MousePointer2,
  Move3d,
  RotateCw,
  Scaling,
  Scissors
} from "lucide-react";
import type { ToolId } from "@ggez/tool-system";

export function TridentIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" {...props}>
      <path
        d="M7 4v5.5M12 4v13M17 4v5.5M7 4l-2 2.5M7 4l2 2.5M17 4l-2 2.5M17 4l2 2.5M12 17.5l-2 2.5M12 17.5l2 2.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

export function ExtrudeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" {...props}>
      <path
        d="M5.5 7.5 12 4l6.5 3.5L12 11 5.5 7.5Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
      <path
        d="M12 11v8.5M9 16l3 3 3-3"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}

export function BrushCreateIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" {...props}>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      <path d="M7 7h10v10H7z" opacity="0.28" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

export function MeshEditToolIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" {...props}>
      <path d="M7 8.5 12 5l5 3.5v7L12 19l-5-3.5v-7Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.6" />
      <path d="M7 8.5 12 12m5-3.5L12 12m0 0v7" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
      <circle cx="7" cy="8.5" r="1.2" fill="currentColor" />
      <circle cx="17" cy="8.5" r="1.2" fill="currentColor" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" />
      <circle cx="12" cy="19" r="1.2" fill="currentColor" />
    </svg>
  );
}

export function AssetPlaceIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" {...props}>
      <path d="M6 8.5 12 5l6 3.5v7L12 19l-6-3.5v-7Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.6" />
      <path d="M12 4v8" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
      <path d="m9.5 9.5 2.5 2.5 2.5-2.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
    </svg>
  );
}

export function VertexModeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" {...props}>
      <circle cx="7" cy="7" r="2" fill="currentColor" />
      <circle cx="17" cy="8.5" r="2" fill="currentColor" />
      <circle cx="12" cy="17" r="2" fill="currentColor" />
      <path d="M8.8 8.1 15 9.2m-6.2.8 2.1 5.2m5.1-4.3-2.6 4" opacity="0.34" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
    </svg>
  );
}

export function EdgeModeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" {...props}>
      <path d="M6 16 18 8" stroke="currentColor" strokeLinecap="round" strokeWidth="2.2" />
      <circle cx="6" cy="16" r="2" fill="currentColor" />
      <circle cx="18" cy="8" r="2" fill="currentColor" />
    </svg>
  );
}

export function FaceModeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" {...props}>
      <path d="M7 7.5 17.5 9.2 14.7 17.2 6.2 15.4Z" fill="currentColor" fillOpacity="0.24" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.6" />
    </svg>
  );
}

export function InflateIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" {...props}>
      <path d="M12 8v8M8 12h8" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      <path d="m12 4 2 2m-2-2-2 2m8 6 2 2m-2-2-2 2m-6 4-2 2m2-2 2 2M4 12l2-2m-2 2 2 2" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
    </svg>
  );
}

export function DeflateIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" {...props}>
      <path d="M8 12h8" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      <path d="m8 8-2-2m2 2V6m8 2 2-2m-2 2V6m-8 8-2 2m2-2v2m8-2 2 2m-2-2v2" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
    </svg>
  );
}

export function RaiseTopIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" {...props}>
      <path d="M7 14h10v5H7z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.6" />
      <path d="M12 5v8m0-8-3 3m3-3 3 3" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

export function LowerTopIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" {...props}>
      <path d="M7 5h10v5H7z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.6" />
      <path d="M12 19v-8m0 8-3-3m3 3 3-3" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

export function FlipNormalsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" {...props}>
      <path d="M7 8.5 17 6l-2.7 10L5 18.5 7 8.5Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.6" />
      <path d="M10 12h7m0 0-2.2-2.2M17 12l-2.2 2.2" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

export function BevelIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" {...props}>
      <path d="M6 16 11 8h7" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      <path d="M6 16h10l2-2" opacity="0.34" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
    </svg>
  );
}

export function ArcEdgeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" {...props}>
      <path d="M6 16c2.2-5.2 9.8-5.2 12 0" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      <path d="M6 16h12" opacity="0.28" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4" />
      <circle cx="6" cy="16" r="1.7" fill="currentColor" />
      <circle cx="18" cy="16" r="1.7" fill="currentColor" />
    </svg>
  );
}

export function MergeFacesIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" {...props}>
      <path d="M5.5 8.5 10.5 6l4.5 2.5-5 2.5-4.5-2.5ZM14 10.5l4.5-2.3 0 7-4.5 2.3v-7Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.6" />
      <path d="M10 11h4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}

export function FillFaceIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" {...props}>
      <path d="M7 8.5 17 7l-2.5 9L6 17.5Z" fill="currentColor" fillOpacity="0.24" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.6" />
      <path d="M9 12h6" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
    </svg>
  );
}

export function CutMeshIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" {...props}>
      <path d="M6 18a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm12-8a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" stroke="currentColor" strokeWidth="1.6" />
      <path d="m7.5 14.8 9-5.6M9 7l6 10" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}

export function SubdivideIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" {...props}>
      <path d="M6 7h12v10H6z" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 7v10M6 12h12" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

export function DeleteFacesIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" {...props}>
      <path d="M7 8h10l-1 10H8L7 8Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.6" />
      <path d="M9 8V6h6v2M10 11v4M14 11v4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
    </svg>
  );
}

export function TranslateModeIcon(props: SVGProps<SVGSVGElement>) {
  return <Move3d {...props} />;
}

export function RotateModeIcon(props: SVGProps<SVGSVGElement>) {
  return <RotateCw {...props} />;
}

export function ScaleModeIcon(props: SVGProps<SVGSVGElement>) {
  return <Scaling {...props} />;
}

export function CubePrimitiveIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" {...props}>
      <path d="M6 8.5 12 5l6 3.5v7L12 19l-6-3.5v-7Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.6" />
      <path d="M12 12v7M6 8.5 12 12l6-3.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
    </svg>
  );
}

export function PlanePrimitiveIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" {...props}>
      <path d="M5.5 9 12 6l6.5 3-6.5 3-6.5-3Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.6" />
      <path d="M5.5 9v6l6.5 3 6.5-3V9" opacity="0.3" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.4" />
      <path d="M8 13.2h8" opacity="0.55" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4" />
    </svg>
  );
}

export function PathAddIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" {...props}>
      <path d="M6.5 17.5 11 8.5l6.5 7" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      <circle cx="6.5" cy="17.5" r="1.8" fill="currentColor" />
      <circle cx="11" cy="8.5" r="1.8" fill="currentColor" />
      <circle cx="17.5" cy="15.5" r="1.8" fill="currentColor" />
      <path d="M18.5 5.5v5M16 8h5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}

export function PathEditIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" {...props}>
      <path d="M5.5 17.5 10 9l6.5 6.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      <circle cx="5.5" cy="17.5" r="1.8" fill="currentColor" />
      <circle cx="10" cy="9" r="1.8" fill="currentColor" />
      <circle cx="16.5" cy="15.5" r="1.8" fill="currentColor" />
      <path d="m15.7 6.3 2-2a1.6 1.6 0 0 1 2.3 2.3l-2 2-2.8.5.5-2.8Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.5" />
    </svg>
  );
}

export function CrateIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" {...props}>
      <path d="M6 8.5 12 5l6 3.5v7L12 19l-6-3.5v-7Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.6" />
      <path d="m8.5 10 7 4m-7 0 7-4M12 5v14" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4" />
    </svg>
  );
}

export function SpherePrimitiveIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" {...props}>
      <circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 5c2.2 2.1 3.5 4.7 3.5 7s-1.3 4.9-3.5 7c-2.2-2.1-3.5-4.7-3.5-7s1.3-4.9 3.5-7Z" opacity="0.72" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5.5 12h13" opacity="0.72" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4" />
    </svg>
  );
}

export function CylinderPrimitiveIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" {...props}>
      <ellipse cx="12" cy="7" rx="5.5" ry="2.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M6.5 7v9.5c0 1.4 2.5 2.5 5.5 2.5s5.5-1.1 5.5-2.5V7" stroke="currentColor" strokeWidth="1.6" />
      <path d="M6.5 16.5c0 1.4 2.5 2.5 5.5 2.5s5.5-1.1 5.5-2.5" opacity="0.72" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

export function ConePrimitiveIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" {...props}>
      <path d="M12 5 6.5 16.5h11L12 5Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.6" />
      <ellipse cx="12" cy="16.5" rx="5.5" ry="2.3" opacity="0.72" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

export function PlayerSpawnIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" {...props}>
      <circle cx="12" cy="8" r="2.4" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8.5 17.5c.8-2.4 2.1-3.6 3.5-3.6s2.7 1.2 3.5 3.6" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
      <path d="M12 4v2.2M5 19h14" opacity="0.72" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4" />
    </svg>
  );
}

export function NpcSpawnIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" {...props}>
      <circle cx="9" cy="9" r="2.1" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="15.5" cy="10" r="1.8" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6.5 17.2c.7-2 1.8-3 3.1-3 1.2 0 2.3 1 3 3M13.5 17.2c.5-1.6 1.3-2.4 2.4-2.4 1 0 1.9.8 2.4 2.4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4" />
    </svg>
  );
}

export function SmartObjectIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" {...props}>
      <path d="M7 7h10v10H7z" stroke="currentColor" strokeWidth="1.6" />
      <path d="m12 8.5.9 2.1 2.2.2-1.7 1.4.5 2.1-1.9-1.1-1.9 1.1.5-2.1-1.7-1.4 2.2-.2.9-2.1Z" fill="currentColor" fillOpacity="0.3" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.2" />
    </svg>
  );
}

export function PointLightIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" {...props}>
      <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 4v2.3M12 17.7V20M4 12h2.3M17.7 12H20M6.4 6.4l1.7 1.7M15.9 15.9l1.7 1.7M17.6 6.4l-1.7 1.7M8.1 15.9l-1.7 1.7" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4" />
    </svg>
  );
}

export function DirectionalLightIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" {...props}>
      <path d="M7 7h10v10H7z" opacity="0.18" fill="currentColor" />
      <path d="M6 18 18 6M13 6h5v5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

export function HemisphereLightIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" {...props}>
      <path d="M5 13a7 7 0 1 1 14 0H5Z" fill="currentColor" fillOpacity="0.2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M5 13h14" opacity="0.72" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

export function SpotLightIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" {...props}>
      <path d="M7 7h6l4 4-7 7-4-4 1-7Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.6" />
      <path d="M14 10l5-5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
    </svg>
  );
}

export function AmbientLightIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" {...props}>
      <circle cx="12" cy="12" r="6.2" fill="currentColor" fillOpacity="0.16" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="2.4" fill="currentColor" />
    </svg>
  );
}

export function toolIconFor(toolId: ToolId) {
  switch (toolId) {
    case "select":
      return MousePointer2;
    case "transform":
      return TridentIcon;
    case "brush":
      return BrushCreateIcon;
    case "clip":
      return Scissors;
    case "extrude":
      return ExtrudeIcon;
    case "mesh-edit":
      return MeshEditToolIcon;
    case "path-add":
      return PathAddIcon;
    case "path-edit":
      return PathEditIcon;
    default:
      return Grid3X3;
  }
}

export { Grid3X3 };
