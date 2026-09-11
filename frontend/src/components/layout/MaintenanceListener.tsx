import { useEffect } from "react";

const PUSDATIN_URL = import.meta.env.PUBLIC_PUSDATIN_URL;
const APP_ID = import.meta.env.PUBLIC_PUSDATIN_APP_ID;
const CHECK_INTERVAL = 15_000;

export function MaintenanceListener() {
  useEffect(() => {
    if (!PUSDATIN_URL || !APP_ID) return;
    async function checkStatus() {
      try {
        const res = await fetch(
          `${PUSDATIN_URL}/api/public/apps/${APP_ID}/status?_t=${Date.now()}`
        );
        if (!res.ok) return;

        const data: any = await res.json();
        const isMaintenance = data?.status === "maintenance";
        const currentPath = window.location.pathname;

        if (isMaintenance) {
          sessionStorage.setItem("is_maintenance", "true");
          if (!currentPath.startsWith("/maintenance")) {
            window.location.replace("/maintenance");
          }
        } else {
          sessionStorage.removeItem("is_maintenance");
          if (currentPath.startsWith("/maintenance")) {
            window.location.replace("/");
          }
        }
      } catch {
        // Abaikan jika offline / gagal fetch, pengecekan berikutnya akan mencoba lagi
      }
    }

    // Pengecekan saat awal load
    checkStatus();

    // Polling periodik dan saat tab kembali aktif
    const interval = setInterval(checkStatus, CHECK_INTERVAL);
    window.addEventListener("focus", checkStatus);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", checkStatus);
    };
  }, []);

  return null;
}

export default MaintenanceListener;
