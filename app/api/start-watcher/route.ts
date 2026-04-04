import { startWatcher } from "@/backend/monitors/watcher";

let watcherStarted = false;

export async function GET() {
  if (!watcherStarted) {
    watcherStarted = true;
    startWatcher((title) => {
      console.log(`[API] Watcher auto-submitted ticket: ${title}`);
    });
    return new Response(
      JSON.stringify({ status: "Watcher started" }),
      { status: 200 }
    );
  }
  return new Response(
    JSON.stringify({ status: "Watcher already running" }),
    { status: 200 }
  );
}