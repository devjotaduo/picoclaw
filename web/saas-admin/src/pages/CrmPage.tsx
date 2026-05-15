import { useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import type { CrmView } from "./Layout";

export function CrmPage() {
  const { view = "contacts" } = useParams<{ view?: CrmView }>();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const mountedRef = useRef(false);

  // After initial load, drive view changes via postMessage (no full reload).
  useEffect(() => {
    if (!mountedRef.current) return;
    iframeRef.current?.contentWindow?.postMessage(
      { type: "crm:setView", view },
      window.location.origin,
    );
  }, [view]);

  return (
    <iframe
      ref={iframeRef}
      src={`/crm/?embedded=1&view=${view}`}
      className="w-full h-full border-0"
      title="CRM"
      onLoad={() => { mountedRef.current = true; }}
    />
  );
}
