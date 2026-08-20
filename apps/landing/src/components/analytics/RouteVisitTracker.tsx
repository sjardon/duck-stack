import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { captureEvent } from "../../lib/analytics";
import { parseTrafficOrigin, registerTrafficOrigin } from "../../lib/attribution";

export default function RouteVisitTracker(): null {
  const location = useLocation();

  useEffect(() => {
    registerTrafficOrigin(parseTrafficOrigin(window.location.search, document.referrer));
    captureEvent("landing_page_viewed", { route: location.pathname });
  }, [location.pathname]);

  return null;
}
